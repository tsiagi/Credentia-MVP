-- ════════════════════════════════════════════════════════════════
-- Core-Roborate — Task → Verification bridge
-- Additive. Run AFTER task-knowledge-agent.sql.
--
-- Continues the existing 5-level verification flow from the new task engine:
-- a manager can promote a COMPLETED verified_task into an L2 (Manager-Verified)
-- achievement, which then flows through the existing achievement/oversight
-- chain. Mirrors the operational tasks→achievement bridge in lib/tasks.ts.
-- ════════════════════════════════════════════════════════════════

-- Link a verified_task to the achievement it was promoted into (prevents
-- double-promotion; lets the board show a "verified" state).
alter table verified_tasks
  add column if not exists achievement_id uuid references achievements on delete set null;

-- Allow a manager to INSERT an L2 Manager-Verified achievement for a DIRECT
-- REPORT (promoting a completed task). Narrowly scoped: manager-of the subject,
-- same org, exactly L2, not pending_executive. The base achievements RLS only
-- allows owner inserts, so this policy is required for the bridge.
-- NOTE: this environment's `achievements` table has no `submitted_by` column,
-- so (unlike daily-pulse-tasks.sql) the check does not reference it.
drop policy if exists "ach: manager insert from task" on achievements;
create policy "ach: manager insert from task" on achievements for insert
  with check (
    is_manager_of(profile_id)
    and org_id = current_org()
    and verification_level = 2
    and pending_executive = false
  );
