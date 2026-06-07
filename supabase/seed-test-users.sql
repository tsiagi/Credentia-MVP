-- Workforce Verify — QA test accounts (one per role)
-- Run AFTER creating auth users in Supabase Dashboard (see instructions below).
--
-- ═══════════════════════════════════════════════════════════════
-- STEP A — Create 5 auth users in Supabase Dashboard (do this FIRST)
-- ═══════════════════════════════════════════════════════════════
--
-- 1. Open Supabase → Authentication → Users → Add user → Create new user
-- 2. For each row below, create a user with the email and password shown.
--    Enable "Auto Confirm User" so email verification is not required.
-- 3. Suggested password for all QA accounts: TestPass123!
--
--    Email                              | Role (for your notes)
--    -----------------------------------|----------------------
--    superadmin@demo.credentia.test       | Platform operator
--    admin@demo.credentia.test          | Company admin
--    executive@demo.credentia.test        | Executive
--    manager@demo.credentia.test          | Manager
--    employee@demo.credentia.test         | Employee (reports to manager)
--
-- 4. Copy each user's UUID from the Users list if you need to debug
--    (this script resolves IDs by email automatically).
--
-- ═══════════════════════════════════════════════════════════════
-- STEP B — Run this SQL in Supabase → SQL Editor (postgres role)
-- ═══════════════════════════════════════════════════════════════
--
-- Creates Demo Corp org, departments, profiles, and manager_id wiring.
-- Superadmin has org_id = NULL (platform scope, not tenant-scoped).

do $$
declare
  v_super_email   text := 'superadmin@demo.credentia.test';
  v_admin_email   text := 'admin@demo.credentia.test';
  v_exec_email    text := 'executive@demo.credentia.test';
  v_mgr_email     text := 'manager@demo.credentia.test';
  v_emp_email     text := 'employee@demo.credentia.test';

  v_org_id        uuid := 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  v_super_id      uuid;
  v_admin_id      uuid;
  v_exec_id       uuid;
  v_mgr_id        uuid;
  v_emp_id        uuid;
  v_dept_eng      uuid := 'a2222222-2222-4222-8222-222222222222';
  v_dept_hr       uuid := 'a4444444-4444-4444-8444-444444444444';
begin
  select id into v_super_id from auth.users where email = v_super_email;
  select id into v_admin_id from auth.users where email = v_admin_email;
  select id into v_exec_id  from auth.users where email = v_exec_email;
  select id into v_mgr_id   from auth.users where email = v_mgr_email;
  select id into v_emp_id   from auth.users where email = v_emp_email;

  if v_super_id is null then
    raise exception 'Auth user not found: %. Create it in Authentication → Users first.', v_super_email;
  end if;
  if v_admin_id is null then
    raise exception 'Auth user not found: %. Create it in Authentication → Users first.', v_admin_email;
  end if;
  if v_exec_id is null then
    raise exception 'Auth user not found: %. Create it in Authentication → Users first.', v_exec_email;
  end if;
  if v_mgr_id is null then
    raise exception 'Auth user not found: %. Create it in Authentication → Users first.', v_mgr_email;
  end if;
  if v_emp_id is null then
    raise exception 'Auth user not found: %. Create it in Authentication → Users first.', v_emp_email;
  end if;

  -- Demo organization (active tenant)
  insert into organizations (id, name, status, plan, sso_provider, sso_domain)
  values (v_org_id, 'Demo Corp', 'active', 'Enterprise', 'okta', 'demo.corp.com')
  on conflict (id) do update set
    name         = excluded.name,
    status       = excluded.status,
    plan         = excluded.plan,
    sso_provider = excluded.sso_provider,
    sso_domain   = excluded.sso_domain;

  -- Profiles: superadmin is platform-scoped (no org)
  insert into profiles (id, org_id, manager_id, role, full_name, title, account_status, provisioned_via)
  values
    (v_super_id, null,  null,     'superadmin', 'Platform Operator',  'Credentia Ops',        'active_sso', 'invite'),
    (v_admin_id, v_org_id, null,  'admin',      'Casey Admin',        'System Administrator', 'active_sso', 'invite'),
    (v_exec_id,  v_org_id, null,  'executive',  'Alex Morgan',        'Chief People Officer', 'active_sso', 'sso'),
    (v_mgr_id,   v_org_id, null,  'manager',    'Jordan Lee',         'Engineering Manager',  'active_sso', 'sso'),
    (v_emp_id,   v_org_id, v_mgr_id, 'employee', 'Maya Chen',         'Senior Analyst',       'active_sso', 'sso')
  on conflict (id) do update set
    org_id          = excluded.org_id,
    manager_id      = excluded.manager_id,
    role            = excluded.role,
    full_name       = excluded.full_name,
    title           = excluded.title,
    account_status  = excluded.account_status,
    provisioned_via = excluded.provisioned_via;

  -- Departments
  delete from departments where org_id = v_org_id;
  insert into departments (id, org_id, name, head_profile_id) values
    (v_dept_eng, v_org_id, 'Engineering',  v_mgr_id),
    (v_dept_hr,  v_org_id, 'People & HR',  v_exec_id);

  -- User settings for app shell
  insert into user_settings (profile_id)
  select id from profiles where id in (v_super_id, v_admin_id, v_exec_id, v_mgr_id, v_emp_id)
  on conflict (profile_id) do nothing;

  raise notice 'QA seed complete.';
  raise notice 'Superadmin: % (no org)', v_super_email;
  raise notice 'Admin:      %', v_admin_email;
  raise notice 'Executive:  %', v_exec_email;
  raise notice 'Manager:    %', v_mgr_email;
  raise notice 'Employee:   % → reports to manager', v_emp_email;
end $$;

-- Verify wiring
select p.full_name, p.role, p.org_id, o.name as org, m.full_name as manager
from profiles p
left join organizations o on o.id = p.org_id
left join profiles m on m.id = p.manager_id
where p.role in ('superadmin', 'admin', 'executive', 'manager', 'employee')
  and (p.org_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479' or p.role = 'superadmin')
order by
  case p.role
    when 'superadmin' then 0
    when 'admin' then 1
    when 'executive' then 2
    when 'manager' then 3
    when 'employee' then 4
  end;
