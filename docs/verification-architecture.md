# Continuous Verification Pipeline & Overseer AI — Technical Architecture

> Status: DESIGN (architecture + DDL + step-by-step logic). No migrations applied, no app code shipped in this deliverable.
> Audience: Core-Roborate engineering. Anchored on the existing schema and `lib/*`.
> Author scope: the context/memory/harness boundary and the verified-vs-inferred wall.

---

## 0. The one rule everything below obeys

Core-Roborate's differentiator is that **verified facts** (human-attested, `verified_*`, blue/`ShieldCheck`) and **AI inferences** (model estimates, `ai_inference_*`, amber/`Sparkles`) are never merged, relabeled, or co-mingled. This redesign turns a manual hierarchical workflow (Employee → Manager → Executive) into a **continuous, AI-assisted pipeline** — *without eroding that rule*.

The mechanism that makes "continuous AI verification" safe is a single sentence:

> **The AI never verifies. It stages candidates and proposes. A separate, single-writer, server-side _attestation event_ — performed by a human, or by an Overseer rule that a human pre-approved and that the system audits — is the only thing that promotes a candidate to a `verified_*` row.**

Three layers stay clean throughout:

- **Context** — ephemeral, assembled per request, provenance-tagged, never persisted as truth.
- **Memory** — durable per-user state. `verified_*` (authoritative, human-attested) and `ai_inference_*` (prior model guesses) are *different memory classes* and are never returned in a single flattened retrieval that erases provenance. `agent_memory` already holds verified-only training facts.
- **Harness** — the server-side scaffolding around every model call: prompt construction, provenance-tagged inputs, output schema, validation, the write path (always to `ai_inference_*`), and the audit entry.

Everything new in this document is **staging + attestation**, never "AI output = fact."

---

## 1. Architecture overview

### 1.1 Components

```
                          ┌─────────────────────────────────────────────┐
   EVIDENCE SOURCES       │              STAGING PIPELINE                │
   (provenance-tagged)    │                                              │
                          │   verification_candidates  (pending →        │
  ┌────────────────┐      │       shadow_approved → attested/rejected)   │
  │ knowledge docs │──┐   │            ▲          │                      │
  │ (documentation)│  │   │            │          │ links               │
  └────────────────┘  │   │   candidate_evidence (M:N to source rows)    │
  ┌────────────────┐  ├──▶│            │          │                      │
  │ messages       │──┤   │   ingestion_events (audited, consented)      │
  └────────────────┘  │   └────────────┼──────────┼──────────────────────┘
  ┌────────────────┐  │                │          │
  │ verified_tasks │──┘                │          │ PROMOTION BOUNDARY
  │ (task signals) │                   │          │ (single-writer, server-side)
  └────────────────┘                   │          ▼
                                       │   ┌──────────────────────────┐
        ┌──────────────────────────┐   │   │  promote_candidate()      │
        │  OVERSEER AI              │   │   │  SECURITY DEFINER fn       │
        │  (learning loop)          │───┘   │  ── the ONLY writer that  │
        │                           │       │     turns a candidate     │
        │  overseer_rules (vN)      │       │     into a verified_* row │
        │  overseer_shadow_decisions│       └───────────┬──────────────┘
        │  shadow → active lifecycle│                   │
        └──────────────────────────┘                   ▼
                                              ┌────────────────────┐
                                              │  verified_facts /  │  (blue, attested)
                                              │  achievements /    │
                                              │  verified_tasks    │
                                              └─────────┬──────────┘
                                                        │
                                                        ▼
                                              ┌────────────────────┐
                                              │  Verified Passport │
                                              │  blue = attested   │
                                              │  amber = in-staging │
                                              └────────────────────┘

  Every arrow that crosses the promotion boundary writes the audit_log.
  Every model call writes ONLY to ai_inference_* / staging — never to verified_*.
```

### 1.2 Data flow (one sentence per stage)

1. **Ingest.** A document, message, or task event becomes a provenance-tagged *evidence record* (server-side), respecting consent and `org_id`.
2. **Stage.** The harness proposes one or more `verification_candidates` (amber) from that evidence, each linked back to its source(s) via `candidate_evidence`, with a confidence and a model id.
3. **Decide.** A human reviewer, or the Overseer running in **shadow** mode, produces a proposed decision + proof-of-context. Shadow decisions are recorded and scored, never enacted.
4. **Promote.** Only when a human attests (or an *active*, human-enabled Overseer rule auto-approves) does `promote_candidate()` write the `verified_*` row and stamp `attested_by`/`attested_at`.
5. **Surface.** The Passport shows attested candidates as blue; pending/shadow candidates as amber "in review," clearly separated.

### 1.3 What this reuses (do not rebuild)

- `verified_tasks` / `ai_inference_tasks` already model the blue/amber split with a server-only inference writer and a human-approval promotion (`origin='ai_approved'`, `source_inference_id`). The candidate pipeline **generalises that exact pattern** to facts, achievements, and docs.
- `documentation` already has a manager-gated verification trigger (`guard_doc_verification`). The Knowledge Doc gate (mechanic 2) **extends** that, it does not replace it.
- `agent_memory` already enforces "verified facts only" with server-side ingestion. Verification *evidence ingestion* (mechanic 3) is a **distinct pipeline** from twin-memory ingestion.
- Helpers `current_org()`, `current_role_name()`, `is_manager_of()`, `is_org_leader_of()`, `is_company_user()` are reused verbatim in all new RLS.
- Service-role write pattern from `lib/ai/persist.ts`, `lib/ai/subtasks.ts`, `lib/ai/reports.ts` (admin client + `audit_log` insert) is the model for every new server writer.
- `writeAuditLog` (`lib/audit.ts`) and the `audit_log` table for all client-side significant actions; `formatAuditAction` gains new labels.

---

## 2. Schema DDL (new + changed tables)

> Migration file (when built): `supabase/verification-pipeline.sql`, run AFTER `task-knowledge-agent.sql` and `task-verification-bridge.sql`. All tables `org_id`-scoped, RLS enabled, inference/staging writes service-role only.

### 2.1 Evidence ingestion log (consent + provenance anchor)

```sql
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
```

### 2.2 Verification candidates (the AMBER staging area)

```sql
-- A proposed-but-not-yet-true claim about a person. AMBER. Server-written only.
-- The ONLY path out of this table to a verified_* row is promote_candidate().
create table if not exists verification_candidates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations on delete cascade,
  subject_id    uuid not null references profiles on delete cascade,   -- the person the claim is about
  -- What kind of verified record this would become if promoted.
  target_kind   text not null
                check (target_kind in ('verified_fact', 'achievement', 'verified_task', 'kpi', 'project', 'documentation')),
  claim         text not null,                                         -- human-readable proposed claim
  payload       jsonb not null default '{}',                           -- fields to write on promotion (kind/label/etc.)
  -- State machine. See §4.1. Candidates are amber in EVERY state except after
  -- promotion, at which point the verified_* row (not this row) is the blue truth.
  state         text not null default 'pending'
                check (state in ('pending', 'shadow_approved', 'attested', 'rejected', 'superseded')),
  confidence    numeric check (confidence between 0 and 1),            -- model's self-estimate (advisory)
  model         text,                                                  -- model id that proposed it (null = deterministic)
  -- Promotion bookkeeping (mirrors ai_inference_tasks.approved_task_id).
  promoted_table text,                                                 -- e.g. 'verified_facts'
  promoted_id    uuid,                                                 -- the blue row it became
  attested_by   uuid references profiles on delete set null,          -- HUMAN attestor, or rule's enabler
  attested_at   timestamptz,
  attest_method text check (attest_method in ('human', 'overseer_rule')),
  attest_rule_version_id uuid,                                         -- FK added late (overseer_rule_versions)
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
```

### 2.3 Candidate → evidence links (provenance preserved end-to-end)

```sql
-- M:N: each candidate cites the evidence that supports it. Lets the Passport and
-- audit trail show "this attested fact came from these tasks/messages/docs."
create table if not exists candidate_evidence (
  candidate_id  uuid not null references verification_candidates on delete cascade,
  ingestion_id  uuid not null references ingestion_events on delete cascade,
  weight        numeric check (weight between 0 and 1),   -- how much this evidence supported the claim
  note          text,
  primary key (candidate_id, ingestion_id)
);
comment on table candidate_evidence is
  'Provenance graph: candidate ↔ evidence. Read-only proof for review + Passport + audit.';
```

### 2.4 Knowledge document verification gate (extends existing trigger)

```sql
-- documentation already has status in ('draft','verified','archived') gated by
-- guard_doc_verification(). We ADD an explicit eligibility column so an
-- unverified doc can NEVER be model-input context (mechanic 2). Eligibility is
-- a stricter, separate concept from "verified" so a doc can be human-readable
-- yet still blocked from AI ingestion until cleared.
alter table documentation
  add column if not exists ai_ingest_state text not null default 'blocked'
    check (ai_ingest_state in ('blocked', 'staged', 'cleared', 'quarantined'));
comment on column documentation.ai_ingest_state is
  'AI-input gate. blocked = never eligible as model context. cleared = passed staging gate AND status=verified. Only cleared docs may enter agent_memory or any prompt.';
```

### 2.5 Overseer rules + versions (continual codes as DATA, not free model output)

```sql
-- A "continual code": a versioned, org-scoped, auditable automated decision rule
-- the Overseer learns from observed human approvals. The rule LOGIC lives in a
-- structured, inspectable payload — NOT free-floating model prose treated as truth.
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
  active_version_id uuid,                                    -- FK to overseer_rule_versions (late-added)
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
  -- Shadow performance gate (see §6.2): agreement rate vs humans before enablement.
  shadow_agreement_rate numeric check (shadow_agreement_rate between 0 and 1),
  shadow_sample_size    integer not null default 0,
  proposed_by   uuid references profiles on delete set null,  -- null = Overseer/system
  approved_by   uuid references profiles on delete set null,  -- human who approved THIS version
  created_at    timestamptz not null default now(),
  unique (rule_id, version)
);
comment on table overseer_rule_versions is
  'Immutable rule logic versions. logic = structured predicates (inspectable). Every auto-promotion cites a version id.';
```

### 2.6 Shadow decision log (proof-of-context, hard gate)

```sql
-- Before any rule auto-approves, it runs in SHADOW: it records its PROPOSED
-- decision + the context/reasoning that justifies it, and (when known) the
-- HUMAN's actual decision on the same candidate, so agreement can be measured.
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
```

### 2.7 Late FKs

```sql
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
```

### 2.8 RLS notes (every table)

All tables `enable row level security`. Patterns reuse existing helpers:

- **`ingestion_events`** — no client INSERT (service-role only). SELECT: `subject_id = auth.uid()` (an employee can see what was ingested about them — privacy/transparency), `is_manager_of(subject_id)`, `is_org_leader_of(subject_id)`. All filtered by `org_id = current_org()`.
- **`verification_candidates`** — **no client INSERT/UPDATE that changes `state` to `attested`** (only `promote_candidate()` does that). SELECT mirrors `ai_inference_tasks`: subject, manager-of-subject, org leader. A narrow client UPDATE policy lets a human reviewer set `state` to `rejected` with `rejected_by/reason` (manager+ or subject for own self-claims) — rejection is allowed client-side; attestation is not.
- **`candidate_evidence`** — SELECT only, gated by readability of the parent candidate (subquery), service-role insert.
- **`overseer_rules` / `overseer_rule_versions`** — SELECT for `current_role_name() in ('manager','executive','admin')` within `org_id`. The shadow→active flip (UPDATE `lifecycle`, `enabled_by`) restricted to `executive`/`admin` (policy decision — see §7). Version INSERT is service-role (Overseer proposes) + admin (human approves).
- **`overseer_shadow_decisions`** — SELECT for manager+/leader in org (this is the oversight surface); service-role INSERT/UPDATE only.
- **`documentation.ai_ingest_state`** — column-level transition gated by an extended trigger (§3 / mechanic 2), not RLS alone.

---

## 3. Mechanics — step-by-step logic

### Mechanic 1 — Verification staging pipeline

**Data model:** `ingestion_events` → `verification_candidates` → `candidate_evidence`.

**States & transitions** (`verification_candidates.state`):

```
pending ──(human attests)────────────────────────────▶ attested   [promote_candidate]
pending ──(active rule auto-approves)─────────────────▶ attested   [promote_candidate, attest_method='overseer_rule']
pending ──(Overseer shadow proposes approve)──────────▶ shadow_approved  (advisory only, NOT promoted)
shadow_approved ──(human attests)─────────────────────▶ attested
pending | shadow_approved ──(human or rule rejects)───▶ rejected
pending | shadow_approved ──(new candidate supersedes)▶ superseded
```

Key invariant: `attested` is only ever reached **through `promote_candidate()`**, which is `SECURITY DEFINER` and the single writer to `verified_*`. `shadow_approved` is a parking state meaning "the Overseer thinks yes, but a human (or an active rule) hasn't enacted it." It is still amber.

**Flow:**
1. Server ingestion endpoint records an `ingestion_events` row (idempotent on `org_id, source_type, source_id`).
2. The harness (a server route using the admin client) proposes candidate(s): inserts `verification_candidates` (amber, `pending`) + `candidate_evidence` links, with `model` and `confidence`. Audit: `verification_candidate_staged`.
3. Review surface lists candidates with their evidence and provenance.
4. Promotion via `promote_candidate()` (§4) on human attestation or active-rule auto-approval.

### Mechanic 2 — Knowledge document verification gate

**Rule (hard):** an unverified doc is **never** eligible as model-input context. Eligibility = `documentation.status = 'verified'` **AND** `ai_ingest_state = 'cleared'`.

**Gate states (`ai_ingest_state`):**
- `blocked` (default on upload) — invisible to all AI ingestion and prompt assembly.
- `staged` — submitted for the AI-eligibility review; a `verification_candidate` of `target_kind='documentation'` is created. Still not usable by any model.
- `cleared` — passed the gate; set **only** by the same privileged transition that sets `status='verified'`. Now eligible for `agent_memory` ingestion and prompt context.
- `quarantined` — flagged (e.g., contains PII/secrets/disputed content); permanently excluded until re-reviewed.

**Enforcement:** extend `guard_doc_verification()` so that:
- A doc may only become `ai_ingest_state='cleared'` in the same statement that has `status='verified'` and the actor passes the existing manager+/HR role check.
- Leaving `verified` resets `ai_ingest_state` back to `blocked` (mirrors the existing stamp-reset logic).
- The **agent-memory ingestion server path and every context-assembly query must filter `ai_ingest_state='cleared'`** (in addition to the existing visibility/role checks). This is the mechanical guard: even a verified-but-not-cleared doc cannot enter a prompt.

### Mechanic 3 — Passive Messenger Verification (always-on) + privacy reconciliation

**The tension.** Today `messages.save_to_agent_memory` defaults to `false` ("Off the Record"); only opted-in messages can train the **sender's Scout** (`agent_memory`). The new requirement wants messages auto-ingested as verification *evidence*. These look contradictory only if you conflate two different pipelines.

**The reconciliation — two distinct pipelines over the same messages:**

| | (a) Scout memory | (b) Verification evidence ingestion |
|---|---|---|
| Table | `agent_memory` (owner-only) | `ingestion_events` + `verification_candidates` |
| Purpose | personalises the user's own assistant | proposes verifiable claims about work |
| Default | **opt-in** (`save_to_agent_memory=false`) — unchanged | **always-on by org policy**, but *evidence only* |
| Visibility | private to the owner | subject + their manager + org leader |
| Output | shapes the twin's voice | amber candidates, human-attested to become blue |
| Opt-out | per-message toggle (unchanged) | cannot opt out of *evidence creation*, **can** suppress content & dispute candidates |

**Why this is defensible and clean:**
- `save_to_agent_memory` keeps its exact current meaning. The messaging trust UI does not change. Pipeline (a) is untouched.
- Pipeline (b) does **not** read message *content* into any verified row automatically. It creates an amber `ingestion_events` record (consent_basis = `org_policy`) and may stage an amber `verification_candidate`. **Nothing becomes verified without a human attestation.** So "always-on ingestion" never means "always-on verification."
- **Privacy posture / recommended default:**
  - Evidence ingestion is **on by default at the org level** (this is a workforce-verification product; the company has a legitimate-interest basis for work-context messages), BUT:
    - **Off-the-record stays sacred:** a message with `save_to_agent_memory=false` is still eligible to be *evidence*, but the employee may mark a conversation or message **content-suppressed** (`ingestion_events.redacted=true`), meaning only metadata (that a candidate exists) is retained — never the raw text in a candidate payload.
    - The subject can always **see** every `ingestion_events`/candidate about them (RLS grants subject read) and **dispute/reject** any candidate.
    - Recommended default decision to ratify with Legal: org-policy ingestion **on**, content-suppression **available per conversation**, direct 1:1 personal channels **excluded** unless task-linked. (Flagged in §7.)
  - Auditable basis: every ingestion writes `ingestion_events` (consent_basis recorded) and an `audit_log` row `evidence_ingested`.

### Mechanic 4 — Task-as-a-Verifier

**Signal.** Completing/interacting with a `verified_task` emits a verification signal into staging:
- On `verified_tasks.status → 'done'` (and on the existing manager promotion path in `lib/tasks.ts`), the server emits an `ingestion_events` row (`source_type='verified_task'`) and stages a `verification_candidate` (`target_kind='achievement'` or `'verified_fact'`) describing the completed work, linked via `candidate_evidence`.
- The candidate's `confidence` reflects task signal strength (e.g., manager-assigned + completed-on-time + linked to a revenue pillar scores higher). This is advisory only.

**Linkage.** `candidate_evidence.ingestion_id → ingestion_events(source_type='verified_task', source_id=verified_tasks.id)`. This preserves the chain: attested achievement → candidate → task. Note this **complements** the existing `task-verification-bridge.sql` path (manager promotes a task into an L2 achievement directly) — that remains the fast human path; the candidate pipeline is the continuous/AI-assisted path, and both terminate at the same blue tables via attestation.

### Mechanic 5 — Overseer AI + learning loop (shadow → active)

**Replaces** hierarchical manager/exec approval *as the default reviewer*, but a human is always in the loop until a rule is explicitly enabled, and the kill-switch is permanent.

**5.1 Learning (continual codes).** The Overseer observes `overseer_shadow_decisions` joined to actual human attest/reject outcomes on candidates. When it finds a stable pattern ("manager always approves task-derived achievements with confidence ≥ 0.9 backed by a completed verified_task"), it proposes an `overseer_rule` + `overseer_rule_versions` row whose `logic` is **structured predicates** (inspectable JSON), with a natural-language `rationale` for the human. The rule is data, versioned, org-scoped, auditable — never free model output treated as authoritative.

**5.2 Shadow → active lifecycle (hard gate):**

```
draft ──(Overseer proposes version, human reviews)──▶ shadow
shadow: rule runs on every matching candidate, WITHOUT enacting. For each it writes
        an overseer_shadow_decisions row (proposed_action + proof_of_context). When a
        human later decides, human_action + agreed are filled in.
shadow ──(agreement_rate ≥ threshold over ≥ min_sample AND explicit human enable)──▶ active
active: rule MAY auto-promote matching candidates via promote_candidate(
        attest_method='overseer_rule', attest_rule_version_id=...). Every auto-promotion
        STILL writes a shadow_decision row (was_enacted=true) + an audit_log entry citing
        the rule version and its proof_of_context.
active ──(human pause / metric regression / dispute spike)──▶ paused   [KILL-SWITCH]
any ──▶ retired
```

- **Promotion of a rule to `active` requires BOTH** (a) `shadow_agreement_rate ≥` org threshold over `shadow_sample_size ≥` minimum, AND (b) an explicit human enable (`enabled_by`, `enabled_at`). The system never self-promotes a rule.
- **Kill-switch:** any executive/admin (policy: §7) can set `lifecycle='paused'` instantly; `promote_candidate()` re-checks `lifecycle='active'` at call time inside the same transaction, so a paused rule cannot promote even a candidate already in flight.
- **Every auto-promotion is fully audited:** `audit_log` `candidate_auto_promoted` with `{rule_id, rule_version_id, candidate_id, proof_of_context_id}`.

### Mechanic 6 — The Verified Passport

**Extend, don't replace, `get_public_passport`.** The public RPC continues to expose only verified records (blue) and self-reported (amber level-1) — no AI/comp/score data, per its current security-definer contract.

**Authenticated (in-app) Passport view** gains a third, clearly separated section sourced from the pipeline:
- **Verified (blue):** `verified_*` rows whose origin includes pipeline-attested candidates (`promoted_id` join). Rendered with `ShieldCheck` + `--verified-fg/-bg`, and a provenance affordance ("attested by X" or "auto-attested by rule vN") drawn from `attested_by`/`attest_method` + `candidate_evidence`.
- **In staging / AI-suggested (amber):** `verification_candidates` in `pending`/`shadow_approved` for the subject. `Sparkles` + `--inferred-fg/-bg`, labeled "In review — not yet verified." Never counted toward `titleLevel`, never shown on the public slug.

**Mechanical guard:** the public RPC must **never** select from `verification_candidates`. A candidate appears on the public passport only after `promote_candidate()` writes a `verified_*` row. The in-app amber section reads candidates under RLS but renders them visually distinct and explicitly non-verified.

---

## 4. The promotion boundary (single-writer, server-side)

```sql
-- The ONE function that turns a candidate into a verified fact. SECURITY DEFINER
-- so it can write verified_* even though normal RLS forbids AI-origin inserts.
-- Callable by: (a) an authenticated human with attest authority over the subject,
-- or (b) the service role on behalf of an ACTIVE, human-enabled Overseer rule.
-- It re-checks every guard at call time and is the only place attest_* is stamped.
create or replace function promote_candidate(
  p_candidate_id uuid,
  p_method       text,             -- 'human' | 'overseer_rule'
  p_rule_version uuid default null
) returns uuid                      -- the new verified_* row id
language plpgsql security definer set search_path = public as $$
declare
  c verification_candidates%rowtype;
  v_actor uuid := auth.uid();
  v_new_id uuid;
  v_rule_lifecycle text;
begin
  select * into c from verification_candidates where id = p_candidate_id for update;
  if c.id is null then raise exception 'candidate not found'; end if;
  if c.state = 'attested' then raise exception 'already attested'; end if;

  if p_method = 'human' then
    -- human path: actor must have attest authority over the subject
    if not (is_manager_of(c.subject_id) or is_org_leader_of(c.subject_id)
            or current_role_name() in ('admin','hr')) then
      raise exception 'not authorized to attest for this subject';
    end if;
  elsif p_method = 'overseer_rule' then
    -- rule path: only the service role reaches here; rule MUST be active NOW.
    select lifecycle into v_rule_lifecycle
      from overseer_rules r join overseer_rule_versions rv on rv.rule_id = r.id
      where rv.id = p_rule_version;
    if v_rule_lifecycle is distinct from 'active' then
      raise exception 'rule not active (kill-switch / not enabled)';
    end if;
  else
    raise exception 'invalid attest method';
  end if;

  -- Write the BLUE row into the appropriate verified_* table from c.payload.
  -- (one branch per target_kind; e.g. insert into verified_facts(...) returning id)
  -- ... v_new_id := <inserted id> ...

  update verification_candidates set
    state = 'attested', attested_by = v_actor, attested_at = now(),
    attest_method = p_method, attest_rule_version_id = p_rule_version,
    promoted_id = v_new_id, updated_at = now()
  where id = p_candidate_id;

  insert into audit_log(actor_id, action, target_table, target_id, changes)
  values (v_actor,
          case when p_method='human' then 'candidate_attested' else 'candidate_auto_promoted' end,
          'verification_candidates', p_candidate_id,
          jsonb_build_object('method', p_method, 'rule_version', p_rule_version,
                             'promoted_id', v_new_id, 'target_kind', c.target_kind));
  return v_new_id;
end $$;
```

This is the **only** code that writes `state='attested'` and the only AI-pathway writer to `verified_*`. The `for update` lock + re-check of rule `lifecycle` inside the transaction is what makes the kill-switch race-free.

---

## 5. Verified-vs-inferred enforcement points (where the wall is mechanically guarded)

1. **Separate tables, preserved.** Candidates live in `verification_candidates` (amber); verified rows stay in `verified_*` (blue). No column ever holds both.
2. **Single promotion writer.** `promote_candidate()` (SECURITY DEFINER) is the only writer that sets `attested` and the only AI-path writer to `verified_*`. No client INSERT policy lets an AI-origin row land in a verified table.
3. **No client write of `attested`.** RLS on `verification_candidates` permits client `rejected` transitions but never client `attested`.
4. **Doc gate.** Context assembly and `agent_memory` ingestion filter `ai_ingest_state='cleared'`; an unverified doc is mechanically excluded from every prompt.
5. **Public RPC blindness.** `get_public_passport` never selects candidates; only promoted blue rows surface publicly.
6. **Harness output schema.** Every model call's output schema forces results into staging/inference shapes with a provenance flag; validation on the way out rejects any payload that claims `verified` provenance. (Mirrors the existing `disclaimer`-injection in `lib/ai/anthropic.ts`/`reports.ts`.)
7. **Rule logic is structured data.** Overseer `logic` is inspectable JSON predicates, not executed prose; `rationale` is advisory only.
8. **Audit on every boundary crossing.** Ingestion, staging, shadow decision, rule version, enable/pause, attestation, auto-promotion each write `audit_log`.
9. **Provenance preserved.** `candidate_evidence` + `ingestion_events` keep every candidate (and every promoted fact) traceable to its source rows; `attested_by`/`attest_method`/`attest_rule_version_id` record who/what promoted it.
10. **`org_id` RLS everywhere.** All new tables scope by `current_org()`; `promote_candidate()` re-checks authority over `subject_id`. No cross-org assembly.

---

## 6. Provenance-preserving memory retrieval (context assembly contract)

Context assembly for a user's agent must return provenance-tagged items, never flat strings:

```ts
type RetrievedContextItem = {
  value: string;
  source: 'verified' | 'ai_inferred' | 'in_staging';
  attestor?: string;          // present only when source==='verified'
  attestMethod?: 'human' | 'overseer_rule';
  confidence?: number;        // present for ai_inferred / in_staging
  evidenceIds?: string[];     // ingestion_events ids — provenance chain
};
```

- `verified` items come from `verified_*` (and only `ai_ingest_state='cleared'` docs).
- `ai_inferred` / `in_staging` items come from `ai_inference_*` / `verification_candidates`.
- The two classes are returned in **separate arrays** so a flattening bug cannot erase provenance. Role hierarchy mirrored: an employee's assembly reads only their own scope; a manager's may include team verified facts via `is_manager_of`.

---

## 7. Open policy questions (need human decisions before build)

1. **Passive ingestion default & scope.** Confirm with Legal/HR: org-policy evidence ingestion ON by default? Which channels are excluded (personal 1:1 vs task-linked)? Is content-suppression per-conversation sufficient, or is per-message required in some jurisdictions (GDPR/works-council, CCPA)?
2. **Right to be forgotten vs frozen attestations.** Existing `frozen_at` makes employment-era attestations immutable. How does that interact with an employee's deletion request for *evidence* and *candidates*? (Recommend: candidates deletable; promoted verified rows follow existing freeze rules.)
3. **Who can enable a rule / hold the kill-switch?** Proposal: enable requires `executive` or `admin`; pause (kill-switch) allowed for any `manager`+ over their own scope. Confirm.
4. **Shadow thresholds.** What agreement rate and minimum sample size gate shadow→active (e.g., ≥0.95 over ≥50 decisions)? Per-org configurable or platform-fixed?
5. **Auto-promotion ceiling.** Should active rules be capped to low-stakes target kinds (e.g., task-derived achievements ≤ L2) and forbidden from comp/promotion-adjacent claims entirely? (Recommend: yes — hard ceiling.)
6. **Confidence display.** Do we surface model `confidence` to employees on amber candidates, or only to reviewers? (Trust-UI implication.)
7. **Cross-company portable credentials.** When an attested fact rides the existing portable-credential network, does its `attest_method='overseer_rule'` provenance travel with it, and do receiving orgs see it was auto-attested?

---

## 8. Build order (when greenlit)

1. `supabase/verification-pipeline.sql` — tables §2 + `promote_candidate()` + extended `guard_doc_verification()`, RLS.
2. `lib/verification/staging.ts` (read/reject, browser+RLS) and `lib/verification/promote.ts` (server, calls RPC).
3. Server ingestion routes: doc-clear, message-evidence, task-signal (admin client, audit).
4. `lib/overseer/*` — rule CRUD, shadow runner, enable/pause; harness for rule proposal.
5. Passport in-app amber section; verify public RPC remains candidate-blind.
6. Audit labels in `lib/audit.ts` (`evidence_ingested`, `verification_candidate_staged`, `candidate_attested`, `candidate_auto_promoted`, `overseer_rule_proposed`, `overseer_rule_enabled`, `overseer_rule_paused`).
```
