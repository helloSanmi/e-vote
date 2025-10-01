// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { getDbPool } = require("./db");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

// Allow requests from any origin (use a more restrictive setup in production)
app.use(
  cors({
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/vote", require("./routes/vote"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/public", require("./routes/public"));

// Create server and Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Emit updates
const emitUpdate = (eventName, data) => {
  io.emit(eventName, data || {});
};
app.set("socketio", io);
app.set("emitUpdate", emitUpdate);

io.on("connection", (socket) => {
  socket.on("triggerUpdate", (eventName, payload) => {
    if (typeof eventName === "string" && eventName.trim()) {
      emitUpdate(eventName.trim(), payload);
    }
  });
});

// Listen on HOST and PORT from environment variables
getDbPool()
  .then(() => {
    const HOST = process.env.HOST || "0.0.0.0";
    const PORT = Number(process.env.PORT || 5050);
    server.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialise database pool:", error);
    process.exit(1);
  });
