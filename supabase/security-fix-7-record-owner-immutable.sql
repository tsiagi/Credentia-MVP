-- ════════════════════════════════════════════════════════════════
-- Security fix #7 — record-ownership integrity on verified/inference rows
-- Run AFTER rls-policies.sql and security-fix-2-owner-verified-write.sql.
-- Idempotent.
--
-- PROBLEM (audit #7):
--   The manager-verify / leader-update policies on achievements / kpis /
--   projects / process_improvements / compensation_recommendations had a
--   USING clause but no WITH CHECK. Postgres falls back to USING for the new
--   row, BUT because permissive policies are OR'd, a manager could satisfy the
--   manager policy's USING on a REPORT's row while satisfying the *owner*
--   policy's WITH CHECK on the resulting row (profile_id = auth.uid()) — i.e.
--   reassign a direct report's record to themselves (record theft / data loss),
--   or shuffle a record between people. RLS policies cannot compare OLD vs NEW,
--   so a WITH CHECK alone cannot express "the owner column may not change".
--
-- FIX (two layers):
--   1. A BEFORE UPDATE trigger that makes the owner column (profile_id /
--      employee_id) IMMUTABLE for normal users (service role and superadmin
--      excepted). No legitimate flow reassigns ownership; creation sets it once.
--   2. Explicit WITH CHECK on the verify/update policies (defense-in-depth and
--      self-documenting — no longer relying on the implicit USING fallback).
-- ════════════════════════════════════════════════════════════════

-- ── 1. Owner-column immutability triggers ───────────────────────
create or replace function guard_profile_id_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;                 -- service role
  if current_role_name() = 'superadmin' then return new; end if; -- platform op
  if new.profile_id is distinct from old.profile_id then
    raise exception 'Cannot reassign record ownership (profile_id is immutable)';
  end if;
  return new;
end;
$$;

create or replace function guard_employee_id_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if current_role_name() = 'superadmin' then return new; end if;
  if new.employee_id is distinct from old.employee_id then
    raise exception 'Cannot reassign record ownership (employee_id is immutable)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_facts_owner_immutable on verified_facts;
create trigger trg_facts_owner_immutable before update on verified_facts
  for each row execute function guard_profile_id_immutable();

drop trigger if exists trg_ach_owner_immutable on achievements;
create trigger trg_ach_owner_immutable before update on achievements
  for each row execute function guard_profile_id_immutable();

drop trigger if exists trg_proj_owner_immutable on projects;
create trigger trg_proj_owner_immutable before update on projects
  for each row execute function guard_profile_id_immutable();

drop trigger if exists trg_pi_owner_immutable on process_improvements;
create trigger trg_pi_owner_immutable before update on process_improvements
  for each row execute function guard_profile_id_immutable();

drop trigger if exists trg_kpi_owner_immutable on kpis;
create trigger trg_kpi_owner_immutable before update on kpis
  for each row execute function guard_employee_id_immutable();

drop trigger if exists trg_comp_owner_immutable on compensation_recommendations;
create trigger trg_comp_owner_immutable before update on compensation_recommendations
  for each row execute function guard_employee_id_immutable();

-- ── 2. Explicit WITH CHECK on verify / leader-update policies ────
drop policy if exists "ach: manager verify" on achievements;
create policy "ach: manager verify" on achievements for update
  using (is_manager_of(profile_id)) with check (is_manager_of(profile_id));

drop policy if exists "kpi: manager verify" on kpis;
create policy "kpi: manager verify" on kpis for update
  using (is_manager_of(employee_id)) with check (is_manager_of(employee_id));

drop policy if exists "proj: manager verify" on projects;
create policy "proj: manager verify" on projects for update
  using (is_manager_of(profile_id)) with check (is_manager_of(profile_id));

drop policy if exists "pi: manager verify" on process_improvements;
create policy "pi: manager verify" on process_improvements for update
  using (is_manager_of(profile_id)) with check (is_manager_of(profile_id));

drop policy if exists "comp: leader update" on compensation_recommendations;
create policy "comp: leader update" on compensation_recommendations for update
  using (is_org_leader_of(employee_id)) with check (is_org_leader_of(employee_id));
