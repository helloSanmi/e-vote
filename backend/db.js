// backend/db.js
const sql = require("mssql");
require("dotenv").config();

let poolPromise;


function createConfig() {
  return {
    server: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 1433),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
  };
}

async function ensureSchema(pool) {
  const request = pool.request();
  await request.batch(`
    IF OBJECT_ID('dbo.Users', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        fullName NVARCHAR(255) NOT NULL,
        username NVARCHAR(255) NOT NULL UNIQUE,
        email NVARCHAR(255) NOT NULL UNIQUE,
        password NVARCHAR(255) NOT NULL,
        hasVoted BIT NOT NULL DEFAULT (0),
        createdAt DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME())
      );
    END;

    IF OBJECT_ID('dbo.VotingPeriod', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.VotingPeriod (
        id INT IDENTITY(1,1) PRIMARY KEY,
        startTime DATETIME2 NOT NULL,
        endTime DATETIME2 NOT NULL,
        resultsPublished BIT NOT NULL DEFAULT (0),
        forcedEnded BIT NOT NULL DEFAULT (0)
      );
      CREATE INDEX IX_VotingPeriod_StartEnd ON dbo.VotingPeriod (startTime, endTime);
    END;

    IF OBJECT_ID('dbo.Candidates', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Candidates (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        lga NVARCHAR(255) NULL,
        photoUrl NVARCHAR(512) NULL,
        periodId INT NULL,
        published BIT NOT NULL DEFAULT (0),
        votes INT NOT NULL DEFAULT (0),
        createdAt DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_Candidates_VotingPeriod FOREIGN KEY (periodId) REFERENCES dbo.VotingPeriod(id) ON DELETE SET NULL
      );
      CREATE INDEX IX_Candidates_PeriodId ON dbo.Candidates (periodId);
      CREATE INDEX IX_Candidates_Published ON dbo.Candidates (published);
    END;

    IF OBJECT_ID('dbo.Votes', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Votes (
        id INT IDENTITY(1,1) PRIMARY KEY,
        userId INT NOT NULL,
        candidateId INT NOT NULL,
        periodId INT NOT NULL,
        createdAt DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_Votes_User FOREIGN KEY (userId) REFERENCES dbo.Users(id) ON DELETE CASCADE,
        CONSTRAINT FK_Votes_Candidate FOREIGN KEY (candidateId) REFERENCES dbo.Candidates(id) ON DELETE CASCADE,
        CONSTRAINT FK_Votes_Period FOREIGN KEY (periodId) REFERENCES dbo.VotingPeriod(id) ON DELETE CASCADE,
        CONSTRAINT UQ_Votes_UserPeriod UNIQUE (userId, periodId)
      );
      CREATE INDEX IX_Votes_PeriodCandidate ON dbo.Votes (periodId, candidateId);
      CREATE INDEX IX_Votes_UserId ON dbo.Votes (userId);
    END;
  `);
}

async function createPool() {
  const config = createConfig();
  const pool = await new sql.ConnectionPool(config).connect();

  pool.on("error", (err) => {
    console.error("MSSQL pool error", err);
  });

  await ensureSchema(pool);
  return pool;
}

async function getDbPool() {
  if (!poolPromise) {
    poolPromise = createPool().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

function bindParameters(request, sqlText, params = []) {
  let index = 0;
  const transformed = sqlText.replace(/\?/g, () => {
    if (index >= params.length) {
      throw new Error("Insufficient parameters supplied for query");
    }
    const paramName = `p${index}`;
    request.input(paramName, params[index]);
    index += 1;
    return `@${paramName}`;
  });

  if (index < params.length) {
    throw new Error("Too many parameters supplied for query");
  }

  return transformed;
}

async function execute(sqlText, params = []) {
  const pool = await getDbPool();
  const request = pool.request();
  const statement = bindParameters(request, sqlText, params);
  return request.query(statement);
}

async function query(sqlText, params = []) {
  const result = await execute(sqlText, params);
  return result.recordset || [];
}

async function queryOne(sqlText, params = []) {
  const rows = await query(sqlText, params);
  return rows.length ? rows[0] : null;
}

async function withTransaction(callback) {
  const pool = await getDbPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  const txRunner = {
    async execute(sqlText, params = []) {
      const request = new sql.Request(transaction);
      const statement = bindParameters(request, sqlText, params);
      return request.query(statement);
    },
    async query(sqlText, params = []) {
      const result = await this.execute(sqlText, params);
      return result.recordset || [];
    },
    async queryOne(sqlText, params = []) {
      const rows = await this.query(sqlText, params);
      return rows.length ? rows[0] : null;
    },
  };

  try {
    const result = await callback(txRunner);
    await transaction.commit();
    return result;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("Transaction rollback failed", rollbackError);
    }
    throw error;
  }
}

module.exports = { getDbPool, execute, query, queryOne, withTransaction };
