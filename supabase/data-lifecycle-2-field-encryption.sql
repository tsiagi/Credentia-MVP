-- ════════════════════════════════════════════════════════════════
-- Data lifecycle #2 — field-level encryption for organizations.scim_secret
-- Idempotent.
--
-- scim_secret is now stored as an AES-256-GCM ciphertext envelope (key in the
-- server env via lib/crypto.ts, NEVER in the DB). This SQL only removes the
-- plaintext-generating column default — the superadmin org-creation route now
-- sets an encrypted secret, and existing rows are migrated by
-- scripts/encrypt-scim-secrets.mjs. The column remains hidden from client roles
-- (column grants from security-fix-8/#10 exclude it).
-- ════════════════════════════════════════════════════════════════

alter table organizations alter column scim_secret drop default;

comment on column organizations.scim_secret is
  'Per-org SCIM webhook secret, encrypted at rest (AES-256-GCM, key in server env). Operator/server-only; never readable by client roles.';
