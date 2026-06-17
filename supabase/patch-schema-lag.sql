-- Patch: bring the deployed DB in line with schema.sql for columns the manager
-- dashboard READS. Without these, the corresponding fetches 400 and the panels
-- render empty regardless of seeded data. All statements are idempotent.
--
-- Run once in the Supabase SQL Editor (or psql), then re-run:
--   npm run seed:maya-queue
--   npm run seed:team-reports
--
-- Confirmed gaps (found via the seed/probe scripts against the live project):

-- 1. Performance Review Center — fetchReviewRows selects feedback_cycles.updated_at
alter table feedback_cycles add column if not exists updated_at timestamptz not null default now();

-- 2. Employee Verification Center (KPI items) — fetchVerifyQueue selects kpis.progress + verification_level
alter table kpis add column if not exists progress numeric not null default 0;
alter table kpis add column if not exists verification_level smallint not null default 1;
alter table kpis add column if not exists employee_id uuid references profiles on delete cascade;
update kpis set employee_id = profile_id where employee_id is null and profile_id is not null;

-- 3. Manager-submitted achievements — ManagerAchievementPanel writes contribution_type / pending_executive
alter table achievements add column if not exists contribution_type text not null default 'individual';
alter table achievements add column if not exists pending_executive boolean not null default false;
