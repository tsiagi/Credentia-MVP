-- ════════════════════════════════════════════════════════════════
-- Security fix #6 — stop audit-log forgery / impersonation
-- Run AFTER rls-policies.sql. Idempotent.
--
-- PROBLEM (audit #6):
--   Policy "audit: anyone insert" used WITH CHECK (auth.uid() IS NOT NULL),
--   so any authenticated user could insert audit rows attributing ANY action
--   to ANY actor_id (impersonation / repudiation), undermining the
--   tamper-evident audit trail.
--
-- FIX:
--   Require the inserted actor_id to equal the caller. Legitimate client logs
--   already pass the acting user's id (lib/audit.ts → writeAuditLog). Trusted
--   server writes use the service-role key, which BYPASSES RLS, so they can
--   still stamp any actor_id (or null) as before.
--
--   UPDATE/DELETE remain denied for clients (no such policy exists), so the
--   log stays append-only at the client boundary.
-- ════════════════════════════════════════════════════════════════

drop policy if exists "audit: anyone insert" on audit_log;
create policy "audit: actor inserts own" on audit_log for insert
  with check (actor_id = auth.uid());
