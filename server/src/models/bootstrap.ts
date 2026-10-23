import bcrypt from "bcryptjs";
import { pool } from "../config/database.js";

export async function ensureDefaultUsers(): Promise<void> {
  const adminPass = process.env.SEED_ADMIN_PASSWORD ?? "admin-spotlight-2026";
  const judgePass = process.env.SEED_JUDGE_PASSWORD ?? "judge-spotlight-2026";

  const adminHash = await bcrypt.hash(adminPass, 12);
  const judgeHash = await bcrypt.hash(judgePass, 12);

  await pool.query(
    `INSERT INTO users (username, password_hash, display_name, role)
     VALUES ('admin', $1, 'Spotlight Admin', 'admin')
     ON CONFLICT (username) DO NOTHING`,
    [adminHash]
  );

  // Only seed a default judge on a fresh database. Once judges exist (for
  // example, a full roster added by the crew), never recreate old defaults.
  await pool.query(
    `INSERT INTO users (username, password_hash, display_name, role)
     SELECT 'judge01', $1, 'Judge 01', 'judge'
     WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'judge')
     ON CONFLICT (username) DO NOTHING`,
    [judgeHash]
  );
}
