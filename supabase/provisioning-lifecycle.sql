-- Workforce Verify — provisioning, org chart, account lifecycle, billing
-- Run AFTER schema.sql and rls-policies.sql (or re-run provisioning-rls.sql after this).
--
-- Design (locked):
--   • SSO/SCIM = source of truth for profiles; manual email invite = fallback only
--   • manager_id set only by admin/HR (managers propose via manager_assignment_requests)
--   • Departure freezes verified records; account transfers to individual
--   • Free tier: always view + export own verified record
--   • Paid tier: shareable recruiter-facing passport

-- ── organizations: IdP + billing controls ─────────────────────
alter table organizations add column if not exists sso_enabled boolean not null default false;
alter table organizations add column if not exists scim_enabled boolean not null default false;
alter table organizations add column if not exists sso_provider text
  check (sso_provider is null or sso_provider in ('okta', 'azure', 'google'));
alter table organizations add column if not exists idp_metadata jsonb not null default '{}';
alter table organizations add column if not exists auto_trial_on_departure boolean not null default true;
alter table organizations add column if not exists default_trial_days smallint not null default 30
  check (default_trial_days between 1 and 365);

comment on column organizations.auto_trial_on_departure is
  'When true, departing employees enter former_trial for default_trial_days (admin can extend or disable).';
comment on column organizations.idp_metadata is
  'Non-secret IdP config refs (entity ID, ACS URL). Secrets live in env / Supabase Auth SAML config.';

-- ── profiles: lifecycle + provisioning source ───────────────
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('employee', 'manager', 'executive', 'admin', 'hr'));

alter table profiles add column if not exists account_status text not null default 'active_sso'
  check (account_status in ('active_sso', 'active_invited', 'former_trial', 'former_free', 'former_paid'));
alter table profiles add column if not exists provisioning_source text not null default 'sso'
  check (provisioning_source in ('sso', 'scim', 'invite'));
alter table profiles add column if not exists idp_external_id text;
alter table profiles add column if not exists departed_at timestamptz;
alter table profiles add column if not exists former_org_id uuid references organizations on delete set null;
alter table profiles add column if not exists trial_ends_at timestamptz;
alter table profiles add column if not exists records_frozen_at timestamptz;

create unique index if not exists idx_profiles_idp_external
  on profiles (org_id, idp_external_id) where idp_external_id is not null;

comment on column profiles.account_status is
  'active_sso/active_invited = employed; former_* = left company, personal account.';
comment on column profiles.records_frozen_at is
  'Set on departure — verified rows created while employed are immutable after this timestamp.';

-- ── manual email invite (fallback when no IdP) ────────────────
create table if not exists org_invites (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations on delete cascade,
  email        text not null,
  role         text not null default 'employee'
               check (role in ('employee', 'manager', 'executive', 'hr')),
  invited_by   uuid not null references profiles on delete cascade,
  token        text not null unique default encode(gen_random_bytes(24), 'hex'),
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at   timestamptz not null default (now() + interval '14 days'),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

create unique index if not exists idx_org_invites_pending_email
  on org_invites (org_id, lower(email)) where status = 'pending';

create index if not exists idx_org_invites_token on org_invites (token) where status = 'pending';
create index if not exists idx_org_invites_org on org_invites (org_id);

comment on table org_invites is
  'Fallback provisioning when SSO/SCIM is unavailable. IdP path is the default.';

-- ── manager assignment proposals (managers cannot self-assign reports) ──
create table if not exists manager_assignment_requests (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations on delete cascade,
  employee_id          uuid not null references profiles on delete cascade,
  proposed_manager_id  uuid not null references profiles on delete cascade,
  requested_by         uuid not null references profiles on delete cascade,
  status               text not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  review_notes         text,
  reviewed_by          uuid references profiles on delete set null,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now()
);

create unique index if not exists idx_mgr_assign_pending_employee
  on manager_assignment_requests (employee_id) where status = 'pending';

create index if not exists idx_mgr_assign_org on manager_assignment_requests (org_id, status);

comment on table manager_assignment_requests is
  'Managers propose reporting changes; only admin/HR applies manager_id after approval.';

-- ── freeze verified records on departure ──────────────────────
alter table achievements add column if not exists frozen_at timestamptz;
alter table kpis add column if not exists frozen_at timestamptz;
alter table projects add column if not exists frozen_at timestamptz;
alter table process_improvements add column if not exists frozen_at timestamptz;
alter table verified_facts add column if not exists frozen_at timestamptz;

-- Block updates/deletes on frozen verified rows (append-only after employment ends)
create or replace function guard_frozen_verified_record()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.frozen_at is not null then
      raise exception 'Verified record is frozen — cannot delete employment-era attestation';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.frozen_at is not null then
    raise exception 'Verified record is frozen — cannot modify employment-era attestation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_achievements_frozen on achievements;
create trigger trg_achievements_frozen
  before update or delete on achievements for each row execute function guard_frozen_verified_record();

drop trigger if exists trg_kpis_frozen on kpis;
create trigger trg_kpis_frozen
  before update or delete on kpis for each row execute function guard_frozen_verified_record();

drop trigger if exists trg_projects_frozen on projects;
create trigger trg_projects_frozen
  before update or delete on projects for each row execute function guard_frozen_verified_record();

drop trigger if exists trg_pi_frozen on process_improvements;
create trigger trg_pi_frozen
  before update or delete on process_improvements for each row execute function guard_frozen_verified_record();

drop trigger if exists trg_facts_frozen on verified_facts;
create trigger trg_facts_frozen
  before update or delete on verified_facts for each row execute function guard_frozen_verified_record();

-- Block self-service edits to org structure / lifecycle fields on profiles
create or replace function guard_profiles_sensitive_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_role text;
begin
  if auth.uid() is null then
    return new; -- service role / migrations
  end if;

  select role into actor_role from profiles where id = auth.uid();

  -- admin and HR may change org structure and lifecycle for others in their org
  if actor_role in ('admin', 'hr') and new.org_id = current_org() then
    return new;
  end if;

  if auth.uid() = old.id then
    if new.manager_id is distinct from old.manager_id
       or new.org_id is distinct from old.org_id
       or new.role is distinct from old.role
       or new.account_status is distinct from old.account_status
       or new.provisioning_source is distinct from old.provisioning_source
       or new.departed_at is distinct from old.departed_at
       or new.former_org_id is distinct from old.former_org_id
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.records_frozen_at is distinct from old.records_frozen_at
       or new.idp_external_id is distinct from old.idp_external_id
    then
      raise exception 'Cannot self-update org structure, provisioning, or lifecycle fields';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_sensitive on profiles;
create trigger trg_profiles_sensitive
  before update on profiles for each row execute function guard_profiles_sensitive_columns();

-- ── departure processor (called from API with service role) ───
create or replace function process_employee_departure(
  p_profile_id uuid,
  p_actor_id uuid default null
)
returns profiles language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles%rowtype;
  v_org organizations%rowtype;
  v_now timestamptz := now();
  v_new_status text;
begin
  select * into v_profile from profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Profile not found';
  end if;
  if v_profile.account_status not in ('active_sso', 'active_invited') then
    raise exception 'Profile is not an active employee';
  end if;
  if v_profile.org_id is null then
    raise exception 'Profile has no org';
  end if;

  select * into v_org from organizations where id = v_profile.org_id;

  if coalesce(v_org.auto_trial_on_departure, true) then
    v_new_status := 'former_trial';
  else
    v_new_status := 'former_free';
  end if;

  update profiles set
    account_status = v_new_status,
    departed_at = v_now,
    former_org_id = org_id,
    org_id = null,
    manager_id = null,
    trial_ends_at = case
      when v_new_status = 'former_trial'
      then v_now + (coalesce(v_org.default_trial_days, 30) || ' days')::interval
      else null
    end,
    records_frozen_at = v_now,
    passport_published = false,
    updated_at = v_now
  where id = p_profile_id
  returning * into v_profile;

  update achievements set frozen_at = v_now where profile_id = p_profile_id and frozen_at is null;
  update kpis set frozen_at = v_now where employee_id = p_profile_id and frozen_at is null;
  update projects set frozen_at = v_now where profile_id = p_profile_id and frozen_at is null;
  update process_improvements set frozen_at = v_now where profile_id = p_profile_id and frozen_at is null;
  update verified_facts set frozen_at = v_now where profile_id = p_profile_id and frozen_at is null;

  insert into audit_log (actor_id, action, target_table, target_id, changes)
  values (
    p_actor_id,
    'employee_departed',
    'profiles',
    p_profile_id,
    jsonb_build_object(
      'new_status', v_new_status,
      'former_org_id', v_profile.former_org_id,
      'trial_ends_at', v_profile.trial_ends_at
    )
  );

  return v_profile;
end;
$$;

-- Extend trial for a former employee (admin action)
create or replace function extend_employee_trial(
  p_profile_id uuid,
  p_extra_days smallint,
  p_actor_id uuid default null
)
returns profiles language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles%rowtype;
begin
  if p_extra_days < 1 or p_extra_days > 365 then
    raise exception 'extra_days must be between 1 and 365';
  end if;

  select * into v_profile from profiles where id = p_profile_id for update;
  if v_profile.account_status not in ('former_trial', 'former_free') then
    raise exception 'Trial extension only applies to former employees';
  end if;

  update profiles set
    account_status = 'former_trial',
    trial_ends_at = coalesce(trial_ends_at, now()) + (p_extra_days || ' days')::interval,
    updated_at = now()
  where id = p_profile_id
  returning * into v_profile;

  insert into audit_log (actor_id, action, target_table, target_id, changes)
  values (p_actor_id, 'trial_extended', 'profiles', p_profile_id,
    jsonb_build_object('extra_days', p_extra_days, 'trial_ends_at', v_profile.trial_ends_at));

  return v_profile;
end;
$$;

-- SSO/SCIM upsert — IdP is source of truth for employed users
create or replace function upsert_profile_from_idp(
  p_user_id uuid,
  p_org_id uuid,
  p_full_name text,
  p_title text,
  p_role text,
  p_manager_id uuid,
  p_idp_external_id text,
  p_source text default 'sso'
)
returns profiles language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles%rowtype;
  v_status text := case when p_source = 'invite' then 'active_invited' else 'active_sso' end;
begin
  insert into profiles (id, org_id, full_name, title, role, manager_id, idp_external_id,
                        provisioning_source, account_status)
  values (p_user_id, p_org_id, p_full_name, p_title, p_role, p_manager_id, p_idp_external_id,
          p_source, v_status)
  on conflict (id) do update set
    org_id = excluded.org_id,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    title = coalesce(excluded.title, profiles.title),
    role = excluded.role,
    manager_id = excluded.manager_id,
    idp_external_id = coalesce(excluded.idp_external_id, profiles.idp_external_id),
    provisioning_source = excluded.provisioning_source,
    account_status = case
      when profiles.account_status like 'former_%' then profiles.account_status
      else excluded.account_status
    end,
    updated_at = now()
  returning * into v_profile;

  insert into user_settings (profile_id) values (p_user_id)
  on conflict (profile_id) do nothing;

  return v_profile;
end;
$$;

-- Approve manager assignment request (admin/HR only — enforced in app + RLS)
create or replace function approve_manager_assignment(
  p_request_id uuid,
  p_reviewer_id uuid,
  p_notes text default null
)
returns manager_assignment_requests language plpgsql security definer set search_path = public as $$
declare
  v_req manager_assignment_requests%rowtype;
begin
  select * into v_req from manager_assignment_requests where id = p_request_id for update;
  if v_req.status <> 'pending' then
    raise exception 'Request is not pending';
  end if;

  update profiles set manager_id = v_req.proposed_manager_id, updated_at = now()
  where id = v_req.employee_id;

  update manager_assignment_requests set
    status = 'approved',
    reviewed_by = p_reviewer_id,
    reviewed_at = now(),
    review_notes = p_notes
  where id = p_request_id
  returning * into v_req;

  insert into audit_log (actor_id, action, target_table, target_id, changes)
  values (p_reviewer_id, 'manager_assignment_approved', 'profiles', v_req.employee_id,
    jsonb_build_object('manager_id', v_req.proposed_manager_id, 'request_id', p_request_id));

  return v_req;
end;
$$;

-- RLS on new tables (minimal; see provisioning-rls.sql for full policies)
alter table org_invites enable row level security;
alter table manager_assignment_requests enable row level security;
