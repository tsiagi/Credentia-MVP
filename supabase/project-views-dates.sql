-- ════════════════════════════════════════════════════════════════
-- Core-Roborate — Project board fix + dates
-- Additive. Run AFTER task-knowledge-agent.sql.
--
-- 1) FIX: the "wp: member read" (work_projects → verified_tasks) and
--    "vt: project owner read" (verified_tasks → work_projects) policies
--    referenced each other, causing
--      ERROR 42P17: infinite recursion detected in policy
--    on every task query. We move each cross-table lookup into a
--    SECURITY DEFINER helper (which bypasses RLS, like is_manager_of),
--    breaking the cycle.
-- 2) Adds project scheduling columns for the timeline/calendar views.
-- ════════════════════════════════════════════════════════════════

-- Project scheduling
alter table work_projects add column if not exists start_date  date;
alter table work_projects add column if not exists target_date date;

-- Recursion-safe membership / ownership checks
create or replace function is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from verified_tasks t
    where t.project_id = p_project and t.assignee_id = auth.uid()
  )
$$;

create or replace function is_project_owner_or_lead(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from work_projects p
    where p.id = p_project and (p.owner_id = auth.uid() or p.team_lead_id = auth.uid())
  )
$$;

drop policy if exists "wp: member read" on work_projects;
create policy "wp: member read" on work_projects for select
  using (is_project_member(id));

drop policy if exists "vt: project owner read" on verified_tasks;
create policy "vt: project owner read" on verified_tasks for select
  using (is_project_owner_or_lead(project_id));
