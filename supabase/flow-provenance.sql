-- ════════════════════════════════════════════════════════════════
-- Credentia · FLOW — Provenance-Native Work Tracking
--
-- A project-management module that is architecturally distinct from
-- Asana/Monday: every work-item state is recorded at an explicit TRUST
-- TIER, mirroring Credentia's verified-vs-inferred mission.
--
--   ATTESTED  — backed by a linked evidence artifact (merged PR, file,
--               approval, deploy id, webhook). CANNOT exist without an
--               artifact FK. Enforced by CHECK + RPC, not just UI.
--   ASSERTED  — self-reported by the owner. Fast, explicitly unverified.
--               The default tier for any manual status change.
--   INFERRED  — AI output. Lives ONLY in flow_inferences (a physically
--               separate quarantine store). NEVER written to the canonical
--               ledger until a human PROMOTES it (→ ASSERTED, traceable to
--               the originating inference id).
--
-- Provenance is STRUCTURAL, not an enum on one table:
--   • flow_transition_events  — append-only ledger; provenance_tier ∈
--       {ATTESTED, ASSERTED} only. INFERRED can never appear here.
--   • flow_inferences         — the quarantine; the ONLY home of INFERRED.
--   Current state is a PROJECTION over the ledger (view flow_item_state),
--   never a stored status column on the item.
--
-- Additive + idempotent. Safe to re-run. Run AFTER schema.sql +
-- rls-policies.sql (uses current_org(), current_role_name(), current_role_name() = 'superadmin').
-- ════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. BOARDS
-- ──────────────────────────────────────────────────────────────────
create table if not exists flow_boards (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references organizations on delete cascade,
  name                    text not null,
  description             text,
  created_by              uuid references profiles on delete set null,
  sprint_start            date,
  sprint_end              date,
  sprint_points_committed numeric,         -- null ⇒ derive from sum of item estimates
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists flow_boards_org_idx on flow_boards (org_id);

-- ──────────────────────────────────────────────────────────────────
-- 2. COLUMNS — configurable states. Evidence-gating lives here.
--    required_tier = 'ATTESTED'  ⇒ an item may only enter this column via an
--      ATTESTED transition (artifact required). Enforced server-side in the RPC.
--    required_tier = null/'ASSERTED' ⇒ ASSERTED (or better) accepted.
--    is_terminal ⇒ counts as "done" for the burndown.
-- ──────────────────────────────────────────────────────────────────
create table if not exists flow_columns (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references flow_boards on delete cascade,
  org_id        uuid not null references organizations on delete cascade,
  name          text not null,
  sort_order    int  not null default 0,
  is_terminal   boolean not null default false,
  required_tier text check (required_tier in ('ASSERTED', 'ATTESTED')),
  created_at    timestamptz not null default now()
);
create index if not exists flow_columns_board_idx on flow_columns (board_id, sort_order);

-- ──────────────────────────────────────────────────────────────────
-- 3. ITEMS — identity only. NO current-status column: state is derived
--    from the ledger (see view flow_item_state). This keeps the ledger
--    the single source of truth.
-- ──────────────────────────────────────────────────────────────────
create table if not exists flow_items (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations on delete cascade,
  board_id       uuid not null references flow_boards on delete cascade,
  title          text not null,
  description    text,
  point_estimate numeric not null default 1,
  owner_id       uuid references profiles on delete set null,
  created_by     uuid references profiles on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists flow_items_board_idx on flow_items (board_id);
create index if not exists flow_items_org_idx on flow_items (org_id);

-- ──────────────────────────────────────────────────────────────────
-- 4. EVIDENCE ARTIFACTS — what makes a transition ATTESTABLE.
-- ──────────────────────────────────────────────────────────────────
create table if not exists flow_evidence_artifacts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations on delete cascade,
  item_id    uuid references flow_items on delete cascade,
  kind       text not null check (kind in ('merged_pr', 'file', 'approval', 'deploy', 'webhook', 'link')),
  uri        text not null,
  label      text,
  metadata   jsonb not null default '{}'::jsonb,
  added_by   uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists flow_evidence_item_idx on flow_evidence_artifacts (item_id);

-- ──────────────────────────────────────────────────────────────────
-- 5. INFERENCE QUARANTINE — the ONLY home of INFERRED data.
--    Physically decoupled from the canonical ledger. Written ONLY by the
--    service role (server route). No client write path exists. A human
--    promotes a copy into the ledger as ASSERTED via flow_promote_inference().
-- ──────────────────────────────────────────────────────────────────
create table if not exists flow_inferences (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations on delete cascade,
  board_id          uuid references flow_boards on delete cascade,
  item_id           uuid references flow_items on delete cascade,
  kind              text not null check (kind in (
                      'predicted_slip', 'risk_flag', 'dependency_bottleneck', 'status_suggestion')),
  summary           text not null,
  detail            text,
  predicted_value   jsonb not null default '{}'::jsonb,  -- e.g. {"to_column_id": "...", "slip_date": "..."}
  confidence        numeric check (confidence >= 0 and confidence <= 1),
  model             text,
  status            text not null default 'quarantined'
                    check (status in ('quarantined', 'promoted', 'dismissed')),
  promoted_event_id uuid,   -- FK added after the ledger table exists (below)
  promoted_by       uuid references profiles on delete set null,
  promoted_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists flow_inferences_board_idx on flow_inferences (board_id, status);

-- ──────────────────────────────────────────────────────────────────
-- 6. THE LEDGER — append-only. The canonical record of every state change.
--    provenance_tier ∈ {ATTESTED, ASSERTED} ONLY — INFERRED can never land
--    here. ATTESTED requires a non-null artifact (DB CHECK — the hard gate).
--    source_inference_id is set when this row was promoted from an inference.
-- ──────────────────────────────────────────────────────────────────
create table if not exists flow_transition_events (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations on delete cascade,
  item_id            uuid not null references flow_items on delete cascade,
  board_id           uuid not null references flow_boards on delete cascade,
  event_type         text not null check (event_type in ('create', 'status', 'scope', 'assignment', 'tier')),
  provenance_tier    text not null check (provenance_tier in ('ATTESTED', 'ASSERTED')),
  to_column_id       uuid references flow_columns on delete set null,  -- for 'status'/'create'
  artifact_id        uuid references flow_evidence_artifacts on delete restrict,
  source_inference_id uuid references flow_inferences on delete set null,
  actor_id           uuid references profiles on delete set null,
  reason             text,
  prior_value        jsonb,
  new_value          jsonb,
  created_at         timestamptz not null default now(),

  -- THE HARD GATE: an ATTESTED event cannot exist without an artifact.
  constraint flow_attested_needs_artifact
    check (provenance_tier <> 'ATTESTED' or artifact_id is not null)
);
create index if not exists flow_events_item_idx on flow_transition_events (item_id, created_at);
create index if not exists flow_events_board_idx on flow_transition_events (board_id, created_at);

-- Late FK: inference → its promoted ledger event (traceability both ways).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'flow_inferences_promoted_event_fk'
  ) then
    alter table flow_inferences
      add constraint flow_inferences_promoted_event_fk
      foreign key (promoted_event_id) references flow_transition_events on delete set null;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 7. APPEND-ONLY ENFORCEMENT — the ledger may never be updated or deleted.
-- ──────────────────────────────────────────────────────────────────
create or replace function flow_ledger_is_append_only()
returns trigger language plpgsql
set search_path = public
as $$
begin
  raise exception 'flow_transition_events is append-only (% blocked)', tg_op;
end $$;

drop trigger if exists flow_ledger_no_update on flow_transition_events;
create trigger flow_ledger_no_update
  before update or delete on flow_transition_events
  for each row execute function flow_ledger_is_append_only();

-- ──────────────────────────────────────────────────────────────────
-- 8. PROJECTION — current state computed from the ledger (never stored).
--    Latest status/create event per item wins.
-- ──────────────────────────────────────────────────────────────────
create or replace view flow_item_state as
select distinct on (e.item_id)
  e.item_id,
  e.board_id,
  e.to_column_id        as current_column_id,
  e.provenance_tier     as current_tier,
  e.artifact_id         as current_artifact_id,
  e.source_inference_id as current_source_inference_id,
  e.created_at          as as_of
from flow_transition_events e
where e.event_type in ('create', 'status')
order by e.item_id, e.created_at desc, e.id desc;

-- The projection must enforce the QUERYING user's RLS (not the view owner's),
-- or it would leak every org's item state. Requires Postgres 15+.
alter view flow_item_state set (security_invoker = on);

-- ──────────────────────────────────────────────────────────────────
-- 9. RPC — record a transition (the ONLY canonical write path).
--    SECURITY DEFINER, runs as the calling user (auth.uid()). Enforces:
--      • org membership
--      • evidence-gating: a column with required_tier='ATTESTED' may only be
--        entered by an ATTESTED transition carrying an artifact
--      • ATTESTED ⇒ artifact_id present (belt-and-braces with the CHECK)
--    Clients have NO direct INSERT on the ledger — gating cannot be bypassed.
-- ──────────────────────────────────────────────────────────────────
create or replace function flow_record_transition(
  p_item_id            uuid,
  p_event_type         text default 'status',
  p_to_column_id       uuid default null,
  p_provenance_tier    text default 'ASSERTED',
  p_artifact_id        uuid default null,
  p_reason             text default null,
  p_new_value          jsonb default null,
  p_source_inference_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item   flow_items%rowtype;
  v_col    flow_columns%rowtype;
  v_prior  jsonb;
  v_new_id uuid;
begin
  select * into v_item from flow_items where id = p_item_id;
  if not found then raise exception 'flow item % not found', p_item_id; end if;

  -- multi-tenant guard
  if v_item.org_id is distinct from current_org() and not current_role_name() = 'superadmin' then
    raise exception 'not authorized for this org';
  end if;

  if p_provenance_tier not in ('ATTESTED', 'ASSERTED') then
    raise exception 'provenance_tier must be ATTESTED or ASSERTED (INFERRED never enters the ledger)';
  end if;

  -- artifact must belong to the same item/org when supplied
  if p_artifact_id is not null then
    if not exists (
      select 1 from flow_evidence_artifacts a
      where a.id = p_artifact_id and a.org_id = v_item.org_id
    ) then
      raise exception 'artifact % not found in this org', p_artifact_id;
    end if;
  end if;

  if p_provenance_tier = 'ATTESTED' and p_artifact_id is null then
    raise exception 'ATTESTED transitions require an evidence artifact';
  end if;

  -- evidence-gating per target column
  if p_event_type in ('status', 'create') and p_to_column_id is not null then
    select * into v_col from flow_columns where id = p_to_column_id and board_id = v_item.board_id;
    if not found then raise exception 'column % not on this board', p_to_column_id; end if;
    if v_col.required_tier = 'ATTESTED' and (p_provenance_tier <> 'ATTESTED' or p_artifact_id is null) then
      raise exception 'column "%" is ATTESTED-only: attach an evidence artifact to enter it', v_col.name;
    end if;
  end if;

  -- prior state from the projection (for the audit trail)
  select to_jsonb(s) into v_prior from flow_item_state s where s.item_id = p_item_id;

  insert into flow_transition_events (
    org_id, item_id, board_id, event_type, provenance_tier,
    to_column_id, artifact_id, source_inference_id, actor_id, reason, prior_value, new_value
  ) values (
    v_item.org_id, p_item_id, v_item.board_id, p_event_type, p_provenance_tier,
    p_to_column_id, p_artifact_id, p_source_inference_id, auth.uid(), p_reason, v_prior, p_new_value
  )
  returning id into v_new_id;

  return v_new_id;
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 10. RPC — promote a quarantined inference into the ledger as ASSERTED.
--     The ONLY path INFERRED data crosses into the canonical record. The
--     resulting event is ASSERTED (promotion can never fabricate evidence)
--     and is tagged with source_inference_id for traceability.
-- ──────────────────────────────────────────────────────────────────
create or replace function flow_promote_inference(
  p_inference_id uuid,
  p_reason       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inf      flow_inferences%rowtype;
  v_event_id uuid;
  v_to_col   uuid;
  v_type     text;
begin
  select * into v_inf from flow_inferences where id = p_inference_id for update;
  if not found then raise exception 'inference % not found', p_inference_id; end if;

  if v_inf.org_id is distinct from current_org() and not current_role_name() = 'superadmin' then
    raise exception 'not authorized for this org';
  end if;
  if v_inf.status <> 'quarantined' then
    raise exception 'inference % is already %', p_inference_id, v_inf.status;
  end if;
  if v_inf.item_id is null then
    raise exception 'inference % is not attached to an item and cannot be promoted', p_inference_id;
  end if;

  -- A status_suggestion carries a target column; everything else is recorded
  -- as a 'tier' note that captures the (now human-accepted) inference content.
  if v_inf.kind = 'status_suggestion' then
    v_type   := 'status';
    v_to_col := nullif(v_inf.predicted_value->>'to_column_id', '')::uuid;
  else
    v_type   := 'tier';
    v_to_col := null;
  end if;

  v_event_id := flow_record_transition(
    p_item_id            => v_inf.item_id,
    p_event_type         => v_type,
    p_to_column_id       => v_to_col,
    p_provenance_tier    => 'ASSERTED',
    p_artifact_id        => null,
    p_reason             => coalesce(p_reason, 'Promoted from AI inference: ' || v_inf.summary),
    p_new_value          => jsonb_build_object('promoted_summary', v_inf.summary, 'kind', v_inf.kind),
    p_source_inference_id => v_inf.id
  );

  update flow_inferences
     set status = 'promoted', promoted_event_id = v_event_id,
         promoted_by = auth.uid(), promoted_at = now()
   where id = p_inference_id;

  return v_event_id;
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 11. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────────
alter table flow_boards            enable row level security;
alter table flow_columns           enable row level security;
alter table flow_items             enable row level security;
alter table flow_evidence_artifacts enable row level security;
alter table flow_inferences        enable row level security;
alter table flow_transition_events enable row level security;

do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename like 'flow_%'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- helper: is the caller a company user in this org?
-- (reuse current_org()/current_role_name() = 'superadmin' from rls-policies.sql)

-- boards / columns / items / evidence: org members read & write within org.
create policy flow_boards_read on flow_boards for select
  using (org_id = current_org() or current_role_name() = 'superadmin');
create policy flow_boards_write on flow_boards for all
  using (org_id = current_org()) with check (org_id = current_org());

create policy flow_columns_read on flow_columns for select
  using (org_id = current_org() or current_role_name() = 'superadmin');
create policy flow_columns_write on flow_columns for all
  using (org_id = current_org()) with check (org_id = current_org());

create policy flow_items_read on flow_items for select
  using (org_id = current_org() or current_role_name() = 'superadmin');
create policy flow_items_write on flow_items for all
  using (org_id = current_org()) with check (org_id = current_org());

create policy flow_evidence_read on flow_evidence_artifacts for select
  using (org_id = current_org() or current_role_name() = 'superadmin');
create policy flow_evidence_write on flow_evidence_artifacts for all
  using (org_id = current_org()) with check (org_id = current_org());

-- LEDGER: read-only for clients. The ONLY insert path is the SECURITY DEFINER
-- RPC (flow_record_transition / flow_promote_inference). No client INSERT/
-- UPDATE/DELETE policy exists ⇒ gating is unbypassable and append-only holds.
create policy flow_events_read on flow_transition_events for select
  using (org_id = current_org() or current_role_name() = 'superadmin');

-- INFERENCE QUARANTINE: read-only for clients. Writes are service-role only
-- (server route, bypasses RLS). Promotion mutates status via the SECURITY
-- DEFINER RPC. No client write policy exists.
create policy flow_inferences_read on flow_inferences for select
  using (org_id = current_org() or current_role_name() = 'superadmin');

-- Grants: RPCs callable by authenticated users; revoke from anon.
revoke all on function flow_record_transition(uuid, text, uuid, text, uuid, text, jsonb, uuid) from public, anon;
grant execute on function flow_record_transition(uuid, text, uuid, text, uuid, text, jsonb, uuid) to authenticated;
revoke all on function flow_promote_inference(uuid, text) from public, anon;
grant execute on function flow_promote_inference(uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════
-- Done. Next: seed (flow-seed.sql) demonstrates all three tiers and a
-- non-trivial attested-vs-asserted burndown gap.
-- ════════════════════════════════════════════════════════════════
