-- ════════════════════════════════════════════════════════════════
-- Verification for security fix #7 (run AFTER applying
-- security-fix-7-record-owner-immutable.sql). Transaction ROLLS BACK.
-- Asserts:
--   • a manager CANNOT reassign a report's record to themselves (theft)
--   • a manager CAN still verify (raise level) a report's record
--   • an owner CAN still edit their own draft
-- ════════════════════════════════════════════════════════════════
begin;

do $$
declare
  v_mgr uuid; v_report uuid; v_ach uuid; rc int; blocked boolean; results text := '';
begin
  select p.manager_id, p.id into v_mgr, v_report
  from public.profiles p where p.manager_id is not null limit 1;
  if v_mgr is null then raise exception 'No manager/report pair.'; end if;

  insert into public.achievements (profile_id, kind, description, verification_level)
  values (v_report, 'probe', 'probe ach', 1) returning id into v_ach;

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_mgr::text, 'role','authenticated')::text, true);

  -- 7a: manager tries to STEAL the report's achievement (profile_id -> self) : denied
  blocked := false;
  begin update public.achievements set profile_id = v_mgr where id = v_ach;
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 7a: manager reassigned a report record to self'; end if;
  results := results || E'PASS 7a: record-ownership reassign blocked (theft)\n';

  -- 7b: manager LEGIT verify (level 2, owner unchanged) : allowed
  update public.achievements set verification_level = 2 where id = v_ach;
  get diagnostics rc = row_count;
  if rc <> 1 then raise exception 'FAIL 7b: legit manager verify did not apply (rc=%)', rc; end if;
  results := results || E'PASS 7b: manager verify (level 2) still works\n';

  -- 7c: owner edits their OWN draft (no owner change) : allowed
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_report::text, 'role','authenticated')::text, true);
  insert into public.achievements (profile_id, kind, description, verification_level)
  values (v_report, 'own', 'own draft', 1) returning id into v_ach;
  update public.achievements set description='edited' where id = v_ach;
  get diagnostics rc = row_count;
  if rc <> 1 then raise exception 'FAIL 7c: owner could not edit own draft (rc=%)', rc; end if;
  results := results || E'PASS 7c: owner can edit own draft\n';

  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims', null, true);
  raise exception 'VERIFICATION COMPLETE (rolled back). Results:%', E'\n' || results;
end $$;

rollback;
