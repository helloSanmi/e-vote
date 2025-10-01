//backend/routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query, queryOne, execute } = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

const normalizeEnvList = (value) =>
  (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const ADMIN_EMAILS = normalizeEnvList(process.env.ADMIN_EMAILS);
const ADMIN_USERNAMES = normalizeEnvList(process.env.ADMIN_USERNAMES);

const isAdminUser = (user) => {
  const email = (user.email || "").toLowerCase();
  const username = (user.username || "").toLowerCase();
  return ADMIN_EMAILS.includes(email) || ADMIN_USERNAMES.includes(username);
};

const ensureJwtConfigured = (res) => {
  if (!JWT_SECRET) {
    res.status(500).json({ error: "JWT secret not configured" });
    return false;
  }
  return true;
};

// Register User
router.post("/register", async (req, res) => {
  const { fullName, username, email, password } = req.body || {};

  if (!fullName || !username || !email || !password) {
    return res.status(400).json({ error: "fullName, username, email and password are required" });
  }

  try {
    const existing = await query(
      `SELECT id, username, email
       FROM Users
       WHERE username = ? OR email = ?`,
      [username, email]
    );

    if (existing.length > 0) {
      const conflict = existing[0];
      const conflictField = conflict.email === email ? "email" : "username";
      return res.status(409).json({ error: `A user with that ${conflictField} already exists` });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await execute(
      `INSERT INTO Users (fullName, username, email, password)
       VALUES (?, ?, ?, ?)`,
      [fullName, username, email, hashedPassword]
    );

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Error registering user" });
  }
});

// Login User
router.post("/login", async (req, res) => {
  if (!ensureJwtConfigured(res)) {
    return;
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email (or username) and password are required" });
  }

  try {
    const user = await queryOne(
      `SELECT TOP (1) * FROM Users WHERE email = ? OR username = ?`,
      [email, email]
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const isAdmin = isAdminUser(user);
    const tokenPayload = {
      id: user.id,
      email: user.email,
      username: user.username,
      isAdmin,
    };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "8h" });

    res.json({ token, isAdmin });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Error logging in" });
  }
});

// Get Authenticated User Info
router.get("/me", async (req, res) => {
  if (!ensureJwtConfigured(res)) {
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Invalid token format" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await queryOne(
      `SELECT id, fullName, username, email, hasVoted FROM Users WHERE id = ?`,
      [decoded.id]
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ ...user, isAdmin: isAdminUser(user) });
  } catch (error) {
    console.error("Me error:", error);
    return res.status(401).json({ error: "Invalid token" });
  }
});

module.exports = router;
