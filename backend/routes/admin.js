const express = require("express");
const jwt = require("jsonwebtoken");
const { getDbPool } = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

const normalizeEnvList = (value) =>
  (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const ADMIN_EMAILS = normalizeEnvList(process.env.ADMIN_EMAILS);
const ADMIN_USERNAMES = normalizeEnvList(process.env.ADMIN_USERNAMES);

const ensureJwtConfigured = (res) => {
  if (!JWT_SECRET) {
    res.status(500).json({ error: "JWT secret not configured" });
    return false;
  }
  return true;
};

const isAdminDecoded = (decoded) => {
  if (decoded?.isAdmin === true) return true;
  const email = (decoded?.email || "").toLowerCase();
  const username = (decoded?.username || "").toLowerCase();
  return ADMIN_EMAILS.includes(email) || ADMIN_USERNAMES.includes(username);
};

const toBool = (value) => value === 1 || value === true || value === "1";

const emitUpdate = (req, eventName, payload) => {
  const emitter = req.app.get("emitUpdate");
  if (typeof emitter === "function") {
    emitter(eventName, payload || {});
  }
};

const adminMiddleware = async (req, res, next) => {
  if (!ensureJwtConfigured(res)) {
    return;
  }

  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "No token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!isAdminDecoded(decoded)) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    req.userId = decoded.id;
    next();
  } catch (error) {
    console.error("Admin auth error:", error);
    return res.status(401).json({ error: "Invalid token" });
  }
};

const getLatestPeriod = async (pool) => {
  const [rows] = await pool.execute("SELECT * FROM VotingPeriod ORDER BY id DESC LIMIT 1");
  return rows.length ? rows[0] : null;
};

router.post("/start-voting", adminMiddleware, async (req, res) => {
  const { startTime, endTime } = req.body || {};

  if (!startTime || !endTime) {
    return res.status(400).json({ error: "startTime and endTime are required" });
  }

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return res.status(400).json({ error: "Invalid date format" });
  }

  if (start >= end) {
    return res.status(400).json({ error: "End time must be after start time" });
  }

  try {
    const pool = await getDbPool();
    const latestPeriod = await getLatestPeriod(pool);

    if (latestPeriod) {
      const periodEnded =
        toBool(latestPeriod.resultsPublished) ||
        toBool(latestPeriod.forcedEnded) ||
        new Date(latestPeriod.endTime) <= new Date();

      if (!periodEnded) {
        return res.status(400).json({ error: "There is already an active voting period" });
      }
    }

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const [result] = await conn.execute(
        "INSERT INTO VotingPeriod (startTime, endTime, resultsPublished, forcedEnded) VALUES (?, ?, 0, 0)",
        [start.toISOString().slice(0, 19).replace("T", " "), end.toISOString().slice(0, 19).replace("T", " ")]
      );
      const periodId = result.insertId;

      const [updateResult] = await conn.execute(
        "UPDATE Candidates SET periodId = ?, published = 1, votes = 0 WHERE periodId IS NULL AND published = 0",
        [periodId]
      );

      if (updateResult.affectedRows === 0) {
        await conn.rollback();
        return res.status(400).json({ error: "No unpublished candidates available to start voting" });
      }

      await conn.execute("UPDATE Users SET hasVoted = 0");

      await conn.commit();

      emitUpdate(req, "votingStarted", { periodId });
      emitUpdate(req, "candidatesUpdated");

      res.json({ message: "Voting started", periodId });
    } catch (error) {
      await conn.rollback();
      console.error("Start voting error:", error);
      res.status(500).json({ error: "Start failed" });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error("Start voting outer error:", error);
    res.status(500).json({ error: "Start failed" });
  }
});

router.post("/publish-results", adminMiddleware, async (req, res) => {
  try {
    const pool = await getDbPool();
    const latestPeriod = await getLatestPeriod(pool);
    if (!latestPeriod) {
      return res.status(400).json({ error: "No voting period found" });
    }

    const now = new Date();
    const end = new Date(latestPeriod.endTime);

    if (toBool(latestPeriod.resultsPublished)) {
      return res.status(400).json({ error: "Results already published" });
    }

    if (!toBool(latestPeriod.forcedEnded) && now < end) {
      return res.status(400).json({ error: "Voting still ongoing" });
    }

    await pool.execute("UPDATE VotingPeriod SET resultsPublished = 1 WHERE id = ?", [latestPeriod.id]);
    emitUpdate(req, "resultsPublished", { periodId: latestPeriod.id });
    res.json({ message: "Results published" });
  } catch (error) {
    console.error("Publish results error:", error);
    res.status(500).json({ error: "Publish failed" });
  }
});

router.post("/end-voting", adminMiddleware, async (req, res) => {
  try {
    const pool = await getDbPool();
    const latestPeriod = await getLatestPeriod(pool);
    if (!latestPeriod) {
      return res.status(400).json({ error: "No voting period found" });
    }

    if (toBool(latestPeriod.forcedEnded)) {
      return res.status(400).json({ error: "Voting already forced to end" });
    }

    await pool.execute("UPDATE VotingPeriod SET forcedEnded = 1 WHERE id = ?", [latestPeriod.id]);
    emitUpdate(req, "votingEnded", { periodId: latestPeriod.id });
    res.json({ message: "Voting ended early" });
  } catch (error) {
    console.error("End voting error:", error);
    res.status(500).json({ error: "End voting failed" });
  }
});

router.post("/add-candidate", adminMiddleware, async (req, res) => {
  const { name, lga, photoUrl } = req.body || {};
  if (!name || !lga) {
    return res.status(400).json({ error: "Candidate name and LGA are required" });
  }

  try {
    const pool = await getDbPool();
    await pool.execute(
      "INSERT INTO Candidates (name, lga, photoUrl, periodId, published, votes) VALUES (?, ?, ?, NULL, 0, 0)",
      [name.trim(), lga.trim(), photoUrl || null]
    );

    emitUpdate(req, "candidatesUpdated");
    res.status(201).json({ message: "Candidate added" });
  } catch (error) {
    console.error("Add candidate error:", error);
    res.status(500).json({ error: "Add candidate failed" });
  }
});

router.delete("/remove-candidate", adminMiddleware, async (req, res) => {
  const { candidateId } = req.query;
  if (!candidateId) {
    return res.status(400).json({ error: "candidateId is required" });
  }

  try {
    const pool = await getDbPool();
    const [result] = await pool.execute(
      "DELETE FROM Candidates WHERE id = ? AND published = 0 AND periodId IS NULL",
      [candidateId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Candidate not found or already published" });
    }

    emitUpdate(req, "candidatesUpdated");
    res.json({ message: "Candidate removed" });
  } catch (error) {
    console.error("Remove candidate error:", error);
    res.status(500).json({ error: "Remove candidate failed" });
  }
});

router.get("/get-candidates", adminMiddleware, async (req, res) => {
  try {
    const pool = await getDbPool();
    const latestPeriod = await getLatestPeriod(pool);

    if (latestPeriod) {
      const [rows] = await pool.execute(
        "SELECT * FROM Candidates WHERE periodId = ? OR periodId IS NULL ORDER BY createdAt DESC",
        [latestPeriod.id]
      );
      return res.json(rows);
    }

    const [rows] = await pool.execute(
      "SELECT * FROM Candidates WHERE periodId IS NULL ORDER BY createdAt DESC"
    );
    res.json(rows);
  } catch (error) {
    console.error("Get candidates error:", error);
    res.status(500).json({ error: "Fetch failed" });
  }
});

router.get("/candidates", adminMiddleware, async (req, res) => {
  const { periodId } = req.query;
  if (!periodId) {
    return res.status(400).json({ error: "periodId is required" });
  }

  try {
    const pool = await getDbPool();
    const [rows] = await pool.execute(
      "SELECT * FROM Candidates WHERE periodId = ? ORDER BY votes DESC, name ASC",
      [periodId]
    );
    res.json(rows);
  } catch (error) {
    console.error("Get candidates for period error:", error);
    res.status(500).json({ error: "Fetch failed" });
  }
});

router.get("/get-period", adminMiddleware, async (req, res) => {
  try {
    const pool = await getDbPool();
    const latestPeriod = await getLatestPeriod(pool);
    res.json(latestPeriod);
  } catch (error) {
    console.error("Get period error:", error);
    res.status(500).json({ error: "Failed to fetch period" });
  }
});

router.get("/results", adminMiddleware, async (req, res) => {
  const { periodId } = req.query;
  try {
    const pool = await getDbPool();
    let targetPeriodId = periodId;
    if (!targetPeriodId) {
      const latestPeriod = await getLatestPeriod(pool);
      if (!latestPeriod) {
        return res.json([]);
      }
      targetPeriodId = latestPeriod.id;
    }

    const [rows] = await pool.execute(
      `SELECT c.id, c.name, c.lga, c.photoUrl, c.votes
       FROM Candidates c
       WHERE c.periodId = ?
       ORDER BY c.votes DESC, c.name ASC`,
      [targetPeriodId]
    );
    res.json(rows);
  } catch (error) {
    console.error("Get results error:", error);
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

router.get("/periods", adminMiddleware, async (req, res) => {
  try {
    const pool = await getDbPool();
    const [rows] = await pool.execute(
      "SELECT * FROM VotingPeriod ORDER BY startTime DESC"
    );
    res.json(rows);
  } catch (error) {
    console.error("Get periods error:", error);
    res.status(500).json({ error: "Failed to fetch periods" });
  }
});

module.exports = router;
