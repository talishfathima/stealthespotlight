import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../config/database.js";
import {
  createAuthToken,
  findUserByUsername,
  requireAdmin,
  requireAuth,
  requireJudge,
  resolveUser,
  verifyPassword,
} from "../middleware/auth.js";
import {
  broadcastState,
  getAdminState,
  getJudges,
  getParticipantById,
  getParticipants,
  getPublicState,
  getPublishedResults,
  getSession,
  publishResults,
  resetAllScores,
  setActiveParticipant,
  startVoting,
  closeVoting,
  unpublishResults,
} from "../services/stateService.js";
import { correctScore, getMySubmission, submitScore } from "../services/scoreService.js";
import { validateAudienceScore } from "../services/audienceVote.js";
import type { Participant, User } from "../config/types.js";

export const api = Router();

function currentUser(res: any): User {
  return res.locals.user as User;
}

function handleError(res: any, error: any) {
  const status = error.status ?? 500;
  if (status >= 500) console.error("[api]", error);
  res.status(status).json({ error: error.message ?? "Server error." });
}

// ---------- Auth ----------

api.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(422).json({ error: "Username and password are required." });
    }
    const user = await findUserByUsername(username.trim());
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid credentials." });
    }
    const sessionUser: User = {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
    };
    req.session.user = sessionUser;
    res.json({ user: sessionUser, authToken: createAuthToken(sessionUser) });
  } catch (error) {
    handleError(res, error);
  }
});

api.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

api.get("/auth/me", (req, res) => {
  const user = resolveUser(req);
  res.json({ user, authToken: user ? createAuthToken(user) : null });
});

api.post("/auth/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(422).json({ error: "New password must be at least 8 characters." });
    }
    const user = await findUserByUsername(currentUser(res).username);
    if (!user || !(await verifyPassword(currentPassword ?? "", user.password_hash))) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, user.id]);
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

// ---------- Public state (audience + judge) ----------

api.get("/state", async (_req, res) => {
  try {
    res.json(await getPublicState());
  } catch (error) {
    handleError(res, error);
  }
});

api.get("/state/judge", requireJudge, async (req, res) => {
  try {
    const publicState = await getPublicState();
    const mySubmission = await getMySubmission(
      currentUser(res).id,
      publicState.activeParticipant?.id ?? null
    );
    res.json({ ...publicState, mySubmission });
  } catch (error) {
    handleError(res, error);
  }
});

api.get("/state/admin", requireAdmin, async (_req, res) => {
  try {
    res.json(await getAdminState());
  } catch (error) {
    handleError(res, error);
  }
});

api.get("/results", async (_req, res) => {
  try {
    const results = await getPublishedResults();
    if (!results) return res.status(404).json({ error: "Results have not been published yet." });
    res.json(results);
  } catch (error) {
    handleError(res, error);
  }
});

api.post("/audience/vote", async (req, res) => {
  try {
    const { voterId, score } = req.body ?? {};
    if (typeof voterId !== "string" || voterId.trim().length < 8 || voterId.trim().length > 100) {
      return res.status(422).json({ error: "A valid anonymous ballot id is required." });
    }

    const session = await getSession();
    if (session.status !== "voting_open") {
      return res.status(409).json({ error: "Audience voting is not open right now." });
    }

    const numericScore = Number(score);
    if (!validateAudienceScore(numericScore, session.scoring_min, session.scoring_max)) {
      return res.status(422).json({ error: `Score must be an integer between ${session.scoring_min} and ${session.scoring_max}.` });
    }

    const participantId = session.active_participant_id;
    if (!participantId) {
      return res.status(400).json({ error: "There is no active performer for this round." });
    }

    const inserted = await pool.query(
      `INSERT INTO audience_votes (token, participant_id, score)
       VALUES ($1, $2, $3)
       ON CONFLICT (participant_id, token) DO NOTHING
       RETURNING id`,
      [voterId.trim(), participantId, numericScore]
    );
    if (!inserted.rowCount) {
      return res.status(409).json({ error: "You already voted for this performer." });
    }

    res.json({ ok: true, participantId, score: numericScore });
  } catch (error) {
    handleError(res, error);
  }
});

// ---------- Admin: participants ----------

api.get("/participants", requireAuth, async (_req, res) => {
  try {
    res.json(await getParticipants());
  } catch (error) {
    handleError(res, error);
  }
});

api.post("/participants", requireAdmin, async (req, res) => {
  try {
    const { number, name, performance_title, photo_url } = req.body ?? {};
    if (!Number.isInteger(number) || number < 1) {
      return res.status(422).json({ error: "Participant number must be a positive integer." });
    }
    if (typeof name !== "string" || !name.trim()) {
      return res.status(422).json({ error: "Participant name is required." });
    }
    const maxOrder = await pool.query("SELECT COALESCE(MAX(display_order), -1) AS m FROM participants");
    const result = await pool.query(
      `INSERT INTO participants (number, name, performance_title, photo_url, display_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [number, name.trim(), performance_title?.trim() || null, photo_url?.trim() || null, maxOrder.rows[0].m + 1]
    );
    await pool.query(
      `INSERT INTO event_audit (actor_id, action, details) VALUES ($1, 'participant_created', $2)`,
      [currentUser(res).id, JSON.stringify({ id: result.rows[0].id })]
    );
    await broadcastState();
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "That participant number is already in use." });
    }
    handleError(res, error);
  }
});

// NOTE: this route must stay above "/participants/:id" or Express will treat
// "reorder" as an id and the update handler will shadow it.
api.put("/participants/reorder", requireAdmin, async (req, res) => {
  try {
    const { order } = req.body ?? {};
    if (!Array.isArray(order) || order.some((n: unknown) => !Number.isInteger(n))) {
      return res.status(422).json({ error: "Order must be an array of participant ids." });
    }
    await pool.query("BEGIN");
    for (let i = 0; i < order.length; i++) {
      await pool.query("UPDATE participants SET display_order = $1 WHERE id = $2", [i, order[i]]);
    }
    await pool.query("COMMIT");
    await broadcastState();
    res.json(await getParticipants());
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => undefined);
    handleError(res, error);
  }
});

api.put("/participants/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { number, name, performance_title, photo_url } = req.body ?? {};
    if (!Number.isInteger(number) || number < 1) {
      return res.status(422).json({ error: "Participant number must be a positive integer." });
    }
    if (typeof name !== "string" || !name.trim()) {
      return res.status(422).json({ error: "Participant name is required." });
    }
    const result = await pool.query(
      `UPDATE participants
       SET number = $1, name = $2, performance_title = $3, photo_url = $4, updated_at = now()
       WHERE id = $5
       RETURNING *`,
      [number, name.trim(), performance_title?.trim() || null, photo_url?.trim() || null, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Participant not found." });
    await pool.query(
      `INSERT INTO event_audit (actor_id, action, details) VALUES ($1, 'participant_updated', $2)`,
      [currentUser(res).id, JSON.stringify({ id })]
    );
    await broadcastState();
    res.json(result.rows[0]);
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "That participant number is already in use." });
    }
    handleError(res, error);
  }
});

api.delete("/participants/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await pool.query("DELETE FROM participants WHERE id = $1 RETURNING id", [id]);
    if (!result.rows[0]) return res.status(404).json({ error: "Participant not found." });
    await pool.query(
      `INSERT INTO event_audit (actor_id, action, details) VALUES ($1, 'participant_deleted', $2)`,
      [currentUser(res).id, JSON.stringify({ id })]
    );
    await broadcastState();
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

// ---------- Admin: event control ----------

api.post("/event/select-participant", requireAdmin, async (req, res) => {
  try {
    const { participantId } = req.body ?? {};
    const session = await setActiveParticipant(
      participantId === null || participantId === undefined ? null : Number(participantId),
      currentUser(res).id
    );
    res.json(session);
  } catch (error) {
    handleError(res, error);
  }
});

api.post("/event/open-voting", requireAdmin, async (_req, res) => {
  try {
    const session = await startVoting();
    res.json(session);
  } catch (error) {
    handleError(res, error);
  }
});

api.post("/event/close-voting", requireAdmin, async (req, res) => {
  try {
    const session = await closeVoting({ reason: "manual", actorId: currentUser(res).id });
    res.json(session);
  } catch (error) {
    handleError(res, error);
  }
});

api.post("/event/publish-results", requireAdmin, async (req, res) => {
  try {
    await publishResults(currentUser(res).id);
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

api.post("/event/unpublish-results", requireAdmin, async (req, res) => {
  try {
    await unpublishResults(currentUser(res).id);
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

api.post("/event/reset", requireAdmin, async (req, res) => {
  try {
    await resetAllScores(currentUser(res).id);
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

// ---------- Judge: scores ----------

api.post("/scores", requireJudge, async (req, res) => {
  try {
    const { participantId, score } = req.body ?? {};
    if (!Number.isInteger(participantId)) {
      return res.status(422).json({ error: "participantId is required." });
    }
    if (!Number.isInteger(score)) {
      return res.status(422).json({ error: "score must be a whole number." });
    }
    const row = await submitScore({
      participantId,
      judgeId: currentUser(res).id,
      score,
    });
    res.status(201).json({ id: row.id, score: row.score });
  } catch (error) {
    handleError(res, error);
  }
});

// ---------- Admin: score corrections ----------

api.post("/scores/:id/correct", requireAdmin, async (req, res) => {
  try {
    const { newScore, reason } = req.body ?? {};
    if (!Number.isInteger(newScore)) {
      return res.status(422).json({ error: "newScore must be a whole number." });
    }
    const row = await correctScore({
      scoreId: Number(req.params.id),
      newScore,
      actorId: currentUser(res).id,
      reason: typeof reason === "string" ? reason : "",
    });
    res.json(row);
  } catch (error) {
    handleError(res, error);
  }
});

api.get("/scores/audit", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.display_name AS actor_name
       FROM score_audit a
       LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC
       LIMIT 200`
    );
    res.json(result.rows);
  } catch (error) {
    handleError(res, error);
  }
});

api.get("/audit", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.display_name AS actor_name
       FROM event_audit a
       LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC
       LIMIT 200`
    );
    res.json(result.rows);
  } catch (error) {
    handleError(res, error);
  }
});

// ---------- Admin: judges ----------

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

api.get("/judges", requireAdmin, async (_req, res) => {
  try {
    res.json(await getJudges());
  } catch (error) {
    handleError(res, error);
  }
});

api.post("/judges", requireAdmin, async (req, res) => {
  try {
    const { username, password, displayName } = req.body ?? {};
    const normalized = typeof username === "string" ? username.trim().toLowerCase() : "";
    if (!normalized) {
      return res.status(422).json({ error: "Username is required." });
    }
    if (!USERNAME_PATTERN.test(normalized)) {
      return res.status(422).json({
        error: "Username must be 3-32 characters using letters, numbers, dot, dash or underscore.",
      });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(422).json({ error: "Password must be at least 8 characters." });
    }
    const display = typeof displayName === "string" && displayName.trim() ? displayName.trim() : normalized;

    // Adding a judge mid-round would let them score a round the other judges
    // already finished, or mark them missing for a round they never saw.
    const session = await getSession();
    if (session.status === "voting_open") {
      return res.status(409).json({
        error: "Close voting before adding a judge so every judge scores the same rounds.",
      });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, display_name, role)
       VALUES ($1, $2, $3, 'judge')
       RETURNING id, username, display_name, role, 0 AS score_count`,
      [normalized, hash, display]
    );
    await pool.query(
      `INSERT INTO event_audit (actor_id, action, details)
       VALUES ($1, 'judge_created', $2)`,
      [currentUser(res).id, JSON.stringify({ judgeId: result.rows[0].id, username: normalized })]
    );
    await broadcastState();
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "That username is already taken." });
    }
    handleError(res, error);
  }
});

api.post("/judges/:id/reset-password", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { newPassword } = req.body ?? {};
    if (!Number.isInteger(id)) {
      return res.status(422).json({ error: "Judge id is required." });
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(422).json({ error: "Password must be at least 8 characters." });
    }
    const userResult = await pool.query("SELECT id, role FROM users WHERE id = $1", [id]);
    const user = userResult.rows[0];
    if (!user || user.role !== "judge") {
      return res.status(404).json({ error: "Judge not found." });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, id]);
    await pool.query(
      `INSERT INTO event_audit (actor_id, action, details)
       VALUES ($1, 'judge_password_reset', $2)`,
      [currentUser(res).id, JSON.stringify({ judgeId: id })]
    );
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

api.delete("/judges/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(422).json({ error: "Judge id is required." });
    }
    const userResult = await pool.query("SELECT id, role FROM users WHERE id = $1", [id]);
    const user = userResult.rows[0];
    if (!user || user.role !== "judge") {
      return res.status(404).json({ error: "Judge not found." });
    }

    // Removing a judge would cascade-delete their scores and silently change
    // every average, so it is only allowed before they have been scored.
    const scored = await pool.query(
      "SELECT COUNT(*)::int AS count FROM scores WHERE judge_id = $1",
      [id]
    );
    if (scored.rows[0].count > 0) {
      return res.status(409).json({
        error: "This judge already has scores on record and cannot be removed mid-show.",
      });
    }

    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    await pool.query(
      `INSERT INTO event_audit (actor_id, action, details)
       VALUES ($1, 'judge_deleted', $2)`,
      [currentUser(res).id, JSON.stringify({ judgeId: id })]
    );
    await broadcastState();
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

