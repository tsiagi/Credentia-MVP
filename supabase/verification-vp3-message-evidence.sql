-- ════════════════════════════════════════════════════════════════
-- Credentia — Verification Pipeline VP-3: Passive Messenger evidence
--
-- Additive, idempotent migration. Run AFTER:
--   schema.sql + rls-policies.sql + provisioning-rls.sql
--   + task-knowledge-agent.sql   (defines conversations / messages)
--   + verification-pipeline.sql  (VP-1: ingestion_events)
--   + verification-vp2-task-signal.sql (VP-2: the mirrored trigger pattern)
--
-- WHAT THIS DOES
--   Messages written in WORK-CONTEXT channels are AUTOMATICALLY (always-on)
--   recorded as verification EVIDENCE — ONE ingestion_events row per in-scope
--   message — honoring an org `privacy_mode` and per-conversation / per-message
--   content-suppression. The message body NEVER leaves the `messages` table:
--   evidence here is a POINTER (org_id, subject, source_type='message',
--   source_id=messages.id, consent basis, redacted flag), not content.
--
--   It does NOT:
--     • stage any verification_candidate (a message→claim needs a model; that is
--       deferred to VP-6, behind a context-architect gate). VP-3 only records
--       that the evidence EXISTS.
--     • make any model / AI call.
--     • touch the Digital-Twin memory path. `messages.save_to_agent_memory` and
--       the whole `agent_memory` opt-in are a SEPARATE pipeline (memory ≠
--       evidence) and are left exactly as they are.
--     • copy message body text anywhere.
--
-- WHY A TRIGGER
--   Message creation runs CLIENT-SIDE under RLS (lib/messaging.ts → sendMessage,
--   browser supabase) — there is no server seam. A SECURITY DEFINER AFTER INSERT
--   trigger on `messages` is the deterministic, race-free hook, the same pattern
--   as VP-2's stage_task_completion_candidate() and guard_doc_verification().
--   VP-3 is therefore a small additive migration.
--
-- SCOPE (Q1 — work-context only)
--   In-scope  := conversation is NOT a personal 1:1, i.e.
--                  (kind <> 'direct') OR (task_id is not null).
--   Out-of-scope := plain `direct` thread with no task_id → ingest nothing.
--   The trigger looks up the message's conversation to decide.
--
-- REDACTION (content-suppression)
--   redacted := conv.evidence_suppressed
--               OR (org.privacy_mode = 'strict' AND msg.evidence_suppressed)
--   • conversation-level suppression applies in BOTH privacy modes.
--   • message-level suppression is honored ONLY in 'strict' mode.
--   A redacted=true row still records that evidence EXISTS (provenance /
--   transparency) but flags it as content-suppressed for downstream consumers.
--
-- HARD WALL (never violated here)
--   • NOTHING writes a verified_* / achievements / verification_candidates row,
--     nor sets any candidate state. No model call.
--   • Message body is NEVER copied into ingestion_events or any new table.
--   • Every row is org_id-scoped to NEW.org_id.
--   • SECURITY DEFINER intentionally bypasses VP-1's "no client INSERT" RLS on
--     ingestion_events — the intended service-role evidence write path.
--   • NO per-message audit_log row. Messaging is high-frequency; the
--     ingestion_events row IS the evidence record. (Contrast VP-2's
--     low-frequency task completion, which DOES audit.) See note at §3.
--
-- IDEMPOTENCY
--   • Re-running this migration is safe (add column if not exists /
--     create or replace / drop+create trigger).
--   • Exactly one evidence row per message, ever: anchored on ingestion_events'
--     unique (org_id, source_type, source_id) with on conflict do nothing.
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- §1 — Org-level privacy mode
-- ────────────────────────────────────────────────────────────────
-- 'standard' (default): conversation-level suppression honored; per-message
--   suppression is ignored (work-context evidence is the org's policy posture).
-- 'strict': additionally honor a per-message evidence_suppressed flag, so a
--   sender can keep an individual message out of evidence content.
alter table organizations
  add column if not exists privacy_mode text not null default 'standard'
    check (privacy_mode in ('standard', 'strict'));
comment on column organizations.privacy_mode is
  'VP-3 evidence privacy posture. standard = conversation-level suppression only; strict = also honor per-message messages.evidence_suppressed. Never gates whether evidence existence is recorded — only whether content is marked redacted.';

-- ────────────────────────────────────────────────────────────────
-- §2 — Content-suppression flags
-- ────────────────────────────────────────────────────────────────
-- Per-conversation: "Exclude from verification evidence". Available in BOTH
-- privacy modes. A participant may set it (see §5). This is DISTINCT from the
-- existing memory toggle (conversations.agent_memory_default / "Off the
-- Record") — that governs the Digital-Twin; this governs verification evidence.
alter table conversations
  add column if not exists evidence_suppressed boolean not null default false;
comment on column conversations.evidence_suppressed is
  'VP-3: when true, evidence ingested from this conversation is marked redacted (content-suppressed) in BOTH privacy modes. Separate from agent_memory_default (Digital-Twin learning).';

-- Per-message: honored ONLY when organizations.privacy_mode = 'strict'. Lets a
-- sender keep one message out of evidence content even in an otherwise-ingested
-- work-context thread.
alter table messages
  add column if not exists evidence_suppressed boolean not null default false;
comment on column messages.evidence_suppressed is
  'VP-3: per-message content-suppression, honored ONLY when the org privacy_mode = strict. Separate from save_to_agent_memory (Digital-Twin learning).';

-- ────────────────────────────────────────────────────────────────
-- §3 — Evidence ingestion function (AFTER INSERT on messages)
-- ────────────────────────────────────────────────────────────────
create or replace function ingest_message_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind          text;
  v_task_id       uuid;
  v_conv_suppress boolean;
  v_privacy_mode  text;
  v_redacted      boolean;
begin
  -- Best-effort, ALWAYS-ON evidence pointer. A failure here must NEVER block the
  -- message insert (sending a message is the primary action). The whole body is
  -- wrapped to swallow + warn with IDS ONLY (never message body). The trigger
  -- always returns NEW.
  --
  -- NO per-message audit_log write (by design): messaging is high-frequency and
  -- auditing every message would flood the trail. The ingestion_events row IS
  -- the evidence record. (VP-2 audits because task completion is low-frequency.)
  begin
    -- ── Look up the conversation to decide scope + conversation suppression ──
    select c.kind, c.task_id, c.evidence_suppressed
      into v_kind, v_task_id, v_conv_suppress
      from conversations c
     where c.id = new.conversation_id;

    -- Conversation missing (shouldn't happen — FK) → nothing to ingest.
    if not found then
      return new;
    end if;

    -- ── SCOPE (Q1): work-context only. Exclude personal 1:1 direct threads. ──
    -- In-scope := kind <> 'direct' OR task_id is not null.
    if v_kind = 'direct' and v_task_id is null then
      return new;                       -- personal direct thread → no ingestion
    end if;

    -- ── Org privacy mode (for the per-message strict-mode rule) ──
    select o.privacy_mode into v_privacy_mode
      from organizations o
     where o.id = new.org_id;

    -- ── REDACTION formula ──
    --   conversation suppression (both modes)
    --   OR (strict mode AND per-message suppression)
    v_redacted := coalesce(v_conv_suppress, false)
                  or (v_privacy_mode = 'strict' and coalesce(new.evidence_suppressed, false));

    -- ── The evidence POINTER (no body copy) ──
    -- source_type='message', source_id = the message id, subject = the sender,
    -- consent_basis='org_policy' (always-on work-context ingestion under the
    -- org's policy). ingested_by = null (automated/system). Idempotent via the
    -- unique (org_id, source_type, source_id). SECURITY DEFINER bypasses VP-1's
    -- "no client INSERT" RLS — the intended service-role write path.
    if new.sender_id is not null then
      insert into ingestion_events (
        org_id, subject_id, source_type, source_id, consent_basis, redacted, ingested_by
      )
      values (
        new.org_id, new.sender_id, 'message', new.id, 'org_policy', v_redacted, null
      )
      on conflict (org_id, source_type, source_id) do nothing;
    end if;
    -- NOTE: no verification_candidate is staged here. A message→claim needs a
    -- model (VP-6, context-architect-gated). VP-3 records evidence existence only.

  exception when others then
    raise warning 'VP-3 ingest_message_evidence skipped for message % (org %): %',
      new.id, new.org_id, sqlerrm;
  end;

  return new;
end;
$$;

comment on function ingest_message_evidence() is
  'VP-3: on a work-context message INSERT, records ONE ingestion_events evidence POINTER (no body copy) honoring privacy_mode + conversation/message evidence_suppressed. No candidate, no model call, no per-message audit, Digital-Twin memory untouched. Best-effort: failures never block the message insert.';

-- Trigger functions never need to be RPC-callable. Revoke EXECUTE so it is not
-- exposed via PostgREST (/rest/v1/rpc/...); the trigger still fires as owner.
revoke execute on function ingest_message_evidence() from anon, authenticated, public;

-- ────────────────────────────────────────────────────────────────
-- §4 — Trigger
-- ────────────────────────────────────────────────────────────────
drop trigger if exists trg_messages_ingest_evidence on messages;
create trigger trg_messages_ingest_evidence
  after insert on messages
  for each row
  execute function ingest_message_evidence();

-- ────────────────────────────────────────────────────────────────
-- §5 — RLS for the new suppression columns
-- ────────────────────────────────────────────────────────────────
-- conversations.evidence_suppressed:
--   The existing "conv: participant update" policy (task-knowledge-agent.sql)
--   is USING (is_conversation_participant(id)) WITH CHECK (org_id = current_org())
--   — column-AGNOSTIC, so a participant can ALREADY set evidence_suppressed
--   through it (the same path setThreadMemoryDefault uses for
--   agent_memory_default). No new policy is needed and none is added (adding a
--   redundant one would only invite confusion / widening). Confirmed: no change.
--
-- messages.evidence_suppressed:
--   DELIBERATELY no client write path in VP-3. There is currently NO UPDATE
--   policy on `messages` (only "msg: participant read" SELECT + "msg: participant
--   send" INSERT), so messages are effectively immutable. Adding a broad sender
--   UPDATE policy would — because RLS cannot pin WHICH columns change — also let a
--   sender EDIT their already-sent (and possibly already-ingested) message BODY.
--   For a verification/evidence pipeline that is an integrity hole: an ingested
--   message is referenced by id, so a later body edit silently changes what the
--   evidence points to. We therefore keep messages immutable here.
--   Per-message strict-mode suppression is honored by the redaction formula above
--   if the column is ever set, but its WRITE path is DEFERRED: when strict-mode
--   per-message UI is built, set evidence_suppressed via a column-scoped SECURITY
--   DEFINER RPC (validates sender, updates ONLY that one column) — never a general
--   messages UPDATE policy. The shipping VP-3 control is conversation-level only.

-- ════════════════════════════════════════════════════════════════
-- END VP-3. Not touched (by design):
--   • verification_candidates / verified_* / achievements — never written here.
--   • promote_candidate()  — VP-5 owns the only exit to verified_*.
--   • message → claim staging — VP-6 (needs a model; context-architect-gated).
--   • save_to_agent_memory / agent_memory — the Digital-Twin path is untouched.
-- ════════════════════════════════════════════════════════════════
