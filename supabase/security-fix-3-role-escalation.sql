-- ════════════════════════════════════════════════════════════════
-- Security fix #3 — block company-admin → superadmin self-escalation
-- Run AFTER rls-policies.sql. Idempotent (create or replace).
--
-- PROBLEM (audit #3):
--   profiles.role's CHECK permits 'superadmin', and
--   guard_profiles_sensitive_columns() returned NEW unconditionally for an
--   'admin' editing any row in their own org — INCLUDING their own row. Since
--   the "profiles: admin update org members" RLS policy lets an admin update
--   their own profile, a company admin could simply:
--       update profiles set role='superadmin' where id = auth.uid();
--   becoming a platform operator across every tenant.
--
-- FIX:
--   Re-create the trigger function with an early hardening guard that runs for
--   every authenticated actor (service-role writes still short-circuit on a
--   null auth.uid()):
--     • Only an existing platform superadmin may grant the 'superadmin' role.
--     • No one may change their OWN role (no self-escalation), except a
--       superadmin.
--   The rest of the column-guard logic is unchanged, so admins keep managing
--   org structure / lifecycle / company roles (employee↔manager↔admin) for
--   their members.
-- ════════════════════════════════════════════════════════════════

create or replace function guard_profiles_sensitive_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_role text;
begin
  if auth.uid() is null then
    return new; -- service role / migrations
  end if;

  select role into actor_role from profiles where id = auth.uid();

  -- ── HARDENING (security fix #3) ───────────────────────────────
  -- Applies to ALL authenticated actors, evaluated before the admin /
  -- superadmin early-returns below. `is distinct from` so a null actor_role
  -- (no profile) is treated as "not superadmin" and blocked.
  if new.role is distinct from old.role then
    if new.role = 'superadmin' and actor_role is distinct from 'superadmin' then
      raise exception 'Only a platform superadmin may grant the superadmin role';
    end if;
    if auth.uid() = old.id and actor_role is distinct from 'superadmin' then
      raise exception 'You cannot change your own role';
    end if;
  end if;

  -- Org admin may change org structure and lifecycle for members in their org
  if actor_role = 'admin' and old.org_id is not distinct from current_org() then
    return new;
  end if;

  -- Platform superadmin may provision any profile (cross-tenant)
  if actor_role = 'superadmin' then
    return new;
  end if;

  if auth.uid() = old.id then
    if new.manager_id is distinct from old.manager_id
       or new.org_id is distinct from old.org_id
       or new.role is distinct from old.role
       or new.account_status is distinct from old.account_status
       or new.provisioned_via is distinct from old.provisioned_via
       or new.employment_ended_at is distinct from old.employment_ended_at
       or new.trial_ends_at is distinct from old.trial_ends_at
    then
      raise exception 'Cannot self-update org structure or lifecycle fields';
    end if;
  elsif auth.uid() <> old.id then
    -- Non-admin updating someone else's profile: only admin policy should apply;
    -- block sensitive columns for everyone else (e.g. managers).
    if actor_role <> 'admin' then
      if new.manager_id is distinct from old.manager_id
         or new.org_id is distinct from old.org_id
         or new.role is distinct from old.role
         or new.account_status is distinct from old.account_status
      then
        raise exception 'Only org admins may change manager_id, org_id, role, or account_status';
      end if;
    end if;
  end if;

  return new;
end;
$$;
