-- ════════════════════════════════════════════════════════════════
-- Core-Roborate — Verification Pipeline VP-5: promote_candidate()
--   THE PROMOTION BOUNDARY (amber candidate → blue verified record)
--
-- Additive, idempotent migration. Run AFTER:
--   schema.sql + rls-policies.sql + provisioning-rls.sql
--   + task-knowledge-agent.sql / task-verification-bridge.sql (achievements,
--     verified_tasks)
--   + verification-pipeline.sql (VP-1: verification_candidates + state machine)
--   + verification-vp2-task-signal.sql (VP-2: producer of achievement candidates)
--
-- WHAT THIS DOES (and ONLY this)
--   Defines promote_candidate(), the SINGLE pipeline writer into verified_*
--   (here: achievements) and the ONLY path that sets a verification_candidates
--   row to state='attested'. Nothing else in the pipeline may mint a verified
--   row or reach 'attested' — VP-1's client RLS can only ever reach 'rejected'.
--
-- THE TRUST WALL (never violated)
--   • verification_candidates are AMBER (AI inference / staging). They become a
--     BLUE verified fact ONLY by passing through this function, which a real
--     human (or, from VP-6, an enabled overseer rule) authorises.
--   • This is the one amber→blue transition in the whole system. Authority is
--     enforced IN-FUNCTION against auth.uid() (see the grant decision below).
--
-- ──────────────────────────────────────────────────────────────────
-- GRANT / auth.uid() DECISION (critical — read before changing grants)
-- ──────────────────────────────────────────────────────────────────
--   The human-attest authority check uses is_manager_of() / is_org_leader_of()
--   / current_role_name(), all of which resolve against auth.uid() (the manager
--   must be the subject's manager_id, etc.). Under the service role auth.uid()
--   is NULL, so the human check would ALWAYS fail.
--
--   THEREFORE: the human-attest server route calls this RPC on the USER's RLS
--   (browser) client — so auth.uid() IS the attesting manager — NOT the admin
--   client. The function is SECURITY DEFINER, so it runs as the table owner and
--   thus bypasses RLS to write the blue achievements row and to stamp the
--   candidate (which has no client UPDATE path to 'attested'). The authority
--   gate is the in-function check, not an RLS policy.
--
--   GRANTS: EXECUTE is KEPT for `authenticated` (so the user client can call
--   it) and REVOKED from `anon` and `public`. Security does NOT rest on the
--   grant — any authenticated caller may invoke it, but a non-authorised one is
--   rejected inside the function ('not authorized to attest for this subject').
--   The function is the ONLY way to reach state='attested'; no client UPDATE
--   policy permits it (VP-1's "vc: reviewer reject" pins WITH CHECK to
--   'rejected'). The service role may of course also call it (e.g. VP-6's
--   overseer path) — but that path is dormant here and raises.
-- ════════════════════════════════════════════════════════════════

create or replace function promote_candidate(
  p_candidate_id uuid,
  p_method       text default 'human',
  p_rule_version uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c        verification_candidates%rowtype;
  v_new_id uuid;
begin
  -- ── 1. Lock + load the candidate; idempotency / double-promote guards ──
  select * into c
    from verification_candidates
   where id = p_candidate_id
   for update;

  if not found then
    raise exception 'candidate % not found', p_candidate_id;
  end if;
  -- Idempotency / double-promote guard: a candidate already minted cannot be
  -- promoted again (would mint a second blue row).
  if c.state = 'attested' then
    raise exception 'already attested';
  end if;
  if c.state = 'rejected' then
    raise exception 'candidate % was rejected and cannot be promoted', p_candidate_id;
  end if;

  -- ── 2. Authority by method ────────────────────────────────────────────
  if p_method = 'human' then
    -- auth.uid() is the attesting human (the route calls this on the USER's
    -- RLS client — see the grant decision above). Must be the subject's
    -- manager, an org leader over them, or an admin/HR in the org.
    if not (
      is_manager_of(c.subject_id)
      or is_org_leader_of(c.subject_id)
      or current_role_name() in ('admin', 'hr')
    ) then
      raise exception 'not authorized to attest for this subject';
    end if;

  elsif p_method = 'overseer_rule' then
    -- DORMANT in VP-5. The active-rule re-check lands in VP-6.
    --
    -- Q5 DENYLIST (enforce when this path is enabled in VP-6): an overseer rule
    -- may attest ONLY low-stakes, evidence-backed kinds —
    --   c.target_kind in ('verified_task', 'achievement')
    --   AND suggested_verification_level <= 2.
    -- comp / promotion / rating / title kinds are PERMANENTLY human-only and may
    -- NEVER be auto-attested by a rule, regardless of confidence.
    raise exception 'overseer_rule promotion not enabled until VP-6';

  else
    raise exception 'invalid attest method';
  end if;

  -- ── 3. Mint the BLUE verified_* row from c.payload, per target_kind ────
  if c.target_kind = 'achievement' then
    -- Maps to the LIVE achievements columns (verified against the deployed DB):
    --   id, profile_id, org_id, kind, description, evidence_url, achievement_date,
    --   verification_level, created_at, updated_at, frozen_at, contribution_type,
    --   pending_executive. NOTE: this table has NO submitted_by column — the
    --   attesting human is recorded on the candidate (attested_by) + audit_log,
    --   so we do not (and cannot) write it here. verification_level capped at 2
    --   (Manager-Verified); exec sign-off (L3+) is a separate flow, so
    --   pending_executive=false. contribution_type uses its 'individual' default.
    insert into achievements (
      profile_id,
      org_id,
      kind,
      description,
      achievement_date,
      verification_level,
      pending_executive
    )
    values (
      c.subject_id,                                                  -- the person the claim is about
      c.org_id,                                                      -- org integrity: candidate's org, never crossed
      'achievement',
      c.payload->>'description',
      (c.payload->>'achievement_date')::date,
      least(2, coalesce((c.payload->>'suggested_verification_level')::int, 2)),
      false
    )
    returning id into v_new_id;

  else
    -- Every other target_kind is intentionally NOT half-mapped here. Producers
    -- + verified-table branches for these arrive with their future batches.
    raise exception
      'promotion of target_kind % is not supported yet (VP-5 supports achievement)',
      c.target_kind;
  end if;

  -- ── 4. Stamp the candidate as attested (the ONLY writer of this state) ──
  update verification_candidates
     set state                  = 'attested',
         attested_by            = auth.uid(),
         attested_at            = now(),
         attest_method          = p_method,
         attest_rule_version_id = p_rule_version,
         promoted_table         = 'achievements',
         promoted_id            = v_new_id,
         updated_at             = now()
   where id = p_candidate_id;

  -- ── 5. Audit the attestation ──────────────────────────────────────────
  insert into audit_log (actor_id, action, target_table, target_id, changes)
  values (
    auth.uid(),
    'candidate_attested',
    'verification_candidates',
    p_candidate_id,
    jsonb_build_object(
      'candidate_id',   p_candidate_id,
      'method',         p_method,
      'promoted_table', 'achievements',
      'promoted_id',    v_new_id,
      'target_kind',    c.target_kind,
      'subject_id',     c.subject_id
    )
  );

  -- ── 6. Return the new blue verified row id ────────────────────────────
  return v_new_id;
end;
$$;

comment on function promote_candidate(uuid, text, uuid) is
  'VP-5: THE promotion boundary. The ONLY pipeline writer into verified_* (achievements) and the ONLY path to verification_candidates.state=attested. Human authority enforced in-function via auth.uid() — caller MUST invoke on the user RLS client (auth.uid()=attesting manager), never the admin client (where auth.uid() is NULL and the check fails). overseer_rule method is dormant until VP-6. Only target_kind=achievement is implemented; all others raise.';

-- ── GRANTS (see the decision block at the top of this file) ────────────
-- KEEP execute for `authenticated` so the user's RLS client can call it (that
-- is what makes auth.uid() the attesting manager). REVOKE from anon + public.
-- A non-authorised authenticated caller is rejected INSIDE the function, and no
-- client UPDATE policy can reach state='attested' — so this function is the
-- single, gated amber→blue boundary.
revoke execute on function promote_candidate(uuid, text, uuid) from anon, public;
grant  execute on function promote_candidate(uuid, text, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════
-- END VP-5. promote_candidate() is the single verified_* writer + the only
-- path to state='attested'. Only target_kind='achievement' is wired; every
-- other kind and the overseer_rule method raise until their batches land.
-- ════════════════════════════════════════════════════════════════
