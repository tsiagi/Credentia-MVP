// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";

// A valid 32-byte key for the suite.
process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const { encryptField, decryptField, isEncrypted, isEncryptionConfigured } = await import("./crypto.ts");

test("roundtrips a value", () => {
  const secret = "scim-token-" + randomBytes(8).toString("hex");
  const ct = encryptField(secret);
  assert.notEqual(ct, secret, "ciphertext must differ from plaintext");
  assert.ok(isEncrypted(ct));
  assert.equal(decryptField(ct), secret);
});

test("ciphertext is non-deterministic (fresh IV per call)", () => {
  const a = encryptField("same");
  const b = encryptField("same");
  assert.notEqual(a, b, "same input must produce different envelopes");
  assert.equal(decryptField(a), decryptField(b));
});

test("tampering is detected (GCM auth tag)", () => {
  const ct = encryptField("integrity");
  const parts = ct.split(":");
  // flip a byte in the ciphertext segment
  const buf = Buffer.from(parts[3], "base64");
  buf[0] ^= 0xff;
  parts[3] = buf.toString("base64");
  assert.throws(() => decryptField(parts.join(":")), "tampered ciphertext must fail to decrypt");
});

test("wrong key fails to decrypt", () => {
  const ct = encryptField("cross-key");
  const saved = process.env.FIELD_ENCRYPTION_KEY;
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  try {
    assert.throws(() => decryptField(ct), "decrypt under a different key must fail");
  } finally {
    process.env.FIELD_ENCRYPTION_KEY = saved;
  }
});

test("isEncrypted only matches our envelope", () => {
  assert.equal(isEncrypted("plaintext"), false);
  assert.equal(isEncrypted(null), false);
  assert.equal(isEncrypted(encryptField("x")), true);
});

test("missing/invalid key throws", () => {
  const saved = process.env.FIELD_ENCRYPTION_KEY;
  delete process.env.FIELD_ENCRYPTION_KEY;
  try {
    assert.equal(isEncryptionConfigured(), false);
    assert.throws(() => encryptField("x"));
    process.env.FIELD_ENCRYPTION_KEY = Buffer.from("tooshort").toString("base64");
    assert.throws(() => encryptField("x"), /32 bytes/);
  } finally {
    process.env.FIELD_ENCRYPTION_KEY = saved;
  }
});
