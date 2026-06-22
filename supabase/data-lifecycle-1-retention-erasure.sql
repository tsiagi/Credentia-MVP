-- ════════════════════════════════════════════════════════════════
-- Data lifecycle #1 — retention purge + subject erasure (DSR / RTBF)
-- Idempotent. Reuses org_id cascades, audit_log, frozen_at.
--
-- Design:
--   • RETENTION is opt-in and declarative: a retention_policies row per
--     re-derivable AI/inference data class sets a window. No row = keep forever.
--     purge_expired_data() (run nightly by pg_cron) acts ONLY on configured
--     classes, so scheduling it is safe before any policy exists (it no-ops).
--   • ERASURE (right-to-be-forgotten) anonymizes the PERSON and scrubs personal
--     free-text + their private AI data, but never deletes frozen employment-era
--     attestations (immutable) — the company's record skeleton survives,
--     de-identified. Public/shareable surfaces die (slug cleared, links revoked).
--   • Both writers are SECURITY DEFINER and run server-side / via pg_cron, so
--     they bypass RLS by design; audit_log rows are written for every action.
-- ════════════════════════════════════════════════════════════════

-- 0. Anonymization stamp.
alter table profiles add column if not exists anonymized_at timestamptz;
comment on column profiles.anonymized_at is
  'Set by forget_subject() when the person exercised erasure. PII fields are redacted; frozen attestations remain (de-identified).';

-- 1. Retention policy (platform-default windows; per-org override = future work).
create table if not exists retention_policies (
  data_class     text primary key
                 check (data_class in (
                   'ai_inference_tasks', 'ai_inference_reports', 'ai_inferences',
                   'compensation_recommendations', 'promotion_readiness',
                   'employee_value_scores', 'agent_memory')),
  retention_days integer not null check (retention_days between 1 and 3650),
  updated_at     timestamptz not null default now()
);
comment on table retention_policies is
  'Opt-in retention windows for re-derivable AI/inference data classes. No row = keep forever. Consumed by purge_expired_data().';

alter table retention_policies enable row level security;
drop policy if exists "retention: superadmin all" on retention_policies;
create policy "retention: superadmin all" on retention_policies for all
  using (is_superadmin()) with check (is_superadmin());
drop policy if exists "retention: admin read" on retention_policies;
create policy "retention: admin read" on retention_policies for select
  using (current_role_name() in ('admin', 'hr'));

-- 2. Purge function — deletes only classes that have a configured window.
create or replace function purge_expired_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare d integer; n bigint; total jsonb := '{}'::jsonb;
begin
  select retention_days into d from retention_policies where data_class = 'ai_inference_tasks';
  if d is not null then
    delete from ai_inference_tasks where created_at < now() - (d || ' days')::interval;
    get diagnostics n = row_count; total := total || jsonb_build_object('ai_inference_tasks', n);
  end if;

  select retention_days into d from retention_policies where data_class = 'ai_inference_reports';
  if d is not null then
    delete from ai_inference_reports where created_at < now() - (d || ' days')::interval;
    get diagnostics n = row_count; total := total || jsonb_build_object('ai_inference_reports', n);
  end if;

  select retention_days into d from retention_policies where data_class = 'ai_inferences';
  if d is not null then
    delete from ai_inferences where created_at < now() - (d || ' days')::interval;
    get diagnostics n = row_count; total := total || jsonb_build_object('ai_inferences', n);
  end if;

  select retention_days into d from retention_policies where data_class = 'compensation_recommendations';
  if d is not null then
    delete from compensation_recommendations where created_at < now() - (d || ' days')::interval;
    get diagnostics n = row_count; total := total || jsonb_build_object('compensation_recommendations', n);
  end if;

  select retention_days into d from retention_policies where data_class = 'promotion_readiness';
  if d is not null then
    delete from promotion_readiness where created_at < now() - (d || ' days')::interval;
    get diagnostics n = row_count; total := total || jsonb_build_object('promotion_readiness', n);
  end if;

  select retention_days into d from retention_policies where data_class = 'employee_value_scores';
  if d is not null then
    delete from employee_value_scores where computed_at < now() - (d || ' days')::interval;
    get diagnostics n = row_count; total := total || jsonb_build_object('employee_value_scores', n);
  end if;

  select retention_days into d from retention_policies where data_class = 'agent_memory';
  if d is not null then
    delete from agent_memory where created_at < now() - (d || ' days')::interval;
    get diagnostics n = row_count; total := total || jsonb_build_object('agent_memory', n);
  end if;

  if total <> '{}'::jsonb then
    insert into audit_log (actor_id, action, target_table, target_id, changes)
    values (null, 'retention_purge', 'retention_policies', null, total);
  end if;
  return total;
end $$;

-- 3. Subject erasure (RTBF) — anonymize person, scrub personal data, keep
--    frozen attestations. Caller authority is enforced in the API route.
create or replace function forget_subject(p_profile_id uuid, p_actor_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles set
    full_name          = '[redacted]',
    title              = null,
    avatar_url         = null,
    public_slug        = null,
    passport_published = false,
    idp_external_id    = null,
    theme_color        = null,
    hire_date          = null,
    anonymized_at      = now(),
    updated_at         = now()
  where id = p_profile_id;

  -- Kill any public surface.
  update shareable_links set revoked = true where profile_id = p_profile_id;

  -- Scrub personal free-text comms authored by the subject.
  update messages set body = '[redacted]', evidence_suppressed = true
   where sender_id = p_profile_id;

  -- Drop the subject's private / re-derivable AI data.
  delete from agent_memory                 where owner_id    = p_profile_id;
  delete from compensation_recommendations where employee_id = p_profile_id;
  delete from promotion_readiness          where employee_id = p_profile_id;
  delete from employee_value_scores        where employee_id = p_profile_id;

  insert into audit_log (actor_id, action, target_table, target_id, changes)
  values (p_actor_id, 'subject_forgotten', 'profiles', p_profile_id,
          jsonb_build_object('method', 'anonymize+scrub', 'at', now()));
end $$;

-- 4. Schedule the nightly purge (inert until a retention_policies row exists).
create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('credentia-retention-purge');
exception when others then null;  -- not yet scheduled
end $$;
select cron.schedule('credentia-retention-purge', '17 3 * * *',
                     $$select public.purge_expired_data()$$);
