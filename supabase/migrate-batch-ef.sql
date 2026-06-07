-- Batch E (12c–12d): org billing fields + billing_events ledger + RLS.
-- Run in SQL Editor after migrate-batch-cd.sql.

alter table organizations add column if not exists trial_starts_at timestamptz;
alter table organizations add column if not exists trial_ends_at timestamptz;
alter table organizations add column if not exists billing_status text not null default 'trial';
alter table organizations add column if not exists monthly_price numeric;
alter table organizations add column if not exists seats integer;
alter table organizations add column if not exists billing_notes text;

alter table organizations drop constraint if exists organizations_billing_status_check;
alter table organizations add constraint organizations_billing_status_check
  check (billing_status in ('trial', 'active', 'past_due', 'canceled'));

create table if not exists billing_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations on delete cascade,
  type        text not null
              check (type in ('trial_started', 'trial_extended', 'trial_ended', 'plan_set', 'charge_mocked', 'canceled')),
  amount      numeric,
  created_by  uuid references profiles on delete set null,
  created_at  timestamptz not null default now(),
  detail      jsonb not null default '{}'
);
create index if not exists idx_billing_events_org on billing_events (org_id, created_at desc);

alter table billing_events enable row level security;

-- Replace broad admin manage with settings-only update + billing guard trigger.
drop policy if exists "org: admin manage" on organizations;
drop policy if exists "org: admin update settings" on organizations;
drop policy if exists "org: admin insert" on organizations;
drop policy if exists "org: admin read billing summary" on organizations;

create policy "org: admin update settings" on organizations for update
  using (id = current_org() and is_org_admin())
  with check (id = current_org() and is_org_admin());

create policy "org: admin insert" on organizations for insert
  with check (is_org_admin() and id = current_org());

create policy "org: admin read billing summary" on organizations for select
  using (id = current_org() and is_org_admin());

drop policy if exists "billing_events: superadmin all" on billing_events;
create policy "billing_events: superadmin all" on billing_events for all
  using (is_superadmin()) with check (is_superadmin());

create or replace function guard_org_billing_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_superadmin() then
    return new;
  end if;
  if new.billing_status is distinct from old.billing_status
     or new.trial_starts_at is distinct from old.trial_starts_at
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.monthly_price is distinct from old.monthly_price
     or new.seats is distinct from old.seats
     or new.billing_notes is distinct from old.billing_notes then
    raise exception 'Only platform operators can change billing fields';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_org_billing on organizations;
create trigger trg_guard_org_billing
  before update on organizations for each row execute function guard_org_billing_columns();
