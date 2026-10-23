import { pool, withTransaction } from "../config/database.js";
import type { ScoreRow } from "../config/types.js";
import { broadcastState, getSession } from "./stateService.js";

export class ScoreError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function submitScore(input: {
  participantId: number;
  judgeId: number;
  score: number;
}): Promise<ScoreRow> {
  const { participantId, judgeId, score } = input;

  const session = await getSession();
  if (session.status !== "voting_open") {
    throw new ScoreError("Voting is not open.", 403);
  }
  if (!session.active_participant_id || session.active_participant_id !== participantId) {
    throw new ScoreError("This participant is not currently performing.", 403);
  }
  if (!Number.isInteger(score) || score < session.scoring_min || score > session.scoring_max) {
    throw new ScoreError(
      `Score must be a whole number between ${session.scoring_min} and ${session.scoring_max}.`,
      422
    );
  }

  const result = await withTransaction(async (client) => {
    // Re-check state inside the transaction so a close cannot be raced.
    const sessionResult = await client.query("SELECT * FROM event_sessions WHERE id = 1 FOR UPDATE");
    const freshSession = sessionResult.rows[0];
    if (freshSession.status !== "voting_open") {
      throw new ScoreError("Voting is not open.", 403);
    }
    if (freshSession.active_participant_id !== participantId) {
      throw new ScoreError("This participant is not currently performing.", 403);
    }

    const existing = await client.query(
      "SELECT * FROM scores WHERE participant_id = $1 AND judge_id = $2 FOR UPDATE",
      [participantId, judgeId]
    );
    const row = existing.rows[0];
    if (row && !row.is_missing && row.score !== null) {
      throw new ScoreError("You have already submitted a score for this participant.", 409);
    }

    const updated = row
      ? await client.query(
          `UPDATE scores
           SET score = $1, is_missing = FALSE, submitted_at = now(), updated_at = now()
           WHERE id = $2
           RETURNING *`,
          [score, row.id]
        )
      : await client.query(
          `INSERT INTO scores (participant_id, judge_id, score, is_missing, submitted_at)
           VALUES ($1, $2, $3, FALSE, now())
           RETURNING *`,
          [participantId, judgeId, score]
        );

    await client.query(
      `INSERT INTO score_audit (score_id, actor_id, action, old_value, new_value)
       VALUES ($1, $2, 'score_submitted', $3, $4)`,
      [updated.rows[0].id, judgeId, row?.score != null ? String(row.score) : null, String(score)]
    );

    return updated.rows[0] as ScoreRow;
  });

  await broadcastState();
  return result;
}

export async function correctScore(input: {
  scoreId: number;
  newScore: number;
  actorId: number;
  reason: string;
}): Promise<ScoreRow> {
  const { scoreId, newScore, actorId, reason } = input;
  if (!reason?.trim()) throw new ScoreError("A reason is required for score corrections.", 422);

  const session = await getSession();
  if (!Number.isInteger(newScore) || newScore < session.scoring_min || newScore > session.scoring_max) {
    throw new ScoreError(
      `Score must be a whole number between ${session.scoring_min} and ${session.scoring_max}.`,
      422
    );
  }

  const updated = await withTransaction(async (client) => {
    const existing = await client.query("SELECT * FROM scores WHERE id = $1 FOR UPDATE", [scoreId]);
    const row = existing.rows[0];
    if (!row) throw new ScoreError("Score not found.", 404);

    const result = await client.query(
      `UPDATE scores
       SET score = $1, is_missing = FALSE, is_corrected = TRUE, submitted_at = COALESCE(submitted_at, now()), updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [newScore, scoreId]
    );

    await client.query(
      `INSERT INTO score_audit (score_id, actor_id, action, old_value, new_value, reason)
       VALUES ($1, $2, 'score_corrected', $3, $4, $5)`,
      [scoreId, actorId, row.score != null ? String(row.score) : "missing", String(newScore), reason]
    );

    return result.rows[0] as ScoreRow;
  });

  await broadcastState();
  return updated;
}

export async function getMySubmission(
  judgeId: number,
  participantId: number | null
): Promise<{ score: number | null; isMissing: boolean; isCorrected: boolean } | null> {
  if (!participantId) return null;
  const result = await pool.query(
    "SELECT score, is_missing, is_corrected FROM scores WHERE participant_id = $1 AND judge_id = $2",
    [participantId, judgeId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { score: row.score, isMissing: row.is_missing, isCorrected: row.is_corrected };
}
