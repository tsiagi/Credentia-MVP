-- ════════════════════════════════════════════════════════════════
-- Verification for security fix #6 (run AFTER applying
-- security-fix-6-audit-forgery.sql). Transaction ROLLS BACK — commits nothing.
-- Impersonates a real user under enforced RLS and asserts:
--   • user CANNOT insert an audit row attributed to someone else (forgery)
--   • user CAN insert an audit row attributed to themselves
--   • user CANNOT update an existing audit row (append-only at client boundary)
-- ════════════════════════════════════════════════════════════════
begin;

do $$
declare
  v_a uuid; v_b uuid; existing_id uuid; blocked boolean; rc int; results text := '';
begin
  select id into v_a from public.profiles order by created_at limit 1;
  select id into v_b from public.profiles where id <> v_a order by created_at limit 1;
  if v_a is null or v_b is null then raise exception 'Need >=2 profiles to test.'; end if;

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a::text, 'role','authenticated')::text, true);

  -- 6a: forge a row attributed to another user -> denied
  blocked := false;
  begin
    insert into public.audit_log (actor_id, action, target_table, target_id)
    values (v_b, 'forged_action', 'profiles', v_b);
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 6a: forged audit row attributed to another user'; end if;
  results := results || E'PASS 6a: blocked audit row forged as another user\n';

  -- 6b: log own action -> allowed
  insert into public.audit_log (actor_id, action, target_table, target_id)
  values (v_a, 'legit_action', 'profiles', v_a);
  results := results || E'PASS 6b: user can log their own action\n';

  -- 6c: tamper with an existing row -> blocked. RLS with no client UPDATE
  -- policy silently affects 0 rows rather than raising, so assert row_count=0.
  select id into existing_id from public.audit_log where actor_id is not null
   order by created_at desc limit 1;
  if existing_id is not null then
    update public.audit_log set action='tampered' where id = existing_id;
    get diagnostics rc = row_count;
    if rc <> 0 then raise exception 'FAIL 6c: client updated % audit row(s)', rc; end if;
    results := results || E'PASS 6c: audit rows not client-updatable (append-only)\n';
  else
    results := results || E'SKIP 6c: no existing audit rows\n';
  end if;

  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims', null, true);
  raise exception 'VERIFICATION COMPLETE (rolled back). Results:%', E'\n' || results;
end $$;

rollback;
