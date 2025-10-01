process.env.JWT_SECRET = "test-secret";
process.env.ADMIN_EMAILS = "admin@test.com";
process.env.ADMIN_USERNAMES = "admin";

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

jest.mock("../db", () => {
  const buildConnection = () => ({
    beginTransaction: jest.fn().mockResolvedValue(),
    execute: jest.fn().mockResolvedValue([{}]),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn().mockResolvedValue(),
  });

  const buildPool = () => {
    const connection = buildConnection();
    return {
      execute: jest.fn().mockResolvedValue([[], []]),
      getConnection: jest.fn().mockResolvedValue(connection),
      __connection: connection,
    };
  };

  let pool = buildPool();

  return {
    getDbPool: jest.fn(async () => {
      if (!pool) {
        throw new Error("Mock pool not configured");
      }
      return pool;
    }),
    q: jest.fn(),
    getConn: jest.fn(),
    __createPool: () => buildPool(),
    __setPool: (newPool) => {
      pool = newPool;
    },
    __resetPool: () => {
      pool = null;
    },
  };
});

const db = require("../db");
const adminRouter = require("../routes/admin");
const voteRouter = require("../routes/vote");
const publicRouter = require("../routes/public");

const adminToken = jwt.sign(
  { id: 1, email: "admin@test.com", username: "admin" },
  process.env.JWT_SECRET
);
const userToken = jwt.sign(
  { id: 2, email: "user@test.com", username: "user" },
  process.env.JWT_SECRET
);

const createApp = ({ path, router, emitUpdate }) => {
  const app = express();
  app.use(express.json());
  app.set("emitUpdate", emitUpdate || jest.fn());
  app.use(path, router);
  return app;
};

const prepareDb = () => {
  db.getDbPool.mockClear();
  const pool = db.__createPool();
  db.__setPool(pool);
  return { pool, connection: pool.__connection };
};

describe("Admin routes", () => {
  test("starts voting and emits updates when no active period", async () => {
    const { pool, connection } = prepareDb();
    pool.execute.mockResolvedValueOnce([[], []]);

    connection.execute.mockResolvedValueOnce([{ insertId: 7 }]);
    connection.execute.mockResolvedValueOnce([{ affectedRows: 3 }]);

    const emitUpdate = jest.fn();
    const app = createApp({ path: "/api/admin", router: adminRouter, emitUpdate });

    const now = Date.now();
    const startTime = new Date(now + 60_000).toISOString();
    const endTime = new Date(now + 3_600_000).toISOString();

    const response = await request(app)
      .post("/api/admin/start-voting")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ startTime, endTime });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Voting started", periodId: 7 });
    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(emitUpdate).toHaveBeenCalledWith("votingStarted", { periodId: 7 });
    expect(emitUpdate).toHaveBeenCalledWith("candidatesUpdated", {});
  });

  test("rejects start when an active period already exists", async () => {
    const { pool, connection } = prepareDb();
    pool.execute.mockResolvedValueOnce([
      [
        {
          id: 3,
          startTime: new Date(Date.now() - 1_800_000).toISOString(),
          endTime: new Date(Date.now() + 1_800_000).toISOString(),
          resultsPublished: 0,
          forcedEnded: 0,
        },
      ],
      [],
    ]);

    const emitUpdate = jest.fn();
    const app = createApp({ path: "/api/admin", router: adminRouter, emitUpdate });

    const startTime = new Date(Date.now() + 60_000).toISOString();
    const endTime = new Date(Date.now() + 3_600_000).toISOString();

    const response = await request(app)
      .post("/api/admin/start-voting")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ startTime, endTime });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("There is already an active voting period");
    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(emitUpdate).not.toHaveBeenCalled();
  });

  test("requires admin authentication", async () => {
    prepareDb();
    const app = createApp({ path: "/api/admin", router: adminRouter });
    const startTime = new Date(Date.now() + 60_000).toISOString();
    const endTime = new Date(Date.now() + 3_600_000).toISOString();

    const response = await request(app)
      .post("/api/admin/start-voting")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ startTime, endTime });

    expect(response.status).toBe(403);
  });
});

describe("Vote routes", () => {
  test("casts a vote when within an active period", async () => {
    const { pool, connection } = prepareDb();
    const now = Date.now();
    pool.execute
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            startTime: new Date(now - 60_000).toISOString(),
            endTime: new Date(now + 3_600_000).toISOString(),
            forcedEnded: 0,
            resultsPublished: 0,
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([[{ id: 5 }], []])
      .mockResolvedValueOnce([[], []]);

    const emitUpdate = jest.fn();
    const app = createApp({ path: "/api/vote", router: voteRouter, emitUpdate });

    const response = await request(app)
      .post("/api/vote")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ userId: 2, candidateId: 5 });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Vote cast");
    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalled();
    expect(emitUpdate).toHaveBeenCalledWith("voteCast", { periodId: 1, candidateId: 5 });
  });

  test("prevents duplicate votes within the same period", async () => {
    const { pool } = prepareDb();
    const now = Date.now();
    pool.execute
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            startTime: new Date(now - 60_000).toISOString(),
            endTime: new Date(now + 3_600_000).toISOString(),
            forcedEnded: 0,
            resultsPublished: 0,
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([[{ id: 5 }], []])
      .mockResolvedValueOnce([[{ id: 99 }], []]);

    const app = createApp({ path: "/api/vote", router: voteRouter });

    const response = await request(app)
      .post("/api/vote")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ userId: 2, candidateId: 5 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("User already voted");
  });
});

describe("Public routes", () => {
  test("blocks results when user did not participate", async () => {
    const { pool } = prepareDb();
    pool.execute
      .mockResolvedValueOnce([[{ id: 1, resultsPublished: 1 }], []])
      .mockResolvedValueOnce([[], []]);

    const app = createApp({ path: "/api/public", router: publicRouter });

    const response = await request(app)
      .get("/api/public/public-results")
      .query({ periodId: 1, userId: 2 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ published: true, results: [], noParticipation: true });
  });

  test("returns published results to participating users", async () => {
    const { pool } = prepareDb();
    pool.execute
      .mockResolvedValueOnce([[{ id: 1, resultsPublished: 1 }], []])
      .mockResolvedValueOnce([[{ id: 55 }], []])
      .mockResolvedValueOnce([
        [
          {
            id: 5,
            name: "Candidate A",
            lga: "Central",
            photoUrl: null,
            votes: 12,
          },
        ],
        [],
      ]);

    const app = createApp({ path: "/api/public", router: publicRouter });

    const response = await request(app)
      .get("/api/public/public-results")
      .query({ periodId: 1, userId: 2 });

    expect(response.status).toBe(200);
    expect(response.body.published).toBe(true);
    expect(response.body.results).toEqual([
      {
        id: 5,
        name: "Candidate A",
        lga: "Central",
        photoUrl: null,
        votes: 12,
      },
    ]);
  });
});
