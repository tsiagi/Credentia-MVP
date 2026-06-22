-- ════════════════════════════════════════════════════════════════
-- Core-Roborate — Task & Project Engine · Verified Documentation ·
--             Messaging · Scout Agents
-- Additive migration. Run AFTER schema.sql + rls-policies.sql +
-- provisioning-lifecycle.sql + daily-pulse-tasks.sql.
--
-- CORE PRINCIPLE (never violated here):
--   VERIFIED facts (blue / shield) and AI INFERENCES (amber / sparkle)
--   live in SEPARATE tables and are never co-mingled.
--     • verified_tasks ........ human-owned / human-approved (blue)
--     • ai_inference_tasks .... model-suggested sub-tasks (amber), server-
--                               written only, pending until a human approves
--     • documentation ......... neutral until a manager+ verifies → blue
--     • agent_memory .......... TRAINING data = verified facts only (blue);
--                               the agent's OUTPUTS are AI inference (amber)
--                               and are never persisted as verified.
--
-- NAMING NOTE: a `projects` table already exists (verified project OUTCOMES
-- with revenue_impact, tied to a profile). The new Jira/Monday-style project
-- CONTAINER is therefore named `work_projects` to avoid clobbering it.
-- ════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- Shared helper — conversation participant check (security definer
-- so message/conversation policies stay short, mirrors is_manager_of).
-- Defined up-front; the table it reads is created just below.
-- ──────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- FEATURE 1 — TASK & PROJECT MANAGEMENT ENGINE
-- ════════════════════════════════════════════════════════════════

-- PROJECT CONTAINER (Jira/Monday-style board owner) ───────────────
create table if not exists work_projects (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations on delete cascade,
  name         text not null,
  description  text,
  owner_id     uuid not null references profiles on delete cascade,  -- creator (manager or IC)
  team_lead_id uuid references profiles on delete set null,          -- manager the board belongs to
  status       text not null default 'active'
               check (status in ('active', 'archived', 'completed')),
  color        text,                                                 -- UI accent (token name or hex)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_work_projects_org   on work_projects (org_id, status);
create index if not exists idx_work_projects_owner on work_projects (owner_id);

comment on table work_projects is
  'Operational PM container (Jira/Monday-style). Distinct from `projects` (verified outcomes).';

-- VERIFIED TASKS (human-owned / human-approved — the BLUE layer) ──
create table if not exists verified_tasks (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations on delete cascade,
  project_id         uuid references work_projects on delete cascade,        -- null = standalone personal task
  parent_task_id     uuid references verified_tasks on delete cascade,       -- sub-task tree
  title              text not null,
  detail             text,
  assignee_id        uuid references profiles on delete set null,
  created_by         uuid references profiles on delete set null,
  status             text not null default 'todo'
                     check (status in ('todo', 'in_progress', 'blocked', 'done')),
  priority           text not null default 'medium'
                     check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date           date,
  -- Provenance: 'human' authored, or 'ai_approved' (promoted from an AI suggestion).
  origin             text not null default 'human'
                     check (origin in ('human', 'ai_approved')),
  source_inference_id uuid,                                                  -- ai_inference_tasks row it was promoted from
  completed_at       timestamptz,
  frozen_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_vtasks_project  on verified_tasks (project_id, status);
create index if not exists idx_vtasks_assignee on verified_tasks (assignee_id, status);
create index if not exists idx_vtasks_parent   on verified_tasks (parent_task_id);

comment on table verified_tasks is
  'VERIFIED (blue) task layer — human-authored or human-approved. AI suggestions never land here directly.';

-- AI-INFERENCE TASKS (model-suggested sub-tasks — the AMBER layer) ─
-- Server-written only (service role). No client INSERT policy, mirroring
-- ai_inference_reports. Stay `pending` until a human approves → promoted
-- into verified_tasks. This is the hard wall between AI suggestion and fact.
create table if not exists ai_inference_tasks (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations on delete cascade,
  project_id       uuid references work_projects on delete cascade,
  parent_task_id   uuid not null references verified_tasks on delete cascade, -- the task the model broke down
  suggested_for    uuid references profiles on delete set null,               -- proposed assignee
  title            text not null,
  detail           text,
  rationale        text,                                                      -- why the model suggested it
  sequence         smallint not null default 0,                              -- ordering within a breakdown
  confidence       numeric check (confidence between 0 and 1),
  model            text,
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected')),
  reviewed_by      uuid references profiles on delete set null,
  reviewed_at      timestamptz,
  approved_task_id uuid references verified_tasks on delete set null,         -- the verified_task it became
  generated_by     uuid references profiles on delete set null,              -- actor who triggered generation
  created_at       timestamptz not null default now()
);
create index if not exists idx_aitasks_parent  on ai_inference_tasks (parent_task_id, status);
create index if not exists idx_aitasks_subject on ai_inference_tasks (suggested_for, status);

comment on table ai_inference_tasks is
  'AI INFERENCE (amber) — model-suggested sub-tasks. Server-written only; advisory until a human approves.';

-- ════════════════════════════════════════════════════════════════
-- FEATURE 2 — VERIFIED DOCUMENTATION REPOSITORY
-- Neutral while draft; a manager/admin/superadmin verification gate
-- (enforced by trigger below) promotes it to the BLUE verified graph.
-- ════════════════════════════════════════════════════════════════
create table if not exists documentation (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references organizations on delete cascade,
  title                  text not null,
  body                   text not null,
  doc_type               text not null default 'guide'
                         check (doc_type in ('guide', 'task_outcome', 'conversation_summary', 'reference')),
  author_id              uuid references profiles on delete set null,
  -- 'org' = all company members · 'managers' = manager+ only · 'private' = author only.
  -- 'managers' visibility is what keeps an employee's agent from learning manager-only docs.
  visibility             text not null default 'org'
                         check (visibility in ('org', 'managers', 'private')),
  status                 text not null default 'draft'
                         check (status in ('draft', 'verified', 'archived')),
  verified_by            uuid references profiles on delete set null,
  verified_at            timestamptz,
  source_task_id         uuid references verified_tasks on delete set null,
  source_conversation_id uuid,                                                -- references conversations (declared below)
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_docs_org_status on documentation (org_id, status);
create index if not exists idx_docs_author     on documentation (author_id);

comment on table documentation is
  'Knowledge repository. Draft = neutral; status=verified (manager+ only, gated by trigger) = BLUE verified fact.';

-- ════════════════════════════════════════════════════════════════
-- FEATURE 3 — CONVERSATIONS & MESSAGING
-- Direct (user↔user) or task threads. Each message carries an explicit
-- "Save to Agent Memory" flag ("Off the Record" = false).
-- ════════════════════════════════════════════════════════════════
create table if not exists conversations (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations on delete cascade,
  kind                 text not null default 'direct'
                       check (kind in ('direct', 'task')),
  title                text,
  task_id              uuid references verified_tasks on delete cascade,      -- set for task threads
  created_by           uuid references profiles on delete set null,
  agent_memory_default boolean not null default false,                       -- thread-level default for new messages
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_conversations_org  on conversations (org_id);
create index if not exists idx_conversations_task on conversations (task_id);

create table if not exists conversation_participants (
  conversation_id uuid not null references conversations on delete cascade,
  profile_id      uuid not null references profiles on delete cascade,
  added_at        timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table if not exists messages (
  id                   uuid primary key default gen_random_uuid(),
  conversation_id      uuid not null references conversations on delete cascade,
  org_id               uuid not null references organizations on delete cascade,
  sender_id            uuid references profiles on delete set null,
  body                 text not null,
  -- "Save to Agent Memory" (true) vs "Off the Record" (false). Only true
  -- messages are eligible to become agent_memory (and only the SENDER's agent).
  save_to_agent_memory boolean not null default false,
  created_at           timestamptz not null default now()
);
create index if not exists idx_messages_conversation on messages (conversation_id, created_at);

comment on column messages.save_to_agent_memory is
  'true = eligible for the sender''s Scout memory; false = Off the Record, never learned.';

-- Participant check — declared after the table exists so it can read it.
create or replace function is_conversation_participant(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_participants p
    where p.conversation_id = cid and p.profile_id = auth.uid()
  )
$$;

-- ════════════════════════════════════════════════════════════════
-- FEATURE 4 — DIGITAL-TWIN AGENTS
-- One agent per user. agent_memory holds ONLY verified training facts
-- (blue). Agent OUTPUTS are AI inference (amber) — rendered as such in
-- the UI and never written here. RLS keeps memory owner-only; ingestion
-- (the only writer) is server-side and re-checks org + role access.
-- ════════════════════════════════════════════════════════════════
create table if not exists user_agents (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references profiles on delete cascade,
  org_id              uuid not null references organizations on delete cascade,
  name                text not null default 'My Scout',
  persona             text,
  enabled             boolean not null default true,
  learn_from_tasks    boolean not null default true,
  learn_from_docs     boolean not null default true,
  learn_from_messages boolean not null default true,
  config              jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (owner_id)                                                          -- exactly one agent per user
);

create table if not exists agent_memory (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references user_agents on delete cascade,
  owner_id    uuid not null references profiles on delete cascade,          -- denormalised for RLS
  org_id      uuid not null references organizations on delete cascade,
  source_type text not null check (source_type in ('verified_task', 'documentation', 'message')),
  source_id   uuid,
  content     text not null,                                                -- distilled verified fact learned
  embedding   jsonb,                                                        -- optional float[] (avoids pgvector dependency)
  created_at  timestamptz not null default now(),
  unique (agent_id, source_type, source_id)                                 -- idempotent ingestion
);
create index if not exists idx_agent_memory_owner on agent_memory (owner_id, source_type);

comment on table agent_memory is
  'Scout TRAINING data — VERIFIED facts only (blue). Server-written; owner-only read. Agent outputs (amber) are never stored here.';

-- ════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- Freeze approved verified tasks on employment end (reuse the shared guard).
drop trigger if exists trg_verified_tasks_frozen on verified_tasks;
create trigger trg_verified_tasks_frozen
  before update or delete on verified_tasks for each row execute function guard_frozen_verified_record();

-- Keep updated_at fresh on the mutable operational tables.
create or replace function touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_work_projects_touch on work_projects;
create trigger trg_work_projects_touch before update on work_projects
  for each row execute function touch_updated_at();
drop trigger if exists trg_conversations_touch on conversations;
create trigger trg_conversations_touch before update on conversations
  for each row execute function touch_updated_at();
drop trigger if exists trg_user_agents_touch on user_agents;
create trigger trg_user_agents_touch before update on user_agents
  for each row execute function touch_updated_at();

-- DOCUMENTATION VERIFICATION GATE — only manager/exec/admin/hr/superadmin
-- may move a doc to status='verified'. Stamps verified_by/_at automatically
-- and forbids un-verifying by a non-privileged author. RLS row access is not
-- enough here (it is column/transition logic), so enforce in a trigger —
-- the same approach schema.sql uses for sensitive profile columns.
create or replace function guard_doc_verification()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_role text;
begin
  if auth.uid() is null then
    return new;                                            -- service role / migrations
  end if;
  select role into actor_role from profiles where id = auth.uid();

  -- Becoming verified (insert or update transition)
  if new.status = 'verified'
     and (tg_op = 'INSERT' or old.status is distinct from 'verified') then
    if actor_role not in ('manager', 'executive', 'admin', 'hr', 'superadmin') then
      raise exception 'Only a manager, admin, or superadmin can verify documentation';
    end if;
    new.verified_by := auth.uid();
    new.verified_at := now();
  end if;

  -- Leaving verified resets the attestation stamp.
  if tg_op = 'UPDATE' and old.status = 'verified' and new.status <> 'verified' then
    new.verified_by := null;
    new.verified_at := null;
  end if;

  return new;
end;
$$;
drop trigger if exists trg_doc_verification on documentation;
create trigger trg_doc_verification
  before insert or update on documentation for each row execute function guard_doc_verification();

-- ════════════════════════════════════════════════════════════════
-- COMPATIBILITY HELPER — is_company_user()
-- Some environments predate this helper (defined canonically in
-- rls-policies.sql). Define it idempotently so this migration is
-- self-contained; the body matches the canonical definition and only
-- depends on current_role_name() + current_org(), which already exist.
-- ════════════════════════════════════════════════════════════════
create or replace function is_company_user()
returns boolean language sql stable security definer set search_path = public as $$
  select current_role_name() in ('employee', 'manager', 'executive', 'admin', 'hr')
    and current_org() is not null
$$;

-- ════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════
alter table work_projects             enable row level security;
alter table verified_tasks            enable row level security;
alter table ai_inference_tasks        enable row level security;
alter table documentation             enable row level security;
alter table conversations             enable row level security;
alter table conversation_participants enable row level security;
alter table messages                  enable row level security;
alter table user_agents               enable row level security;
alter table agent_memory              enable row level security;

-- ── WORK PROJECTS ───────────────────────────────────────────────
drop policy if exists "wp: owner all" on work_projects;
create policy "wp: owner all" on work_projects for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and org_id = current_org());
drop policy if exists "wp: team lead manage" on work_projects;
create policy "wp: team lead manage" on work_projects for all
  using (team_lead_id = auth.uid())
  with check (org_id = current_org());
drop policy if exists "wp: leader read" on work_projects;
create policy "wp: leader read" on work_projects for select
  using (is_org_leader_of(owner_id));
drop policy if exists "wp: member read" on work_projects;
create policy "wp: member read" on work_projects for select
  using (exists (
    select 1 from verified_tasks t
    where t.project_id = work_projects.id and t.assignee_id = auth.uid()
  ));

-- ── VERIFIED TASKS ──────────────────────────────────────────────
-- SECURITY REVIEW NOTE (audit #11): an assignee may freely create/complete
-- their own verified_tasks. This is intentional and NOT a self-attestation
-- hole: "verified_tasks" is the canonical TASK LEDGER (the real-work counterpart
-- to ai_inference_tasks), with operational status (todo/in_progress/blocked/
-- done) — it has NO verification_level and is never rendered as a verified
-- CREDENTIAL. Self-completed tasks only (a) appear on the task board, and
-- (b) feed the owner's PRIVATE Scout (agent_memory, owner-only read),
-- whose output is always labeled AI inference. A task becomes a blue verified
-- credential ONLY via manager promotion into an L2 achievement
-- ("ach: manager insert from task" / lib/projects.ts promoteTaskToAchievement),
-- which is the human attestation. So no client write here can masquerade as a
-- verified fact to anyone else.
drop policy if exists "vt: assignee all" on verified_tasks;
create policy "vt: assignee all" on verified_tasks for all
  using (assignee_id = auth.uid())
  with check (assignee_id = auth.uid() and org_id = current_org());
drop policy if exists "vt: creator all" on verified_tasks;
create policy "vt: creator all" on verified_tasks for all
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and org_id = current_org());
drop policy if exists "vt: manager manage" on verified_tasks;
create policy "vt: manager manage" on verified_tasks for all
  using (is_manager_of(assignee_id))
  with check (is_manager_of(assignee_id) and org_id = current_org());
drop policy if exists "vt: leader read" on verified_tasks;
create policy "vt: leader read" on verified_tasks for select
  using (is_org_leader_of(assignee_id));
-- project owner/lead can read the whole board
drop policy if exists "vt: project owner read" on verified_tasks;
create policy "vt: project owner read" on verified_tasks for select
  using (exists (
    select 1 from work_projects p
    where p.id = verified_tasks.project_id
      and (p.owner_id = auth.uid() or p.team_lead_id = auth.uid())
  ));

-- ── AI INFERENCE TASKS (amber) ──────────────────────────────────
-- NO insert policy: writes are service-role only (server AI route).
drop policy if exists "ait: subject read" on ai_inference_tasks;
create policy "ait: subject read" on ai_inference_tasks for select
  using (suggested_for = auth.uid() or generated_by = auth.uid());
drop policy if exists "ait: manager read" on ai_inference_tasks;
create policy "ait: manager read" on ai_inference_tasks for select
  using (is_manager_of(suggested_for));
drop policy if exists "ait: leader read" on ai_inference_tasks;
create policy "ait: leader read" on ai_inference_tasks for select
  using (is_org_leader_of(suggested_for));
-- Approve / reject (status + review stamp). The subject or their manager may act.
drop policy if exists "ait: subject review" on ai_inference_tasks;
create policy "ait: subject review" on ai_inference_tasks for update
  using (suggested_for = auth.uid())
  with check (suggested_for = auth.uid());
drop policy if exists "ait: manager review" on ai_inference_tasks;
create policy "ait: manager review" on ai_inference_tasks for update
  using (is_manager_of(suggested_for))
  with check (is_manager_of(suggested_for));

-- ── DOCUMENTATION ───────────────────────────────────────────────
drop policy if exists "doc: author all" on documentation;
create policy "doc: author all" on documentation for all
  using (author_id = auth.uid())
  with check (author_id = auth.uid() and org_id = current_org());
drop policy if exists "doc: org read" on documentation;
create policy "doc: org read" on documentation for select
  using (org_id = current_org() and is_company_user() and visibility = 'org');
drop policy if exists "doc: managers read" on documentation;
create policy "doc: managers read" on documentation for select
  using (org_id = current_org() and visibility = 'managers'
         and current_role_name() in ('manager', 'executive', 'admin', 'hr'));
-- Managers/admins may update any org doc (to verify it; trigger gates the transition).
drop policy if exists "doc: manager verify" on documentation;
create policy "doc: manager verify" on documentation for update
  using (org_id = current_org() and current_role_name() in ('manager', 'executive', 'admin', 'hr'))
  with check (org_id = current_org());
drop policy if exists "doc: leader read" on documentation;
create policy "doc: leader read" on documentation for select
  using (is_org_leader_of(author_id));

-- ── CONVERSATIONS / PARTICIPANTS / MESSAGES ─────────────────────
drop policy if exists "conv: participant read" on conversations;
create policy "conv: participant read" on conversations for select
  using (is_conversation_participant(id));
-- Creator can always read their own conversation. Needed so INSERT ... RETURNING
-- works before participant rows are added (and survives participant churn).
drop policy if exists "conv: creator read" on conversations;
create policy "conv: creator read" on conversations for select
  using (created_by = auth.uid());
drop policy if exists "conv: creator insert" on conversations;
create policy "conv: creator insert" on conversations for insert
  with check (created_by = auth.uid() and org_id = current_org());
drop policy if exists "conv: participant update" on conversations;
create policy "conv: participant update" on conversations for update
  using (is_conversation_participant(id))
  with check (org_id = current_org());

drop policy if exists "cpart: participant read" on conversation_participants;
create policy "cpart: participant read" on conversation_participants for select
  using (profile_id = auth.uid() or is_conversation_participant(conversation_id));
drop policy if exists "cpart: creator add" on conversation_participants;
create policy "cpart: creator add" on conversation_participants for insert
  with check (exists (
    select 1 from conversations c
    where c.id = conversation_id
      and (c.created_by = auth.uid() or is_conversation_participant(c.id))
  ));
drop policy if exists "cpart: self remove" on conversation_participants;
create policy "cpart: self remove" on conversation_participants for delete
  using (profile_id = auth.uid());

drop policy if exists "msg: participant read" on messages;
create policy "msg: participant read" on messages for select
  using (is_conversation_participant(conversation_id));
drop policy if exists "msg: participant send" on messages;
create policy "msg: participant send" on messages for insert
  with check (sender_id = auth.uid()
              and org_id = current_org()
              and is_conversation_participant(conversation_id));

-- ── USER AGENTS ─────────────────────────────────────────────────
drop policy if exists "ua: owner all" on user_agents;
create policy "ua: owner all" on user_agents for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and org_id = current_org());

-- ── AGENT MEMORY ────────────────────────────────────────────────
-- Owner-only read; owner may "forget" (delete). INSERT/UPDATE are service-
-- role only — server ingestion is the sole writer and re-checks that each
-- source is verified AND accessible to the owner's role before learning it.
drop policy if exists "am: owner read" on agent_memory;
create policy "am: owner read" on agent_memory for select
  using (owner_id = auth.uid());
drop policy if exists "am: owner forget" on agent_memory;
create policy "am: owner forget" on agent_memory for delete
  using (owner_id = auth.uid());

-- ════════════════════════════════════════════════════════════════
-- Late FK: documentation.source_conversation_id → conversations
-- (added now that conversations exists).
-- ════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'documentation_source_conversation_fk'
  ) then
    alter table documentation
      add constraint documentation_source_conversation_fk
      foreign key (source_conversation_id) references conversations on delete set null;
  end if;
end $$;
