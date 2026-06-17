// Add a couple more direct reports under the real manager (manager@demo.corp.com)
// so the AI Coaching carousel has multiple swipeable slides.
//
// fetchCoachingInsights() returns ONE insight per direct report, so multiple
// slides require multiple reports — each gets a promotion_readiness row.
// Also seeds one pending verification item per new report.
//
// Idempotent: auth users are reused if they exist; profiles are upserted;
// seeded queue/coaching rows are matched + cleared by a unique marker.
//
// Run: node scripts/seed-team-reports.mjs   (or npm run seed:team-reports)
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

const MANAGER_EMAIL = "manager@demo.corp.com";
const PASSWORD = process.env.TEST_USER_PASSWORD ?? "TestPass123!";
const MARKER = "#demoseed"; // colon-free: achievementTitle() splits on ":"

// New reports + their coaching insight (distinct categories → distinct carousel slides)
const NEW_REPORTS = [
  { email: "devin@demo.corp.com", full_name: "Devin Park", title: "Platform Engineer",
    coach: { category: "6mo", evidence: `Strong delivery on the billing rewrite; one more cross-team lead rotation before a promotion case. ${MARKER}` },
    item: { kind: "project", description: `Billing service rewrite — 30% latency cut ${MARKER}` } },
  { email: "sasha@demo.corp.com", full_name: "Sasha Romano", title: "Data Analyst",
    coach: { category: "dev_needed", evidence: `Workload elevated 3 weeks running; coach on scope before stretching further. ${MARKER}` },
    item: { kind: "certification", description: `dbt Analytics Engineering Certification ${MARKER}` } },
];

// Pulse / value-score / review profile per report (keyed by full_name). Pulse
// dimensions are 1–5 (the app divides by 5); value score is 0–1000. Review state:
// "both" → Ready to sign, "employee" → In progress, "none" → Not started.
const SURVEY_YEAR = 2026, SURVEY_QUARTER = 2;
const HEALTH = {
  "Maya Chen":    { score: 842, pulse: { satisfaction: 4, balance: 4, workload: 3, collaboration: 4, manager_support: 5, growth: 4 },
                    inputs: { kpis: 0.92, reviews: 0.85, projects: 0.90, certs: 0.70, leadership: 0.78, innovation: 0.75, skills: 0.82, recognition: 0.80 }, review: "both" },
  "Devin Park":   { score: 788, pulse: { satisfaction: 4, balance: 3, workload: 4, collaboration: 4, manager_support: 4, growth: 4 },
                    inputs: { kpis: 0.84, reviews: 0.80, projects: 0.93, certs: 0.66, leadership: 0.72, innovation: 0.86, skills: 0.79, recognition: 0.70 }, review: "employee" },
  "Sasha Romano": { score: 715, pulse: { satisfaction: 3, balance: 2, workload: 4, collaboration: 3, manager_support: 3, growth: 3 },
                    inputs: { kpis: 0.77, reviews: 0.72, projects: 0.70, certs: 0.81, leadership: 0.62, innovation: 0.74, skills: 0.88, recognition: 0.64 }, review: "none" },
};
const DEFAULT_HEALTH = { score: 760, pulse: { satisfaction: 4, balance: 3, workload: 3 }, inputs: {}, review: "none" };

const REVIEW_EMP = { q_wins: "Shipped the Q2 roadmap and mentored two new hires.", q_growth: "Want more exposure to cross-org planning." };
const REVIEW_MGR = { q_wins: "Consistently strong delivery; trusted by partner teams.", q_growth: "Ready for a stretch project next cycle." };

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserIdByEmail(email) {
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) break;
    page++;
  }
  return null;
}

async function getOrCreateAuthUser(email) {
  const existing = await findUserIdByEmail(email);
  if (existing) { console.log(`  auth exists  ${email} (${existing})`); return existing; }
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`${email}: ${error.message}`);
  console.log(`  auth created ${email} (${data.user.id})`);
  return data.user.id;
}

// Insert resilient to a remote schema that lags schema.sql.
async function safeInsert(table, rows) {
  let payload = rows.map((r) => ({ ...r }));
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await admin.from(table).insert(payload).select("id");
    if (!res.error) return res.data ?? [];
    const m = res.error.message.match(/Could not find the '([^']+)' column/);
    if (m) { const bad = m[1]; payload = payload.map((r) => { const c = { ...r }; delete c[bad]; return c; }); continue; }
    throw res.error;
  }
  throw new Error(`Could not insert into ${table} after stripping unknown columns`);
}

async function main() {
  // Resolve the real manager via auth (the id that logs in; duplicate name-profiles exist)
  const authUser = await findUserIdByEmail(MANAGER_EMAIL);
  if (!authUser) throw new Error(`No auth user ${MANAGER_EMAIL} — run npm run seed:test-users first.`);
  const { data: mgr, error: mgrErr } = await admin
    .from("profiles").select("id, org_id, full_name").eq("id", authUser).maybeSingle();
  if (mgrErr) throw mgrErr;
  if (!mgr) throw new Error(`No profile for ${MANAGER_EMAIL} (${authUser}).`);
  console.log(`Manager: ${mgr.full_name} (${mgr.id})\n`);

  const { data: sample } = await admin.from("profiles").select("*").limit(1);
  const profCols = new Set(sample?.[0] ? Object.keys(sample[0]) : []);

  for (const u of NEW_REPORTS) {
    console.log(`Report: ${u.full_name}`);
    const id = await getOrCreateAuthUser(u.email);

    const row = { id, org_id: mgr.org_id, manager_id: mgr.id, role: "employee", full_name: u.full_name, title: u.title };
    if (profCols.has("account_status")) row.account_status = "active_sso";
    if (profCols.has("provisioned_via")) row.provisioned_via = "sso";
    else if (profCols.has("provisioning_source")) row.provisioning_source = "sso";
    const up = await admin.from("profiles").upsert(row);
    if (up.error) throw new Error(`profiles upsert ${u.full_name}: ${up.error.message}`);

    // Clear prior seeded rows for this report, then re-seed
    await admin.from("achievements").delete().like("description", `%${MARKER}%`).eq("profile_id", id);
    await admin.from("projects").delete().like("description", `%${MARKER}%`).eq("profile_id", id);
    await admin.from("promotion_readiness").delete().like("evidence", `%${MARKER}%`).eq("employee_id", id);

    if (u.item.kind === "project") {
      await safeInsert("projects", [{ profile_id: id, description: u.item.description, verification_level: 1 }]);
    } else {
      await safeInsert("achievements", [{ profile_id: id, org_id: mgr.org_id, kind: u.item.kind, description: u.item.description, verification_level: 1 }]);
    }
    await safeInsert("promotion_readiness", [{ employee_id: id, category: u.coach.category, evidence: u.coach.evidence }]);
    console.log(`  ✓ profile + 1 verify item + 1 coaching insight (${u.coach.category})\n`);
  }

  // Populate Team Health / Team Value Scores / Review Center for every report
  const { data: reps } = await admin.from("profiles").select("id, full_name").eq("manager_id", mgr.id);
  console.log(`\nSeeding health data for ${reps.length} report(s)...`);
  for (const r of reps) {
    const h = HEALTH[r.full_name] ?? DEFAULT_HEALTH;

    // pulse_surveys — scoped idempotency on (employee, year, quarter)
    await admin.from("pulse_surveys").delete()
      .eq("employee_id", r.id).eq("survey_year", SURVEY_YEAR).eq("survey_quarter", SURVEY_QUARTER);
    await safeInsert("pulse_surveys", [{ employee_id: r.id, survey_year: SURVEY_YEAR, survey_quarter: SURVEY_QUARTER, ...h.pulse }]);

    // employee_value_scores — marker in inputs jsonb for idempotent cleanup
    await admin.from("employee_value_scores").delete().eq("employee_id", r.id).eq("inputs->>_seed", MARKER);
    await safeInsert("employee_value_scores", [{ employee_id: r.id, score: h.score, inputs: { ...h.inputs, _seed: MARKER } }]);

    // feedback_cycles — one current cycle; responses drive the status pill
    await admin.from("feedback_cycles").delete().eq("profile_id", r.id);
    if (h.review !== "none") {
      const row = { profile_id: r.id, employee_responses: REVIEW_EMP, manager_responses: h.review === "both" ? REVIEW_MGR : {} };
      await safeInsert("feedback_cycles", [row]);
    }

    const status = h.review === "both" ? "Ready to sign" : h.review === "employee" ? "In progress" : "Not started";
    console.log(`  ${r.full_name}: score ${h.score}, pulse Q${SURVEY_QUARTER} ${SURVEY_YEAR}, review "${status}"`);
  }

  console.log(`\nDirect reports under ${mgr.full_name} now: ${reps.map((r) => r.full_name).join(", ")}`);
  console.log(`Coaching carousel slides expected: ${reps.length} (one insight per report with a promotion_readiness row)`);
  console.log("Done. Reload the manager dashboard.");
}

main().catch((e) => { console.error("Seed failed:", e.message ?? e); process.exit(1); });
