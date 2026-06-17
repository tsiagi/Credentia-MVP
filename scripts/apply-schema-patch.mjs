// Apply supabase/patch-schema-lag.sql to the live database over a direct
// Postgres connection (PostgREST/supabase-js cannot run DDL).
//
// Provide ONE of the following in .env.local:
//   SUPABASE_DB_URL      full connection string from the Supabase dashboard
//                        (Project Settings → Database → Connection string → URI).
//                        Easiest + region-proof. Example:
//                        SUPABASE_DB_URL=postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres
//   — or —
//   SUPABASE_DB_PASSWORD your database password, plus optionally
//   SUPABASE_DB_HOST     pooler host (default aws-0-us-east-1.pooler.supabase.com)
//   SUPABASE_DB_PORT     default 6543
//
// Run: node scripts/apply-schema-patch.mjs   (or npm run db:patch)
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const ref = url?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

let postgres;
try {
  postgres = (await import("postgres")).default;
} catch {
  console.error("The 'postgres' package is required. Install it: npm i -D postgres");
  process.exit(1);
}

function buildConnection() {
  if (env.SUPABASE_DB_URL) {
    return { conn: env.SUPABASE_DB_URL, opts: { ssl: "require", max: 1 }, how: "SUPABASE_DB_URL" };
  }
  const password = env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) return null;
  if (!ref) {
    console.error("Could not derive project ref from NEXT_PUBLIC_SUPABASE_URL.");
    process.exit(1);
  }
  const host = env.SUPABASE_DB_HOST?.trim() || "aws-0-us-east-1.pooler.supabase.com";
  const port = Number(env.SUPABASE_DB_PORT?.trim() || 6543);
  return {
    opts: { host, port, database: "postgres", username: `postgres.${ref}`, password, ssl: "require", max: 1 },
    how: `SUPABASE_DB_PASSWORD via ${host}:${port}`,
  };
}

const c = buildConnection();
if (!c) {
  console.error([
    "Missing database credentials.",
    "",
    "Add ONE of these to .env.local, then re-run `npm run db:patch`:",
    "",
    "  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres",
    "    (Supabase dashboard → Project Settings → Database → Connection string → URI — copy verbatim)",
    "",
    "  — or —",
    "",
    "  SUPABASE_DB_PASSWORD=<your db password>",
    "  SUPABASE_DB_HOST=aws-0-<region>.pooler.supabase.com   # optional, if not us-east-1",
    "",
  ].join("\n"));
  process.exit(1);
}

const sqlText = readFileSync(resolve(process.cwd(), "supabase/patch-schema-lag.sql"), "utf8");

const sql = c.conn ? postgres(c.conn, c.opts) : postgres(c.opts);

try {
  console.log(`Connecting (${c.how})...`);
  await sql.unsafe(sqlText);
  console.log("Applied supabase/patch-schema-lag.sql\n");

  // Verify the columns now exist
  const checks = [
    ["feedback_cycles", "updated_at"],
    ["kpis", "progress"],
    ["kpis", "verification_level"],
    ["kpis", "employee_id"],
    ["achievements", "contribution_type"],
    ["achievements", "pending_executive"],
  ];
  for (const [table, column] of checks) {
    const r = await sql`
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = ${table} and column_name = ${column} limit 1`;
    console.log(`  ${r.length ? "✓" : "✗"} ${table}.${column}`);
  }
  console.log("\nDone. Re-run: npm run seed:maya-queue && npm run seed:team-reports");
} catch (e) {
  console.error("Patch failed:", e.message ?? e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
