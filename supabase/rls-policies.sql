-- Workforce Verify — Row Level Security policies
-- RUN THIS *AFTER* schema.sql, in Supabase → SQL Editor.
--
-- PREREQUISITE: profiles must have org_id and manager_id. If you haven't added them:
--   alter table profiles add column if not exists org_id uuid references organizations on delete set null;
--   alter table profiles add column if not exists manager_id uuid references profiles on delete set null;
--
-- Mental model: a policy GRANTS access. With RLS on and no policy, everything is denied.
-- We layer policies: the user's own rows, then manager-of, then exec/admin-in-org.

-- ── replace prior policies / helpers (safe to re-run) ─────────
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles', 'user_settings', 'verified_facts', 'achievements', 'kpis',
        'projects', 'process_improvements', 'feedback_cycles', 'verification_requests',
        'pulse_surveys', 'compensation_recommendations', 'promotion_readiness',
        'employee_value_scores', 'audit_log', 'organizations', 'departments'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

drop function if exists public.my_role();
drop function if exists public.my_org_id();
drop function if exists public.is_exec_or_admin();
drop function if exists public.can_access_profile(uuid);
drop function if exists public.same_org(uuid);

alter table kpis add column if not exists employee_id uuid references profiles on delete cascade;
update kpis set employee_id = profile_id where employee_id is null and profile_id is not null;

-- ══════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS  (so policies stay short and consistent)
-- ══════════════════════════════════════════════════════════════

create or replace function current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function current_org()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid()
$$;

create or replace function is_manager_of(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = target and manager_id = auth.uid()
  )
$$;

create or replace function is_org_leader_of(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles me, profiles them
    where me.id = auth.uid()
      and them.id = target
      and me.org_id = them.org_id
      and me.role in ('executive', 'admin')
  )
$$;

-- ══════════════════════════════════════════════════════════════
-- PROFILES
-- ══════════════════════════════════════════════════════════════

create policy "profiles: insert own"
  on profiles for insert with check (id = auth.uid());

create policy "profiles: read own"
  on profiles for select using (id = auth.uid());

create policy "profiles: update own"
  on profiles for update using (id = auth.uid());

create policy "profiles: manager reads reports"
  on profiles for select using (manager_id = auth.uid());

create policy "profiles: leaders read org"
  on profiles for select using (
    org_id = current_org() and current_role_name() in ('executive', 'admin')
  );

-- ══════════════════════════════════════════════════════════════
-- USER SETTINGS  (strictly private to the owner)
-- ══════════════════════════════════════════════════════════════

create policy "settings: owner only"
  on user_settings for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- VERIFIED RECORDS
-- Owner: full access to own. Manager: read reports'. Leaders: read org.
-- (Writes/verification by managers are handled in the app + audit_log;
--  keeping write to owner here, managers verify via their own approve flow.)
-- ══════════════════════════════════════════════════════════════

create policy "facts: owner all" on verified_facts for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "facts: manager read" on verified_facts for select
  using (is_manager_of(profile_id));
create policy "facts: leader read" on verified_facts for select
  using (is_org_leader_of(profile_id));

create policy "ach: owner all" on achievements for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "ach: manager read" on achievements for select
  using (is_manager_of(profile_id));
create policy "ach: manager verify" on achievements for update
  using (is_manager_of(profile_id));
create policy "ach: leader read" on achievements for select
  using (is_org_leader_of(profile_id));

create policy "kpi: owner all" on kpis for all
  using (employee_id = auth.uid()) with check (employee_id = auth.uid());
create policy "kpi: manager read" on kpis for select
  using (is_manager_of(employee_id));
create policy "kpi: manager verify" on kpis for update
  using (is_manager_of(employee_id));
create policy "kpi: leader read" on kpis for select
  using (is_org_leader_of(employee_id));

create policy "proj: owner all" on projects for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "proj: manager read" on projects for select
  using (is_manager_of(profile_id));
create policy "proj: manager verify" on projects for update
  using (is_manager_of(profile_id));
create policy "proj: leader read" on projects for select
  using (is_org_leader_of(profile_id));

create policy "pi: owner all" on process_improvements for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "pi: manager read" on process_improvements for select
  using (is_manager_of(profile_id));
create policy "pi: manager verify" on process_improvements for update
  using (is_manager_of(profile_id));
create policy "pi: leader read" on process_improvements for select
  using (is_org_leader_of(profile_id));

create policy "fc: owner all" on feedback_cycles for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "fc: manager read" on feedback_cycles for select
  using (is_manager_of(profile_id));

create policy "vr: owner all" on verification_requests for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- PULSE SURVEYS  — SENSITIVE
-- The employee owns their responses. Managers should NOT read raw
-- individual responses (that defeats honest feedback). Only aggregate
-- views (built later as a server-side function) expose trends to leaders.
-- So: owner full access; NO direct manager/leader read of raw rows.
-- ══════════════════════════════════════════════════════════════

create policy "pulse: owner only" on pulse_surveys for all
  using (employee_id = auth.uid()) with check (employee_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- AI INFERENCE / SUPPORTING — internal, leadership-facing
-- Employee can READ their own (right to see + dispute inferences about them)
-- and toggle disputed/hidden, but cannot fabricate them: inserts/compute
-- happen server-side. Managers/leaders read for their people.
-- These never appear on the public resume regardless of policy.
-- ══════════════════════════════════════════════════════════════

create policy "comp: subject read" on compensation_recommendations for select
  using (employee_id = auth.uid());
create policy "comp: leader read" on compensation_recommendations for select
  using (is_org_leader_of(employee_id));
create policy "comp: leader update" on compensation_recommendations for update
  using (is_org_leader_of(employee_id));

create policy "promo: subject read" on promotion_readiness for select
  using (employee_id = auth.uid());
create policy "promo: manager read" on promotion_readiness for select
  using (is_manager_of(employee_id));
create policy "promo: leader read" on promotion_readiness for select
  using (is_org_leader_of(employee_id));

create policy "evs: subject read" on employee_value_scores for select
  using (employee_id = auth.uid());
create policy "evs: manager read" on employee_value_scores for select
  using (is_manager_of(employee_id));
create policy "evs: leader read" on employee_value_scores for select
  using (is_org_leader_of(employee_id));

-- ══════════════════════════════════════════════════════════════
-- AUDIT LOG  — append-only; readable by admins
-- Any authenticated user can INSERT (the app logs their actions),
-- but no one updates or deletes. Admins read.
-- ══════════════════════════════════════════════════════════════

create policy "audit: anyone insert" on audit_log for insert
  with check (auth.uid() is not null);
create policy "audit: admin read" on audit_log for select
  using (current_role_name() = 'admin');

-- ══════════════════════════════════════════════════════════════
-- ORG / DEPARTMENTS  — readable within org; managed by admins
-- ══════════════════════════════════════════════════════════════

create policy "org: members read" on organizations for select
  using (id = current_org());
create policy "org: admin manage" on organizations for all
  using (id = current_org() and current_role_name() = 'admin');

create policy "dept: members read" on departments for select
  using (org_id = current_org());
create policy "dept: admin manage" on departments for all
  using (org_id = current_org() and current_role_name() = 'admin');

-- ── NOTES ─────────────────────────────────────────────────────
-- 1. INSERT on inference tables is intentionally NOT granted to clients.
--    Generate those rows from a server-side route (service role key) so an
--    employee can't invent their own value score or comp recommendation.
-- 2. Pulse survey raw rows are owner-only on purpose. Build a SQL function
--    (security definer) that returns ONLY department aggregates to leaders.
-- 3. "with check" guards writes; "using" guards reads/which-rows. Keep both
--    on owner policies so users can't write rows pointing at someone else.
