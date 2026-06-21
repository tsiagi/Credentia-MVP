-- ════════════════════════════════════════════════════════════════
-- Security fix #10 — per-org SCIM secret (replace single global token)
-- Idempotent.
--
-- PROBLEM (audit #10):
--   /api/provision/scim authenticated with one global SCIM_WEBHOOK_SECRET and
--   trusted a client-supplied x-org-id header. Anyone holding that single
--   secret could create/deactivate users — and trigger departures — in ANY
--   org by changing x-org-id. No per-tenant scoping.
--
-- FIX (db side):
--   Give each org its own SCIM secret. The webhook (see route change) looks up
--   the secret for the specific x-org-id and constant-time compares it, so a
--   token only authorizes the tenant it belongs to.
--
--   scim_secret is operator-only — it must NOT be readable by client roles.
--   security-fix-8 already revoked blanket table SELECT and re-grants an
--   explicit column list that EXCLUDES scim_secret, so we re-run that grant
--   here to cover the newly added column.
-- ════════════════════════════════════════════════════════════════

alter table organizations add column if not exists scim_secret text;
-- New orgs get a fresh random secret automatically (volatile default).
alter table organizations alter column scim_secret set default encode(gen_random_bytes(24), 'hex');
-- Backfill existing orgs.
update organizations set scim_secret = encode(gen_random_bytes(24), 'hex') where scim_secret is null;

-- Re-assert column-level SELECT so scim_secret (and billing_notes) stay hidden
-- from client roles while every other column remains readable.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'organizations'
    and column_name not in ('billing_notes', 'scim_secret');

  revoke select on public.organizations from authenticated, anon;
  execute format('grant select (%s) on public.organizations to authenticated, anon', cols);
end $$;
