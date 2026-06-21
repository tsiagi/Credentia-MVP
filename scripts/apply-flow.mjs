// Apply supabase/flow-provenance.sql + supabase/flow-seed.sql to the live
// database over a direct Postgres connection (PostgREST/supabase-js cannot run
// DDL). Idempotent: both files are safe to re-run.
//
// PREREQUISITE: schema.sql + rls-policies.sql must already be applied (this
// migration uses current_org() / current_role_name()).
//
// Provide ONE of the following in .env.local (same as the other migrations):
//   SUPABASE_DB_URL      full connection string (Project Settings → Database → URI)
//   — or —
//   SUPABASE_DB_PASSWORD your database password (+ optional SUPABASE_DB_HOST/PORT)
//
// Run: node scripts/apply-flow.mjs  (or npm run db:migrate:flow)
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
    "Add ONE of these to .env.local, then re-run `npm run db:migrate:flow`:",
    "",
    "  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres",
    "  — or —",
    "  SUPABASE_DB_PASSWORD=<your db password>",
    "",
  ].join("\n"));
  process.exit(1);
}

const schemaSql = readFileSync(resolve(process.cwd(), "supabase/flow-provenance.sql"), "utf8");
const seedSql = readFileSync(resolve(process.cwd(), "supabase/flow-seed.sql"), "utf8");
const sql = c.conn ? postgres(c.conn, c.opts) : postgres(c.opts);

try {
  console.log(`Connecting (${c.how})...`);
  await sql.unsafe(schemaSql);
  console.log("Applied supabase/flow-provenance.sql");
  await sql.unsafe(seedSql);
  console.log("Applied supabase/flow-seed.sql\n");

  for (const t of ["flow_boards", "flow_columns", "flow_items", "flow_evidence_artifacts", "flow_inferences", "flow_transition_events"]) {
    const r = await sql`select 1 from information_schema.tables where table_schema='public' and table_name=${t} limit 1`;
    console.log(`  ${r.length ? "✓" : "✗"} table ${t}`);
  }
  for (const fn of ["flow_record_transition", "flow_promote_inference", "flow_ledger_is_append_only"]) {
    const r = await sql`select 1 from pg_proc where proname=${fn} limit 1`;
    console.log(`  ${r.length ? "✓" : "✗"} function ${fn}()`);
  }

  // Burndown sanity: the seed should show a non-trivial attested-vs-asserted gap.
  const gap = await sql`
    with b as (select id, sprint_points_committed from flow_boards where name='Q3 Platform Sprint — Provenance Demo'),
    state as (
      select s.item_id, s.current_tier, c.is_terminal, i.point_estimate
      from flow_item_state s
      join flow_columns c on c.id = s.current_column_id
      join flow_items i on i.id = s.item_id
      where s.board_id = (select id from b))
    select
      (select sprint_points_committed from b) as committed,
      coalesce(sum(point_estimate) filter (where is_terminal and current_tier='ATTESTED'),0) as attested_done,
      coalesce(sum(point_estimate) filter (where is_terminal),0) as asserted_plus_attested
    from state`;
  const g = gap[0] ?? {};
  console.log(`\n  Burndown: committed=${g.committed} attested_done=${g.attested_done} asserted+attested=${g.asserted_plus_attested} ⇒ gap=${(g.asserted_plus_attested ?? 0) - (g.attested_done ?? 0)} pts`);

  console.log("\nDone. Visit /dev/flow (signed in to the demo org) to explore the board.");
} catch (e) {
  console.error("Migration failed:", e.message ?? e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
