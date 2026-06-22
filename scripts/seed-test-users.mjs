// Create QA test auth users + profiles in remote Supabase.
// Run: npm run seed:test-users
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

const PASSWORD = process.env.TEST_USER_PASSWORD ?? "TestPass123!";
const ORG_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const DEPT_ENG = "a2222222-2222-4222-8222-222222222222";
const DEPT_HR = "a4444444-4444-4444-8444-444444444444";

const USERS = [
  { email: "superadmin@demo.corp.com", role: "superadmin", full_name: "Platform Operator", title: "Core-Roborate Ops", org_id: null, manager_key: null, source: "invite" },
  { email: "admin@demo.corp.com", role: "admin", full_name: "Casey Admin", title: "System Administrator", org_id: ORG_ID, manager_key: null, source: "invite" },
  { email: "executive@demo.corp.com", role: "executive", full_name: "Alex Morgan", title: "Chief People Officer", org_id: ORG_ID, manager_key: null, source: "sso" },
  { email: "manager@demo.corp.com", role: "manager", full_name: "Jordan Lee", title: "Engineering Manager", org_id: ORG_ID, manager_key: null, source: "sso" },
  { email: "employee@demo.corp.com", role: "employee", full_name: "Maya Chen", title: "Senior Analyst", org_id: ORG_ID, manager_key: "manager", source: "sso" },
];

const SUPERADMIN_PATCH_SQL = `-- Allow superadmin role (run once in SQL Editor if seed warns)
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('superadmin', 'employee', 'manager', 'executive', 'admin', 'hr'));`;

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!serviceKey.startsWith("eyJ") || serviceKey.length < 100) {
  console.error("SUPABASE_SERVICE_ROLE_KEY must be the service_role JWT (starts with eyJ...).");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function detectSchema() {
  const { data: orgSample } = await admin.from("organizations").select("*").limit(1);
  const orgCols = new Set(orgSample?.[0] ? Object.keys(orgSample[0]) : ["id", "name"]);

  const { data: profSample } = await admin.from("profiles").select("*").limit(1);
  const profCols = new Set(
    profSample?.[0]
      ? Object.keys(profSample[0])
      : ["id", "org_id", "manager_id", "role", "full_name", "title", "account_status"],
  );

  return {
    orgCols,
    profCols,
    usesProvisioningSource: profCols.has("provisioning_source"),
    usesProvisionedVia: profCols.has("provisioned_via"),
    hasOrgPlan: orgCols.has("plan"),
    hasOrgStatus: orgCols.has("status"),
    hasOrgSsoDomain: orgCols.has("sso_domain"),
  };
}

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
  if (existing) {
    console.log(`  exists  ${email} (${existing})`);
    return existing;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`${email}: ${error.message}`);
  console.log(`  created ${email} (${data.user.id})`);
  return data.user.id;
}

async function upsertOrganization(schema) {
  const payload = { id: ORG_ID, name: "Demo Corp" };
  if (schema.hasOrgStatus) payload.status = "active";
  if (schema.hasOrgPlan) payload.plan = "Enterprise";
  if (schema.orgCols.has("sso_provider")) payload.sso_provider = "okta";
  if (schema.hasOrgSsoDomain) payload.sso_domain = "demo.corp.com";
  if (schema.orgCols.has("sso_enabled")) payload.sso_enabled = true;

  const { error } = await admin.from("organizations").upsert(payload);
  if (error) throw new Error(`organizations: ${error.message}`);
}

function buildProfileRow(u, id, managerId, schema) {
  const row = {
    id,
    org_id: u.org_id,
    manager_id: managerId,
    role: u.role,
    full_name: u.full_name,
    title: u.title,
    account_status: "active_sso",
  };
  if (schema.usesProvisionedVia) row.provisioned_via = u.source;
  else if (schema.usesProvisioningSource) row.provisioning_source = u.source;
  return row;
}

async function trySuperadminConstraint(schema, superadminId) {
  const probe = buildProfileRow(
    { role: "superadmin", full_name: "probe", title: "", org_id: null, source: "invite" },
    superadminId,
    null,
    schema,
  );
  const { error } = await admin.from("profiles").upsert(probe);
  if (!error) return true;
  if (!error.message.includes("profiles_role_check")) throw new Error(`profiles probe: ${error.message}`);
  return false;
}

async function applySuperadminPatchViaPg() {
  const dbPassword = env.SUPABASE_DB_PASSWORD?.trim();
  if (!dbPassword) return false;

  const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!ref) return false;

  let pg;
  try {
    pg = (await import("postgres")).default;
  } catch {
    console.warn("  Install postgres package for automatic superadmin migration: npm i -D postgres");
    return false;
  }

  const host = env.SUPABASE_DB_HOST ?? `aws-0-us-east-1.pooler.supabase.com`;
  const sql = postgres({
    host,
    port: 6543,
    database: "postgres",
    username: `postgres.${ref}`,
    password: dbPassword,
    ssl: "require",
    max: 1,
  });

  try {
    await sql.unsafe(SUPERADMIN_PATCH_SQL);
    return true;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const schema = await detectSchema();

console.log("Step 1 — Auth users (password: " + PASSWORD + ")");
const ids = {};
for (const u of USERS) {
  ids[u.email] = await getOrCreateAuthUser(u.email);
}
ids.manager = ids["manager@demo.corp.com"];

console.log("\nStep 2 — Demo Corp organization");
await upsertOrganization(schema);

console.log("\nStep 3 — Profiles");
let superadminOk = await trySuperadminConstraint(schema, ids["superadmin@demo.corp.com"]);
if (!superadminOk) {
  console.warn("  superadmin role not allowed yet — attempting DB patch…");
  superadminOk = await applySuperadminPatchViaPg();
  if (!superadminOk) {
    console.warn("\n  ⚠ Run this in Supabase SQL Editor, then re-run seed:\n");
    console.warn(SUPERADMIN_PATCH_SQL);
    console.warn("");
  }
}

for (const u of USERS) {
  const id = ids[u.email];
  const manager_id = u.manager_key === "manager" ? ids.manager : null;
  let role = u.role;
  if (u.role === "superadmin" && !superadminOk) {
    console.warn(`  skipping superadmin profile for ${u.email} until SQL patch is applied`);
    continue;
  }
  const row = buildProfileRow(u, id, manager_id, schema);
  const { error } = await admin.from("profiles").upsert(row);
  if (error) throw new Error(`profiles ${u.email}: ${error.message}`);
  console.log(`  ${role.padEnd(12)} ${u.full_name}`);
}

console.log("\nStep 4 — Departments");
await admin.from("departments").delete().eq("org_id", ORG_ID);
const { error: deptErr } = await admin.from("departments").insert([
  { id: DEPT_ENG, org_id: ORG_ID, name: "Engineering", head_profile_id: ids.manager },
  { id: DEPT_HR, org_id: ORG_ID, name: "People & HR", head_profile_id: ids["executive@demo.corp.com"] },
]);
if (deptErr) throw new Error(`departments: ${deptErr.message}`);

console.log("\nStep 5 — user_settings");
for (const u of USERS) {
  if (u.role === "superadmin" && !superadminOk) continue;
  const { error } = await admin.from("user_settings").upsert({ profile_id: ids[u.email] });
  if (error) throw new Error(`user_settings ${u.email}: ${error.message}`);
}

const profileIds = USERS.filter((u) => u.role !== "superadmin" || superadminOk).map((u) => ids[u.email]);
const { data: verify, error: verifyErr } = await admin
  .from("profiles")
  .select("full_name, role, org_id, manager_id")
  .in("id", profileIds);
if (verifyErr) throw verifyErr;

console.log("\nDone — sign in with:");
for (const u of USERS) {
  if (u.role === "superadmin" && !superadminOk) {
    console.log(`  ${"(pending SQL)".padEnd(12)} ${u.email}`);
  } else {
    console.log(`  ${u.role.padEnd(12)} ${u.email}`);
  }
}
console.log("\nProfiles in DB:");
for (const row of verify ?? []) {
  console.log(`  ${row.role?.padEnd(12)} ${row.full_name}  org=${row.org_id ? "Demo Corp" : "—"}  manager=${row.manager_id ? "yes" : "—"}`);
}

if (!superadminOk) process.exitCode = 2;
