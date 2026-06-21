-- ════════════════════════════════════════════════════════════════
-- Verification for security fix #2 (run AFTER applying
-- security-fix-2-owner-verified-write.sql).
--
-- Safe to run against any environment: everything happens inside a single
-- transaction that ROLLS BACK at the end — no row is ever committed.
--
-- It impersonates a real employee (set role authenticated + a JWT sub claim,
-- exactly how Supabase evaluates RLS) and asserts:
--   • owner CANNOT insert/update a verified_* row above verification_level 1
--   • owner CANNOT self-approve a KPI / process_improvement
--   • owner CAN still create and edit a level-1 DRAFT (no regression)
-- Each check RAISEs and aborts the script on failure; a clean run prints PASS
-- lines only.
-- ════════════════════════════════════════════════════════════════
begin;

-- Pick a real employee to impersonate (their profile must exist for FKs).
do $$
declare v_uid uuid;
begin
  select id into v_uid from public.profiles
   where role = 'employee' and org_id is not null
   order by created_at limit 1;
  if v_uid is null then
    raise exception 'No employee profile found to impersonate — seed one first.';
  end if;
  perform set_config('test.uid', v_uid::text, true);
end $$;

-- Become an authenticated end-user (so RLS is enforced, not bypassed) with
-- that user as auth.uid().
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role', 'authenticated')::text,
  true
);

-- 1. EXPLOIT: owner inserts a level-5 "verified" achievement → must be denied.
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.achievements (profile_id, kind, description, verification_level)
    values (auth.uid(), 'fraud', 'self-minted verified credential', 5);
  exception when others then blocked := true;
  end;
  if not blocked then
    raise exception 'FAIL #2a: owner inserted a level-5 achievement';
  end if;
  raise notice 'PASS #2a: owner blocked from inserting level-5 achievement';
end $$;

-- 2. EXPLOIT: owner inserts a legit draft, then tries to escalate it → denied.
do $$
declare new_id uuid; blocked boolean := false;
begin
  insert into public.achievements (profile_id, kind, description, verification_level)
  values (auth.uid(), 'work', 'legit draft', 1)
  returning id into new_id;            -- draft insert must succeed
  raise notice 'PASS #2b: owner can insert a level-1 draft';

  begin
    update public.achievements set verification_level = 5 where id = new_id;
  exception when others then blocked := true;
  end;
  if not blocked then
    raise exception 'FAIL #2c: owner escalated their own achievement to level 5';
  end if;
  raise notice 'PASS #2c: owner blocked from escalating draft to level 5';

  -- editing the draft (staying at level 1) must still work:
  update public.achievements set description = 'edited draft' where id = new_id;
  raise notice 'PASS #2d: owner can still edit a level-1 draft';
end $$;

-- 3. EXPLOIT: owner self-approves a KPI → denied.
do $$
declare new_id uuid; blocked boolean := false;
begin
  insert into public.kpis (employee_id, title, target, progress, status, verification_level)
  values (auth.uid(), 'self kpi', 100, 50, 'pending', 1)
  returning id into new_id;
  begin
    update public.kpis set status = 'approved', verification_level = 2 where id = new_id;
  exception when others then blocked := true;
  end;
  if not blocked then
    raise exception 'FAIL #2e: owner self-approved a KPI';
  end if;
  raise notice 'PASS #2e: owner blocked from self-approving a KPI';
end $$;

-- 4. EXPLOIT: owner self-approves a process_improvement → denied.
do $$
declare new_id uuid; blocked boolean := false;
begin
  insert into public.process_improvements (profile_id, type, status)
  values (auth.uid(), 'efficiency', 'pending')
  returning id into new_id;
  begin
    update public.process_improvements set status = 'approved' where id = new_id;
  exception when others then blocked := true;
  end;
  if not blocked then
    raise exception 'FAIL #2f: owner self-approved a process_improvement';
  end if;
  raise notice 'PASS #2f: owner blocked from self-approving a process_improvement';
end $$;

reset role;
rollback;  -- nothing is committed
