-- ════════════════════════════════════════════════════════════════
-- Verification for security fix #8 (run AFTER applying
-- security-fix-8-billing-notes-column.sql). Transaction ROLLS BACK.
-- Asserts a company user cannot read organizations.billing_notes but can
-- still read non-sensitive org columns.
-- ════════════════════════════════════════════════════════════════
begin;

do $$
declare
  v_uid uuid; v_org uuid; blocked boolean; v_name text; results text := '';
begin
  select id, org_id into v_uid, v_org from public.profiles
   where org_id is not null and role in ('employee','manager','admin') order by created_at limit 1;

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role','authenticated')::text, true);

  blocked := false;
  begin
    perform billing_notes from public.organizations where id = v_org;
  exception when insufficient_privilege then blocked := true;
           when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 8a: client read billing_notes'; end if;
  results := results || E'PASS 8a: billing_notes not readable by company user\n';

  select name into v_name from public.organizations where id = v_org;
  if v_name is null then raise exception 'FAIL 8b: client could not read org settings'; end if;
  results := results || E'PASS 8b: non-sensitive org columns still readable\n';

  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims', null, true);
  raise exception 'VERIFICATION COMPLETE (rolled back). Results:%', E'\n' || results;
end $$;

rollback;
