process.env.JWT_SECRET = "test-secret";
process.env.ADMIN_EMAILS = "admin@test.com";
process.env.ADMIN_USERNAMES = "admin";

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

jest.mock("../db", () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  execute: jest.fn(),
  withTransaction: jest.fn(),
  getDbPool: jest.fn(),
}));

const db = require("../db");
const adminRouter = require("../routes/admin");
const voteRouter = require("../routes/vote");
const publicRouter = require("../routes/public");

const adminToken = jwt.sign(
  { id: 1, email: "admin@test.com", username: "admin", isAdmin: true },
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Admin routes", () => {
  test("starts voting and emits updates when no active period", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    const txExecute = jest
      .fn()
      .mockResolvedValueOnce({ recordset: [{ id: 7 }] })
      .mockResolvedValueOnce({ rowsAffected: [3] })
      .mockResolvedValueOnce({});

    db.withTransaction.mockImplementationOnce(async (fn) => {
      return fn({
        execute: txExecute,
      });
    });

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
    expect(txExecute).toHaveBeenCalledTimes(3);
    expect(emitUpdate).toHaveBeenCalledWith("votingStarted", { periodId: 7 });
    expect(emitUpdate).toHaveBeenCalledWith("candidatesUpdated", {});
  });

  test("rejects start when an active period already exists", async () => {
    db.queryOne.mockResolvedValueOnce({
      id: 3,
      startTime: new Date(Date.now() - 1_800_000).toISOString(),
      endTime: new Date(Date.now() + 1_800_000).toISOString(),
      resultsPublished: 0,
      forcedEnded: 0,
    });

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
    expect(db.withTransaction).not.toHaveBeenCalled();
    expect(emitUpdate).not.toHaveBeenCalled();
  });

  test("requires admin authentication", async () => {
    const app = createApp({ path: "/api/admin", router: adminRouter });
    const startTime = new Date(Date.now() + 60_000).toISOString();
    const endTime = new Date(Date.now() + 3_600_000).toISOString();

    const response = await request(app)
      .post("/api/admin/start-voting")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ startTime, endTime });

    expect(response.status).toBe(403);
  });

  test("deletes a concluded period and emits updates", async () => {
    db.queryOne.mockResolvedValueOnce({
      id: 4,
      endTime: new Date(Date.now() - 86_400_000).toISOString(),
      resultsPublished: 1,
      forcedEnded: 0,
    });

    const txExecute = jest.fn().mockResolvedValue({});
    db.withTransaction.mockImplementationOnce(async (fn) => fn({ execute: txExecute }));

    const emitUpdate = jest.fn();
    const app = createApp({ path: "/api/admin", router: adminRouter, emitUpdate });

    const response = await request(app)
      .delete("/api/admin/period")
      .set("Authorization", `Bearer ${adminToken}`)
      .query({ periodId: 4 });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Voting period deleted");
    expect(txExecute).toHaveBeenCalledTimes(3);
    expect(txExecute).toHaveBeenNthCalledWith(1, "DELETE FROM Votes WHERE periodId = ?", [4]);
    expect(txExecute).toHaveBeenNthCalledWith(2, "DELETE FROM Candidates WHERE periodId = ?", [4]);
    expect(txExecute).toHaveBeenNthCalledWith(3, "DELETE FROM VotingPeriod WHERE id = ?", [4]);
    expect(emitUpdate).toHaveBeenCalledWith("periodDeleted", { periodId: 4 });
    expect(emitUpdate).toHaveBeenCalledWith("candidatesUpdated", {});
  });

  test("prevents deleting an active period", async () => {
    db.queryOne.mockResolvedValueOnce({
      id: 8,
      endTime: new Date(Date.now() + 86_400_000).toISOString(),
      resultsPublished: 0,
      forcedEnded: 0,
    });

    const emitUpdate = jest.fn();
    const app = createApp({ path: "/api/admin", router: adminRouter, emitUpdate });

    const response = await request(app)
      .delete("/api/admin/period")
      .set("Authorization", `Bearer ${adminToken}`)
      .query({ periodId: 8 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Cannot delete an active voting period");
    expect(db.withTransaction).not.toHaveBeenCalled();
    expect(emitUpdate).not.toHaveBeenCalled();
  });
});

describe("Vote routes", () => {
  test("casts a vote when within an active period", async () => {
    const now = Date.now();
    db.queryOne
      .mockResolvedValueOnce({
        id: 1,
        startTime: new Date(now - 60_000).toISOString(),
        endTime: new Date(now + 3_600_000).toISOString(),
        forcedEnded: 0,
        resultsPublished: 0,
      })
      .mockResolvedValueOnce({ id: 5 })
      .mockResolvedValueOnce(null);

    const txExecute = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowsAffected: [1] })
      .mockResolvedValueOnce({});

    db.withTransaction.mockImplementationOnce(async (fn) => fn({ execute: txExecute }));

    const emitUpdate = jest.fn();
    const app = createApp({ path: "/api/vote", router: voteRouter, emitUpdate });

    const response = await request(app)
      .post("/api/vote")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ userId: 2, candidateId: 5 });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Vote cast");
    expect(txExecute).toHaveBeenCalledTimes(3);
    expect(emitUpdate).toHaveBeenCalledWith("voteCast", { periodId: 1, candidateId: 5 });
  });

  test("prevents duplicate votes within the same period", async () => {
    const now = Date.now();
    db.queryOne
      .mockResolvedValueOnce({
        id: 1,
        startTime: new Date(now - 60_000).toISOString(),
        endTime: new Date(now + 3_600_000).toISOString(),
        forcedEnded: 0,
        resultsPublished: 0,
      })
      .mockResolvedValueOnce({ id: 5 })
      .mockResolvedValueOnce({ id: 9 });

    const app = createApp({ path: "/api/vote", router: voteRouter });

    const response = await request(app)
      .post("/api/vote")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ userId: 2, candidateId: 5 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("User already voted");
    expect(db.withTransaction).not.toHaveBeenCalled();
  });
});

describe("Public routes", () => {
  test("returns latest period", async () => {
    db.queryOne.mockResolvedValueOnce({ id: 1 });
    const app = createApp({ path: "/api/public", router: publicRouter });

    const response = await request(app).get("/api/public/period");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 1 });
  });
});
