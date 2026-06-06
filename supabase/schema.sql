-- Workforce Verify (Credentia) — Supabase schema
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
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ══════════════════════════════════════════════════════════════
-- EXISTING TABLES (verification_level added to verified_facts)
-- profiles.org_id + profiles.manager_id power RLS in rls-policies.sql
-- ══════════════════════════════════════════════════════════════

create table if not exists profiles (
  id                 uuid primary key references auth.users on delete cascade,
  org_id             uuid references organizations on delete set null,
  manager_id         uuid references profiles on delete set null,
  role               text not null default 'employee'
                     check (role in ('employee', 'manager', 'executive', 'admin')),
  full_name          text,
  title              text,
  public_slug        text unique,
  passport_published boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- If profiles already exists without org columns, run after organizations:
-- alter table profiles add column if not exists org_id uuid references organizations on delete set null;
-- alter table profiles add column if not exists manager_id uuid references profiles on delete set null;

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
  created_at         timestamptz not null default now()
);

create table if not exists verification_requests (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid not null references profiles on delete cascade,
  past_employer_email  text not null,
  status               text not null default 'pending',
  created_at           timestamptz not null default now()
);

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
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

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
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

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
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

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

-- ── row level security (enable; policies in rls-policies.sql) ─
alter table profiles enable row level security;
alter table user_settings enable row level security;
alter table feedback_cycles enable row level security;
alter table verified_facts enable row level security;
alter table verification_requests enable row level security;
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
