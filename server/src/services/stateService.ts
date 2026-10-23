import { pool, withTransaction } from "../config/database.js";
import { config } from "../config/env.js";
import { generateAudienceRoundToken } from "./audienceVote.js";
import type {
  AdminState,
  EventSession,
  EventStatus,
  JudgeAccount,
  LeaderboardEntry,
  Participant,
  PublicState,
  PublishedResults,
  ScoreRow,
} from "../config/types.js";

type Listener = (payload: { scope: "public" | "admin"; state: PublicState | AdminState }) => void;

const listeners = new Set<Listener>();

export function onStateChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(scope: "public" | "admin", state: PublicState | AdminState) {
  for (const listener of listeners) {
    try {
      listener({ scope, state });
    } catch (error) {
      console.error("[state] listener error:", error);
    }
  }
}

export async function getSession(): Promise<EventSession> {
  const row = await pool.query("SELECT * FROM event_sessions WHERE id = 1");
  return row.rows[0] as EventSession;
}

export async function getParticipants(): Promise<Participant[]> {
  const result = await pool.query("SELECT * FROM participants ORDER BY display_order ASC, number ASC");
  return result.rows as Participant[];
}

export async function getParticipantById(id: number): Promise<Participant | null> {
  const result = await pool.query("SELECT * FROM participants WHERE id = $1", [id]);
  return (result.rows[0] as Participant) ?? null;
}

/** Judge roster with the number of scores each one has on record. */
export async function getJudges(): Promise<JudgeAccount[]> {
  const result = await pool.query(
    `SELECT users.id, users.username, users.display_name, users.role,
            COUNT(scores.id)::int AS score_count
     FROM users
     LEFT JOIN scores ON scores.judge_id = users.id
     WHERE users.role = 'judge'
     GROUP BY users.id, users.username, users.display_name, users.role
     ORDER BY users.id`
  );
  return result.rows as JudgeAccount[];
}

/** Voting now stays open until an admin closes it. */
export async function reconcileDeadline(): Promise<EventSession> {
  return getSession();
}

export async function startVoting(): Promise<EventSession> {
  const newSession = await withTransaction(async (client) => {
    const sessionResult = await client.query("SELECT * FROM event_sessions WHERE id = 1 FOR UPDATE");
    const session = sessionResult.rows[0] as EventSession;

    if (session.status === "voting_open") {
      throw Object.assign(new Error("Voting is already open."), { status: 409 });
    }
    if (!session.active_participant_id) {
      throw Object.assign(new Error("Select a performer before opening voting."), { status: 400 });
    }

    const now = new Date();
    const token = generateAudienceRoundToken();

    const updated = await client.query(
      `UPDATE event_sessions
       SET status = 'voting_open',
           audience_vote_token = $1,
           audience_vote_participant_id = $2,
           audience_vote_generated_at = $3,
           voting_opened_at = $4,
           voting_deadline_at = NULL,
           voting_duration_sec = 0,
           updated_at = now()
       WHERE id = 1
       RETURNING *`,
      [token, session.active_participant_id, now.toISOString(), now.toISOString()]
    );

    await client.query(
      `INSERT INTO event_audit (actor_id, action, details)
       VALUES ($1, 'voting_opened', $2)`,
      [null, JSON.stringify({ participantId: session.active_participant_id, audienceVoteToken: token })]
    );

    return updated.rows[0] as EventSession;
  });

  await broadcastState();
  return newSession;
}

export async function closeVoting(opts: {
  reason: "manual" | "participant_switch";
  actorId?: number;
}): Promise<EventSession> {
  const session = await withTransaction(async (client) => {
    const currentResult = await client.query("SELECT * FROM event_sessions WHERE id = 1 FOR UPDATE");
    const current = currentResult.rows[0] as EventSession;
    if (current.status !== "voting_open") return current;

    const updated = await client.query(
      `UPDATE event_sessions
       SET status = 'voting_closed',
           audience_vote_token = NULL,
           audience_vote_participant_id = NULL,
           audience_vote_generated_at = NULL,
           updated_at = now()
       WHERE id = 1 AND status = 'voting_open'
       RETURNING *`
    );
    const newSession = updated.rows[0] as EventSession;

    if (newSession.active_participant_id) {
      await client.query(
        `INSERT INTO scores (participant_id, judge_id, score, is_missing, submitted_at)
         SELECT $1, u.id, NULL, TRUE, now()
         FROM users u
         WHERE u.role = 'judge'
           AND NOT EXISTS (
             SELECT 1 FROM scores s WHERE s.participant_id = $1 AND s.judge_id = u.id
           )
         ON CONFLICT (participant_id, judge_id) DO NOTHING`,
        [newSession.active_participant_id]
      );
    }

    await client.query(
      `INSERT INTO event_audit (actor_id, action, details)
       VALUES ($1, 'voting_closed', $2)`,
      [opts.actorId ?? null, JSON.stringify({ reason: opts.reason })]
    );

    return newSession;
  });

  await broadcastState();
  return session;
}

export async function setActiveParticipant(
  participantId: number | null,
  actorId?: number
): Promise<EventSession> {
  if (participantId !== null) {
    const participant = await getParticipantById(participantId);
    if (!participant) {
      throw Object.assign(new Error("Participant not found."), { status: 404 });
    }
  }

  const session = await withTransaction(async (client) => {
    const currentResult = await client.query("SELECT * FROM event_sessions WHERE id = 1 FOR UPDATE");
    const current = currentResult.rows[0] as EventSession;

    let effectiveId = participantId;
    if (current.status === "voting_open" && participantId !== current.active_participant_id) {
      const updated = await client.query(
        `UPDATE event_sessions SET status = 'voting_closed', updated_at = now() WHERE id = 1 AND status = 'voting_open' RETURNING *`
      );
      const closed = updated.rows[0] as EventSession;
      if (closed.active_participant_id) {
        await client.query(
          `INSERT INTO scores (participant_id, judge_id, score, is_missing, submitted_at)
           SELECT $1, u.id, NULL, TRUE, now()
           FROM users u WHERE u.role = 'judge'
             AND NOT EXISTS (SELECT 1 FROM scores s WHERE s.participant_id = $1 AND s.judge_id = u.id)
           ON CONFLICT (participant_id, judge_id) DO NOTHING`,
          [closed.active_participant_id]
        );
      }
    }

    let status = current.status;
    if (current.status === "voting_open" || current.status === "voting_closed") {
      status = participantId === null ? "ready" : "voting_closed";
    }
    if (current.status === "completed") {
      status = participantId === null ? "completed" : "voting_closed";
    }

    const result = await client.query(
      `UPDATE event_sessions
       SET active_participant_id = $1, status = $2,
           audience_vote_token = NULL,
           audience_vote_participant_id = NULL,
           audience_vote_generated_at = NULL,
           voting_opened_at = NULL,
           voting_deadline_at = NULL, updated_at = now()
       WHERE id = 1
       RETURNING *`,
      [effectiveId, status]
    );

    await client.query(
      `INSERT INTO event_audit (actor_id, action, details)
       VALUES ($1, 'active_participant_changed', $2)`,
      [actorId ?? null, JSON.stringify({ participantId: effectiveId })]
    );

    return result.rows[0] as EventSession;
  });

  await broadcastState();
  return session;
}

type AudienceVoteRow = {
  id: number;
  participant_id: number;
  score: number;
  created_at: string | null;
};

export function buildParticipantLeaderboardEntry({
  participant,
  judgeRows,
  audienceRows,
  judgeNames,
}: {
  participant: Participant;
  judgeRows: ScoreRow[];
  audienceRows: AudienceVoteRow[];
  judgeNames: Map<number, string>;
}): LeaderboardEntry {
  const judgeEntries = judgeRows.map((row) => ({
    id: row.id,
    judgeId: row.judge_id,
    judgeName: judgeNames.get(row.judge_id) ?? `Judge #${row.judge_id}`,
    score: row.score,
    isMissing: row.is_missing,
    isCorrected: row.is_corrected,
  }));

  const validJudges = judgeEntries.filter((r) => !r.isMissing && r.score !== null);
  const missingJudges = judgeEntries.filter((r) => r.isMissing || r.score === null);
  const judgeTotal = validJudges.reduce((sum, r) => sum + (r.score ?? 0), 0);
  const judgeAverage = validJudges.length > 0 ? judgeTotal / validJudges.length : null;

  const audienceTotal = audienceRows.reduce((sum, r) => sum + r.score, 0);
  const audienceAverage = audienceRows.length > 0 ? audienceTotal / audienceRows.length : null;

  // Final score: 80% judges, 20% audience. If one side has no votes yet, use the
  // other side alone so a performer is not penalised for missing audience votes.
  const weighted =
    judgeAverage !== null && audienceAverage !== null
      ? judgeAverage * 0.8 + audienceAverage * 0.2
      : judgeAverage ?? audienceAverage;

  const audienceEntry =
    audienceAverage !== null
      ? [
          {
            id: -1,
            judgeId: -1,
            judgeName: `Audience (${audienceRows.length})`,
            score: Math.round(audienceAverage * 100) / 100,
            isMissing: false,
            isCorrected: false,
          },
        ]
      : [];

  return {
    rank: 0,
    tied: false,
    participant,
    average: weighted === null ? null : Math.round(weighted * 100) / 100,
    totalScore: judgeTotal,
    validScoreCount: validJudges.length,
    hasAllScores: judgeEntries.length > 0 && missingJudges.length === 0,
    missingJudgeNames: missingJudges.map((r) => r.judgeName),
    scores: [...judgeEntries, ...audienceEntry],
  };
}

/** Tie policy: higher average first, then higher total score, then fewer missing scores, then participant number. */
export async function computeLeaderboard(): Promise<LeaderboardEntry[]> {
  const [participants, judges, scores, audienceVotes] = await Promise.all([
    getParticipants(),
    pool.query("SELECT id, display_name FROM users WHERE role = 'judge'"),
    pool.query("SELECT * FROM scores"),
    pool.query("SELECT id, participant_id, score, created_at FROM audience_votes"),
  ]);

  const judgeNames = new Map<number, string>(
    (judges.rows as { id: number; display_name: string }[]).map((j) => [j.id, j.display_name])
  );
  const scoresByParticipant = new Map<number, ScoreRow[]>();
  for (const row of scores.rows as ScoreRow[]) {
    const list = scoresByParticipant.get(row.participant_id) ?? [];
    list.push(row);
    scoresByParticipant.set(row.participant_id, list);
  }

  const audienceByParticipant = new Map<number, AudienceVoteRow[]>();
  for (const row of audienceVotes.rows as AudienceVoteRow[]) {
    const list = audienceByParticipant.get(row.participant_id) ?? [];
    list.push(row);
    audienceByParticipant.set(row.participant_id, list);
  }

  const entries: LeaderboardEntry[] = participants.map((participant) =>
    buildParticipantLeaderboardEntry({
      participant,
      judgeRows: scoresByParticipant.get(participant.id) ?? [],
      audienceRows: audienceByParticipant.get(participant.id) ?? [],
      judgeNames,
    })
  );

  const sorted = entries.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    const avgA = a.average ?? -1;
    const avgB = b.average ?? -1;
    if (avgB !== avgA) return avgB - avgA;
    if (a.missingJudgeNames.length !== b.missingJudgeNames.length)
      return a.missingJudgeNames.length - b.missingJudgeNames.length;
    return a.participant.number - b.participant.number;
  });

  let rank = 0;
  let prevKey = "";
  sorted.forEach((entry, index) => {
    const key = `${entry.average}|${entry.totalScore}|${entry.missingJudgeNames.length}`;
    if (key !== prevKey) {
      rank = index + 1;
      prevKey = key;
    }
    entry.rank = rank;
  });

  const rankCounts = new Map<number, number>();
  for (const entry of sorted) rankCounts.set(entry.rank, (rankCounts.get(entry.rank) ?? 0) + 1);
  for (const entry of sorted) entry.tied = (rankCounts.get(entry.rank) ?? 0) > 1;

  return sorted;
}

function toPublicState(session: EventSession, participant: Participant | null): PublicState {
  const audienceVoteUrl = session.status === "voting_open" ? `${config.clientUrl}/vote` : null;

  return {
    title: session.title,
    club: session.club,
    status: session.status,
    activeParticipant: participant
      ? {
          id: participant.id,
          number: participant.number,
          name: participant.name,
          performance_title: participant.performance_title,
          photo_url: participant.photo_url,
        }
      : null,
    audienceVoteToken: null,
    audienceVoteUrl,
    votingDeadlineAt: session.voting_deadline_at,
    votingOpenedAt: session.voting_opened_at,
    votingDurationSec: session.voting_duration_sec,
    scoringMin: session.scoring_min,
    scoringMax: session.scoring_max,
    serverTime: new Date().toISOString(),
    resultsPublished: session.results_published,
  };
}

export async function getPublicState(): Promise<PublicState> {
  const session = await reconcileDeadline();
  const participant = session.active_participant_id
    ? await getParticipantById(session.active_participant_id)
    : null;
  return toPublicState(session, participant);
}

export async function getAdminState(): Promise<AdminState> {
  const session = await reconcileDeadline();
  const participant = session.active_participant_id
    ? await getParticipantById(session.active_participant_id)
    : null;
  const leaderboard = await computeLeaderboard();
  return {
    ...toPublicState(session, participant),
    leaderboard,
    participants: await getParticipants(),
    judges: await getJudges(),
  };
}

export async function broadcastState(): Promise<void> {
  const publicState = await getPublicState();
  emit("public", publicState);
  const adminState = await getAdminState();
  emit("admin", adminState);
}

export async function publishResults(actorId?: number): Promise<void> {
  const leaderboard = await computeLeaderboard();
  const hasAnyScores = leaderboard.some((entry) => entry.average !== null);
  if (!hasAnyScores) {
    throw Object.assign(new Error("No scores to publish yet."), { status: 400 });
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE event_sessions
       SET results_published = TRUE, results_published_at = now(), status = 'completed', updated_at = now()
       WHERE id = 1`
    );
    await client.query(
      `INSERT INTO event_audit (actor_id, action, details)
       VALUES ($1, 'results_published', $2)`,
      [actorId ?? null, JSON.stringify({ participants: leaderboard.length })]
    );
  });

  await broadcastState();
}

export async function unpublishResults(actorId?: number): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE event_sessions SET results_published = FALSE, results_published_at = NULL, updated_at = now() WHERE id = 1`
    );
    await client.query(
      `INSERT INTO event_audit (actor_id, action, details) VALUES ($1, 'results_unpublished', '{}'::jsonb)`,
      [actorId ?? null]
    );
  });
  await broadcastState();
}

export async function getPublishedResults(): Promise<PublishedResults | null> {
  const session = await getSession();
  if (!session.results_published) return null;
  const leaderboard = await computeLeaderboard();
  return {
    title: session.title,
    club: session.club,
    publishedAt: session.results_published_at,
    winners: leaderboard,
  };
}

export async function resetAllScores(actorId?: number): Promise<void> {
  await withTransaction(async (client) => {
    await client.query("DELETE FROM scores");
    await client.query("DELETE FROM audience_votes");
    await client.query(
      `UPDATE event_sessions
       SET status = 'ready', active_participant_id = NULL,
           audience_vote_token = NULL,
           audience_vote_participant_id = NULL,
           audience_vote_generated_at = NULL,
           voting_opened_at = NULL,
           voting_deadline_at = NULL, results_published = FALSE, results_published_at = NULL,
           updated_at = now()
       WHERE id = 1`
    );
    await client.query(
      `INSERT INTO event_audit (actor_id, action, details) VALUES ($1, 'scores_reset', '{}'::jsonb)`,
      [actorId ?? null]
    );
  });
  await broadcastState();
}
