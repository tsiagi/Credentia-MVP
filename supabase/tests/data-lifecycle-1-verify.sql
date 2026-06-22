-- ════════════════════════════════════════════════════════════════
-- Verification for data-lifecycle-1-retention-erasure.sql.
-- Transaction ROLLS BACK — commits nothing.
-- Asserts:
--   (a) purge_expired_data() no-ops when no retention policy is configured
--   (b) purge deletes rows past a configured window
--   (c) forget_subject() anonymizes the person and revokes share links
-- Separately confirm the cron job:
--   select jobname, schedule, active from cron.job
--    where jobname = 'credentia-retention-purge';
-- ════════════════════════════════════════════════════════════════
begin;

do $$
declare v_emp uuid; res jsonb; v_name text; v_anon timestamptz; v_links int; results text := '';
begin
  select id into v_emp from profiles where role='employee' order by created_at limit 1;
  if v_emp is null then raise exception 'no employee to test'; end if;

  res := public.purge_expired_data();
  if res <> '{}'::jsonb then raise exception 'FAIL a: purge acted with no policy: %', res; end if;
  results := results || E'PASS a: purge no-ops when unconfigured\n';

  insert into retention_policies(data_class, retention_days) values ('employee_value_scores',1)
    on conflict (data_class) do update set retention_days=1;
  insert into employee_value_scores(employee_id, score, computed_at)
    values (v_emp, 500, now() - interval '10 days');
  res := public.purge_expired_data();
  if (res->>'employee_value_scores')::int < 1 then raise exception 'FAIL b: purge did not delete old evs: %', res; end if;
  results := results || 'PASS b: purge deleted '||(res->>'employee_value_scores')||E' old evs row(s)\n';

  insert into shareable_links(profile_id) values (v_emp);
  perform public.forget_subject(v_emp, null);
  select full_name, anonymized_at into v_name, v_anon from profiles where id=v_emp;
  select count(*) into v_links from shareable_links where profile_id=v_emp and revoked=false;
  if v_name <> '[redacted]' or v_anon is null then raise exception 'FAIL c: not anonymized (name=%, anon=%)', v_name, v_anon; end if;
  if v_links <> 0 then raise exception 'FAIL c: share links still active'; end if;
  results := results || E'PASS c: subject anonymized + share links revoked\n';

  raise exception 'VERIFICATION COMPLETE (rolled back). Results:%', E'\n' || results;
end $$;

rollback;
