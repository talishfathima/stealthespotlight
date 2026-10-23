import { pool } from "../config/database.js";
import { ensureDefaultUsers } from "./bootstrap.js";

const SAMPLE_PARTICIPANTS = [
  { number: 1, name: "Amara Osei", performance_title: "The Midnight Library of Unwritten Stories" },
  { number: 2, name: "Jonah Whitfield", performance_title: "Ode to a Broken Typewriter" },
  { number: 3, name: "Priya Nair", performance_title: "Letters I Never Sent" },
  { number: 4, name: "Diego Salazar", performance_title: "The Cartographer's Confession" },
  { number: 5, name: "Mei-Lin Zhao", performance_title: "Paper Cranes at Dawn" },
  { number: 6, name: "Felix Andersen", performance_title: "A Eulogy for the Last Bookshop" },
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'judge')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participants (
  id                SERIAL PRIMARY KEY,
  number            INTEGER NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  performance_title TEXT,
  photo_url         TEXT,
  display_order     INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_sessions (
  id                    SERIAL PRIMARY KEY,
  title                 TEXT NOT NULL DEFAULT 'Steal the Spotlight',
  club                  TEXT NOT NULL DEFAULT 'Authorcraft',
  status                TEXT NOT NULL DEFAULT 'ready'
                        CHECK (status IN ('ready','voting_open','voting_closed','completed')),
  active_participant_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
  audience_vote_token   TEXT,
  audience_vote_participant_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
  audience_vote_generated_at TIMESTAMPTZ,
  voting_opened_at      TIMESTAMPTZ,
  voting_deadline_at    TIMESTAMPTZ,
  voting_duration_sec   INTEGER NOT NULL DEFAULT 30,
  results_published     BOOLEAN NOT NULL DEFAULT FALSE,
  results_published_at  TIMESTAMPTZ,
  scoring_min           INTEGER NOT NULL DEFAULT 0,
  scoring_max           INTEGER NOT NULL DEFAULT 10,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audience_votes (
  id                 SERIAL PRIMARY KEY,
  token              TEXT NOT NULL,
  participant_id     INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  score              INTEGER NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scores (
  id             SERIAL PRIMARY KEY,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  judge_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score          INTEGER,
  is_missing     BOOLEAN NOT NULL DEFAULT FALSE,
  is_corrected   BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, judge_id)
);

CREATE TABLE IF NOT EXISTS score_audit (
  id         SERIAL PRIMARY KEY,
  score_id   INTEGER REFERENCES scores(id) ON DELETE SET NULL,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_audit (
  id         SERIAL PRIMARY KEY,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participants_order ON participants(display_order);
CREATE INDEX IF NOT EXISTS idx_scores_participant ON scores(participant_id);
`;

export async function runMigrations(): Promise<void> {
  await pool.query(SCHEMA);

  await pool.query(`
    ALTER TABLE event_sessions
      ADD COLUMN IF NOT EXISTS audience_vote_token TEXT,
      ADD COLUMN IF NOT EXISTS audience_vote_participant_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS audience_vote_generated_at TIMESTAMPTZ;
  `);

  // Anonymous audience ballots: one vote per device per performer, instead of
  // a single shared token per round.
  await pool.query(`
    ALTER TABLE audience_votes DROP CONSTRAINT IF EXISTS audience_votes_token_key;
    CREATE UNIQUE INDEX IF NOT EXISTS audience_votes_participant_voter_idx
      ON audience_votes (participant_id, token);
  `);

  const existing = await pool.query("SELECT id FROM event_sessions LIMIT 1");
  if (existing.rowCount === 0) {
    await pool.query("INSERT INTO event_sessions (id) VALUES (1)");
  }

  await ensureDefaultUsers();

  const participantCount = await pool.query("SELECT COUNT(*)::int AS count FROM participants");
  if (participantCount.rows[0].count === 0) {
    for (let i = 0; i < SAMPLE_PARTICIPANTS.length; i++) {
      const p = SAMPLE_PARTICIPANTS[i];
      await pool.query(
        `INSERT INTO participants (number, name, performance_title, display_order)
         VALUES ($1, $2, $3, $4)`,
        [p.number, p.name, p.performance_title, i]
      );
    }
  }
}

async function main() {
  console.log("Running migrations...");
  await runMigrations();
  console.log("Migrations complete.");
  await pool.end();
}

const isDirectRun = process.argv[1]?.includes("migrate");
if (isDirectRun) {
  main().catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
}
