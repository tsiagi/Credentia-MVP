-- Workforce Verify — RLS for provisioning, org chart, lifecycle
-- Run AFTER provisioning-lifecycle.sql

-- Extend helper: admin OR hr for org-structure operations
create or replace function is_admin_or_hr()
returns boolean language sql stable security definer set search_path = public as $$
  select current_role_name() in ('admin', 'hr')
$$;

create or replace function is_org_leader_of(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles me, profiles them
    where me.id = auth.uid()
      and them.id = target
      and me.org_id = them.org_id
      and me.role in ('executive', 'admin', 'hr')
  )
$$;

-- ── profiles: admin/HR manage org members ─────────────────────
drop policy if exists "profiles: admin hr update org members" on profiles;
create policy "profiles: admin hr update org members"
  on profiles for update using (
    is_admin_or_hr() and org_id = current_org()
  );

drop policy if exists "profiles: admin hr read org" on profiles;
create policy "profiles: admin hr read org"
  on profiles for select using (
    org_id = current_org() and current_role_name() in ('admin', 'hr')
  );

-- Former employees: always read own profile (free tier data rights)
-- (existing "profiles: read own" already covers this)

-- ── org_invites ───────────────────────────────────────────────
drop policy if exists "invites: admin hr manage" on org_invites;
create policy "invites: admin hr manage"
  on org_invites for all using (
    org_id = current_org() and is_admin_or_hr()
  ) with check (
    org_id = current_org() and is_admin_or_hr()
  );

-- Invitee can read their pending invite by token via service role / API only

-- ── manager_assignment_requests ───────────────────────────────
drop policy if exists "mgr_req: manager propose" on manager_assignment_requests;
create policy "mgr_req: manager propose"
  on manager_assignment_requests for insert with check (
    requested_by = auth.uid()
    and org_id = current_org()
    and current_role_name() in ('manager', 'executive')
    and exists (
      select 1 from profiles e
      where e.id = employee_id and e.org_id = current_org()
    )
  );

drop policy if exists "mgr_req: read own or admin" on manager_assignment_requests;
create policy "mgr_req: read own or admin"
  on manager_assignment_requests for select using (
    requested_by = auth.uid()
    or (org_id = current_org() and is_admin_or_hr())
    or employee_id = auth.uid()
  );

drop policy if exists "mgr_req: admin hr review" on manager_assignment_requests;
create policy "mgr_req: admin hr review"
  on manager_assignment_requests for update using (
    org_id = current_org() and is_admin_or_hr()
  );

drop policy if exists "mgr_req: requester cancel" on manager_assignment_requests;
create policy "mgr_req: requester cancel"
  on manager_assignment_requests for update using (
    requested_by = auth.uid() and status = 'pending'
  );

-- ── organizations: HR reads billing settings ──────────────────
drop policy if exists "org: hr read billing" on organizations;
create policy "org: hr read billing"
  on organizations for select using (
    id = current_org() and current_role_name() in ('admin', 'hr', 'executive')
  );

drop policy if exists "org: admin hr billing" on organizations;
create policy "org: admin hr billing"
  on organizations for update using (
    id = current_org() and is_admin_or_hr()
  );

-- ── audit: HR can read org audit ──────────────────────────────
drop policy if exists "audit: admin read" on audit_log;
create policy "audit: admin hr read" on audit_log for select
  using (current_role_name() in ('admin', 'hr'));
