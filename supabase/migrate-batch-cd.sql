-- Batch C + D schema patches for existing Supabase projects.
-- Run in SQL Editor after migrate-batch-ab.sql.

alter table organizations add column if not exists ai_coaching_enabled boolean not null default true;
alter table organizations add column if not exists promotion_engine_enabled boolean not null default true;
alter table organizations add column if not exists require_proof boolean not null default true;
alter table organizations add column if not exists evaluation_model text not null default 'A';
alter table organizations add column if not exists logo_url text;

alter table organizations drop constraint if exists organizations_evaluation_model_check;
alter table organizations add constraint organizations_evaluation_model_check
  check (evaluation_model in ('A', 'B', 'both'));

alter table achievements add column if not exists contribution_type text not null default 'individual';
alter table achievements add column if not exists submitted_by uuid references profiles on delete set null;
alter table achievements add column if not exists pending_executive boolean not null default false;

alter table achievements drop constraint if exists achievements_contribution_type_check;
alter table achievements add constraint achievements_contribution_type_check
  check (contribution_type in ('individual', 'team'));

create table if not exists removal_requests (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations on delete cascade,
  subject_profile_id  uuid not null references profiles on delete cascade,
  requested_by        uuid not null references profiles on delete cascade,
  reason              text,
  status              text not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected')),
  created_at          timestamptz not null default now()
);
create index if not exists idx_removal_requests_org on removal_requests (org_id, status);

alter table removal_requests enable row level security;
drop policy if exists "removal: requester insert" on removal_requests;
create policy "removal: requester insert" on removal_requests for insert
  with check (requested_by = auth.uid() and org_id = current_org());
drop policy if exists "removal: org read" on removal_requests;
create policy "removal: org read" on removal_requests for select
  using (org_id = current_org());
drop policy if exists "removal: admin update" on removal_requests;
create policy "removal: admin update" on removal_requests for update
  using (is_org_admin());
drop policy if exists "removal: admin delete profile via request" on removal_requests;
create policy "removal: admin delete profile via request" on removal_requests for delete
  using (is_org_admin());
