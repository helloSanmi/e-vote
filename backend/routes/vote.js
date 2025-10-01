const express = require("express");
const jwt = require("jsonwebtoken");
const { queryOne, withTransaction } = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

const ensureJwtConfigured = (res) => {
  if (!JWT_SECRET) {
    res.status(500).json({ error: "JWT secret not configured" });
    return false;
  }
  return true;
};

const toBool = (value) => value === 1 || value === true || value === "1";

const emitUpdate = (req, eventName, payload) => {
  const emitter = req.app.get("emitUpdate");
  if (typeof emitter === "function") {
    emitter(eventName, payload || {});
  }
};

const authMiddleware = (req, res, next) => {
  if (!ensureJwtConfigured(res)) {
    return;
  }

  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    console.error("Vote auth error:", error);
    res.status(401).json({ error: "Invalid token" });
  }
};

router.post("/", authMiddleware, async (req, res) => {
  const { userId: bodyUserId, candidateId } = req.body || {};

  if (!candidateId) {
    return res.status(400).json({ error: "candidateId is required" });
  }

  const userId = req.userId;
  if (bodyUserId && Number(bodyUserId) !== Number(userId)) {
    return res.status(403).json({ error: "User mismatch" });
  }

  try {
    const period = await queryOne("SELECT TOP (1) * FROM VotingPeriod ORDER BY id DESC");

    if (!period) {
      return res.status(400).json({ error: "No voting period" });
    }
    const now = new Date();
    const start = new Date(period.startTime);
    const end = new Date(period.endTime);

    if (toBool(period.forcedEnded) || now < start || now > end) {
      return res.status(400).json({ error: "Voting is not currently open" });
    }

    const candidate = await queryOne(
      `SELECT id FROM Candidates WHERE id = ? AND periodId = ? AND published = 1`,
      [candidateId, period.id]
    );

    if (!candidate) {
      return res.status(400).json({ error: "Candidate not available for this period" });
    }

    const existingVote = await queryOne(
      `SELECT TOP (1) id FROM Votes WHERE userId = ? AND periodId = ?`,
      [userId, period.id]
    );

    if (existingVote) {
      return res.status(400).json({ error: "User already voted" });
    }

    await withTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO Votes (userId, candidateId, periodId) VALUES (?, ?, ?)`,
        [userId, candidateId, period.id]
      );

      const voteUpdate = await tx.execute(
        `UPDATE Candidates SET votes = votes + 1 WHERE id = ? AND periodId = ?`,
        [candidateId, period.id]
      );

      if (!voteUpdate.rowsAffected?.[0]) {
        const updateError = new Error("Candidate update failed");
        updateError.code = "CANDIDATE_UPDATE_FAILED";
        throw updateError;
      }

      await tx.execute(
        `UPDATE Users SET hasVoted = 1 WHERE id = ?`,
        [userId]
      );
    });

    emitUpdate(req, "voteCast", { periodId: period.id, candidateId });
    res.status(201).json({ message: "Vote cast" });
  } catch (error) {
    console.error("Vote error:", error);
    res.status(500).json({ error: "Vote failed" });
  }
});

module.exports = router;
