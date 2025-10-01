const express = require("express");
const { getDbPool } = require("../db");

const router = express.Router();

const getLatestPeriod = async (pool) => {
  const [rows] = await pool.execute("SELECT * FROM VotingPeriod ORDER BY id DESC LIMIT 1");
  return rows.length ? rows[0] : null;
};

router.get("/period", async (req, res) => {
  try {
    const pool = await getDbPool();
    const period = await getLatestPeriod(pool);
    res.json(period);
  } catch (error) {
    console.error("Public get period error:", error);
    res.status(500).json({ error: "Failed to fetch period" });
  }
});

router.get("/candidates", async (req, res) => {
  const { periodId } = req.query;

  try {
    const pool = await getDbPool();
    let targetPeriodId = periodId;

    if (!targetPeriodId) {
      const period = await getLatestPeriod(pool);
      if (!period) {
        return res.json([]);
      }
      targetPeriodId = period.id;
    }

    const [rows] = await pool.execute(
      `SELECT id, name, lga, photoUrl, votes, periodId, published
       FROM Candidates
       WHERE periodId = ? AND published = 1
       ORDER BY name ASC`,
      [targetPeriodId]
    );

    res.json(rows);
  } catch (error) {
    console.error("Public get candidates error:", error);
    res.status(500).json({ error: "Failed to fetch candidates" });
  }
});

router.get("/uservote", async (req, res) => {
  const { userId, periodId } = req.query;

  if (!userId || !periodId) {
    return res.status(400).json({ error: "userId and periodId are required" });
  }

  try {
    const pool = await getDbPool();
    const [rows] = await pool.execute(
      `SELECT v.candidateId, c.name, c.lga
       FROM Votes v
       INNER JOIN Candidates c ON c.id = v.candidateId
       WHERE v.userId = ? AND v.periodId = ?
       LIMIT 1`,
      [userId, periodId]
    );

    if (!rows.length) {
      return res.json({});
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Public get user vote error:", error);
    res.status(500).json({ error: "Failed to fetch user vote" });
  }
});

router.get("/public-results", async (req, res) => {
  const { periodId, userId } = req.query;

  if (!periodId) {
    return res.status(400).json({ error: "periodId is required" });
  }

  try {
    const pool = await getDbPool();
    const [[period]] = await pool.execute("SELECT * FROM VotingPeriod WHERE id = ?", [periodId]);

    if (!period) {
      return res.status(404).json({ error: "Voting period not found" });
    }

    const resultsPublished =
      period.resultsPublished === 1 ||
      period.resultsPublished === true ||
      period.resultsPublished === "1";

    if (!resultsPublished) {
      return res.json({ published: false, results: [] });
    }

    if (userId) {
      const [[vote]] = await pool.execute(
        "SELECT id FROM Votes WHERE userId = ? AND periodId = ? LIMIT 1",
        [userId, periodId]
      );

      if (!vote) {
        return res.json({ published: true, results: [], noParticipation: true });
      }
    }

    const [rows] = await pool.execute(
      `SELECT c.id, c.name, c.lga, c.photoUrl, c.votes
       FROM Candidates c
       WHERE c.periodId = ?
       ORDER BY c.votes DESC, c.name ASC`,
      [periodId]
    );

    res.json({ published: true, results: rows });
  } catch (error) {
    console.error("Public get results error:", error);
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

router.get("/periods", async (req, res) => {
  const { userId } = req.query;

  try {
    const pool = await getDbPool();

    if (!userId) {
      const [rows] = await pool.execute(
        "SELECT * FROM VotingPeriod ORDER BY startTime DESC"
      );
      return res.json(rows);
    }

    const [rows] = await pool.execute(
      `SELECT DISTINCT p.*
       FROM VotingPeriod p
       INNER JOIN Votes v ON v.periodId = p.id
       WHERE v.userId = ? AND p.resultsPublished = 1
       ORDER BY p.startTime DESC`,
      [userId]
    );

    res.json(rows);
  } catch (error) {
    console.error("Public get periods error:", error);
    res.status(500).json({ error: "Failed to fetch periods" });
  }
});

module.exports = router;
