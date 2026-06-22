-- ═══════════════════════════════════════════════════════════════════════════
-- [QA] Demo Co — stand-alone tenant for admin + superadmin console testing
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Safe to delete later: org id d0000001-0001-4001-8001-000000000001
-- Email domain: @qa-democo.test (does not overlap demo.corp.com accounts)
--
-- ── EXACT RUN ORDER ───────────────────────────────────────────────────────
--
-- 0. PREREQS (once per Supabase project, if not already applied)
--    a. supabase/schema.sql (baseline)
--    b. supabase/migrate-batch-ab.sql
--    c. supabase/shareable-public.sql
--    d. supabase/migrate-batch-cd.sql
--    e. supabase/migrate-batch-ef.sql   ← billing columns + billing_events
--    f. supabase/rls-policies.sql
--    g. supabase/shareable-comprehensive.sql ← role history + rich shareable profile
--
-- 1. CREATE AUTH USERS (Dashboard — do NOT skip)
--    Supabase → Authentication → Users → Add user → Create new user
--    Enable "Auto Confirm User" for each. Password for all: TestPass123!
--
--    Email                         | Role (your notes)
--    ------------------------------|---------------------------
--    admin@qa-democo.test          | Company admin (Demo Co)
--    executive@qa-democo.test      | Executive
--    manager@qa-democo.test        | Manager
--    employee1@qa-democo.test      | Employee → reports to manager
--    employee2@qa-democo.test      | Employee → reports to manager
--
--    Alternative: `npm run seed:demo-company` (Admin API; needs
--    SUPABASE_SERVICE_ROLE_KEY in .env.local). Password: TestPass123!
--
-- 2. RUN THIS FILE
--    Supabase → SQL Editor → paste entire file → Run
--
-- 3. VERIFY
--    a. Sign in as admin@qa-democo.test → People & Org / Org Controls
--    b. Sign in as superadmin → Platform Console → Per-company billing
--       ("Demo Co" should appear with billing_status = trial)
--    c. Sign in as manager@qa-democo.test → Verification Center (pending L1 items)
--
-- ── TEARDOWN (when QA is done) ────────────────────────────────────────────
--    Uncomment and run the block at the bottom of this file, OR:
--    delete from organizations where id = 'd0000001-0001-4001-8001-000000000001';
--    (cascades profiles' org link only where FK allows — auth.users remain;
--     remove auth users manually in Dashboard if desired)

do $$
declare
  -- Fixed QA ids — grep "d0000001" or "qa-democo" to find all related rows
  v_org_id        uuid := 'd0000001-0001-4001-8001-000000000001';

  v_admin_email   text := 'admin@qa-democo.test';
  v_exec_email    text := 'executive@qa-democo.test';
  v_mgr_email     text := 'manager@qa-democo.test';
  v_emp1_email    text := 'employee1@qa-democo.test';
  v_emp2_email    text := 'employee2@qa-democo.test';

  v_admin_id      uuid;
  v_exec_id       uuid;
  v_mgr_id        uuid;
  v_emp1_id       uuid;
  v_emp2_id       uuid;

  v_dept_eng      uuid := 'd0000002-0002-4002-8002-000000000002';
  v_dept_ops      uuid := 'd0000003-0003-4003-8003-000000000003';

  -- Verified role history (manager-at-the-time) for the shareable profile
  v_role_taylor1  uuid;
  v_role_taylor2  uuid;
  v_role_jordan   uuid;

  v_trial_start   timestamptz := date_trunc('day', now());
  v_trial_end     timestamptz := date_trunc('day', now()) + interval '30 days';
begin
  -- Resolve auth.users (must exist from Step 1)
  select id into v_admin_id from auth.users where email = v_admin_email;
  select id into v_exec_id  from auth.users where email = v_exec_email;
  select id into v_mgr_id   from auth.users where email = v_mgr_email;
  select id into v_emp1_id  from auth.users where email = v_emp1_email;
  select id into v_emp2_id  from auth.users where email = v_emp2_email;

  if v_admin_id is null then
    raise exception 'Auth user not found: %. Create in Authentication → Users first.', v_admin_email;
  end if;
  if v_exec_id is null then
    raise exception 'Auth user not found: %. Create in Authentication → Users first.', v_exec_email;
  end if;
  if v_mgr_id is null then
    raise exception 'Auth user not found: %. Create in Authentication → Users first.', v_mgr_email;
  end if;
  if v_emp1_id is null then
    raise exception 'Auth user not found: %. Create in Authentication → Users first.', v_emp1_email;
  end if;
  if v_emp2_id is null then
    raise exception 'Auth user not found: %. Create in Authentication → Users first.', v_emp2_email;
  end if;

  -- ── Organization: Demo Co on platform trial ─────────────────────────────
  insert into organizations (
    id, name, status, plan,
    sso_provider, sso_domain,
    billing_status, trial_starts_at, trial_ends_at,
    monthly_price, seats, billing_notes,
    ai_coaching_enabled, promotion_engine_enabled, require_proof, evaluation_model
  ) values (
    v_org_id,
    'Demo Co',
    'active',
    'Growth',
    'none',
    'qa-democo.test',
    'trial',
    v_trial_start,
    v_trial_end,
    299,
    25,
    '[QA] Demo Co seed — safe to delete org d0000001-0001-4001-8001-000000000001',
    true,
    true,
    true,
    'both'
  )
  on conflict (id) do update set
    name              = excluded.name,
    status            = excluded.status,
    plan              = excluded.plan,
    sso_provider      = excluded.sso_provider,
    sso_domain        = excluded.sso_domain,
    billing_status    = excluded.billing_status,
    trial_starts_at   = excluded.trial_starts_at,
    trial_ends_at     = excluded.trial_ends_at,
    monthly_price     = excluded.monthly_price,
    seats             = excluded.seats,
    billing_notes     = excluded.billing_notes;

  -- ── Profiles (all roles, manager_id wired) ──────────────────────────────
  insert into profiles (
    id, org_id, manager_id, role, full_name, title,
    account_status, provisioned_via, hire_date
  ) values
    (v_admin_id, v_org_id, null,     'admin',     'Quinn Admin',    'Demo Co Administrator', 'active_sso', 'invite', '2024-01-15'),
    (v_exec_id,  v_org_id, null,     'executive', 'Riley Executive','VP People',             'active_sso', 'sso',    '2023-06-01'),
    (v_mgr_id,   v_org_id, v_exec_id,'manager',   'Morgan Manager', 'Operations Manager',    'active_sso', 'sso',    '2024-03-01'),
    (v_emp1_id,  v_org_id, v_mgr_id, 'employee',  'Taylor Employee','Operations Analyst',  'active_sso', 'sso',    '2025-01-10'),
    (v_emp2_id,  v_org_id, v_mgr_id, 'employee',  'Jordan Employee','Operations Specialist','active_sso', 'sso',   '2025-04-20')
  on conflict (id) do update set
    org_id          = excluded.org_id,
    manager_id      = excluded.manager_id,
    role            = excluded.role,
    full_name       = excluded.full_name,
    title           = excluded.title,
    account_status  = excluded.account_status,
    provisioned_via = excluded.provisioned_via,
    hire_date       = excluded.hire_date;

  insert into user_settings (profile_id)
  select id from profiles where id in (v_admin_id, v_exec_id, v_mgr_id, v_emp1_id, v_emp2_id)
  on conflict (profile_id) do nothing;

  -- ── Clear prior QA demo rows for this org (idempotent re-run) ───────────
  delete from billing_events where org_id = v_org_id;
  delete from pulse_surveys where employee_id in (select id from profiles where org_id = v_org_id);
  delete from employee_value_scores where employee_id in (select id from profiles where org_id = v_org_id);
  delete from compensation_recommendations where employee_id in (select id from profiles where org_id = v_org_id);
  delete from promotion_readiness where employee_id in (select id from profiles where org_id = v_org_id);
  delete from feedback_cycles where profile_id in (select id from profiles where org_id = v_org_id);
  delete from verified_facts where profile_id in (select id from profiles where org_id = v_org_id);
  delete from achievements where org_id = v_org_id;
  delete from kpis where employee_id in (select id from profiles where org_id = v_org_id);
  delete from projects where profile_id in (select id from profiles where org_id = v_org_id);
  delete from employment_roles where profile_id in (select id from profiles where org_id = v_org_id);
  delete from departments where org_id = v_org_id;

  -- ── Departments (2) ─────────────────────────────────────────────────────
  insert into departments (id, org_id, name, head_profile_id) values
    (v_dept_eng, v_org_id, '[QA] Engineering', v_mgr_id),
    (v_dept_ops, v_org_id, '[QA] Operations',  v_mgr_id);

  -- ── Billing ledger (superadmin console) ─────────────────────────────────
  insert into billing_events (org_id, type, amount, created_by, detail) values
    (
      v_org_id,
      'trial_started',
      null,
      v_admin_id,
      jsonb_build_object(
        'qa_seed', true,
        'org_name', 'Demo Co',
        'trial_days', 30,
        'trial_ends_at', v_trial_end
      )
    );

  -- ── Achievements (mixed verification levels) ────────────────────────────
  insert into achievements (
    profile_id, org_id, kind, description, achievement_date,
    verification_level, contribution_type, evidence_url, pending_executive
  ) values
    -- Taylor: L1 pending (manager queue)
    (v_emp1_id, v_org_id, 'achievement',
     'Process automation: Reduced manual handoffs by 40% in Q1.',
     '2026-02-15', 1, 'individual', 'https://qa-democo.test/evidence/taylor-automation.pdf', false),
    -- Taylor: L2 verified
    (v_emp1_id, v_org_id, 'certification',
     'Core-Roborate Analyst Cert: Completed internal verification training.',
     '2025-11-01', 2, 'individual', null, false),
    -- Jordan: L1 pending
    (v_emp2_id, v_org_id, 'award',
     'Team impact award: Led cross-team rollout.',
     '2026-01-20', 1, 'team', 'https://qa-democo.test/evidence/jordan-award.png', false),
    -- Manager self-submit: pending executive (Batch D flow)
    (v_mgr_id, v_org_id, 'promotion',
     'Leadership program completion: Mentored two analysts to L2 verification.',
     '2026-03-01', 1, 'team', 'https://qa-democo.test/evidence/morgan-leadership.pdf', true);

  update achievements
  set submitted_by = v_mgr_id
  where org_id = v_org_id and profile_id = v_mgr_id and pending_executive = true;

  -- ── KPIs (pending + approved + clarify) ─────────────────────────────────
  insert into kpis (employee_id, title, target, progress, status, verification_level) values
    (v_emp1_id, '[QA] Ticket resolution SLA %', 95, 88,  'pending',  1),
    (v_emp1_id, '[QA] Customer satisfaction',    4.5, 4.6, 'approved', 2),
    (v_emp2_id, '[QA] Projects delivered',      6,   5,   'clarify',  1);

  -- ── Verified facts (timeline L3) ────────────────────────────────────────
  insert into verified_facts (profile_id, kind, label, attested_at, verification_level) values
    (v_emp1_id, 'employment', 'Operations Analyst — Demo Co', '2025-01-10', 3),
    (v_emp2_id, 'employment', 'Operations Specialist — Demo Co', '2025-04-20', 3);

  -- ── Verified role history (manager-at-the-time) for shareable profile ────
  -- Taylor held two roles: an earlier one under the executive, then the
  -- current Analyst role under the manager — demonstrates per-role managers.
  insert into employment_roles
    (profile_id, org_id, title, manager_id, manager_name, start_date, end_date, verification_level, attested_at)
  values
    (v_emp1_id, v_org_id, 'Operations Associate — Demo Co', v_exec_id, 'Riley Executive',
     '2024-06-01', '2024-12-31', 3, '2024-06-01')
  returning id into v_role_taylor1;

  insert into employment_roles
    (profile_id, org_id, title, manager_id, manager_name, start_date, end_date, verification_level, attested_at)
  values
    (v_emp1_id, v_org_id, 'Operations Analyst — Demo Co', v_mgr_id, 'Morgan Manager',
     '2025-01-10', null, 3, '2025-01-10')
  returning id into v_role_taylor2;

  insert into employment_roles
    (profile_id, org_id, title, manager_id, manager_name, start_date, end_date, verification_level, attested_at)
  values
    (v_emp2_id, v_org_id, 'Operations Specialist — Demo Co', v_mgr_id, 'Morgan Manager',
     '2025-04-20', null, 3, '2025-04-20')
  returning id into v_role_jordan;

  -- Link achievements to the role held at the time (current role for each).
  update achievements set role_id = v_role_taylor2 where org_id = v_org_id and profile_id = v_emp1_id;
  update achievements set role_id = v_role_jordan  where org_id = v_org_id and profile_id = v_emp2_id;

  -- ── Verified projects (with measurable impact), linked to roles ──────────
  insert into projects
    (profile_id, description, outcome, business_impact, revenue_impact, cost_savings, verification_level, role_id)
  values
    (v_emp1_id, 'Customer portal data migration',
     'Migrated 3 legacy systems with zero downtime.',
     'Cut average page load time by 35%.', null, 48000, 2, v_role_taylor2),
    (v_emp1_id, 'Reconciliation automation pipeline',
     'Automated month-end reconciliation across two teams.',
     null, null, 32000, 2, v_role_taylor1),
    (v_emp2_id, 'Cross-team rollout playbook',
     'Standardized onboarding for three operations pods.',
     'Reduced ramp time from 6 to 4 weeks.', null, null, 2, v_role_jordan);

  -- ── Light inference rows (optional dashboard richness) ──────────────────
  insert into promotion_readiness (employee_id, category, evidence) values
    (v_emp1_id, '6mo', '[QA] Strong L2 cert; one pending achievement awaiting manager.'),
    (v_emp2_id, 'dev_needed', '[QA] Clarify KPI before promotion discussion.');

  insert into employee_value_scores (employee_id, score, inputs) values
    (v_emp1_id, 790, '{"kpis":0.85,"reviews":0.80,"projects":0.78,"certs":0.90,"leadership":0.72,"innovation":0.75,"skills":0.82,"recognition":0.70}'::jsonb),
    (v_emp2_id, 710, '{"kpis":0.72,"reviews":0.70,"projects":0.68,"certs":0.75,"leadership":0.65,"innovation":0.70,"skills":0.78,"recognition":0.62}'::jsonb);

  raise notice '════════════════════════════════════════════════════════';
  raise notice '[QA] Demo Co seed complete.';
  raise notice 'Org id:    %', v_org_id;
  raise notice 'Trial:     % → %', v_trial_start::date, v_trial_end::date;
  raise notice 'Admin:     %', v_admin_email;
  raise notice 'Executive: %', v_exec_email;
  raise notice 'Manager:   % (reports to executive)', v_mgr_email;
  raise notice 'Employees: %, % (report to manager)', v_emp1_email, v_emp2_email;
  raise notice 'Password:  TestPass123! (if created via Dashboard)';
  raise notice '════════════════════════════════════════════════════════';
end $$;

-- ── Verify org + billing ────────────────────────────────────────────────────
select id, name, billing_status, trial_starts_at::date, trial_ends_at::date, monthly_price, seats
from organizations
where id = 'd0000001-0001-4001-8001-000000000001';

-- ── Verify profiles + manager chain ─────────────────────────────────────────
select p.full_name, p.role, p.title, m.full_name as manager
from profiles p
left join profiles m on m.id = p.manager_id
where p.org_id = 'd0000001-0001-4001-8001-000000000001'
order by
  case p.role
    when 'admin' then 1 when 'executive' then 2 when 'manager' then 3 when 'employee' then 4 else 9
  end,
  p.full_name;

-- ── Verify achievements / KPIs by level ─────────────────────────────────────
select p.full_name, a.kind, a.verification_level, a.pending_executive, left(a.description, 50) as summary
from achievements a
join profiles p on p.id = a.profile_id
where a.org_id = 'd0000001-0001-4001-8001-000000000001'
order by a.verification_level, p.full_name;

select p.full_name, k.title, k.status, k.verification_level, k.progress, k.target
from kpis k
join profiles p on p.id = k.employee_id
where p.org_id = 'd0000001-0001-4001-8001-000000000001';

-- ── Verify role history + manager-at-the-time ────────────────────────────────
select p.full_name, er.title, er.manager_name, er.start_date, er.end_date, er.verification_level
from employment_roles er
join profiles p on p.id = er.profile_id
where p.org_id = 'd0000001-0001-4001-8001-000000000001'
order by p.full_name, er.start_date;

/*
-- ── TEARDOWN: uncomment to remove [QA] Demo Co (auth users stay in Dashboard)
delete from billing_events where org_id = 'd0000001-0001-4001-8001-000000000001';
delete from achievements where org_id = 'd0000001-0001-4001-8001-000000000001';
delete from projects where profile_id in (select id from profiles where org_id = 'd0000001-0001-4001-8001-000000000001');
delete from kpis where employee_id in (select id from profiles where org_id = 'd0000001-0001-4001-8001-000000000001');
delete from employment_roles where profile_id in (select id from profiles where org_id = 'd0000001-0001-4001-8001-000000000001');
delete from verified_facts where profile_id in (select id from profiles where org_id = 'd0000001-0001-4001-8001-000000000001');
delete from promotion_readiness where employee_id in (select id from profiles where org_id = 'd0000001-0001-4001-8001-000000000001');
delete from employee_value_scores where employee_id in (select id from profiles where org_id = 'd0000001-0001-4001-8001-000000000001');
delete from departments where org_id = 'd0000001-0001-4001-8001-000000000001';
update profiles set org_id = null, manager_id = null where org_id = 'd0000001-0001-4001-8001-000000000001';
delete from organizations where id = 'd0000001-0001-4001-8001-000000000001';
-- Then delete auth users @qa-democo.test in Authentication → Users if desired.
*/
