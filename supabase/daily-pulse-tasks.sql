-- ════════════════════════════════════════════════════════════════
-- Core-Roborate — Daily Pulse, Smart Task Delegation, and AI Reports
-- Additive migration. Run AFTER schema.sql + rls-policies.sql.
--
-- Design decisions (confirmed):
--   • Tasks BRIDGE to the verified layer — completing a delegated task can be
--     promoted to an L2 Manager-Verified achievement. The verified trust model,
--     5 levels, audit_log, passport, and VerificationDeck are untouched.
--   • Daily pulse is PRIVACY-PRESERVING — raw individual rows stay owner-only;
--     managers/leaders see only the k-anonymised team_pulse_trend() aggregate
--     plus advisory ai_retention_flags. Mirrors the pulse_surveys stance.
--
-- Three data layers stay separate (the product's core principle):
--   operational (tasks, daily_pulse) · verified (achievements…) · AI inference.
-- ════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- MODULE 1 — DAILY PULSE (operational sentiment, one row per day)
-- ──────────────────────────────────────────────────────────────
create table if not exists daily_pulse (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references profiles on delete cascade,
  org_id             uuid references organizations on delete cascade,
  pulse_date         date not null default current_date,
  -- check-in (start of day): "How are you feeling today?"
  checkin_mood       smallint check (checkin_mood between 1 and 5),
  checkin_note       text,
  checkin_at         timestamptz,
  -- check-out (end of day): "How was your workday?"
  checkout_sentiment smallint check (checkout_sentiment between 1 and 5),
  checkout_note      text,
  checkout_at        timestamptz,
  created_at         timestamptz not null default now(),
  unique (employee_id, pulse_date)
);
create index if not exists idx_daily_pulse_emp_date on daily_pulse (employee_id, pulse_date desc);

comment on table daily_pulse is
  'Operational sentiment — daily check-in mood + check-out sentiment. Raw rows are owner-only; leaders see aggregates via team_pulse_trend().';

-- ──────────────────────────────────────────────────────────────
-- MODULE 2 — STRATEGIC PILLARS (admin-configurable categories)
-- ──────────────────────────────────────────────────────────────
create table if not exists strategic_pillars (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations on delete cascade,
  name        text not null,
  sort_order  smallint not null default 0,
  is_default  boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, name)
);
create index if not exists idx_strategic_pillars_org on strategic_pillars (org_id, sort_order);

-- ──────────────────────────────────────────────────────────────
-- MODULE 2 — TASKS (manager-delegated + employee self-reported)
-- ──────────────────────────────────────────────────────────────
create table if not exists tasks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references organizations on delete cascade,
  employee_id    uuid not null references profiles on delete cascade,   -- assignee / owner
  assigned_by    uuid references profiles on delete set null,           -- null = self-reported
  pillar_id      uuid not null references strategic_pillars on delete restrict,
  title          text not null,
  detail         text,
  source         text not null default 'delegated'
                 check (source in ('delegated', 'self_reported')),
  task_date      date not null default current_date,
  status         text not null default 'assigned'
                 check (status in ('assigned', 'complete', 'partial', 'incomplete')),
  blocker_note   text,
  completed_at   timestamptz,
  -- BRIDGE to the verified layer: set when a manager promotes a completed task.
  achievement_id uuid references achievements on delete set null,
  frozen_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Conditional logic enforced at the DB, not only the UI:
  constraint blocker_required_when_not_done
    check (status not in ('partial', 'incomplete')
           or (blocker_note is not null and length(trim(blocker_note)) > 0))
);
create index if not exists idx_tasks_employee_date on tasks (employee_id, task_date desc);
create index if not exists idx_tasks_assigned_by   on tasks (assigned_by);
create index if not exists idx_tasks_pillar        on tasks (pillar_id);

-- ──────────────────────────────────────────────────────────────
-- MODULE 3 — AI INFERENCE: leadership reports + retention flags
-- (server-side writes only — no client INSERT policy, like the other
--  inference tables. UI labels these advisory.)
-- ──────────────────────────────────────────────────────────────
create table if not exists ai_inference_reports (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations on delete cascade,
  scope        text not null check (scope in ('team', 'department', 'org')),
  subject_id   uuid references profiles on delete set null,   -- manager/dept lead; null = org
  period_type  text not null check (period_type in ('weekly', 'monthly')),
  period_start date not null,
  period_end   date not null,
  report       jsonb not null default '{}',
  confidence   numeric check (confidence between 0 and 1),
  model        text,
  generated_by uuid references profiles on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_ai_reports_org_period on ai_inference_reports (org_id, period_end desc);

comment on table ai_inference_reports is
  'AI INFERENCE — internal, advisory. Narrative synthesis over operational+verified data. Never a verified fact.';

create table if not exists ai_retention_flags (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles on delete cascade,
  org_id      uuid references organizations on delete cascade,
  severity    text not null check (severity in ('watch', 'elevated', 'high')),
  signal      text not null,
  evidence    jsonb not null default '{}',
  confidence  numeric check (confidence between 0 and 1),
  created_at  timestamptz not null default now()
);
create index if not exists idx_retention_flags_emp on ai_retention_flags (employee_id, created_at desc);

comment on table ai_retention_flags is
  'AI INFERENCE — internal, advisory. Per-employee retention risk; subject can read & dispute. Never a decision.';

-- ──────────────────────────────────────────────────────────────
-- Freeze new operational rows on employment end (reuse existing guard)
-- ──────────────────────────────────────────────────────────────
drop trigger if exists trg_tasks_frozen on tasks;
create trigger trg_tasks_frozen
  before update or delete on tasks for each row execute function guard_frozen_verified_record();

-- ──────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────
alter table daily_pulse          enable row level security;
alter table strategic_pillars    enable row level security;
alter table tasks                enable row level security;
alter table ai_inference_reports enable row level security;
alter table ai_retention_flags   enable row level security;

-- DAILY PULSE — owner-only raw rows (privacy-preserving). No manager/leader
-- raw read by design; leaders use team_pulse_trend() below.
drop policy if exists "dpulse: owner all" on daily_pulse;
create policy "dpulse: owner all" on daily_pulse for all
  using (employee_id = auth.uid()) with check (employee_id = auth.uid());

-- STRATEGIC PILLARS — members read, admin manages (mirrors departments)
drop policy if exists "pillars: members read" on strategic_pillars;
create policy "pillars: members read" on strategic_pillars for select
  using (org_id = current_org() and is_company_user());
drop policy if exists "pillars: admin manage" on strategic_pillars;
create policy "pillars: admin manage" on strategic_pillars for all
  using (org_id = current_org() and is_org_admin())
  with check (org_id = current_org() and is_org_admin());

-- TASKS — employee owns own; manager delegates/updates reports'; leaders read
drop policy if exists "tasks: owner all" on tasks;
create policy "tasks: owner all" on tasks for all
  using (employee_id = auth.uid()) with check (employee_id = auth.uid());
drop policy if exists "tasks: manager read" on tasks;
create policy "tasks: manager read" on tasks for select
  using (is_manager_of(employee_id));
drop policy if exists "tasks: manager assign" on tasks;
create policy "tasks: manager assign" on tasks for insert
  with check (is_manager_of(employee_id) and assigned_by = auth.uid() and source = 'delegated');
drop policy if exists "tasks: manager update" on tasks;
create policy "tasks: manager update" on tasks for update
  using (is_manager_of(employee_id));
drop policy if exists "tasks: leader read" on tasks;
create policy "tasks: leader read" on tasks for select
  using (is_org_leader_of(employee_id));

-- BRIDGE — let a manager INSERT an L2 Manager-Verified achievement for a direct
-- report (promoting a completed task). Narrowly scoped: manager-of only,
-- submitted_by self, exactly L2, not pending_executive. The base RLS only
-- allowed owner inserts, so this is required for the bridge to run client-side.
drop policy if exists "ach: manager insert verified" on achievements;
create policy "ach: manager insert verified" on achievements for insert
  with check (
    is_manager_of(profile_id)
    and submitted_by = auth.uid()
    and verification_level = 2
    and pending_executive = false
  );

-- AI REPORTS — leadership read; INSERT server-side (service role) only
drop policy if exists "reports: leader read" on ai_inference_reports;
create policy "reports: leader read" on ai_inference_reports for select
  using (org_id = current_org() and current_role_name() in ('executive', 'admin', 'hr'));
drop policy if exists "reports: manager read own team" on ai_inference_reports;
create policy "reports: manager read own team" on ai_inference_reports for select
  using (scope = 'team' and subject_id = auth.uid());

-- RETENTION FLAGS — subject + manager/leader read; INSERT server-side only
drop policy if exists "retention: subject read" on ai_retention_flags;
create policy "retention: subject read" on ai_retention_flags for select
  using (employee_id = auth.uid());
drop policy if exists "retention: manager read" on ai_retention_flags;
create policy "retention: manager read" on ai_retention_flags for select
  using (is_manager_of(employee_id));
drop policy if exists "retention: leader read" on ai_retention_flags;
create policy "retention: leader read" on ai_retention_flags for select
  using (is_org_leader_of(employee_id));

-- ──────────────────────────────────────────────────────────────
-- Privacy-preserving aggregate for leaders (security definer).
-- Returns daily team averages, never individual rows, and only for days
-- with >= 3 responses (k-anonymity) among people the caller manages/leads.
-- ──────────────────────────────────────────────────────────────
create or replace function team_pulse_trend(p_days int default 14)
returns table (pulse_date date, avg_checkin numeric, avg_checkout numeric, responses int)
language sql stable security definer set search_path = public as $$
  select d.pulse_date,
         round(avg(d.checkin_mood), 2)       as avg_checkin,
         round(avg(d.checkout_sentiment), 2) as avg_checkout,
         count(*)::int                        as responses
  from daily_pulse d
  where d.pulse_date >= current_date - p_days
    and (is_manager_of(d.employee_id) or is_org_leader_of(d.employee_id))
  group by d.pulse_date
  having count(*) >= 3
  order by d.pulse_date;
$$;

-- ──────────────────────────────────────────────────────────────
-- Seed the 5 default Strategic Pillars for every existing org.
-- (Admins can add more; provisioning should run the same insert per new org.)
-- ──────────────────────────────────────────────────────────────
insert into strategic_pillars (org_id, name, sort_order, is_default)
select o.id, p.name, p.sort_order, true
from organizations o
cross join (values
  ('Revenue & Growth', 1),
  ('Customer Facing & Experience', 2),
  ('Operations & Process', 3),
  ('Innovation & Strategy', 4),
  ('Culture & Collaboration', 5)
) as p(name, sort_order)
on conflict (org_id, name) do nothing;
