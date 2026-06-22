-- ════════════════════════════════════════════════════════════════
-- Core-Roborate — Continuous Verification Pipeline (VP-1, additive staging)
--
-- Additive, idempotent migration. Run AFTER:
--   schema.sql + rls-policies.sql + provisioning-rls.sql
--   + task-knowledge-agent.sql + task-verification-bridge.sql
--
-- VP-1 SCOPE (schema + RLS only; NO promotion logic, NO model calls):
--   • Staging / evidence / oversight tables (all AMBER, never verified):
--       ingestion_events, verification_candidates, candidate_evidence,
--       overseer_rules, overseer_rule_versions, overseer_shadow_decisions
--   • documentation.ai_ingest_state gate COLUMN only (no trigger yet — VP-4)
--   • RLS on every new table (org_id-scoped via current_org()).
--
-- CORE PRINCIPLE (never violated here):
--   VERIFIED facts (blue / shield, verified_*) and STAGING / AI inference
--   (amber / sparkle, this file) live in SEPARATE tables and are never
--   co-mingled. NOTHING in this file ever writes a verified_* row.
--
--   • verification_candidates ... proposed-but-not-true claims (AMBER).
--                                 Server-written only. The ONLY exit to a
--                                 verified_* row is promote_candidate(),
--                                 which is NOT built here (VP-5). No client
--                                 may set state='attested'.
--   • ingestion_events ......... provenance + consent root (one row per
--                                 raw evidence item). Never a verified fact.
--   • candidate_evidence ....... M:N provenance graph candidate ↔ evidence.
--   • overseer_* ............... oversight/learning surface. Dormant in VP-1
--                                 (nothing populates it yet).
--
-- Helpers reused VERBATIM from the existing schema (do not redefine):
--   current_org(), current_role_name(), is_manager_of(), is_org_leader_of(),
--   is_company_user(). audit_log(actor_id, action, target_table, target_id,
--   changes) is written by the server/client app code, not by this DDL.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- §2.1 — Evidence ingestion log (consent + provenance anchor)
-- ════════════════════════════════════════════════════════════════
-- Every piece of raw evidence that ENTERS the pipeline is recorded once here,
-- with the legal/consent basis under which it was ingested. This is the
-- provenance root: every candidate traces to one or more ingestion_events.
create table if not exists ingestion_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations on delete cascade,
  subject_id    uuid references profiles on delete set null,   -- whose record this is evidence about
  source_type   text not null
                check (source_type in ('documentation', 'message', 'verified_task', 'kpi', 'project')),
  source_id     uuid not null,                                 -- the source row id
  -- Consent / legal basis the ingestion relied on (mechanic 3).
  consent_basis text not null
                check (consent_basis in ('org_policy', 'explicit_opt_in', 'task_context', 'doc_submission')),
  redacted      boolean not null default false,                -- true if employee exercised content-suppression
  ingested_by   uuid references profiles on delete set null,   -- actor or null = automated/system
  created_at    timestamptz not null default now(),
  unique (org_id, source_type, source_id)                      -- idempotent ingestion
);
create index if not exists idx_ingestion_org on ingestion_events (org_id, source_type);
comment on table ingestion_events is
  'Provenance + consent root. One row per raw evidence item entering the pipeline. Never a verified fact.';

-- ════════════════════════════════════════════════════════════════
-- §2.2 — Verification candidates (the AMBER staging area)
-- ════════════════════════════════════════════════════════════════
-- A proposed-but-not-yet-true claim about a person. AMBER. Server-written only.
-- The ONLY path out of this table to a verified_* row is promote_candidate()
-- (built in VP-5). No client may set state='attested'.
create table if not exists verification_candidates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations on delete cascade,
  subject_id    uuid not null references profiles on delete cascade,   -- the person the claim is about
  -- What kind of verified record this would become if promoted.
  target_kind   text not null
                check (target_kind in ('verified_fact', 'achievement', 'verified_task', 'kpi', 'project', 'documentation')),
  claim         text not null,                                         -- human-readable proposed claim
  payload       jsonb not null default '{}',                           -- fields to write on promotion (kind/label/etc.)
  -- State machine (§4.1). Candidates are amber in EVERY state. attested is
  -- reachable ONLY via promote_candidate() (VP-5) — never by a client.
  state         text not null default 'pending'
                check (state in ('pending', 'shadow_approved', 'attested', 'rejected', 'superseded')),
  confidence    numeric check (confidence between 0 and 1),            -- model's self-estimate (advisory; never shown numerically)
  model         text,                                                  -- model id that proposed it (null = deterministic)
  -- Promotion bookkeeping (mirrors ai_inference_tasks.approved_task_id).
  promoted_table text,                                                 -- e.g. 'verified_facts'
  promoted_id    uuid,                                                 -- the blue row it became
  attested_by   uuid references profiles on delete set null,          -- HUMAN attestor, or rule's enabler
  attested_at   timestamptz,
  attest_method text check (attest_method in ('human', 'overseer_rule')),
  attest_rule_version_id uuid,                                         -- FK added late (§2.7 → overseer_rule_versions)
  rejected_by   uuid references profiles on delete set null,
  rejected_reason text,
  generated_by  uuid references profiles on delete set null,          -- actor who triggered staging (null = system)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_vc_subject_state on verification_candidates (subject_id, state);
create index if not exists idx_vc_org_state     on verification_candidates (org_id, state);
comment on table verification_candidates is
  'AI INFERENCE / staging (amber). Proposed claims. NEVER displayed or returned as verified. Only promote_candidate() exits to verified_*.';

-- ════════════════════════════════════════════════════════════════
-- §2.3 — Candidate → evidence links (provenance preserved end-to-end)
-- ════════════════════════════════════════════════════════════════
-- M:N: each candidate cites the evidence that supports it. Lets the Passport
-- and audit trail show "this attested fact came from these tasks/messages/docs."
create table if not exists candidate_evidence (
  candidate_id  uuid not null references verification_candidates on delete cascade,
  ingestion_id  uuid not null references ingestion_events on delete cascade,
  weight        numeric check (weight between 0 and 1),   -- how much this evidence supported the claim
  note          text,
  primary key (candidate_id, ingestion_id)
);
comment on table candidate_evidence is
  'Provenance graph: candidate ↔ evidence. Read-only proof for review + Passport + audit.';

-- ════════════════════════════════════════════════════════════════
-- §2.4 — Knowledge document verification gate (COLUMN ONLY in VP-1)
-- ════════════════════════════════════════════════════════════════
-- documentation already has status in ('draft','verified','archived') gated by
-- guard_doc_verification(). We ADD an explicit eligibility column so an
-- unverified doc can NEVER be model-input context (mechanic 2). Eligibility is
-- a stricter, separate concept from "verified" so a doc can be human-readable
-- yet still blocked from AI ingestion until cleared.
--
-- VP-1: COLUMN ONLY. The transition enforcement (extending
-- guard_doc_verification) and the context-assembly filter land in VP-4.
alter table documentation
  add column if not exists ai_ingest_state text not null default 'blocked'
    check (ai_ingest_state in ('blocked', 'staged', 'cleared', 'quarantined'));
comment on column documentation.ai_ingest_state is
  'AI-input gate. blocked = never eligible as model context. cleared = passed staging gate AND status=verified. Only cleared docs may enter agent_memory or any prompt. Enforcement trigger arrives in VP-4.';

-- ════════════════════════════════════════════════════════════════
-- §2.5 — Overseer rules + versions (continual codes as DATA)
-- ════════════════════════════════════════════════════════════════
-- A "continual code": a versioned, org-scoped, auditable automated decision rule
-- the Overseer learns from observed human approvals. The rule LOGIC lives in a
-- structured, inspectable payload — NOT free-floating model prose treated as truth.
-- Dormant in VP-1 (nothing populates these yet; CRUD/runner arrive in VP-6).
create table if not exists overseer_rules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations on delete cascade,
  name          text not null,
  target_kind   text not null,                              -- which candidate kind it can act on
  scope         text not null default 'team'
                check (scope in ('team', 'department', 'org')),
  scope_subject uuid references profiles on delete set null, -- manager/dept lead the rule acts for
  -- Lifecycle. A rule NEVER auto-promotes until it is 'active' AND human-enabled.
  lifecycle     text not null default 'shadow'
                check (lifecycle in ('draft', 'shadow', 'active', 'paused', 'retired')),
  enabled_by    uuid references profiles on delete set null, -- human who flipped shadow→active (kill-switch owner)
  enabled_at    timestamptz,
  active_version_id uuid,                                    -- FK to overseer_rule_versions (§2.7, late-added)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_overseer_rules_org on overseer_rules (org_id, lifecycle);
comment on table overseer_rules is
  'Overseer "continual codes": versioned automated approval logic, org-scoped, auditable. Auto-promotes ONLY when lifecycle=active AND human-enabled.';

-- Immutable versions. Editing a rule = new version. The active_version_id pins
-- exactly which logic is live; every auto-promotion records the version it used.
create table if not exists overseer_rule_versions (
  id            uuid primary key default gen_random_uuid(),
  rule_id       uuid not null references overseer_rules on delete cascade,
  org_id        uuid not null references organizations on delete cascade,
  version       integer not null,
  -- Structured, inspectable decision logic (predicates over candidate fields,
  -- confidence floor, evidence requirements). NOT prose. e.g.
  -- { "min_confidence": 0.9, "require_evidence_types": ["verified_task"],
  --   "max_claim_level": 2, "predicates": [...] }
  logic         jsonb not null,
  -- The model's natural-language justification for proposing this rule, kept for
  -- the human reviewer — advisory context only, never executed.
  rationale     text,
  -- Shadow performance gate (§6.2): agreement rate vs humans before enablement.
  shadow_agreement_rate numeric check (shadow_agreement_rate between 0 and 1),
  shadow_sample_size    integer not null default 0,
  proposed_by   uuid references profiles on delete set null,  -- null = Overseer/system
  approved_by   uuid references profiles on delete set null,  -- human who approved THIS version
  created_at    timestamptz not null default now(),
  unique (rule_id, version)
);
comment on table overseer_rule_versions is
  'Immutable rule logic versions. logic = structured predicates (inspectable). Every auto-promotion cites a version id.';

-- ════════════════════════════════════════════════════════════════
-- §2.6 — Shadow decision log (proof-of-context, hard gate)
-- ════════════════════════════════════════════════════════════════
-- Before any rule auto-approves, it runs in SHADOW: it records its PROPOSED
-- decision + the context/reasoning that justifies it, and (when known) the
-- HUMAN's actual decision on the same candidate, so agreement can be measured.
-- Dormant in VP-1.
create table if not exists overseer_shadow_decisions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations on delete cascade,
  rule_id         uuid not null references overseer_rules on delete cascade,
  rule_version_id uuid not null references overseer_rule_versions on delete cascade,
  candidate_id    uuid not null references verification_candidates on delete cascade,
  proposed_action text not null check (proposed_action in ('approve', 'reject', 'abstain')),
  -- PROOF-OF-CONTEXT: the exact inputs + reasoning the Overseer used. Auditable,
  -- replayable, shown to the human. This is what makes the shadow check meaningful.
  proof_of_context jsonb not null,    -- { evidence_ids:[], confidence, matched_predicates:[], reasoning:"" }
  -- Filled in when the human decides (or when the candidate is later promoted/rejected).
  human_action    text check (human_action in ('approve', 'reject', 'pending')),
  agreed          boolean,            -- proposed_action == human_action
  was_enacted     boolean not null default false,  -- true only if rule was active and auto-promoted
  created_at      timestamptz not null default now()
);
create index if not exists idx_shadow_rule on overseer_shadow_decisions (rule_id, created_at desc);
create index if not exists idx_shadow_candidate on overseer_shadow_decisions (candidate_id);
comment on table overseer_shadow_decisions is
  'Proof-of-context ledger. Every Overseer decision (shadow or enacted) recorded with its reasoning and measured against the human decision.';

-- ════════════════════════════════════════════════════════════════
-- §2.7 — Late FKs (added once the version table exists)
-- ════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vc_attest_rule_version_fk') then
    alter table verification_candidates
      add constraint vc_attest_rule_version_fk
      foreign key (attest_rule_version_id) references overseer_rule_versions on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'overseer_rules_active_version_fk') then
    alter table overseer_rules
      add constraint overseer_rules_active_version_fk
      foreign key (active_version_id) references overseer_rule_versions on delete set null;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (§2.8)
-- Every table org_id-scoped via current_org(). All staging/inference
-- INSERT/UPDATE is SERVICE-ROLE ONLY (no client INSERT policy, mirroring
-- ai_inference_tasks). The single client-write path is the narrow
-- verification_candidates "reject" transition below.
-- ════════════════════════════════════════════════════════════════
alter table ingestion_events           enable row level security;
alter table verification_candidates    enable row level security;
alter table candidate_evidence         enable row level security;
alter table overseer_rules             enable row level security;
alter table overseer_rule_versions     enable row level security;
alter table overseer_shadow_decisions  enable row level security;

-- ── INGESTION EVENTS ────────────────────────────────────────────
-- NO client INSERT/UPDATE/DELETE: writes are service-role only.
-- SELECT: subject sees what was ingested about them (transparency),
-- their manager, and org leaders. All scoped to current_org().
drop policy if exists "ie: subject read" on ingestion_events;
create policy "ie: subject read" on ingestion_events for select
  using (org_id = current_org() and subject_id = auth.uid());
drop policy if exists "ie: manager read" on ingestion_events;
create policy "ie: manager read" on ingestion_events for select
  using (org_id = current_org() and is_manager_of(subject_id));
drop policy if exists "ie: leader read" on ingestion_events;
create policy "ie: leader read" on ingestion_events for select
  using (org_id = current_org() and is_org_leader_of(subject_id));

-- ── VERIFICATION CANDIDATES (amber) ─────────────────────────────
-- NO client INSERT: staging is service-role only (mirrors ai_inference_tasks).
-- SELECT: subject, manager-of-subject, org leader — all within current_org().
drop policy if exists "vc: subject read" on verification_candidates;
create policy "vc: subject read" on verification_candidates for select
  using (org_id = current_org() and subject_id = auth.uid());
drop policy if exists "vc: manager read" on verification_candidates;
create policy "vc: manager read" on verification_candidates for select
  using (org_id = current_org() and is_manager_of(subject_id));
drop policy if exists "vc: leader read" on verification_candidates;
create policy "vc: leader read" on verification_candidates for select
  using (org_id = current_org() and is_org_leader_of(subject_id));

-- The ONLY client UPDATE allowed: a human reviewer (manager+ over the subject)
-- sets a pending / shadow_approved candidate to 'rejected'. The subject may
-- reject ONLY candidates they generated themselves (self-claims:
-- generated_by = subject = auth.uid()) — an employee cannot unilaterally kill a
-- manager/system-staged candidate before review (integrity), but retains full
-- read visibility of everything about them (transparency, via the SELECT
-- policies above) and can dispute manager-staged items through their manager.
-- There is NO client path to 'attested' — attestation happens ONLY through
-- promote_candidate() (VP-5). USING restricts which rows + starting states are
-- touchable; WITH CHECK pins the resulting state to 'rejected' so this policy
-- can never reach 'attested'.
drop policy if exists "vc: reviewer reject" on verification_candidates;
create policy "vc: reviewer reject" on verification_candidates for update
  using (
    org_id = current_org()
    and state in ('pending', 'shadow_approved')
    and (
      is_manager_of(subject_id)
      or is_org_leader_of(subject_id)
      or (subject_id = auth.uid() and generated_by = auth.uid())
    )
  )
  with check (
    org_id = current_org()
    and state = 'rejected'
  );

-- ── CANDIDATE EVIDENCE ──────────────────────────────────────────
-- SELECT only, gated by readability of the parent candidate (an org-scoped
-- subquery mirroring the candidate SELECT policies). Service-role INSERT only.
drop policy if exists "ce: read via candidate" on candidate_evidence;
create policy "ce: read via candidate" on candidate_evidence for select
  using (exists (
    select 1 from verification_candidates vc
    where vc.id = candidate_evidence.candidate_id
      and vc.org_id = current_org()
      and (
        vc.subject_id = auth.uid()
        or is_manager_of(vc.subject_id)
        or is_org_leader_of(vc.subject_id)
      )
  ));

-- ── OVERSEER RULES / VERSIONS / SHADOW DECISIONS ────────────────
-- Oversight surface (dormant in VP-1). SELECT for manager+/leader within the
-- org. All INSERT/UPDATE is service-role (Overseer proposals + shadow writes)
-- plus admin/exec version approval & enable/pause; those write policies are
-- intentionally NOT created in VP-1 (no producer exists yet — the runner and
-- CRUD land in VP-6). With RLS enabled and no INSERT/UPDATE policy, only the
-- service role can write, which is exactly the VP-1 posture.
drop policy if exists "or: manager+ read" on overseer_rules;
create policy "or: manager+ read" on overseer_rules for select
  using (org_id = current_org()
         and current_role_name() in ('manager', 'executive', 'admin', 'hr'));

drop policy if exists "orv: manager+ read" on overseer_rule_versions;
create policy "orv: manager+ read" on overseer_rule_versions for select
  using (org_id = current_org()
         and current_role_name() in ('manager', 'executive', 'admin', 'hr'));

drop policy if exists "osd: manager+ read" on overseer_shadow_decisions;
create policy "osd: manager+ read" on overseer_shadow_decisions for select
  using (org_id = current_org()
         and current_role_name() in ('manager', 'executive', 'admin', 'hr'));

-- ════════════════════════════════════════════════════════════════
-- END VP-1.  NOT created here (by design):
--   • promote_candidate()        → VP-5 (the single verified_* writer)
--   • guard_doc_verification ext  → VP-4 (ai_ingest_state transition gate)
--   • overseer_* write policies   → VP-6 (CRUD + shadow runner)
-- Nothing in this file writes a verified_* row.
-- ════════════════════════════════════════════════════════════════
