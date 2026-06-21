-- ════════════════════════════════════════════════════════════════
-- Credentia — Verification Pipeline VP-2: Task-as-a-Verifier signal
--
-- Additive, idempotent migration. Run AFTER:
--   schema.sql + rls-policies.sql + provisioning-rls.sql
--   + task-knowledge-agent.sql / task-verification-bridge.sql
--                                 (define the `verified_tasks` table)
--   + verification-pipeline.sql  (VP-1: ingestion_events /
--                                 verification_candidates / candidate_evidence)
--
-- WHAT THIS DOES
--   When a `verified_tasks` row transitions INTO status='done', it
--   DETERMINISTICALLY stages ONE amber achievement CANDIDATE into the VP-1
--   pipeline, carrying full provenance (an ingestion_event + a candidate_evidence
--   link) and a payload mirroring what the manual verified_task → achievement
--   bridge would mint, so VP-5's promote_candidate() can later turn it into a
--   verified achievement cleanly. NO model / AI call — confidence is computed
--   from real task signals only.
--
-- TARGET TABLE (decision 2026-06-19)
--   The deployed task model on this project is `verified_tasks` (the table the
--   architecture doc's Mechanic 4 named), NOT the daily-pulse `tasks` table
--   (which is not deployed here). VP-2 hooks `verified_tasks`:
--     subject   = assignee_id          on_time = completed_at::date <= due_date
--     delegated = created_by <> assignee_id     link = project_id present
--   completion status value is 'done'.
--
-- WHY A TRIGGER
--   Task completion runs CLIENT-SIDE under RLS (no server seam). A SECURITY
--   DEFINER trigger is the deterministic, race-free hook — the same pattern as
--   guard_doc_verification() / guard_frozen_verified_record(). VP-2 is therefore
--   a small additive migration.
--
-- HARD WALL (never violated here)
--   • NOTHING writes a verified_* row, an `achievements` row, or sets a candidate
--     to state='attested'. The only exit to verified is promote_candidate()
--     (VP-5) and the existing manual bridge — neither is touched here.
--   • Every staged row is org_id-scoped to NEW.org_id.
--   • SECURITY DEFINER bypasses the VP-1 "no client INSERT" RLS — the intended
--     service-role staging write path.
--
-- IDEMPOTENCY
--   • Re-running this migration is safe (create or replace + drop/create trigger).
--   • Exactly one candidate per task, ever: anchored on ingestion_events' unique
--     (org_id, source_type, source_id). A re-completion (done → in_progress →
--     done) finds the ingestion row present (on conflict do nothing), so staging
--     is skipped.
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- §1 — Staging function
-- ────────────────────────────────────────────────────────────────
create or replace function stage_task_completion_candidate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ingestion_id   uuid;
  v_fresh_ingest   boolean := false;
  v_candidate_id   uuid;
  v_description    text;
  v_claim          text;
  v_ach_date       date;
  v_delegated      boolean;
  v_on_time        boolean;
  v_has_project    boolean;
  v_confidence     numeric;
begin
  -- Best-effort, SECONDARY signal. A failure here must NEVER block the primary
  -- task update; the whole body is wrapped to swallow + warn (no task content
  -- in the message). The trigger always returns NEW.
  begin
    -- ── Idempotent provenance root ────────────────────────────────
    insert into ingestion_events (org_id, subject_id, source_type, source_id, consent_basis, ingested_by)
    values (new.org_id, new.assignee_id, 'verified_task', new.id, 'task_context', null)
    on conflict (org_id, source_type, source_id) do nothing
    returning id into v_ingestion_id;

    if v_ingestion_id is not null then
      v_fresh_ingest := true;                 -- the RETURNING fired → brand-new ingestion
    else
      select id into v_ingestion_id
        from ingestion_events
       where org_id = new.org_id
         and source_type = 'verified_task'
         and source_id = new.id;
    end if;

    -- ── Stage exactly once ────────────────────────────────────────
    if v_fresh_ingest
       and not exists (
         select 1 from verification_candidates
          where org_id = new.org_id
            and target_kind = 'achievement'
            and payload->>'source_task_id' = new.id::text
       )
    then
      v_description := case
        when new.detail is not null and length(trim(new.detail)) > 0
          then new.title || ': ' || new.detail
        else new.title
      end;
      v_claim := 'Completed task: ' || new.title;

      -- achievement_date: completed date, else due date, else creation date.
      v_ach_date := coalesce(new.completed_at::date, new.due_date, new.created_at::date);

      -- ── Deterministic confidence ∈ [0,1] from REAL signals only ──
      --   base                              0.40  every completed task
      --   delegated (+0.30)  created_by is not null and <> assignee_id
      --                      → a leader assigned it to someone else (stronger
      --                        provenance than a self-created task)
      --   on time   (+0.15)  completed_at::date <= due_date (when due_date set)
      --   project   (+0.15)  project_id present (linked to a tracked project)
      -- Max 1.00 ; min 0.40 (self-created, late/no due date, no project).
      v_delegated   := (new.created_by is not null and new.created_by is distinct from new.assignee_id);
      v_on_time     := (new.completed_at is not null and new.due_date is not null
                        and new.completed_at::date <= new.due_date);
      v_has_project := (new.project_id is not null);

      v_confidence := least(
        1.0,
        0.40
        + (case when v_delegated   then 0.30 else 0 end)
        + (case when v_on_time     then 0.15 else 0 end)
        + (case when v_has_project then 0.15 else 0 end)
      );

      -- ── The amber candidate (AI-INFERENCE / staging — never verified) ──
      -- model=null + generated_by=null ⇒ deterministic, system-staged.
      -- state='pending' (NEVER 'attested'). target_kind='achievement'.
      insert into verification_candidates (
        org_id, subject_id, target_kind, claim, payload,
        state, confidence, model, generated_by
      )
      values (
        new.org_id,
        new.assignee_id,
        'achievement',
        v_claim,
        jsonb_build_object(
          'source_task_id',                new.id,
          'profile_id',                    new.assignee_id,
          'kind',                          'achievement',
          'description',                   v_description,
          'achievement_date',             v_ach_date,
          'suggested_verification_level',  2,        -- L2 Manager-Verified (suggested; VP-5 decides)
          'submitted_by',                  new.created_by,  -- natural attestor on promotion
          'origin',                        new.origin,
          'project_id',                    new.project_id,
          'due_date',                      new.due_date,
          'completed_at',                  new.completed_at,
          'staged_by',                     'vp2_task_completion'
        ),
        'pending',
        v_confidence,
        null,   -- model: null ⇒ deterministic, no AI call
        null    -- generated_by: null ⇒ system-staged
      )
      returning id into v_candidate_id;

      -- ── Provenance link: candidate ↔ ingestion event ─────────────
      insert into candidate_evidence (candidate_id, ingestion_id, weight, note)
      values (
        v_candidate_id,
        v_ingestion_id,
        v_confidence,
        'Staged from verified_task completion (deterministic, VP-2).'
      )
      on conflict (candidate_id, ingestion_id) do nothing;

      -- ── Audit (actor_id = null = system) ─────────────────────────
      insert into audit_log (actor_id, action, target_table, target_id, changes)
      values (
        null, 'evidence_ingested', 'ingestion_events', v_ingestion_id,
        jsonb_build_object(
          'task_id', new.id, 'source_type', 'verified_task',
          'subject_id', new.assignee_id, 'consent_basis', 'task_context',
          'staged_by', 'vp2_task_completion'
        )
      );

      insert into audit_log (actor_id, action, target_table, target_id, changes)
      values (
        null, 'verification_candidate_staged', 'verification_candidates', v_candidate_id,
        jsonb_build_object(
          'task_id', new.id, 'candidate_id', v_candidate_id,
          'target_kind', 'achievement', 'subject_id', new.assignee_id,
          'confidence', v_confidence, 'deterministic', true,
          'staged_by', 'vp2_task_completion'
        )
      );
    end if;

  exception when others then
    raise warning 'VP-2 stage_task_completion_candidate skipped for task % (org %): %',
      new.id, new.org_id, sqlerrm;
  end;

  return new;
end;
$$;

comment on function stage_task_completion_candidate() is
  'VP-2: on a verified_tasks row transitioning into status=done, deterministically stages ONE amber achievement candidate (+ ingestion event + evidence + audit) into the VP-1 pipeline. No model call. Never writes verified_*/achievements. Best-effort: failures never block the task update.';

-- Trigger functions never need to be RPC-callable. Revoke EXECUTE so it is not
-- exposed via PostgREST (/rest/v1/rpc/...); triggers still fire as table owner.
revoke execute on function stage_task_completion_candidate() from anon, authenticated, public;

-- ────────────────────────────────────────────────────────────────
-- §2 — Triggers
-- ────────────────────────────────────────────────────────────────
-- Fire on the edge into 'done'. Guarded on a non-null assignee because
-- verification_candidates.subject_id is NOT NULL — an unassigned task that
-- completes simply stages nothing. The function is OLD-agnostic; the
-- ingestion-event unique constraint keeps it to exactly one candidate per task
-- across both the UPDATE and INSERT triggers.
drop trigger if exists trg_vtask_stage_candidate on verified_tasks;
create trigger trg_vtask_stage_candidate
  after update on verified_tasks
  for each row
  when (new.status = 'done' and old.status is distinct from 'done' and new.assignee_id is not null)
  execute function stage_task_completion_candidate();

-- Also cover a row INSERTed already at status='done'.
drop trigger if exists trg_vtask_stage_candidate_ins on verified_tasks;
create trigger trg_vtask_stage_candidate_ins
  after insert on verified_tasks
  for each row
  when (new.status = 'done' and new.assignee_id is not null)
  execute function stage_task_completion_candidate();

-- ════════════════════════════════════════════════════════════════
-- END VP-2. Not touched (by design):
--   • the manual verified_task → achievement bridge stays as-is.
--   • promote_candidate()  — VP-5 owns the only exit to verified_*.
--   • verified_* / achievements — never written here.
-- ════════════════════════════════════════════════════════════════
