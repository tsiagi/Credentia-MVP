-- Batch A + B schema patches for existing Supabase projects.
-- Run in SQL Editor after schema.sql baseline.

alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists theme_color text default '#0f6e5c';
alter table profiles add column if not exists hire_date date;

alter table verification_requests add column if not exists item_type text not null default 'role';
alter table verification_requests add column if not exists item_label text not null default '';
alter table verification_requests add column if not exists item_ref_id uuid;

-- Backfill item_label for legacy rows
update verification_requests set item_label = 'Past employment' where item_label = '';

alter table verification_requests drop constraint if exists verification_requests_item_type_check;
alter table verification_requests add constraint verification_requests_item_type_check
  check (item_type in ('role', 'achievement'));

create table if not exists shareable_links (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles on delete cascade,
  token       text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at  timestamptz not null default now(),
  revoked     boolean not null default false
);
create index if not exists idx_shareable_links_profile on shareable_links (profile_id);
create index if not exists idx_shareable_links_token on shareable_links (token) where revoked = false;

alter table shareable_links enable row level security;
drop policy if exists "share: owner all" on shareable_links;
create policy "share: owner all" on shareable_links for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Then run supabase/shareable-public.sql for the public RPC.
