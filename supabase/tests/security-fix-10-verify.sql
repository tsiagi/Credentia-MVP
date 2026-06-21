-- ════════════════════════════════════════════════════════════════
-- Verification for security fix #10 (run AFTER applying
-- security-fix-10-scim-per-org-secret.sql). Transaction ROLLS BACK.
-- Asserts: every org has its own distinct SCIM secret, and the secret is not
-- readable by client roles. (The per-org token validation itself lives in
-- app/api/provision/scim/route.ts.)
-- ════════════════════════════════════════════════════════════════
begin;

do $$
declare
  n_orgs int; n_secret int; n_distinct int; v_uid uuid; v_org uuid; blocked boolean; results text := '';
begin
  select count(*), count(scim_secret), count(distinct scim_secret)
    into n_orgs, n_secret, n_distinct from public.organizations;
  if n_secret <> n_orgs then raise exception 'FAIL 10a: % of % orgs missing scim_secret', n_orgs - n_secret, n_orgs; end if;
  if n_distinct <> n_orgs then raise exception 'FAIL 10a: scim secrets are not unique per org'; end if;
  results := results || E'PASS 10a: every org has a distinct scim_secret\n';

  select id, org_id into v_uid, v_org from public.profiles where org_id is not null order by created_at limit 1;
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role','authenticated')::text, true);

  blocked := false;
  begin perform scim_secret from public.organizations where id = v_org;
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 10b: client read scim_secret'; end if;
  results := results || E'PASS 10b: scim_secret not readable by company user\n';

  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims', null, true);
  raise exception 'VERIFICATION COMPLETE (rolled back). Results:%', E'\n' || results;
end $$;

rollback;
