-- ════════════════════════════════════════════════════════════════
-- Core-Roborate — VP-4: Knowledge-doc AI-ingest gate (trigger enforcement)
--
-- Additive, idempotent migration. Run AFTER:
--   schema.sql + rls-policies.sql + provisioning-rls.sql
--   + task-knowledge-agent.sql        (documentation + guard_doc_verification)
--   + task-verification-bridge.sql
--   + verification-pipeline.sql        (VP-1: documentation.ai_ingest_state COLUMN)
--
-- VP-4 SCOPE (this file):
--   • EXTEND guard_doc_verification() to couple documentation.ai_ingest_state
--     to the verification gate. The function's EXISTING behaviour is preserved
--     verbatim; this file only ADDS the ai_ingest_state coupling.
--   • The app-side hard filter (status='verified' AND ai_ingest_state='cleared')
--     lives in lib/verification/doc-eligibility.ts and the agent ingest route —
--     NOT in this DDL.
--
-- THE ONE RULE THIS ENFORCES (design §3 Mechanic 2, §5 enforcement point 4):
--   A doc may be model-input context (a prompt input, or ingested into
--   agent_memory) ONLY when status='verified' AND ai_ingest_state='cleared'.
--   This trigger is the DB half of that wall: it controls *when a doc may
--   become 'cleared'* and *forces it back to 'blocked' the instant it stops
--   being verified*. 'quarantined' is terminal-exclusionary and never
--   auto-clears.
--
-- WALL (never violated): 'cleared' is the ONLY state that admits a doc to AI
--   ingestion, and 'cleared' is reachable ONLY in the same privileged,
--   manager+/HR-gated transition that sets status='verified'. Verified (blue)
--   context only; unvetted content can never silently become model input.
--
-- Helpers/behaviour reused VERBATIM (do not redefine):
--   • The actor role read: select role from profiles where id = auth.uid().
--   • The authority check: actor_role in
--       ('manager','executive','admin','hr','superadmin')
--     — the SAME check the existing trigger uses to gate status='verified'.
--   • auth.uid() is null  ⇒  service role / migrations bypass (unchanged).
-- ════════════════════════════════════════════════════════════════

-- ── Idempotent guard: ai_ingest_state column must exist (from VP-1) ──
-- VP-1 (verification-pipeline.sql) adds this column. Re-assert it here so VP-4
-- is self-contained and safe to apply even if VP-1 ordering is uncertain. The
-- definition is byte-identical to VP-1 (default 'blocked'); `if not exists`
-- makes a second add a no-op.
alter table documentation
  add column if not exists ai_ingest_state text not null default 'blocked'
    check (ai_ingest_state in ('blocked', 'staged', 'cleared', 'quarantined'));

-- ════════════════════════════════════════════════════════════════
-- EXTENDED guard_doc_verification()
--
-- This is a FAITHFUL EXTENSION of the function defined in
-- task-knowledge-agent.sql. Every existing guard is preserved exactly:
--   (1) service-role / migration bypass when auth.uid() is null,
--   (2) the manager+/HR/superadmin role gate on becoming verified,
--   (3) automatic stamping of verified_by / verified_at,
--   (4) clearing the attestation stamp when a doc leaves 'verified'.
--
-- VP-4 ADDS the ai_ingest_state coupling (and nothing else):
--   (A) CLEAR GATE — a row may end a statement with ai_ingest_state='cleared'
--       ONLY when status='verified' AND the actor passed the SAME role gate the
--       function already enforces for verification. Any attempt to set
--       'cleared' without 'verified', or by an unauthorized actor, raises.
--   (B) QUARANTINE IS TERMINAL-EXCLUSIONARY — a doc that is already
--       'quarantined' can NEVER move straight to 'cleared'. It must first be
--       re-reviewed back to a non-cleared state ('blocked' or 'staged') by a
--       privileged actor; only then may a subsequent verified+clear transition
--       re-admit it. The trigger never auto-clears a quarantined doc.
--   (C) DE-VERIFY RESET — if a doc leaves status='verified' (to draft/archived),
--       force ai_ingest_state back to 'blocked' (mirrors the verified_by/_at
--       reset). A doc that is not verified can never remain AI-eligible.
--
-- Result: there is no statement, by any client, that lands a non-verified or
-- unauthorized doc in 'cleared'. The app-side filter is defense-in-depth on top
-- of this; this trigger is the authoritative DB gate.
-- ════════════════════════════════════════════════════════════════
create or replace function guard_doc_verification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_role     text;
  actor_is_priv  boolean := false;       -- did the actor pass the manager+/HR gate?
  becoming_clear boolean;
  was_clear      boolean;
  was_quarantined boolean;
begin
  -- (1) Service role / migrations: bypass all human-authority checks (unchanged).
  if auth.uid() is null then
    return new;
  end if;

  select role into actor_role from profiles where id = auth.uid();
  -- The SAME authority predicate the existing trigger uses for verification.
  actor_is_priv := actor_role in ('manager', 'executive', 'admin', 'hr', 'superadmin');

  -- ── EXISTING BEHAVIOUR (preserved verbatim) ──────────────────────

  -- (2)+(3) Becoming verified (insert or update transition): role-gate + stamp.
  if new.status = 'verified'
     and (tg_op = 'INSERT' or old.status is distinct from 'verified') then
    if not actor_is_priv then
      raise exception 'Only a manager, admin, or superadmin can verify documentation';
    end if;
    new.verified_by := auth.uid();
    new.verified_at := now();
  end if;

  -- (4) Leaving verified resets the attestation stamp.
  if tg_op = 'UPDATE' and old.status = 'verified' and new.status <> 'verified' then
    new.verified_by := null;
    new.verified_at := null;
  end if;

  -- ── VP-4 ADDITION: ai_ingest_state coupling ──────────────────────
  -- Compute transition facts. On INSERT there is no OLD row.
  becoming_clear  := new.ai_ingest_state = 'cleared'
                     and (tg_op = 'INSERT' or old.ai_ingest_state is distinct from 'cleared');
  was_clear       := tg_op = 'UPDATE' and old.ai_ingest_state = 'cleared';
  was_quarantined := tg_op = 'UPDATE' and old.ai_ingest_state = 'quarantined';

  -- (C) DE-VERIFY RESET — applied FIRST so a row that is not (or no longer)
  -- verified cannot end the statement 'cleared', no matter what was requested.
  -- A doc whose status is anything other than 'verified' is forced to 'blocked'
  -- unless it was explicitly quarantined in this same statement (quarantine is a
  -- deliberate exclusionary flag and must be preserved, not downgraded to blocked).
  if new.status <> 'verified' and new.ai_ingest_state <> 'quarantined' then
    new.ai_ingest_state := 'blocked';
    -- Recompute: after this reset, no clear can be "becoming" on a non-verified row.
    becoming_clear := false;
  end if;

  -- (B) QUARANTINE IS TERMINAL-EXCLUSIONARY — a quarantined doc can never move
  -- directly to 'cleared'. It must be re-reviewed to a non-cleared, non-
  -- quarantined state first (privileged actor sets 'blocked' or 'staged'), after
  -- which a normal verified+clear transition may re-admit it. The trigger never
  -- auto-clears a quarantined doc.
  if was_quarantined and new.ai_ingest_state = 'cleared' then
    raise exception
      'A quarantined document cannot be cleared directly; it must be re-reviewed (set to blocked or staged by a manager+/HR actor) before it can be re-cleared';
  end if;

  -- Re-review OUT of quarantine is a privileged action (so an employee author
  -- cannot quietly lift a quarantine on their own doc to make it eligible later).
  if was_quarantined and new.ai_ingest_state <> 'quarantined' and not actor_is_priv then
    raise exception 'Only a manager, admin, or superadmin can lift a document quarantine';
  end if;

  -- (A) CLEAR GATE — to END a statement with ai_ingest_state='cleared', the row
  -- MUST be status='verified' AND the actor MUST have passed the manager+/HR
  -- gate. This holds for any path that *reaches* 'cleared' (fresh transition or
  -- an UPDATE that keeps it cleared while changing other columns).
  if new.ai_ingest_state = 'cleared' then
    if new.status <> 'verified' then
      raise exception
        'A document can only be AI-cleared (ai_ingest_state=cleared) while status=verified';
    end if;
    -- A *new* clear transition requires the privileged actor explicitly.
    if becoming_clear and not actor_is_priv then
      raise exception
        'Only a manager, admin, or superadmin can clear a document for AI ingestion';
    end if;
  end if;

  return new;
end;
$$;

-- Re-attach the trigger (idempotent; same name + firing as task-knowledge-agent.sql).
drop trigger if exists trg_doc_verification on documentation;
create trigger trg_doc_verification
  before insert or update on documentation for each row execute function guard_doc_verification();

comment on function guard_doc_verification() is
  'Doc verification + AI-ingest gate. (Existing) manager+/HR gate on status=verified, auto-stamp verified_by/_at, reset stamp on de-verify. (VP-4) ai_ingest_state=cleared requires status=verified AND the same manager+/HR actor; leaving verified forces ai_ingest_state back to blocked; quarantined is terminal-exclusionary and never auto-clears. cleared is the ONLY AI-eligible state.';

-- ════════════════════════════════════════════════════════════════
-- END VP-4 (DB half). The app-side hard filter lives in
-- lib/verification/doc-eligibility.ts (CLEARED_DOC_FILTER / assertDocCleared /
-- eligibleDocsQuery) and is wired into app/api/ai/agent/ingest/route.ts so no
-- doc enters agent_memory or any prompt unless status='verified' AND
-- ai_ingest_state='cleared'.
-- ════════════════════════════════════════════════════════════════
