-- ════════════════════════════════════════════════════════════════
-- admin-rls-notes.sql  —  Admin Console schema reconciliation
-- Supports the Superadmin (/superadmin) + Company Admin (/admin) route trees.
--
-- Idempotent: add column if not exists / create table if not exists /
-- create or replace fn / drop-create policy. Safe to re-run. Apply with:
--   node scripts/apply-schema-patch.mjs supabase/admin-rls-notes.sql
-- or paste into the Supabase SQL editor.
--
-- WHY THIS EXISTS
-- The live DB pre-dated several repo migrations: the organizations table lacked
-- billing/status/branding columns, billing_events / tenant_integrations /
-- data_import_batches did not exist, is_superadmin() was missing, and the
-- 'superadmin' role was not permitted. This migration reconciles the schema to
-- what the admin route trees expect.
--
-- ENFORCEMENT MODEL
--   1. middleware.ts blocks the wrong role from loading the wrong shell.
--   2. Route-tree layouts re-check role server-side (defense in depth).
--   3. RLS below is the AUTHORITATIVE data boundary. Company admins read only
--      their own org (org_id = current_org()); cross-tenant superadmin reads go
--      through the service-role API routes (/api/superadmin/*, /api/billing/org)
--      behind requireSuperadmin — never a blanket client RLS bypass.
--
-- Per rls-policies.sql note #5, the sensitive per-employee inference tables
-- (compensation_recommendations, employee_value_scores, promotion_readiness)
-- stay org-scoped; the platform "AI Insight usage" metric counts only the
-- org-level AI artifacts (ai_inference_tasks / ai_inference_reports).
-- ════════════════════════════════════════════════════════════════

-- ── 1. Allow the superadmin role on profiles ───────────────────────────────
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('superadmin', 'employee', 'manager', 'executive', 'admin', 'hr'));

-- ── 2. Organizations: subscription, lifecycle, branding, AI-policy columns ──
alter table organizations add column if not exists status text not null default 'active';
alter table organizations add column if not exists plan text;
alter table organizations add column if not exists billing_status text not null default 'trial';
alter table organizations add column if not exists trial_starts_at timestamptz;
alter table organizations add column if not exists trial_ends_at timestamptz;
alter table organizations add column if not exists monthly_price numeric;
alter table organizations add column if not exists seats integer;
alter table organizations add column if not exists billing_notes text;
alter table organizations add column if not exists logo_url text;
alter table organizations add column if not exists brand_color text;
alter table organizations add column if not exists sso_domain text;
alter table organizations add column if not exists ai_coaching_enabled boolean not null default true;
alter table organizations add column if not exists promotion_engine_enabled boolean not null default true;
alter table organizations add column if not exists require_proof boolean not null default true;

comment on column organizations.brand_color is
  'Company accent colour shown in the app shell. Non-billing — editable by org admin and superadmin.';

-- ── 3. Missing tables (billing ledger, integrations, bulk imports) ─────────
create table if not exists billing_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations on delete cascade,
  type        text not null,
  amount      numeric,
  created_by  uuid references profiles on delete set null,
  created_at  timestamptz not null default now(),
  detail      jsonb not null default '{}'
);
create index if not exists idx_billing_events_org on billing_events (org_id, created_at desc);

-- No strict source/status CHECK: the app writes status='connected', which the
-- repo's stricter schema would reject. Reconcile toward the code.
create table if not exists tenant_integrations (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations on delete cascade,
  source            text not null,
  status            text not null default 'pending',
  last_sync_at      timestamptz,
  records_imported  integer not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists idx_tenant_integrations_org on tenant_integrations (org_id);

create table if not exists data_import_batches (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations on delete cascade,
  imported_by   uuid not null references profiles on delete cascade,
  source        text not null,
  row_count     integer not null default 0,
  success_count integer not null default 0,
  error_count   integer not null default 0,
  errors        jsonb not null default '[]',
  created_at    timestamptz not null default now()
);
create index if not exists idx_data_import_batches_org on data_import_batches (org_id, created_at desc);

-- ── 4. is_superadmin() helper ──────────────────────────────────────────────
create or replace function is_superadmin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name() = 'superadmin', false)
$$;

-- ── 5. Block non-superadmin edits to billing columns ───────────────────────
-- Allow trusted server contexts (service role / direct DB → auth.uid() is null)
-- and superadmins; block only authenticated non-superadmin users (company admins).
-- The auth.uid() allowance is REQUIRED so the service-role billing API can write.
create or replace function guard_org_billing_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_superadmin() then
    return new;
  end if;
  if new.billing_status is distinct from old.billing_status
     or new.trial_starts_at is distinct from old.trial_starts_at
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.monthly_price is distinct from old.monthly_price
     or new.seats is distinct from old.seats
     or new.billing_notes is distinct from old.billing_notes then
    raise exception 'Only platform operators can change billing fields';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_org_billing on organizations;
create trigger trg_guard_org_billing
  before update on organizations for each row execute function guard_org_billing_columns();

-- ── 6. Policies the admin feature needs ────────────────────────────────────
-- Company admin: delete a profile in their org (user management).
drop policy if exists "profiles: admin delete org members" on profiles;
create policy "profiles: admin delete org members" on profiles for delete
  using (is_org_admin() and org_id = current_org());

-- Company admin reads org AI-usage volume (artifacts carry org_id).
alter table ai_inference_tasks   enable row level security;
alter table ai_inference_reports enable row level security;

drop policy if exists "ai_tasks: admin read org" on ai_inference_tasks;
create policy "ai_tasks: admin read org" on ai_inference_tasks for select
  using (org_id = current_org() and is_org_admin());
drop policy if exists "ai_tasks: superadmin read" on ai_inference_tasks;
create policy "ai_tasks: superadmin read" on ai_inference_tasks for select
  using (is_superadmin());

drop policy if exists "ai_reports: admin read org" on ai_inference_reports;
create policy "ai_reports: admin read org" on ai_inference_reports for select
  using (org_id = current_org() and is_org_admin());
drop policy if exists "ai_reports: superadmin read" on ai_inference_reports;
create policy "ai_reports: superadmin read" on ai_inference_reports for select
  using (is_superadmin());

-- billing_events: superadmin only via RLS (service-role API also writes).
alter table billing_events enable row level security;
drop policy if exists "billing_events: superadmin all" on billing_events;
create policy "billing_events: superadmin all" on billing_events for all
  using (is_superadmin()) with check (is_superadmin());

-- tenant_integrations: org admin manages own org; superadmin all.
alter table tenant_integrations enable row level security;
drop policy if exists "integrations: admin all" on tenant_integrations;
create policy "integrations: admin all" on tenant_integrations for all
  using (org_id = current_org() and is_org_admin())
  with check (org_id = current_org() and is_org_admin());
drop policy if exists "integrations: superadmin all" on tenant_integrations;
create policy "integrations: superadmin all" on tenant_integrations for all
  using (is_superadmin()) with check (is_superadmin());

-- data_import_batches: org admin reads/inserts own org; superadmin all.
alter table data_import_batches enable row level security;
drop policy if exists "imports: admin read" on data_import_batches;
create policy "imports: admin read" on data_import_batches for select
  using (org_id = current_org() and is_org_admin());
drop policy if exists "imports: admin insert" on data_import_batches;
create policy "imports: admin insert" on data_import_batches for insert
  with check (org_id = current_org() and is_org_admin() and imported_by = auth.uid());
drop policy if exists "imports: superadmin all" on data_import_batches;
create policy "imports: superadmin all" on data_import_batches for all
  using (is_superadmin()) with check (is_superadmin());

-- ── 7. Promote the platform operator profile to the superadmin role ────────
-- (Idempotent: only flips the seeded operator account.)
update profiles set role = 'superadmin'
where id = (select id from auth.users where email = 'superadmin@demo.corp.com')
  and role <> 'superadmin';
