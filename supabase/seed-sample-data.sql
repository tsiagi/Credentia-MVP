-- Workforce Verify — sample data for dashboard testing
-- Run in Supabase → SQL Editor (postgres role bypasses RLS).
--
-- PREREQ: apply supabase/shareable-comprehensive.sql first (adds the
--         employment_roles table + role_id columns this seed populates).
--
-- BEFORE RUNNING
-- 1. Create 1–4 test users in Authentication (or sign up through the app).
-- 2. Edit the four emails below to match those accounts.
-- 3. Sign in once per account so a profiles row exists (or run ensureProfile upsert in app).
--
-- Roles after seed:
--   executive@test…  → executive (org-wide dashboard)
--   manager@test…    → manager (verification queue + team health)
--   employee1@test…  → employee, reports to manager
--   employee2@test…  → employee, reports to manager (optional)
--
-- Re-running this script clears prior demo rows for the demo org, then re-seeds.

-- ── CONFIG: change these emails ───────────────────────────────
do $$
declare
  v_exec_email    text := 'executive@demo.credentia.test';
  v_mgr_email     text := 'manager@demo.credentia.test';
  v_emp1_email    text := 'employee1@demo.credentia.test';
  v_emp2_email    text := 'employee2@demo.credentia.test';

  v_org_id        uuid := 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  v_exec_id       uuid;
  v_mgr_id        uuid;
  v_emp1_id       uuid;
  v_emp2_id       uuid;
  v_dept_fin      uuid := 'a1111111-1111-4111-8111-111111111111';
  v_dept_eng      uuid := 'a2222222-2222-4222-8222-222222222222';
  v_dept_ops      uuid := 'a3333333-3333-4333-8333-333333333333';
  v_dept_hr       uuid := 'a4444444-4444-4444-8444-444444444444';

  -- Verified role history (manager-at-the-time) for the shareable profile
  v_role_maya1    uuid;
  v_role_maya2    uuid;
  v_role_james    uuid;
begin
  -- Resolve auth users (must exist in auth.users)
  select id into v_exec_id from auth.users where email = v_exec_email;
  select id into v_mgr_id  from auth.users where email = v_mgr_email;
  select id into v_emp1_id from auth.users where email = v_emp1_email;
  select id into v_emp2_id from auth.users where email = v_emp2_email;

  if v_mgr_id is null then
    raise exception 'Manager account not found: %. Create it in Authentication first.', v_mgr_email;
  end if;

  -- Single-user fallback: use manager for exec + both employee slots
  if v_exec_id is null then
    v_exec_id := v_mgr_id;
    raise notice 'Executive email not found — using manager % as executive.', v_mgr_email;
  end if;
  if v_emp1_id is null then
    v_emp1_id := v_mgr_id;
    raise notice 'Employee1 email not found — using manager as employee1 (switch role in app to test employee view).';
  end if;
  if v_emp2_id is null then
    v_emp2_id := v_emp1_id;
  end if;

  -- Org
  insert into organizations (id, name)
  values (v_org_id, 'Demo Corp')
  on conflict (id) do update set name = excluded.name;

  -- Ensure profile rows exist
  insert into profiles (id, role, full_name, title)
  values
    (v_exec_id, 'executive', 'Alex Morgan', 'Chief People Officer'),
    (v_mgr_id,  'manager',   'Jordan Lee',  'Engineering Manager'),
    (v_emp1_id, 'employee',  'Maya Chen',   'Senior Analyst'),
    (v_emp2_id, 'employee',  'James Okafor', 'Equity Specialist')
  on conflict (id) do update set
    role       = excluded.role,
    full_name  = excluded.full_name,
    title      = excluded.title,
    org_id     = v_org_id,
    manager_id = case
      when profiles.id in (v_emp1_id, v_emp2_id) then v_mgr_id
      else profiles.manager_id
    end;

  update profiles set org_id = v_org_id, manager_id = null
    where id = v_exec_id;
  update profiles set org_id = v_org_id, manager_id = null
    where id = v_mgr_id;
  update profiles set org_id = v_org_id, manager_id = v_mgr_id
    where id in (v_emp1_id, v_emp2_id);

  -- Clear previous demo data for this org (child tables only)
  delete from audit_log
    where target_id in (
      select id from achievements where org_id = v_org_id
      union select id from kpis where employee_id in (select id from profiles where org_id = v_org_id)
      union select id from projects where profile_id in (select id from profiles where org_id = v_org_id)
      union select id from process_improvements where profile_id in (select id from profiles where org_id = v_org_id)
    );
  delete from pulse_surveys where employee_id in (select id from profiles where org_id = v_org_id);
  delete from employee_value_scores where employee_id in (select id from profiles where org_id = v_org_id);
  delete from compensation_recommendations where employee_id in (select id from profiles where org_id = v_org_id);
  delete from promotion_readiness where employee_id in (select id from profiles where org_id = v_org_id);
  delete from feedback_cycles where profile_id in (select id from profiles where org_id = v_org_id);
  delete from verified_facts where profile_id in (select id from profiles where org_id = v_org_id);
  delete from achievements where org_id = v_org_id;
  delete from kpis where employee_id in (select id from profiles where org_id = v_org_id);
  delete from projects where profile_id in (select id from profiles where org_id = v_org_id);
  delete from process_improvements where profile_id in (select id from profiles where org_id = v_org_id);
  delete from employment_roles where profile_id in (select id from profiles where org_id = v_org_id);
  delete from departments where org_id = v_org_id;

  insert into user_settings (profile_id)
  select id from profiles where org_id = v_org_id
  on conflict (profile_id) do nothing;

  -- Departments (executive dashboard cards)
  insert into departments (id, org_id, name, head_profile_id) values
    (v_dept_fin, v_org_id, 'Finance & Equity', v_emp2_id),
    (v_dept_eng, v_org_id, 'Engineering',      v_mgr_id),
    (v_dept_ops, v_org_id, 'Operations',       v_emp1_id),
    (v_dept_hr,  v_org_id, 'People & HR',      v_exec_id);

  -- ── VERIFIED RECORDS (employee + manager queue) ───────────────

  -- Maya: mix of L1 pending (verify queue) and L2 verified (timeline)
  insert into achievements (profile_id, org_id, kind, description, achievement_date, verification_level) values
    (v_emp1_id, v_org_id, 'kpi',           'Reconciliation accuracy 99.8%: Exceeded 98% target across Q1.', '2026-01-15', 1),
    (v_emp1_id, v_org_id, 'certification', 'Shareworks Master Cert: Completed advanced certification.',   '2025-11-01', 2),
    (v_emp1_id, v_org_id, 'award',         'Q1 Impact Award: Led cost-savings automation.',               '2026-03-01', 1);

  insert into kpis (employee_id, title, target, progress, status, verification_level) values
    (v_emp1_id, 'Close cycle time (days)', 5, 4.2, 'pending', 1),
    (v_emp1_id, 'Audit findings resolved', 10, 11, 'approved', 2);

  insert into projects (profile_id, description, outcome, business_impact, cost_savings, verification_level) values
    (v_emp1_id, 'Global equity migration: Led 12-country platform cutover.', 'On-time launch', 'Reduced manual reconciliations', 240000, 1);

  insert into process_improvements (profile_id, type, hours_saved, dollars_saved, teams_impacted, status) values
    (v_emp1_id, 'Workflow automation', 120, 85000, 4, 'pending');

  -- James: additional queue items
  insert into achievements (profile_id, org_id, kind, description, achievement_date, verification_level) values
    (v_emp2_id, v_org_id, 'promotion', 'Promotion to Sr. Analyst: Nominated for next level.', '2026-02-01', 1);

  insert into kpis (employee_id, title, target, progress, status, verification_level) values
    (v_emp2_id, 'Grant processing SLA %', 95, 97.5, 'clarify', 1);

  insert into verified_facts (profile_id, kind, label, attested_at, verification_level) values
    (v_emp1_id, 'employment', 'Senior Analyst — Demo Corp', '2024-06-01', 3),
    (v_emp2_id, 'employment', 'Equity Specialist — Demo Corp', '2023-03-15', 3);

  -- ── Verified role history (manager-at-the-time) for shareable profile ────
  insert into employment_roles
    (profile_id, org_id, title, manager_id, manager_name, start_date, end_date, verification_level, attested_at)
  values
    (v_emp1_id, v_org_id, 'Analyst — Demo Corp', v_exec_id, 'Alex Morgan',
     '2023-01-09', '2024-05-31', 3, '2023-01-09')
  returning id into v_role_maya1;

  insert into employment_roles
    (profile_id, org_id, title, manager_id, manager_name, start_date, end_date, verification_level, attested_at)
  values
    (v_emp1_id, v_org_id, 'Senior Analyst — Demo Corp', v_mgr_id, 'Jordan Lee',
     '2024-06-01', null, 3, '2024-06-01')
  returning id into v_role_maya2;

  insert into employment_roles
    (profile_id, org_id, title, manager_id, manager_name, start_date, end_date, verification_level, attested_at)
  values
    (v_emp2_id, v_org_id, 'Equity Specialist — Demo Corp', v_mgr_id, 'Jordan Lee',
     '2023-03-15', null, 3, '2023-03-15')
  returning id into v_role_james;

  -- Link achievements to the role held at the time (current role for each).
  update achievements set role_id = v_role_maya2 where org_id = v_org_id and profile_id = v_emp1_id;
  update achievements set role_id = v_role_james where org_id = v_org_id and profile_id = v_emp2_id;

  -- A verified (L2) project so the shareable profile shows project impact.
  insert into projects (profile_id, description, outcome, business_impact, cost_savings, verification_level, role_id) values
    (v_emp1_id, 'Equity platform automation: Streamlined multi-country reconciliations.',
     'Cut reconciliation effort by 60%.', 'Reduced close-cycle risk', 180000, 2, v_role_maya2);

  -- Feedback cycles (manager Performance Review Center)
  insert into feedback_cycles (profile_id, employee_responses, manager_responses) values
    (v_emp1_id, '{"strengths":"Cross-functional delivery","growth":"Executive presence"}'::jsonb, '{"strengths":"Reliable execution","growth":"Delegation"}'::jsonb),
    (v_emp2_id, '{"strengths":"Deep equity knowledge"}'::jsonb, '{}'::jsonb),
    (v_mgr_id,  '{}'::jsonb, '{}'::jsonb);

  -- ── PULSE + VALUE SCORES (team health + executive metrics) ────

  insert into pulse_surveys (employee_id, survey_year, survey_quarter, workload, collaboration, manager_support, growth, balance, satisfaction) values
    (v_emp1_id, 2025, 3, 3, 4, 4, 4, 3, 4),
    (v_emp1_id, 2025, 4, 3, 4, 5, 4, 3, 4),
    (v_emp1_id, 2026, 1, 2, 4, 4, 5, 3, 4),
    (v_emp2_id, 2025, 3, 4, 3, 3, 3, 2, 3),
    (v_emp2_id, 2025, 4, 3, 4, 4, 3, 3, 3),
    (v_emp2_id, 2026, 1, 2, 3, 3, 4, 2, 3),
    (v_mgr_id,  2026, 1, 4, 5, 5, 4, 4, 5);

  insert into employee_value_scores (employee_id, score, inputs) values
    (v_emp1_id, 840, '{"kpis":0.92,"reviews":0.88,"projects":0.90,"certs":0.85,"leadership":0.78,"innovation":0.82,"skills":0.86,"recognition":0.80}'::jsonb),
    (v_emp2_id, 760, '{"kpis":0.80,"reviews":0.75,"projects":0.72,"certs":0.88,"leadership":0.70,"innovation":0.68,"skills":0.82,"recognition":0.65}'::jsonb),
    (v_mgr_id,  880, '{"kpis":0.90,"reviews":0.92,"projects":0.85,"certs":0.80,"leadership":0.94,"innovation":0.78,"skills":0.88,"recognition":0.86}'::jsonb);

  -- ── AI INFERENCE (labeled in UI — not decisions) ──────────────

  insert into promotion_readiness (employee_id, category, evidence) values
    (v_emp1_id, 'ready_now',  '3 L2+ achievements, KPI attainment 112%, positive pulse trend over 2 quarters.'),
    (v_emp2_id, '6mo',        'Strong domain expertise; workload sentiment low — address balance before promotion.'),
    (v_emp2_id, 'dev_needed', 'Feedback alignment gap on communication; manager rating below self-rating.');

  insert into compensation_recommendations (employee_id, type, suggested_min, suggested_max, reasoning, confidence, status) values
    (v_emp1_id, 'raise', 8000, 12000, 'Above-target KPI performance and verified project impact.', 0.82, 'pending'),
    (v_emp1_id, 'bonus', 3000, 5000,  'Q1 impact award nomination.', 0.75, 'pending'),
    (v_emp2_id, 'raise', 5000, 8000,  'Market comp gap vs role benchmark.', 0.71, 'pending'),
    (v_emp2_id, 'bonus', 1500, 2500,  'Solid delivery; equity SLA exceedance.', 0.65, 'pending'),
    (v_mgr_id,  'bonus', 4000, 6000,  'Team productivity index top quartile.', 0.78, 'pending');

  raise notice 'Seed complete for org % (Demo Corp).', v_org_id;
  raise notice 'Executive: % | Manager: % | Employees: %, %', v_exec_email, v_mgr_email, v_emp1_email, v_emp2_email;
end $$;

-- ── Quick verify ──────────────────────────────────────────────
select p.full_name, p.role, p.org_id, m.full_name as manager
from profiles p
left join profiles m on m.id = p.manager_id
where p.org_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
order by p.role, p.full_name;
