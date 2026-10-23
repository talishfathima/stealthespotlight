import http from "http";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import { Server as SocketServer, type Socket } from "socket.io";
import { config } from "./config/env.js";
import { isMemoryDatabaseActive, pool } from "./config/database.js";
import { verifyAuthToken } from "./middleware/auth.js";
import type { User } from "./config/types.js";
import { runMigrations } from "./models/migrate.js";
import { api } from "./routes/api.js";
import { broadcastState, onStateChange, getPublicState, getAdminState } from "./services/stateService.js";
import { getMySubmission } from "./services/scoreService.js";

const PgStore = connectPgSimple(session);

async function main() {
  await runMigrations();

  const app = express();
  const server = http.createServer(app);
  const allowedOrigins = new Set(config.clientUrls.map((origin) => origin.replace(/\/$/, "")));

  const isAllowedOrigin = (origin: string | undefined): boolean => {
    if (!origin) return true;
    const normalizedOrigin = origin.replace(/\/$/, "");
    if (allowedOrigins.has(normalizedOrigin)) return true;
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(normalizedOrigin);
  };

  app.set("trust proxy", 1);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));

  const sessionMiddleware = session({
    store: isMemoryDatabaseActive
      ? new session.MemoryStore()
      : new PgStore({
          pool,
          tableName: "session",
          createTableIfMissing: true,
        }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProd,
      maxAge: 1000 * 60 * 60 * 12,
    },
  });

  app.use(sessionMiddleware);

  app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use("/api", api);

  const io = new SocketServer(server, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    },
  });

  // Share express-session with socket.io so we know who is connecting.
  io.engine.use(sessionMiddleware);

  function socketUser(socket: Socket): User | null {
    const handshake = socket.handshake.auth as { authToken?: unknown } | undefined;
    const tokenUser = verifyAuthToken(
      typeof handshake?.authToken === "string" ? handshake.authToken : null
    );
    if (tokenUser) return tokenUser;

    const sessionUser = (socket.request as unknown as { session?: { user?: User } })?.session?.user;
    return sessionUser ?? null;
  }

  function socketRole(socket: Socket): "admin" | "judge" | "public" {
    const user = socketUser(socket);
    if (user?.role === "admin") return "admin";
    if (user?.role === "judge") return "judge";
    return "public";
  }

  function socketJudgeId(socket: Socket): number | null {
    const user = socketUser(socket);
    return user?.role === "judge" ? user.id : null;
  }

  async function pushStateTo(socket: Socket) {
    try {
      const currentRole = socketRole(socket);
      if (currentRole === "admin") {
        socket.emit("state", await getAdminState());
      } else if (currentRole === "judge") {
        const publicState = await getPublicState();
        const judgeId = socketJudgeId(socket);
        const mySubmission =
          judgeId !== null
            ? await getMySubmission(judgeId, publicState.activeParticipant?.id ?? null)
            : null;
        socket.emit("state", { ...publicState, mySubmission });
      } else {
        socket.emit("state", await getPublicState());
      }
    } catch (error) {
      console.error("[socket] state push failed:", error);
    }
  }

  io.on("connection", (socket) => {
    const role = socketRole(socket);
    socket.join(role === "admin" ? "admins" : role === "judge" ? "judges" : "audience");

    void pushStateTo(socket);

    socket.on("request_state", () => {
      void pushStateTo(socket);
    });
  });

  onStateChange(({ scope }) => {
    const rooms = scope === "admin" ? ["admins", "judges"] : ["audience", "judges"];
    for (const room of rooms) {
      for (const socketId of io.sockets.adapter.rooms.get(room) ?? []) {
        const target = io.sockets.sockets.get(socketId);
        if (!target) continue;
        void pushStateTo(target);
      }
    }
  });

  // Heartbeat so every client can re-sync its clock offset to the server.
  setInterval(() => {
    io.emit("clock", { serverTime: new Date().toISOString() });
  }, 2000);

  server.listen(config.port, () => {
    console.log(`[server] Authorcraft Steal the Spotlight API on http://localhost:${config.port}`);
    void broadcastState();
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
