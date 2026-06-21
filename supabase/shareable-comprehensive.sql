-- ════════════════════════════════════════════════════════════════
-- Comprehensive Shareable Verified Profile
-- Additive. Run AFTER schema.sql, rls-policies.sql, and shareable-public.sql.
-- Safe to re-run.
--
-- Adds a verified employment/role HISTORY (with the manager assigned at the
-- time of each role) and links achievements/projects to a role, then rewrites
-- get_shareable_profile() to return a role-grouped, VERIFIED-FACTS-ONLY payload:
--   • roles (title, manager-at-the-time, dates, verification level)
--   • achievements (with category + the role they belong to)
--   • projects (outcome / business impact)
--   • metrics (approved KPIs)
-- No AI inferences, compensation, or value scores ever cross this boundary.
-- ════════════════════════════════════════════════════════════════

-- ── Verified employment / role history ──────────────────────────
-- One row per role a person has held. manager_id is the manager assigned at
-- the time; manager_name is a snapshot so the historical record survives
-- later reassignment or the manager's departure (we freeze, never rewrite).
create table if not exists employment_roles (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references profiles on delete cascade,
  org_id             uuid references organizations on delete cascade,
  title              text not null,
  manager_id         uuid references profiles on delete set null,
  manager_name       text,
  start_date         date,
  end_date           date,
  verification_level smallint not null default 1
                     check (verification_level between 1 and 5),
  attested_at        timestamptz,
  frozen_at          timestamptz,
  created_at         timestamptz not null default now()
);

comment on table employment_roles is
  'Verified role history. manager_id/manager_name capture the manager assigned at the time of each role; end_date null = current role.';
comment on column employment_roles.manager_name is
  'Snapshot of the manager-at-the-time label so historical attestations survive reassignment or departure.';
comment on column employment_roles.frozen_at is
  'Set on employment end — immutable attestation from the employment period.';

create index if not exists idx_employment_roles_profile on employment_roles (profile_id);
create index if not exists idx_employment_roles_org on employment_roles (org_id);

-- Link verified achievements / projects to the role they belong to (optional).
alter table achievements add column if not exists role_id uuid references employment_roles on delete set null;
alter table projects     add column if not exists role_id uuid references employment_roles on delete set null;

-- ── RLS — mirror the other verified records (owner all; manager + leader read) ──
alter table employment_roles enable row level security;

drop policy if exists "roles: owner all" on employment_roles;
create policy "roles: owner all" on employment_roles for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists "roles: manager read" on employment_roles;
create policy "roles: manager read" on employment_roles for select
  using (is_manager_of(profile_id));

drop policy if exists "roles: leader read" on employment_roles;
create policy "roles: leader read" on employment_roles for select
  using (is_org_leader_of(profile_id));

-- ── Comprehensive public RPC (anon-safe; verified facts only) ───
create or replace function public.get_shareable_profile(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_name text;
  v_title text;
  v_current_mgr text;
begin
  select sl.profile_id into v_profile_id
  from shareable_links sl
  where sl.token = p_token and sl.revoked = false;

  if v_profile_id is null then
    return null;
  end if;

  select full_name, title into v_name, v_title
  from profiles where id = v_profile_id;

  select m.full_name into v_current_mgr
  from profiles p
  left join profiles m on m.id = p.manager_id
  where p.id = v_profile_id;

  return jsonb_build_object(
    'name', coalesce(v_name, 'Professional'),
    'title', coalesce(v_title, ''),
    'currentManager', v_current_mgr,

    -- Role history with the manager assigned at the time of each role.
    'roles', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'title', er.title,
          'manager', coalesce(er.manager_name, m.full_name),
          'startDate', er.start_date,
          'endDate', er.end_date,
          'level', er.verification_level,
          'current', (er.end_date is null)
        )
        order by er.start_date desc nulls last
      )
      from employment_roles er
      left join profiles m on m.id = er.manager_id
      where er.profile_id = v_profile_id
        and (er.verification_level >= 2 or er.attested_at is not null)
    ), '[]'::jsonb),

    -- Verified achievements, with category (kind) and the role they belong to.
    'achievements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'label', a.description,
          'kind', a.kind,
          'date', a.achievement_date,
          'contribution', a.contribution_type,
          'role', er.title
        )
        order by a.achievement_date desc nulls last
      )
      from achievements a
      left join employment_roles er on er.id = a.role_id
      where a.profile_id = v_profile_id and a.verification_level >= 2
    ), '[]'::jsonb),

    -- Verified projects with measurable outcome / business impact.
    'projects', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'label', p2.description,
          'outcome', p2.outcome,
          'impact', coalesce(
            p2.business_impact,
            case
              when p2.revenue_impact is not null then 'Revenue impact: ' || p2.revenue_impact::text
              when p2.cost_savings  is not null then 'Cost savings: '  || p2.cost_savings::text
              else null
            end),
          'role', er.title
        )
        order by p2.created_at desc
      )
      from projects p2
      left join employment_roles er on er.id = p2.role_id
      where p2.profile_id = v_profile_id and p2.verification_level >= 2
    ), '[]'::jsonb),

    -- Verified metrics: approved KPIs only (progress / target).
    'metrics', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'label', k.title,
          'value', coalesce(k.progress, 0)::text || ' / ' || coalesce(k.target, 0)::text
        )
        order by k.created_at desc
      )
      from kpis k
      where k.employee_id = v_profile_id and k.status = 'approved'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_shareable_profile(text) from public;
grant execute on function public.get_shareable_profile(text) to anon, authenticated;
