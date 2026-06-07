-- Departure handoff — run after schema.sql
-- Sets employment_ended_at, freezes verified facts, applies trial/free status,
-- clears org link, writes audit_log. Auth handoff is documented in lib/lifecycle/departure.ts

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

  if v_profile.account_status not in ('active_sso', 'invited') then
    raise exception 'Profile is not an active employee (status=%)', v_profile.account_status;
  end if;
  if v_profile.org_id is null then
    raise exception 'Profile has no org_id';
  end if;

  select * into v_org from organizations where id = v_profile.org_id;

  if coalesce(v_org.auto_trial_enabled, true) then
    v_new_status := 'former_trial';
  else
    v_new_status := 'former_free';
  end if;

  update profiles set
    account_status = v_new_status,
    employment_ended_at = v_now,
    org_id = null,
    manager_id = null,
    trial_ends_at = case
      when v_new_status = 'former_trial'
      then v_now + (coalesce(v_org.trial_days, 30) || ' days')::interval
      else null
    end,
    passport_published = false,
    updated_at = v_now
  where id = p_profile_id
  returning * into v_profile;

  update verified_facts set frozen_at = v_now where profile_id = p_profile_id and frozen_at is null;
  update achievements set frozen_at = v_now where profile_id = p_profile_id and frozen_at is null;
  update kpis set frozen_at = v_now where employee_id = p_profile_id and frozen_at is null;
  update projects set frozen_at = v_now where profile_id = p_profile_id and frozen_at is null;
  update process_improvements set frozen_at = v_now where profile_id = p_profile_id and frozen_at is null;

  insert into audit_log (actor_id, action, target_table, target_id, changes)
  values (
    p_actor_id,
    'employee_departed',
    'profiles',
    p_profile_id,
    jsonb_build_object(
      'account_status', v_new_status,
      'employment_ended_at', v_now,
      'trial_ends_at', v_profile.trial_ends_at,
      'former_org_id', v_org.id
    )
  );

  return v_profile;
end;
$$;

-- Admin approves org_membership_requests → applies manager_id
create or replace function approve_org_membership_request(
  p_request_id uuid,
  p_reviewer_id uuid
)
returns org_membership_requests language plpgsql security definer set search_path = public as $$
declare
  v_req org_membership_requests%rowtype;
begin
  select * into v_req from org_membership_requests where id = p_request_id for update;
  if v_req.status <> 'pending' then
    raise exception 'Request is not pending';
  end if;

  update profiles set manager_id = v_req.proposed_manager_id, updated_at = now()
  where id = v_req.subject_profile_id;

  update org_membership_requests set status = 'approved' where id = p_request_id
  returning * into v_req;

  insert into audit_log (actor_id, action, target_table, target_id, changes)
  values (p_reviewer_id, 'org_membership_approved', 'profiles', v_req.subject_profile_id,
    jsonb_build_object('manager_id', v_req.proposed_manager_id, 'request_id', p_request_id));

  return v_req;
end;
$$;
