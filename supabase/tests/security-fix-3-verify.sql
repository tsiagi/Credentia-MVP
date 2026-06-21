-- ════════════════════════════════════════════════════════════════
-- Verification for security fix #3 (run AFTER applying
-- security-fix-3-role-escalation.sql).
--
-- Safe everywhere: runs inside a transaction that ROLLS BACK; nothing commits.
-- Impersonates a real admin (and a real employee) the way Supabase evaluates
-- RLS/triggers (set role authenticated + JWT sub claim) and asserts:
--   • admin CANNOT set their own role to superadmin
--   • admin CANNOT set a co-member's role to superadmin
--   • admin CANNOT change their own role at all
--   • admin CAN still set a co-member's company role (employee→manager)  [no regression]
--   • employee CANNOT self-promote to admin
-- ════════════════════════════════════════════════════════════════
begin;

do $$
declare
  v_admin uuid;
  v_org   uuid;
  v_member uuid;
  v_emp   uuid;
  blocked boolean;
  results text := '';
begin
  select id, org_id into v_admin, v_org from public.profiles
   where role='admin' and org_id is not null order by created_at limit 1;
  if v_admin is null then raise exception 'No admin profile to impersonate.'; end if;

  select id into v_member from public.profiles
   where org_id = v_org and id <> v_admin and role <> 'superadmin'
   order by created_at limit 1;
  if v_member is null then raise exception 'No co-member in admin org to target.'; end if;

  -- ── Impersonate the admin ──
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);

  -- 3a: admin self → superadmin : denied
  blocked := false;
  begin update public.profiles set role='superadmin' where id = v_admin;
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 3a: admin self-escalated to superadmin'; end if;
  results := results || E'PASS 3a: admin blocked from self-granting superadmin\n';

  -- 3b: admin sets co-member → superadmin : denied
  blocked := false;
  begin update public.profiles set role='superadmin' where id = v_member;
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 3b: admin granted superadmin to a member'; end if;
  results := results || E'PASS 3b: admin blocked from granting superadmin to a member\n';

  -- 3c: admin changes own role (to employee) : denied
  blocked := false;
  begin update public.profiles set role='employee' where id = v_admin;
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 3c: admin changed own role'; end if;
  results := results || E'PASS 3c: admin blocked from changing own role\n';

  -- 3d: admin sets co-member company role (manager) : ALLOWED (no regression)
  update public.profiles set role='manager' where id = v_member;
  results := results || E'PASS 3d: admin can set a co-member company role (manager)\n';

  -- ── Impersonate a plain employee ──
  select id into v_emp from public.profiles
   where role='employee' and org_id is not null order by created_at limit 1;
  if v_emp is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_emp::text, 'role','authenticated')::text, true);
    blocked := false;
    begin update public.profiles set role='admin' where id = v_emp;
    exception when others then blocked := true; end;
    if not blocked then raise exception 'FAIL 3e: employee self-promoted to admin'; end if;
    results := results || E'PASS 3e: employee blocked from self-promoting to admin\n';
  end if;

  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims', null, true);
  raise exception 'VERIFICATION COMPLETE (rolled back). Results:%', E'\n' || results;
end $$;

rollback;
