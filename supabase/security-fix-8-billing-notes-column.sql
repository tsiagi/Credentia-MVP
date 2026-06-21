-- ════════════════════════════════════════════════════════════════
-- Security fix #8 — hide operator-only organizations.billing_notes from
-- company users. Idempotent (re-runnable).
--
-- PROBLEM (audit #8):
--   organizations.billing_notes is documented "internal operator notes
--   (superadmin only) — contract terms, PO reference". But "org: members read"
--   grants every company user SELECT on their org row, and RLS cannot restrict
--   columns — so any employee/admin could `select billing_notes` in DevTools.
--   No app code reads it via the client (ORG_SELECT excludes it); only the
--   service-role superadmin routes use it.
--
-- FIX (column-level privilege):
--   Postgres consults column grants only when the role lacks a table-level
--   grant, so we revoke the blanket table SELECT from the client roles and
--   re-grant SELECT on every column EXCEPT billing_notes. The service_role
--   (superadmin routes) is unaffected. Writes are already blocked by the
--   guard_org_billing_columns trigger.
--
--   MAINTENANCE NOTE: because client SELECT is now an explicit column list,
--   a NEW organizations column will not be readable by clients until granted.
--   Re-run this script (it rebuilds the grant from the live schema) after
--   adding any client-facing organizations column.
-- ════════════════════════════════════════════════════════════════

do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'organizations'
    -- operator-only secrets: never readable by client roles
    and column_name not in ('billing_notes', 'scim_secret');

  revoke select on public.organizations from authenticated, anon;
  execute format('grant select (%s) on public.organizations to authenticated, anon', cols);
end $$;
