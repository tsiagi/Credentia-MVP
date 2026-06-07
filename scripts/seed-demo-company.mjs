// Create [QA] Demo Co auth users, then run supabase/seed-demo-company.sql in SQL Editor.
// Run: npm run seed:demo-company
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

const USERS = [
  "admin@qa-democo.test",
  "executive@qa-democo.test",
  "manager@qa-democo.test",
  "employee1@qa-democo.test",
  "employee2@qa-democo.test",
];

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
    console.log(`  exists  ${email}`);
    return existing;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`${email}: ${error.message}`);
  console.log(`  created ${email}`);
  return data.user.id;
}

console.log("[QA] Demo Co — Step 1: auth users (password: " + PASSWORD + ")");
for (const email of USERS) {
  await getOrCreateAuthUser(email);
}

console.log("\n[QA] Demo Co — Step 2: run SQL in Supabase SQL Editor:");
console.log("  supabase/seed-demo-company.sql");
console.log("\nThen sign in as admin@qa-democo.test and check Platform Console billing as superadmin.");
