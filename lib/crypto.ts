// lib/crypto.ts
// ─────────────────────────────────────────────────────────────
// Application-layer field encryption for sensitive columns
// (e.g. organizations.scim_secret, future comp/transcript PII).
//
// AES-256-GCM (authenticated encryption). The key lives ONLY in the server
// env (FIELD_ENCRYPTION_KEY), never in the database — so a DB dump contains
// only ciphertext and there is no key in it to reverse it. GCM's auth tag
// makes tampering detectable (decrypt throws). Output is self-describing and
// versioned so the scheme can be rotated:
//
//     v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
//
// Encrypt/decrypt happen in server code only (route handlers, RPC-adjacent
// server logic, migration/backfill scripts). The browser never holds the key.
//
// We deliberately do NOT use pgsodium TCE (deprecated on Supabase) — keeping
// the key out of Postgres entirely is a stronger posture.
// ─────────────────────────────────────────────────────────────
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // standard GCM nonce length

/** Decode the 32-byte key from FIELD_ENCRYPTION_KEY (base64). Throws if absent/invalid. */
function getKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY is not set. Generate one with " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"` " +
        "and set it server-side (never NEXT_PUBLIC_).",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).");
  }
  return key;
}

/** True when a valid key is configured (for health checks / graceful 503s). */
export function isEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/** True if a stored value is one of our ciphertext envelopes (vs legacy plaintext). */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(VERSION + ":");
}

/** Encrypt a UTF-8 string into a `v1:iv:tag:ct` envelope. */
export function encryptField(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

/** Decrypt a `v1:iv:tag:ct` envelope. Throws on tampering or wrong key. */
export function decryptField(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognized ciphertext format");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return pt.toString("utf8");
}
