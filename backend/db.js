// backend/db.js
const mysql = require("mysql2/promise");
require("dotenv").config();

let pool;

async function getDbPool() {
  if (pool) return pool;

  pool = await mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "evotedb",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: "Z",
    dateStrings: true,
  });

  // Create tables if they don't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fullName VARCHAR(255) NOT NULL,
      username VARCHAR(255) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      hasVoted BOOLEAN DEFAULT FALSE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CHECK (hasVoted IN (0, 1)),
      INDEX idx_username (username),
      INDEX idx_email (email)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS VotingPeriod (
      id INT AUTO_INCREMENT PRIMARY KEY,
      startTime DATETIME NOT NULL,
      endTime DATETIME NOT NULL,
      resultsPublished BOOLEAN DEFAULT FALSE,
      forcedEnded BOOLEAN DEFAULT FALSE,
      CHECK (resultsPublished IN (0, 1)),
      CHECK (forcedEnded IN (0, 1)),
      INDEX idx_start_end (startTime, endTime)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Candidates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      lga VARCHAR(255),
      photoUrl VARCHAR(255),
      periodId INT NULL,
      published BOOLEAN DEFAULT FALSE,
      votes INT DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CHECK (published IN (0, 1)),
      FOREIGN KEY (periodId) REFERENCES VotingPeriod(id) ON DELETE SET NULL,
      INDEX idx_periodId (periodId),
      INDEX idx_published (published)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Votes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      candidateId INT NOT NULL,
      periodId INT NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (userId, periodId),
      FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE,
      FOREIGN KEY (candidateId) REFERENCES Candidates(id) ON DELETE CASCADE,
      FOREIGN KEY (periodId) REFERENCES VotingPeriod(id) ON DELETE CASCADE,
      INDEX idx_period_candidate (periodId, candidateId),
      INDEX idx_userId (userId)
    );
  `);

  return pool;
}

async function q(sql, params = []) {
  const pool = await getDbPool();
  return pool.query(sql, params);
}

async function getConn() {
  const pool = await getDbPool();
  return pool.getConnection();
}

module.exports = { getDbPool, q, getConn };
