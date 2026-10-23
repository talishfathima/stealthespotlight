import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../config/database.js";
import { config } from "../config/env.js";
import type { User } from "../config/types.js";

declare module "express-session" {
  interface SessionData {
    user?: User;
  }
}

type TokenPayload = User & { exp: number };

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

/**
 * Per-tab auth token. The cookie session is shared by every tab in a browser,
 * so logging in as a judge in one tab would otherwise log the admin out in
 * another. This token is stored in sessionStorage and sent with each request.
 */
export function createAuthToken(user: User): string {
  const payload: TokenPayload = { ...user, exp: Date.now() + TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", config.sessionSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyAuthToken(token: string | null | undefined): User | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = crypto.createHmac("sha256", config.sessionSecret).update(body).digest("base64url");
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    if (typeof payload.id !== "number") return null;
    if (payload.role !== "admin" && payload.role !== "judge") return null;
    return {
      id: payload.id,
      username: payload.username,
      display_name: payload.display_name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export function resolveUser(req: Request): User | null {
  const header = req.headers["x-auth-token"];
  const token = Array.isArray(header) ? header[0] : header;
  return verifyAuthToken(token) ?? req.session.user ?? null;
}

export async function findUserByUsername(username: string): Promise<(User & { password_hash: string }) | null> {
  const normalized = username.trim().toLowerCase();
  const result = await pool.query("SELECT * FROM users WHERE username = $1", [normalized]);
  return (result.rows[0] as User & { password_hash: string }) ?? null;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = resolveUser(req);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  res.locals.user = user;
  next();
}

export function requireJudge(req: Request, res: Response, next: NextFunction) {
  const user = resolveUser(req);
  if (!user || user.role !== "judge") {
    return res.status(403).json({ error: "Judge access required." });
  }
  res.locals.user = user;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "Authentication required." });
  }
  res.locals.user = user;
  next();
}
