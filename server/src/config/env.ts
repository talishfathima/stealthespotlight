import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from the repo root regardless of the process working directory.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env") });
dotenv.config(); // also allow a local server/.env override

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    console.warn(`[env] Missing ${name}, using fallback default`);
    return fallback ?? "";
  }
  return value;
}

const defaultClientOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
];

const parsedClientOrigins = (process.env.CLIENT_URLS ?? process.env.CLIENT_URL ?? defaultClientOrigins.join(","))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export const config = {
  port: parseInt(process.env.PORT ?? "3002", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  clientUrl: parsedClientOrigins[0] ?? "http://localhost:5173",
  clientUrls: parsedClientOrigins.length ? parsedClientOrigins : defaultClientOrigins,
  sessionSecret: required("SESSION_SECRET", "dev-only-insecure-secret-change-me"),
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/authorcraft_sts",
  useInMemoryDb: process.env.USE_IN_MEMORY_DB === "true" || (process.env.DATABASE_URL ?? "") === "",
  scoring: {
    min: parseInt(process.env.SCORING_MIN ?? "0", 10),
    max: parseInt(process.env.SCORING_MAX ?? "10", 10),
    step: parseInt(process.env.SCORING_STEP ?? "1", 10),
  },
  allowScoreCorrections: process.env.ALLOW_SCORE_CORRECTIONS !== "false",
};
