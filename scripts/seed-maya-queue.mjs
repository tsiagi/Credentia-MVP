// Seed pending verification items + coaching rows for Jordan Lee's direct
// report(s) so the redesigned Manager Verification Center + AI Coaching
// carousel have real data to render.
//
// Idempotent: clears the rows it previously created (matched by marker text)
// before re-inserting, so it is safe to run repeatedly.
//
// Run: node scripts/seed-maya-queue.mjs
import { createClient } from "@supabase/supabase-js";
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

const MANAGER_EMAIL = "manager@demo.corp.com"; // resolve via auth.users (the id that logs in)
// Colon-free marker: achievementTitle() splits titles on the first ":".
const MARKER = "#demoseed";
// Markers to clean up (current + any earlier ones this script used).
const CLEAN_MARKERS = [MARKER, "[seed:maya-queue]"];

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Insert resilient to a remote schema that lags schema.sql: drop any column
// the table doesn't actually have (PostgREST reports it), then retry.
async function safeInsert(table, rows) {
  let payload = rows.map((r) => ({ ...r }));
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await admin.from(table).insert(payload).select("id");
    if (!res.error) return res.data ?? [];
    const m = res.error.message.match(/Could not find the '([^']+)' column/);
    if (m) {
      const bad = m[1];
      console.log(`  · ${table}: remote has no '${bad}' column — dropping it`);
      payload = payload.map((r) => { const c = { ...r }; delete c[bad]; return c; });
      continue;
    }
    throw res.error;
  }
  throw new Error(`Could not insert into ${table} after stripping unknown columns`);
}

async function main() {
  // 1. Resolve the manager via auth.users — profiles has no email column, and
  //    duplicate name-matched profiles exist, so we MUST bind to the id that
  //    actually logs in (otherwise RLS hides the rows from the real session).
  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw listErr;
  const authUser = list.users.find((u) => u.email === MANAGER_EMAIL);
  if (!authUser) throw new Error(`No auth user ${MANAGER_EMAIL} — run npm run seed:test-users first.`);
  const { data: mgr, error: mgrErr } = await admin
    .from("profiles").select("id, org_id, full_name").eq("id", authUser.id).maybeSingle();
  if (mgrErr) throw mgrErr;
  if (!mgr) throw new Error(`No profile row for auth user ${MANAGER_EMAIL} (${authUser.id}).`);

  const { data: reports, error: repErr } = await admin
    .from("profiles").select("id, full_name, title, org_id").eq("manager_id", mgr.id);
  if (repErr) throw repErr;
  if (!reports?.length) throw new Error(`No direct reports under ${mgr.full_name}.`);

  const maya = reports.find((r) => (r.full_name ?? "").includes("Maya")) ?? reports[0];
  console.log(`Manager: ${mgr.full_name} (${mgr.id})`);
  console.log(`Reports: ${reports.map((r) => r.full_name).join(", ")}`);
  console.log(`Primary subject: ${maya.full_name} (${maya.id})\n`);

  const orgId = maya.org_id ?? mgr.org_id ?? null;

  // 2. Idempotent cleanup — scoped to Maya only. This script owns Maya's rows;
  //    seed-team-reports owns the other reports'. Keeping the deletes scoped to
  //    maya.id prevents the two seeds from clobbering each other (which produced
  //    duplicate promotion_readiness rows).
  for (const mk of CLEAN_MARKERS) {
    await admin.from("achievements").delete().like("description", `%${mk}%`).eq("profile_id", maya.id);
    await admin.from("kpis").delete().like("title", `%${mk}%`).eq("employee_id", maya.id);
    await admin.from("projects").delete().like("description", `%${mk}%`).eq("profile_id", maya.id);
    await admin.from("process_improvements").delete().like("type", `%${mk}%`).eq("profile_id", maya.id);
    await admin.from("promotion_readiness").delete().like("evidence", `%${mk}%`).eq("employee_id", maya.id);
  }

  // 3. Pending verification queue items for Maya (each table feeds fetchVerifyQueue)
  const ach = await safeInsert("achievements", [
    { profile_id: maya.id, org_id: orgId, kind: "certification",
      description: `AWS Solutions Architect — Associate ${MARKER}`, verification_level: 1,
      evidence_url: "https://example.com/certs/aws-saa" },
    { profile_id: maya.id, org_id: orgId, kind: "award",
      description: `Q1 Analyst of the Quarter ${MARKER}`, verification_level: 1 },
  ]);

  const kpi = await safeInsert("kpis", [
    { employee_id: maya.id, title: `Reconciliation accuracy ${MARKER}`, target: 98, progress: 99.4, status: "pending", verification_level: 1 },
    { employee_id: maya.id, title: `Quarterly rollouts shipped ${MARKER}`, target: 12, progress: 11, status: "clarify", verification_level: 1 },
  ]);

  const proj = await safeInsert("projects", [
    { profile_id: maya.id, description: `Ledger automation pipeline ${MARKER}`, outcome: "Cut close time 40%",
      business_impact: "Faster month-end close", cost_savings: 180000, verification_level: 1 },
  ]);

  const pi = await safeInsert("process_improvements", [
    { profile_id: maya.id, type: `Automated variance report ${MARKER}`, hours_saved: 120, dollars_saved: 24000, teams_impacted: 3, status: "pending" },
  ]);

  // 4. One coaching row for Maya (promotion_readiness — AI INFERENCE). Exactly one
  //    row per employee keeps the carousel + readiness buckets de-duplicated.
  //    Other reports' coaching is owned by seed-team-reports.
  const coach = await safeInsert("promotion_readiness", [
    { employee_id: maya.id, category: "ready_now", evidence: `3 L4-verified projects, KPI attainment 112%, peer kudos trending up over 2 quarters. ${MARKER}` },
  ]);

  console.log("\nSeeded:");
  console.log(`  achievements (L1 pending):   ${ach.length}`);
  console.log(`  kpis (pending/clarify):      ${kpi.length}`);
  console.log(`  projects (L1 pending):       ${proj.length}`);
  console.log(`  process_improvements:        ${pi.length}`);
  console.log(`  promotion_readiness rows:    ${coach.length}`);

  // 5. Verify what the dashboard will actually render (mirror fetchVerifyQueue's
  //    own selects, so schema-lag columns that break a sub-query are caught here).
  const probes = await Promise.all([
    admin.from("achievements").select("id").eq("profile_id", maya.id).eq("verification_level", 1),
    admin.from("kpis").select("id, progress, target").eq("employee_id", maya.id).in("status", ["pending", "clarify"]),
    admin.from("projects").select("id").eq("profile_id", maya.id).eq("verification_level", 1),
    admin.from("process_improvements").select("id").eq("profile_id", maya.id).in("status", ["pending", "clarify"]),
  ]);
  const labels = ["achievements", "kpis", "projects", "process_improvements"];
  let displayable = 0;
  probes.forEach((p, i) => {
    if (p.error) console.log(`  ! ${labels[i]} won't display — fetch select errors: ${p.error.message}`);
    else displayable += p.data.length;
  });
  console.log(`\nVerification queue items the dashboard can render for ${maya.full_name}: ${displayable}`);
  console.log("Done. Reload the manager dashboard.");
}

main().catch((e) => { console.error("Seed failed:", e.message ?? e); process.exit(1); });
