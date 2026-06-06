// Sign-in smoke test — run: node scripts/test-signin.mjs
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

const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = loadEnv();
const email = process.env.TEST_EMAIL ?? "wv-test-1780777631717@mailinator.com";
const password = process.env.TEST_PASSWORD ?? "TestSignIn123!";

const supabase = createClient(url, key);
let failed = 0;
function check(label, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
}

const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
check("signInWithPassword", !signInErr && !!signIn?.session, signInErr?.message);
const userId = signIn?.user?.id;
if (!userId) process.exit(1);

const { error: profileErr } = await supabase.from("profiles").upsert({
  id: userId,
  role: "employee",
  full_name: "WV Test User",
});
check("profiles upsert", !profileErr, profileErr?.message);

const { data: profile, error: fetchErr } = await supabase
  .from("profiles")
  .select("role, full_name")
  .eq("id", userId)
  .single();
check("profiles select", !fetchErr && profile?.role === "employee", fetchErr?.message);

const { error: settingsErr } = await supabase.from("user_settings").upsert({
  profile_id: userId,
  show_outlook: true,
  ai_summaries: true,
  passport_published: false,
  kudos_notifications: true,
});
check("user_settings upsert", !settingsErr, settingsErr?.message);

const { error: factsErr } = await supabase.from("verified_facts").select("id").eq("profile_id", userId);
check("verified_facts select", !factsErr, factsErr?.message);

const { data: { session } } = await supabase.auth.getSession();
check("getSession", !!session?.access_token);

console.log(failed === 0 ? "\nAll checks passed — sign-in + RLS working." : `\n${failed} failed.`);
process.exit(failed);
