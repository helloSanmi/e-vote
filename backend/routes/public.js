const express = require("express");
const { query, queryOne } = require("../db");

const router = express.Router();

const getLatestPeriod = async () =>
  queryOne("SELECT TOP (1) * FROM VotingPeriod ORDER BY id DESC");

const normalizePhotoUrlValue = (value) => {
  if (value === null || value === undefined) return null;
  const stringValue = typeof value === "string" ? value : String(value);
  const trimmed = stringValue.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) {
    return trimmed;
  }
  return `/${trimmed}`;
};

const withNormalizedPhoto = (candidate) => {
  if (!candidate) return candidate;
  return { ...candidate, photoUrl: normalizePhotoUrlValue(candidate.photoUrl) };
};

const normalizeCandidateRows = (rows = []) => rows.map(withNormalizedPhoto);

router.get("/period", async (req, res) => {
  try {
    const period = await getLatestPeriod();
    res.json(period);
  } catch (error) {
    console.error("Public get period error:", error);
    res.status(500).json({ error: "Failed to fetch period" });
  }
});

router.get("/candidates", async (req, res) => {
  const { periodId } = req.query;

  try {
    let targetPeriodId = periodId;

    if (!targetPeriodId) {
      const period = await getLatestPeriod();
      if (!period) {
        return res.json([]);
      }
      targetPeriodId = period.id;
    }

    const rows = await query(
      `SELECT id, name, lga, photoUrl, votes, periodId, published
       FROM Candidates
       WHERE periodId = ? AND published = 1
       ORDER BY name ASC`,
      [targetPeriodId]
    );

    res.json(normalizeCandidateRows(rows));
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
    const rows = await query(
      `SELECT TOP (1) v.candidateId, c.name, c.lga
       FROM Votes v
       INNER JOIN Candidates c ON c.id = v.candidateId
       WHERE v.userId = ? AND v.periodId = ?`,
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
    const period = await queryOne("SELECT * FROM VotingPeriod WHERE id = ?", [periodId]);

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
      const vote = await queryOne(
        `SELECT TOP (1) id FROM Votes WHERE userId = ? AND periodId = ?`,
        [userId, periodId]
      );

      if (!vote) {
        return res.json({ published: true, results: [], noParticipation: true });
      }
    }

    const rows = await query(
      `SELECT c.id, c.name, c.lga, c.photoUrl, c.votes
       FROM Candidates c
       WHERE c.periodId = ?
       ORDER BY c.votes DESC, c.name ASC`,
      [periodId]
    );

    res.json({ published: true, results: normalizeCandidateRows(rows) });
  } catch (error) {
    console.error("Public get results error:", error);
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

router.get("/periods", async (req, res) => {
  const { userId } = req.query;

  try {
    if (!userId) {
      const rows = await query(
        "SELECT * FROM VotingPeriod ORDER BY startTime DESC"
      );
      return res.json(rows);
    }

    const rows = await query(
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
