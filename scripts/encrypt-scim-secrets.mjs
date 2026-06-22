// One-time backfill: encrypt any plaintext organizations.scim_secret at rest.
// Idempotent — rows already in `v1:` envelope form are skipped.
//
//   node scripts/encrypt-scim-secrets.mjs
//
// Requires (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// FIELD_ENCRYPTION_KEY.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Minimal .env.local loader (KEY=VALUE, optional quotes).
function loadEnv() {
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* rely on real env */
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || !process.env.FIELD_ENCRYPTION_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / FIELD_ENCRYPTION_KEY in .env.local");
  process.exit(1);
}

// Single source of truth for the ciphertext format.
const { encryptField, isEncrypted } = await import("../lib/crypto.ts");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: orgs, error } = await supabase.from("organizations").select("id, scim_secret");
if (error) {
  console.error("Read failed:", error.message);
  process.exit(1);
}

let encrypted = 0, skipped = 0;
for (const org of orgs ?? []) {
  if (!org.scim_secret) { skipped++; continue; }
  if (isEncrypted(org.scim_secret)) { skipped++; continue; }
  const { error: upErr } = await supabase
    .from("organizations")
    .update({ scim_secret: encryptField(org.scim_secret) })
    .eq("id", org.id);
  if (upErr) {
    console.error(`Failed to encrypt org ${org.id}:`, upErr.message);
    process.exit(1);
  }
  encrypted++;
}

console.log(`Done. Encrypted ${encrypted} org SCIM secret(s); skipped ${skipped} (null or already encrypted).`);
