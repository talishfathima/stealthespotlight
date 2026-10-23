import test from "node:test";
import assert from "node:assert/strict";
import { newDb } from "pg-mem";

import { buildParticipantLeaderboardEntry } from "./stateService.js";

test("judge roster query works with pg-mem", async () => {
  const db = newDb();
  const { Pool: MemPool } = db.adapters.createPg();
  const pool = new MemPool();

  await pool.query(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE scores (
      id SERIAL PRIMARY KEY,
      judge_id INTEGER,
      participant_id INTEGER,
      score INTEGER
    );
  `);
  await pool.query("INSERT INTO users (username, display_name, role) VALUES ('admin', 'Admin', 'admin'), ('judge1', 'Judge 1', 'judge'), ('judge2', 'Judge 2', 'judge')");
  await pool.query("INSERT INTO scores (judge_id, participant_id, score) VALUES (2, 1, 8), (2, 1, 9), (3, 1, 7)");

  const result = await pool.query(`
    SELECT users.id, users.username, users.display_name, users.role,
           COUNT(scores.id)::int AS score_count
    FROM users
    LEFT JOIN scores ON scores.judge_id = users.id
    WHERE users.role = 'judge'
    GROUP BY users.id, users.username, users.display_name, users.role
    ORDER BY users.id
  `);

  assert.deepEqual(
    result.rows.map((row: { id: number; score_count: number | string }) => ({
      id: row.id,
      score_count: Number(row.score_count),
    })),
    [
    { id: 2, score_count: 2 },
    { id: 3, score_count: 1 },
  ]);

  await pool.end();
});

test("leaderboard combines judge and audience scores for the winner", () => {
  const entry = buildParticipantLeaderboardEntry({
    participant: {
      id: 1,
      number: 1,
      name: "Ada",
      performance_title: "Song",
      photo_url: null,
      display_order: 1,
    },
    judgeRows: [
      { id: 11, participant_id: 1, judge_id: 21, score: 9, is_missing: false, is_corrected: false, submitted_at: null },
      { id: 12, participant_id: 1, judge_id: 22, score: 7, is_missing: false, is_corrected: false, submitted_at: null },
    ],
    audienceRows: [{ id: 101, participant_id: 1, score: 10, created_at: null }],
    judgeNames: new Map([
      [21, "Judge Ada"],
      [22, "Judge Tobi"],
    ]),
  });

  assert.equal(entry.totalScore, 16);
  assert.equal(entry.validScoreCount, 2);
  assert.equal(entry.average, 8.4);
  assert.ok(entry.scores.some((score) => score.judgeName === "Audience (1)"));
});

test("audience votes are averaged into a single 20% share", () => {
  const entry = buildParticipantLeaderboardEntry({
    participant: {
      id: 1,
      number: 1,
      name: "Ada",
      performance_title: "Song",
      photo_url: null,
      display_order: 1,
    },
    judgeRows: [
      { id: 11, participant_id: 1, judge_id: 21, score: 9, is_missing: false, is_corrected: false, submitted_at: null },
    ],
    audienceRows: [
      { id: 101, participant_id: 1, score: 4, created_at: null },
      { id: 102, participant_id: 1, score: 8, created_at: null },
    ],
    judgeNames: new Map([[21, "Judge Ada"]]),
  });

  assert.equal(entry.average, 8.4);
  assert.equal(entry.scores.filter((score) => score.judgeId === -1).length, 1);
  assert.equal(entry.scores.find((score) => score.judgeId === -1)?.score, 6);
});
