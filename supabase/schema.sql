-- Workforce Verify (Core-Roborate) — Supabase schema
-- Paste into Supabase → SQL Editor and run once.
-- Verified records and AI inference tables are kept in separate sections.

-- ── extensions ────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── shared enums / checks ───────────────────────────────────
-- verification_level: 1=self, 2=manager, 3=HR, 4=company, 5=multi-source

-- ══════════════════════════════════════════════════════════════
-- ORG STRUCTURE (organizations must exist before profiles.org_id)
-- ══════════════════════════════════════════════════════════════

create table if not exists organizations (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  -- Tenant lifecycle (multi-tenant: one DB, logical isolation via org_id + RLS)
  status               text not null default 'provisioning'
                       check (status in ('provisioning', 'active', 'suspended')),
  plan                 text,
  isolation_mode       text not null default 'shared'
                       check (isolation_mode in ('shared', 'dedicated')),
  onboarding_step      integer not null default 0,
  -- IdP + billing (company subscription controls departing-employee trial)
  sso_provider         text not null default 'none'
                       check (sso_provider in ('okta', 'azure', 'google', 'none')),
  sso_domain           text,
  auto_trial_enabled   boolean not null default true,
  trial_days           integer not null default 30
                       check (trial_days between 1 and 365),
  -- Org-wide AI + verification policy (company admin)
  ai_coaching_enabled      boolean not null default true,
  promotion_engine_enabled boolean not null default true,
  require_proof            boolean not null default true,
  evaluation_model         text not null default 'A'
                       check (evaluation_model in ('A', 'B', 'both')),
  logo_url                 text,
  -- Company subscription billing (mock-money ledger — no card data in DB)
  trial_starts_at          timestamptz,
  trial_ends_at            timestamptz,
  billing_status           text not null default 'trial'
                       check (billing_status in ('trial', 'active', 'past_due', 'canceled')),
  monthly_price            numeric,
  seats                    integer,
  billing_notes            text,
  created_at           timestamptz not null default now()
);

comment on column organizations.status is
  'provisioning = superadmin onboarding; active = live tenant; suspended = access blocked.';
comment on column organizations.plan is
  'Commercial plan label (e.g. enterprise, growth) — set by superadmin.';
comment on column organizations.isolation_mode is
  'shared = default single-DB multi-tenant. dedicated = forward flag for future physical DB split.';
comment on column organizations.onboarding_step is
  'Superadmin onboarding wizard progress (0 = not started).';

comment on column organizations.sso_provider is
  'Connected identity provider: okta/azure/google, or none (manual invite fallback only).';
comment on column organizations.sso_domain is
  'Email domain routed to this org on SSO login (e.g. acme.com). Used to resolve org from IdP assertion.';
comment on column organizations.auto_trial_enabled is
  'When true, departing employees enter former_trial for trial_days. Admin can disable org-wide.';
comment on column organizations.trial_days is
  'Length of personal passport trial after employment ends (default 30). Admin can extend per person in app.';
comment on column organizations.ai_coaching_enabled is
  'When false, AI Coaching panels are hidden org-wide.';
comment on column organizations.promotion_engine_enabled is
  'When false, Promotion Readiness panels are hidden org-wide.';
comment on column organizations.require_proof is
  'When true, achievements/attestations require evidence before submission.';
comment on column organizations.evaluation_model is
  'A = peer selection, B = kudos ecosystem, both = run both models concurrently.';
comment on column organizations.logo_url is
  'Company logo shown in app shell for this org (mock URL until Storage).';
comment on column organizations.trial_starts_at is
  'When the company platform trial began (set by superadmin).';
comment on column organizations.trial_ends_at is
  'When the company platform trial ends — extend or convert to active plan.';
comment on column organizations.billing_status is
  'trial | active | past_due | canceled — commercial subscription state (no card numbers stored).';
comment on column organizations.monthly_price is
  'Mock/list price per month in dollars — real charges go through a payment processor later.';
comment on column organizations.seats is
  'Licensed seat count for the org subscription.';
comment on column organizations.billing_notes is
  'Internal operator notes (superadmin only) — e.g. contract terms, PO reference.';

-- Append-only ledger of billing actions (mock charges included). No payment instrument data.
create table if not exists billing_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations on delete cascade,
  type        text not null
              check (type in ('trial_started', 'trial_extended', 'trial_ended', 'plan_set', 'charge_mocked', 'canceled')),
  amount      numeric,
  created_by  uuid references profiles on delete set null,
  created_at  timestamptz not null default now(),
  detail      jsonb not null default '{}'
);

comment on table billing_events is
  'Append-only billing ledger — trial changes, plan updates, mocked charges. Real card data never stored.';
comment on column billing_events.type is
  'Event kind: trial_started, plan_set, charge_mocked, etc.';
comment on column billing_events.amount is
  'Dollar amount when applicable (mock charges use this for operator visibility).';
comment on column billing_events.created_by is
  'Superadmin profile who performed the action.';
comment on column billing_events.detail is
  'Extra context (trial days, seat count, mock flag) — jsonb for flexibility.';

create index if not exists idx_billing_events_org on billing_events (org_id, created_at desc);

-- How each tenant's data was integrated (manual, CSV, SCIM, Okta, etc.)
create table if not exists tenant_integrations (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations on delete cascade,
  source            text not null
                    check (source in ('manual', 'csv', 'scim', 'okta', 'workday')),
  status            text not null default 'pending'
                    check (status in ('pending', 'active', 'error', 'disabled')),
  last_synced_at    timestamptz,
  records_imported  integer not null default 0,
  created_at        timestamptz not null default now()
);

comment on table tenant_integrations is
  'Tracks how a company tenant receives workforce data. One row per integration channel.';
comment on column tenant_integrations.source is
  'Provisioning channel: manual add, csv bulk, scim sync, okta SSO, etc.';
comment on column tenant_integrations.records_imported is
  'Running count of profiles/rows successfully imported via this integration.';

-- Bulk import audit trail (CSV uploads, superadmin bulk loads)
create table if not exists data_import_batches (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations on delete cascade,
  imported_by   uuid not null references profiles on delete cascade,
  source        text not null
                check (source in ('manual', 'csv', 'scim', 'okta', 'superadmin')),
  row_count     integer not null default 0,
  success_count integer not null default 0,
  error_count   integer not null default 0,
  errors        jsonb not null default '[]',
  created_at    timestamptz not null default now()
);

comment on table data_import_batches is
  'One row per bulk import operation — success/error counts and per-row errors in jsonb.';
comment on column data_import_batches.errors is
  'Array of { row, message } objects for failed rows; kept for admin/superadmin review.';

create index if not exists idx_tenant_integrations_org on tenant_integrations (org_id);
create index if not exists idx_data_import_batches_org on data_import_batches (org_id, created_at desc);

-- ══════════════════════════════════════════════════════════════
-- EXISTING TABLES (verification_level added to verified_facts)
-- profiles.org_id + profiles.manager_id power RLS in rls-policies.sql
-- ══════════════════════════════════════════════════════════════

create table if not exists profiles (
  id                 uuid primary key references auth.users on delete cascade,
  org_id             uuid references organizations on delete set null,
  manager_id         uuid references profiles on delete set null,
  role               text not null default 'employee'
                     check (role in ('superadmin', 'employee', 'manager', 'executive', 'admin', 'hr')),
  full_name          text,
  title              text,
  avatar_url         text,
  theme_color        text default '#0f6e5c',
  hire_date          date,
  public_slug        text unique,
  passport_published boolean not null default false,
  -- Account lifecycle (employed → departed → personal tier)
  account_status     text not null default 'invited'
                     check (account_status in (
                       'active_sso', 'former_trial', 'former_free', 'former_paid', 'invited'
                     )),
  provisioned_via    text not null default 'invite'
                     check (provisioned_via in ('sso', 'scim', 'invite', 'csv', 'self')),
  employment_ended_at timestamptz,
  trial_ends_at      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column profiles.account_status is
  'active_sso = employed via company IdP; invited = pending/onboarded via email invite; former_* = left company, personal account.';
comment on column profiles.provisioned_via is
  'How this profile entered the system: sso/scim (IdP source of truth) or invite/self (fallback paths).';
comment on column profiles.employment_ended_at is
  'When the person left the employer. Triggers record freeze; org_id/manager_id cleared in departure flow.';
comment on column profiles.trial_ends_at is
  'End of former_trial personal passport window. After this, account_status moves to former_free unless paid.';
comment on column profiles.manager_id is
  'Reporting line — set only by admin/HR (or approved org_membership_request). Managers cannot self-assign reports.';
comment on column profiles.role is
  'superadmin = platform operator (above company admin). Company roles: admin, executive, manager, employee, hr.';
comment on column profiles.avatar_url is
  'Profile photo URL (mock: data URL or external link until Supabase Storage is wired).';
comment on column profiles.theme_color is
  'Personal accent color hex — applied in app shell for this user only.';
comment on column profiles.hire_date is
  'Employment start date — set by HR/IdP; read-only for the employee in Settings.';

-- If profiles already exists without org columns, run after organizations:
-- alter table profiles add column if not exists org_id uuid references organizations on delete set null;
-- alter table profiles add column if not exists manager_id uuid references profiles on delete set null;

-- ══════════════════════════════════════════════════════════════
-- PROVISIONING & ORG CHART
-- SSO/SCIM = default path; invitations = fallback. Managers propose
-- reporting changes; admin/HR approves (never self-assign reports).
-- ══════════════════════════════════════════════════════════════

-- Manual email invite when org has no IdP (exception, not default).
create table if not exists invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations on delete cascade,
  email        text not null,
  role         text not null default 'employee'
               check (role in ('employee', 'manager', 'executive', 'hr')),
  token        text not null unique default encode(gen_random_bytes(24), 'hex'),
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'expired', 'revoked')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);

comment on table invitations is
  'Fallback provisioning path. IdP (SSO/SCIM) creates profiles automatically; invites are for orgs without an IdP.';
comment on column invitations.token is
  'Single-use accept token sent in invite link. Matched on signup/login to attach profile to org.';
comment on column invitations.status is
  'pending → accepted on first login with matching email; expired/revoked by admin or TTL.';

create unique index if not exists idx_invitations_pending_email
  on invitations (org_id, lower(email)) where status = 'pending';

-- Manager proposes org-chart / reporting change; admin or HR approves before manager_id changes.
create table if not exists org_membership_requests (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations on delete cascade,
  requested_by         uuid not null references profiles on delete cascade,
  subject_profile_id   uuid not null references profiles on delete cascade,
  proposed_manager_id  uuid not null references profiles on delete cascade,
  status               text not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected')),
  created_at           timestamptz not null default now()
);

comment on table org_membership_requests is
  'Managers propose reporting-line changes. Only admin/HR applies manager_id after approval — protects RLS.';
comment on column org_membership_requests.requested_by is
  'Usually the proposing manager (or HR). Cannot directly mutate subject_profile.manager_id.';
comment on column org_membership_requests.subject_profile_id is
  'The employee whose reporting line would change.';
comment on column org_membership_requests.proposed_manager_id is
  'Suggested manager_id if this request is approved.';

create unique index if not exists idx_org_membership_pending_subject
  on org_membership_requests (subject_profile_id) where status = 'pending';

create index if not exists idx_invitations_org on invitations (org_id);
create index if not exists idx_org_membership_org on org_membership_requests (org_id, status);

create table if not exists user_settings (
  profile_id           uuid primary key references profiles on delete cascade,
  show_outlook         boolean not null default true,
  ai_summaries         boolean not null default true,
  passport_published   boolean not null default false,
  kudos_notifications  boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists feedback_cycles (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references profiles on delete cascade,
  employee_responses  jsonb not null default '{}',
  manager_responses   jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists verified_facts (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references profiles on delete cascade,
  kind               text not null,
  label              text not null,
  attested_at        timestamptz,
  verification_level smallint not null default 1
                     check (verification_level between 1 and 5),
  frozen_at          timestamptz,
  created_at         timestamptz not null default now()
);

comment on column verified_facts.frozen_at is
  'Set on employment end — row becomes immutable (no update/delete). We freeze, never silently delete attested facts.';

create table if not exists verification_requests (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid not null references profiles on delete cascade,
  past_employer_email  text not null,
  item_type            text not null default 'role'
                       check (item_type in ('role', 'achievement')),
  item_label           text not null,
  item_ref_id          uuid,
  status               text not null default 'pending',
  created_at           timestamptz not null default now()
);

comment on column verification_requests.item_type is
  'Whether this attestation targets a past role/title or a specific achievement.';
comment on column verification_requests.item_label is
  'Human-readable label sent to the past employer (e.g. job title or achievement text).';
comment on column verification_requests.item_ref_id is
  'Optional FK to verified_facts or achievements row being attested.';

-- Token-based mini public profile (verified achievements only — not the full passport).
create table if not exists shareable_links (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles on delete cascade,
  token       text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at  timestamptz not null default now(),
  revoked     boolean not null default false
);

comment on table shareable_links is
  'Shareable view-only links for employees/managers — name, role, verified achievements only. Revocable.';
create index if not exists idx_shareable_links_profile on shareable_links (profile_id);
create index if not exists idx_shareable_links_token on shareable_links (token) where revoked = false;

-- Profile removal: non-admins request; company admin approves (deletes) or rejects.
create table if not exists removal_requests (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations on delete cascade,
  subject_profile_id  uuid not null references profiles on delete cascade,
  requested_by        uuid not null references profiles on delete cascade,
  reason              text,
  status              text not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected')),
  created_at          timestamptz not null default now()
);

comment on table removal_requests is
  'Current employees request removal; only company admin can delete profiles. Former self-delete is separate.';
create index if not exists idx_removal_requests_org on removal_requests (org_id, status);

-- If verified_facts already exists without verification_level, run:
-- alter table verified_facts add column if not exists verification_level smallint not null default 1
--   check (verification_level between 1 and 5);

-- Department tree within an org; head_profile_id is the department lead.
create table if not exists departments (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations on delete cascade,
  name             text not null,
  head_profile_id  uuid references profiles on delete set null,
  created_at       timestamptz not null default now(),
  unique (org_id, name)
);

-- ══════════════════════════════════════════════════════════════
-- VERIFIED RECORDS — human-attested workforce data
-- (separate from AI inference tables below)
-- ══════════════════════════════════════════════════════════════

-- Verified Achievement Vault: accomplishments employees submit and managers attest.
create table if not exists achievements (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references profiles on delete cascade,
  org_id             uuid references organizations on delete cascade,
  kind               text not null,
  description        text not null,
  evidence_url       text,
  achievement_date   date,
  verification_level smallint not null default 1
                     check (verification_level between 1 and 5),
  contribution_type  text not null default 'individual'
                     check (contribution_type in ('individual', 'team')),
  submitted_by       uuid references profiles on delete set null,
  pending_executive  boolean not null default false,
  frozen_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column achievements.frozen_at is
  'Set on employment end — immutable attestation from employment period.';
comment on column achievements.contribution_type is
  'Individual vs team contribution — labeled in UI for exec/manager views.';
comment on column achievements.pending_executive is
  'Manager-submitted achievements await executive approval before reaching verified level.';

-- Employee KPIs tracked over a cycle; managers approve or send back for clarification.
create table if not exists kpis (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references profiles on delete cascade,
  title              text not null,
  target             numeric not null,
  progress           numeric not null default 0,
  status             text not null default 'pending'
                     check (status in ('pending', 'approved', 'rejected', 'clarify')),
  verification_level smallint not null default 1
                     check (verification_level between 1 and 5),
  frozen_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Project outcomes with measurable business impact; can be promoted to passport facts.
create table if not exists projects (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references profiles on delete cascade,
  description        text not null,
  outcome            text,
  business_impact    text,
  revenue_impact     numeric,
  cost_savings       numeric,
  verification_level smallint not null default 1
                     check (verification_level between 1 and 5),
  frozen_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column projects.frozen_at is
  'Set on employment end — immutable attestation from employment period.';

comment on column kpis.frozen_at is
  'Set on employment end — immutable attestation from employment period.';

-- Operational improvements an employee drove (efficiency, savings, reach).
create table if not exists process_improvements (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles on delete cascade,
  type            text not null,
  hours_saved     numeric,
  dollars_saved   numeric,
  teams_impacted  integer,
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected', 'clarify')),
  frozen_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column process_improvements.frozen_at is
  'Set on employment end — immutable attestation from employment period.';

-- Quarterly employee pulse: six sentiment dimensions, one row per person per quarter.
create table if not exists pulse_surveys (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references profiles on delete cascade,
  survey_year      smallint not null,
  survey_quarter   smallint not null check (survey_quarter between 1 and 4),
  workload         smallint check (workload between 1 and 5),
  collaboration    smallint check (collaboration between 1 and 5),
  manager_support  smallint check (manager_support between 1 and 5),
  growth           smallint check (growth between 1 and 5),
  balance          smallint check (balance between 1 and 5),
  satisfaction     smallint check (satisfaction between 1 and 5),
  created_at       timestamptz not null default now(),
  unique (employee_id, survey_year, survey_quarter)
);

-- ══════════════════════════════════════════════════════════════
-- AI INFERENCE & SUPPORTING METRICS — internal only
-- Never mixed with verified_facts / achievements. UI must label
-- these as recommendations or advisory guidance, not decisions.
-- ══════════════════════════════════════════════════════════════

-- AI-generated raise/bonus suggestions for comp review cycles.
create table if not exists compensation_recommendations (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references profiles on delete cascade,
  type           text not null check (type in ('raise', 'bonus')),
  suggested_min  numeric not null,
  suggested_max  numeric not null,
  reasoning      text not null,
  confidence     numeric not null check (confidence >= 0 and confidence <= 1),
  status         text not null default 'pending'
                 check (status in ('pending', 'approved')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table compensation_recommendations is
  'AI INFERENCE — internal only. Suggested comp ranges; humans approve or ignore.';

-- AI assessment of promotion timing based on verified evidence signals.
create table if not exists promotion_readiness (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles on delete cascade,
  category    text not null
              check (category in ('ready_now', '6mo', '12mo', 'dev_needed')),
  evidence    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table promotion_readiness is
  'AI INFERENCE — internal only. Promotion timing guidance, not a decision.';

-- Composite 0–1000 value score derived from verified inputs; supporting metric only.
create table if not exists employee_value_scores (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles on delete cascade,
  score       smallint not null check (score between 0 and 1000),
  inputs      jsonb not null default '{}',
  computed_at timestamptz not null default now()
);

comment on table employee_value_scores is
  'SUPPORTING METRIC — internal only. Derived score from inputs; not a verified fact.';

-- ══════════════════════════════════════════════════════════════
-- AUDIT TRAIL — append-only log for every meaningful action
-- ══════════════════════════════════════════════════════════════

create table if not exists audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references profiles on delete set null,
  action       text not null,
  target_table text not null,
  target_id    uuid,
  changes      jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

comment on table audit_log is
  'Append-only. App writes a row on verify, approve, reject, edit, publish, etc.';

-- ── freeze verified rows on departure (immutable-friendly; never delete) ──
create or replace function guard_frozen_verified_record()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.frozen_at is not null then
      raise exception 'Verified record is frozen — cannot delete employment-era attestation';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.frozen_at is not null then
    raise exception 'Verified record is frozen — cannot modify employment-era attestation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verified_facts_frozen on verified_facts;
create trigger trg_verified_facts_frozen
  before update or delete on verified_facts for each row execute function guard_frozen_verified_record();
drop trigger if exists trg_achievements_frozen on achievements;
create trigger trg_achievements_frozen
  before update or delete on achievements for each row execute function guard_frozen_verified_record();
drop trigger if exists trg_kpis_frozen on kpis;
create trigger trg_kpis_frozen
  before update or delete on kpis for each row execute function guard_frozen_verified_record();
drop trigger if exists trg_projects_frozen on projects;
create trigger trg_projects_frozen
  before update or delete on projects for each row execute function guard_frozen_verified_record();
drop trigger if exists trg_process_improvements_frozen on process_improvements;
create trigger trg_process_improvements_frozen
  before update or delete on process_improvements for each row execute function guard_frozen_verified_record();

-- ── indexes (foreign keys + common filters) ───────────────────
create index if not exists idx_profiles_org on profiles (org_id);
create index if not exists idx_profiles_manager on profiles (manager_id);
create index if not exists idx_departments_org on departments (org_id);
create index if not exists idx_achievements_profile on achievements (profile_id);
create index if not exists idx_kpis_employee on kpis (employee_id);
create index if not exists idx_kpis_status on kpis (status);
create index if not exists idx_projects_profile on projects (profile_id);
create index if not exists idx_process_improvements_profile on process_improvements (profile_id);
create index if not exists idx_pulse_surveys_employee on pulse_surveys (employee_id);
create index if not exists idx_comp_recommendations_employee on compensation_recommendations (employee_id);
create index if not exists idx_promotion_readiness_employee on promotion_readiness (employee_id);
create index if not exists idx_value_scores_employee on employee_value_scores (employee_id);
create index if not exists idx_audit_log_target on audit_log (target_table, target_id);
create index if not exists idx_audit_log_actor on audit_log (actor_id);
create index if not exists idx_verified_facts_profile on verified_facts (profile_id);
create index if not exists idx_feedback_cycles_profile on feedback_cycles (profile_id);
create index if not exists idx_profiles_account_status on profiles (account_status);
create index if not exists idx_profiles_trial_ends on profiles (trial_ends_at) where trial_ends_at is not null;

-- ── row level security (enable; policies in rls-policies.sql) ─
alter table invitations enable row level security;
alter table org_membership_requests enable row level security;
alter table tenant_integrations enable row level security;
alter table data_import_batches enable row level security;
alter table profiles enable row level security;
alter table user_settings enable row level security;
alter table feedback_cycles enable row level security;
alter table verified_facts enable row level security;
alter table verification_requests enable row level security;
alter table shareable_links enable row level security;
alter table removal_requests enable row level security;
alter table billing_events enable row level security;
alter table organizations enable row level security;
alter table departments enable row level security;
alter table achievements enable row level security;
alter table kpis enable row level security;
alter table projects enable row level security;
alter table process_improvements enable row level security;
alter table pulse_surveys enable row level security;
alter table compensation_recommendations enable row level security;
alter table promotion_readiness enable row level security;
alter table employee_value_scores enable row level security;
alter table audit_log enable row level security;
