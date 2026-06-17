// Apply supabase/task-knowledge-agent.sql to the live database over a direct
// Postgres connection (PostgREST/supabase-js cannot run DDL).
//
// PREREQUISITE: schema.sql + rls-policies.sql + provisioning-lifecycle.sql +
// daily-pulse-tasks.sql must already be applied (this migration depends on
// their helper functions, the organizations/profiles tables, and the
// guard_frozen_verified_record() trigger function).
//
// Provide ONE of the following in .env.local (same as the other migrations):
//   SUPABASE_DB_URL      full connection string (Project Settings → Database → URI)
//   — or —
//   SUPABASE_DB_PASSWORD your database password (+ optional SUPABASE_DB_HOST/PORT)
//
// Run: node scripts/apply-task-knowledge-agent.mjs  (or npm run db:migrate:tka)
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
    "Missing database credentials — cannot run DDL with the service-role key alone.",
    "",
    "Add ONE of these to .env.local, then re-run `npm run db:migrate:tka`:",
    "",
    "  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres",
    "  — or —",
    "  SUPABASE_DB_PASSWORD=<your db password>",
    "",
  ].join("\n"));
  process.exit(1);
}

const sqlText = readFileSync(resolve(process.cwd(), "supabase/task-knowledge-agent.sql"), "utf8");
const sql = c.conn ? postgres(c.conn, c.opts) : postgres(c.opts);

try {
  console.log(`Connecting (${c.how})...`);
  await sql.unsafe(sqlText);
  console.log("Applied supabase/task-knowledge-agent.sql\n");

  const tables = [
    "work_projects", "verified_tasks", "ai_inference_tasks", "documentation",
    "conversations", "conversation_participants", "messages", "user_agents", "agent_memory",
  ];
  for (const t of tables) {
    const r = await sql`
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = ${t} limit 1`;
    console.log(`  ${r.length ? "✓" : "✗"} table ${t}`);
  }
  for (const fn of ["is_conversation_participant", "guard_doc_verification"]) {
    const r = await sql`select 1 from pg_proc where proname = ${fn} limit 1`;
    console.log(`  ${r.length ? "✓" : "✗"} function ${fn}()`);
  }
  const rls = await sql`
    select count(*)::int as n from pg_policies
    where schemaname = 'public'
      and tablename in ('work_projects','verified_tasks','ai_inference_tasks','documentation',
                        'conversations','conversation_participants','messages','user_agents','agent_memory')`;
  console.log(`  • RLS policies on new tables: ${rls[0]?.n ?? 0}`);

  console.log("\nDone. Task/Project, Documentation, Messaging, and Agent features can now read/write live.");
} catch (e) {
  console.error("Migration failed:", e.message ?? e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
