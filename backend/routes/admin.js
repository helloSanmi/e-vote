const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { query, queryOne, execute, withTransaction } = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

const normalizeEnvList = (value) =>
  (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

const ensureUploadsDir = () => {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
};

ensureUploadsDir();

const normalizePhotoPath = (value) => {
  if (value === null || value === undefined) return null;
  const stringValue = typeof value === "string" ? value : String(value);
  const trimmed = stringValue.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return `/${trimmed}`;
};

const buildAbsolutePhotoUrl = (value, baseUrl) => {
  const normalized = normalizePhotoPath(value);
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (!baseUrl) return normalized;
  const sanitizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${sanitizedBase}${normalized}`;
};

const getPublicBaseUrl = (req) => {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured && configured.trim()) {
    const trimmed = configured.trim();
    return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  }
  const protocol = req.protocol || "http";
  const host = req.get("host");
  return host ? `${protocol}://${host}` : "";
};

const saveBase64Image = (base64String) => {
  if (!base64String) return null;

  try {
    ensureUploadsDir();
    let mimeType;
    let dataPart = base64String;

    const dataUrlMatch = base64String.match(/^data:(.+);base64,(.+)$/);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1];
      dataPart = dataUrlMatch[2];
    }

    const sanitizedBase64 = dataPart.replace(/\s/g, "");
    const buffer = Buffer.from(sanitizedBase64, "base64");

    let extension = "png";
    if (mimeType) {
      const parsedExt = mimeType.split("/")[1];
      if (parsedExt) {
        extension = parsedExt.split("+")[0];
      }
    }

    const fileName = `${randomUUID()}.${extension || "png"}`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    fs.writeFileSync(filePath, buffer);

    return `/uploads/${fileName}`;
  } catch (error) {
    console.error("Failed to save uploaded image", error);
    return null;
  }
};

const deleteUploadedFile = (photoUrl) => {
  if (!photoUrl || !photoUrl.startsWith("/uploads/")) {
    return;
  }
  const relativePart = photoUrl.replace(/^\/uploads\//, "");
  const filePath = path.join(UPLOADS_DIR, relativePart);
  fs.promises.unlink(filePath).catch(() => {});
};

const withNormalizedPhoto = (candidate, baseUrl) => {
  if (!candidate) return candidate;
  const normalizedPhoto = buildAbsolutePhotoUrl(candidate.photoUrl, baseUrl);
  return { ...candidate, photoUrl: normalizedPhoto, photoSrc: normalizedPhoto };
};

const normalizeCandidateRows = (rows = [], baseUrl) => rows.map((row) => withNormalizedPhoto(row, baseUrl));

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

const getLatestPeriod = async () =>
  queryOne("SELECT TOP (1) * FROM VotingPeriod ORDER BY id DESC");

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
    const latestPeriod = await getLatestPeriod();

    if (latestPeriod) {
      const periodEnded =
        toBool(latestPeriod.resultsPublished) ||
        toBool(latestPeriod.forcedEnded) ||
        new Date(latestPeriod.endTime) <= new Date();

      if (!periodEnded) {
        return res.status(400).json({ error: "There is already an active voting period" });
      }
    }

    const periodId = await withTransaction(async (tx) => {
      const insertResult = await tx.execute(
        `INSERT INTO VotingPeriod (startTime, endTime, resultsPublished, forcedEnded)
         OUTPUT INSERTED.id
         VALUES (?, ?, 0, 0)`,
        [start, end]
      );

      const newPeriodId = insertResult.recordset?.[0]?.id;
      if (!newPeriodId) {
        throw new Error("Failed to create voting period");
      }

      const updateResult = await tx.execute(
        `UPDATE Candidates
         SET periodId = ?, published = 1, votes = 0
         WHERE periodId IS NULL AND published = 0`,
        [newPeriodId]
      );

      if (!updateResult.rowsAffected?.[0]) {
        const noCandidatesError = new Error("No unpublished candidates available");
        noCandidatesError.code = "NO_CANDIDATES";
        throw noCandidatesError;
      }

      await tx.execute("UPDATE Users SET hasVoted = 0");

      return newPeriodId;
    });

    emitUpdate(req, "votingStarted", { periodId });
    emitUpdate(req, "candidatesUpdated");

    res.json({ message: "Voting started", periodId });
  } catch (error) {
    if (error.code === "NO_CANDIDATES") {
      return res.status(400).json({ error: "No unpublished candidates available to start voting" });
    }

    console.error("Start voting error:", error);
    res.status(500).json({ error: "Start failed" });
  }
});

router.post("/publish-results", adminMiddleware, async (req, res) => {
  try {
    const latestPeriod = await getLatestPeriod();
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

    await execute("UPDATE VotingPeriod SET resultsPublished = 1 WHERE id = ?", [latestPeriod.id]);
    emitUpdate(req, "resultsPublished", { periodId: latestPeriod.id });
    res.json({ message: "Results published" });
  } catch (error) {
    console.error("Publish results error:", error);
    res.status(500).json({ error: "Publish failed" });
  }
});

router.post("/end-voting", adminMiddleware, async (req, res) => {
  try {
    const latestPeriod = await getLatestPeriod();
    if (!latestPeriod) {
      return res.status(400).json({ error: "No voting period found" });
    }

    if (toBool(latestPeriod.forcedEnded)) {
      return res.status(400).json({ error: "Voting already forced to end" });
    }

    await execute("UPDATE VotingPeriod SET forcedEnded = 1 WHERE id = ?", [latestPeriod.id]);
    emitUpdate(req, "votingEnded", { periodId: latestPeriod.id });
    res.json({ message: "Voting ended early" });
  } catch (error) {
    console.error("End voting error:", error);
    res.status(500).json({ error: "End voting failed" });
  }
});

router.post("/add-candidate", adminMiddleware, async (req, res) => {
  const { name, lga, photoUrl, photoData } = req.body || {};
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedLga = typeof lga === "string" ? lga.trim() : "";
  let normalizedPhotoUrl = normalizePhotoPath(photoUrl);
  let storedFilePath = null;

  if (photoData) {
    const savedPath = saveBase64Image(photoData);
    if (savedPath) {
      storedFilePath = savedPath;
      normalizedPhotoUrl = savedPath;
    }
  }

  if (!trimmedName || !trimmedLga) {
    return res.status(400).json({ error: "Candidate name and LGA are required" });
  }

  try {
    await execute(
      `INSERT INTO Candidates (name, lga, photoUrl, periodId, published, votes)
       VALUES (?, ?, ?, NULL, 0, 0)`,
      [trimmedName, trimmedLga, normalizedPhotoUrl]
    );

    emitUpdate(req, "candidatesUpdated");
    res.status(201).json({ message: "Candidate added" });
  } catch (error) {
    if (storedFilePath) {
      deleteUploadedFile(storedFilePath);
    }
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
    const candidate = await queryOne(
      `SELECT photoUrl FROM Candidates WHERE id = ? AND published = 0 AND periodId IS NULL`,
      [candidateId]
    );

    if (!candidate) {
      return res.status(404).json({ error: "Candidate not found or already published" });
    }

    await execute(
      `DELETE FROM Candidates WHERE id = ? AND published = 0 AND periodId IS NULL`,
      [candidateId]
    );

    deleteUploadedFile(candidate.photoUrl);

    emitUpdate(req, "candidatesUpdated");
    res.json({ message: "Candidate removed" });
  } catch (error) {
    console.error("Remove candidate error:", error);
    res.status(500).json({ error: "Remove candidate failed" });
  }
});

router.get("/get-candidates", adminMiddleware, async (req, res) => {
  try {
    const baseUrl = getPublicBaseUrl(req);
    const latestPeriod = await getLatestPeriod();

    if (latestPeriod) {
      const rows = await query(
        `SELECT * FROM Candidates WHERE periodId = ? OR periodId IS NULL ORDER BY createdAt DESC`,
        [latestPeriod.id]
      );
      return res.json(normalizeCandidateRows(rows, baseUrl));
    }

    const rows = await query(
      "SELECT * FROM Candidates WHERE periodId IS NULL ORDER BY createdAt DESC"
    );
    res.json(normalizeCandidateRows(rows, baseUrl));
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
    const baseUrl = getPublicBaseUrl(req);
    const rows = await query(
      `SELECT * FROM Candidates WHERE periodId = ? ORDER BY votes DESC, name ASC`,
      [periodId]
    );
    res.json(normalizeCandidateRows(rows, baseUrl));
  } catch (error) {
    console.error("Get candidates for period error:", error);
    res.status(500).json({ error: "Fetch failed" });
  }
});

router.get("/get-period", adminMiddleware, async (req, res) => {
  try {
    const latestPeriod = await getLatestPeriod();
    res.json(latestPeriod);
  } catch (error) {
    console.error("Get period error:", error);
    res.status(500).json({ error: "Failed to fetch period" });
  }
});

router.get("/results", adminMiddleware, async (req, res) => {
  const { periodId } = req.query;
  try {
    let targetPeriodId = periodId;
    if (!targetPeriodId) {
      const latestPeriod = await getLatestPeriod();
      if (!latestPeriod) {
        return res.json([]);
      }
      targetPeriodId = latestPeriod.id;
    }

    const baseUrl = getPublicBaseUrl(req);
    const rows = await query(
      `SELECT c.id, c.name, c.lga, c.photoUrl, c.votes
       FROM Candidates c
       WHERE c.periodId = ?
       ORDER BY c.votes DESC, c.name ASC`,
      [targetPeriodId]
    );
    res.json(normalizeCandidateRows(rows, baseUrl));
  } catch (error) {
    console.error("Get results error:", error);
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

router.get("/periods", adminMiddleware, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM VotingPeriod ORDER BY startTime DESC"
    );
    res.json(rows);
  } catch (error) {
    console.error("Get periods error:", error);
    res.status(500).json({ error: "Failed to fetch periods" });
  }
});

router.delete("/period", adminMiddleware, async (req, res) => {
  const { periodId } = req.query;

  const parsedId = Number.parseInt(periodId, 10);
  if (!periodId || Number.isNaN(parsedId)) {
    return res.status(400).json({ error: "Valid periodId is required" });
  }

  try {
    const period = await queryOne("SELECT * FROM VotingPeriod WHERE id = ?", [parsedId]);
    if (!period) {
      return res.status(404).json({ error: "Voting period not found" });
    }

    const endTime = new Date(period.endTime);
    const hasEndedByTime = !Number.isNaN(endTime.getTime()) && endTime <= new Date();
    const periodEnded = toBool(period.resultsPublished) || toBool(period.forcedEnded) || hasEndedByTime;

    if (!periodEnded) {
      return res.status(400).json({ error: "Cannot delete an active voting period" });
    }

    const candidatePhotos = await query(
      `SELECT photoUrl FROM Candidates WHERE periodId = ?`,
      [parsedId]
    );

    await withTransaction(async (tx) => {
      await tx.execute("DELETE FROM Votes WHERE periodId = ?", [parsedId]);
      await tx.execute("DELETE FROM Candidates WHERE periodId = ?", [parsedId]);
      await tx.execute("DELETE FROM VotingPeriod WHERE id = ?", [parsedId]);
    });

    candidatePhotos.forEach((row) => {
      deleteUploadedFile(row?.photoUrl);
    });

    emitUpdate(req, "periodDeleted", { periodId: parsedId });
    emitUpdate(req, "candidatesUpdated");

    res.json({ message: "Voting period deleted" });
  } catch (error) {
    console.error("Delete period error:", error);
    res.status(500).json({ error: "Delete period failed" });
  }
});

module.exports = router;
