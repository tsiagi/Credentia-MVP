-- ════════════════════════════════════════════════════════════════
-- Core-Roborate — Verification Pipeline VP-6: Overseer AI
--   shadow → active learning loop + auto-promotion + race-free kill-switch
--
-- Additive, idempotent migration. Run AFTER:
--   verification-pipeline.sql        (VP-1: overseer_* tables, SELECT RLS)
--   verification-vp2-task-signal.sql (VP-2: achievement candidate producer)
--   verification-vp5-promote.sql     (VP-5: promote_candidate human path — LIVE)
--
-- WHAT THIS DOES (and ONLY this)
--   a. REPLACES the dormant `overseer_rule` raise-stub inside promote_candidate()
--      with the real auto-attest logic. The HUMAN path and every other branch
--      are preserved BYTE-FOR-BYTE from VP-5 (re-stated here so the function is a
--      single source of truth; diff against VP-5 to confirm zero human-path drift).
--   b. Adds the overseer_* WRITE RLS policies VP-1 deliberately left out:
--        • rule / version INSERT  → service-role (proposals) + admin/exec
--        • version approval UPDATE → admin/exec
--        • shadow→active enable UPDATE (lifecycle, enabled_by/at) → executive/admin
--        • pause (kill-switch) UPDATE → manager+ (own scope) / admin-exec (org)
--        • shadow-decision INSERT/UPDATE → service-role ONLY
--      VP-1's SELECT policies are untouched.
--   c. An agreement-metrics VIEW the enablement gate (Q4) reads.
--
-- HARD INVARIANTS (never violated)
--   • promote_candidate() stays the ONLY writer into verified_* / state='attested'.
--   • A `shadow` rule NEVER enacts (no auto-promote); only `active` does.
--   • Kill-switch is RACE-FREE: lifecycle is re-checked INSIDE the txn, AFTER the
--     candidate FOR UPDATE lock, so a rule paused mid-flight cannot promote.
--   • Q5 ceiling is enforced IN this function (target_kind denylist + level ≤ 2) —
--     comp / promotion / rating / title kinds can NEVER be auto-attested.
--   • `logic` is structured inspectable JSON evaluated by the app runner — this
--     SQL never executes rule prose. `rationale` is advisory only. NO model call.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- (a) promote_candidate() — overseer_rule branch made REAL
--     Human path + mint + stamp + audit preserved VERBATIM from VP-5.
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
  c                verification_candidates%rowtype;
  v_new_id         uuid;
  v_rule_lifecycle text;
  v_rule_kind      text;
begin
  -- ── 1. Lock + load the candidate; idempotency / double-promote guards ──
  select * into c
    from verification_candidates
   where id = p_candidate_id
   for update;

  if not found then
    raise exception 'candidate % not found', p_candidate_id;
  end if;
  if c.state = 'attested' then
    raise exception 'already attested';
  end if;
  if c.state = 'rejected' then
    raise exception 'candidate % was rejected and cannot be promoted', p_candidate_id;
  end if;

  -- ── 2. Authority by method ────────────────────────────────────────────
  if p_method = 'human' then
    -- ▼▼▼ HUMAN PATH — UNCHANGED FROM VP-5 (do not edit) ▼▼▼
    if not (
      is_manager_of(c.subject_id)
      or is_org_leader_of(c.subject_id)
      or current_role_name() in ('admin', 'hr')
    ) then
      raise exception 'not authorized to attest for this subject';
    end if;
    -- ▲▲▲ END HUMAN PATH ▲▲▲

  elsif p_method = 'overseer_rule' then
    -- ════════════════════════════════════════════════════════════════
    -- VP-6: the overseer_rule branch (replaces VP-5's raise-stub).
    -- Reached only by the service-role runner (lib/overseer/runShadow…).
    -- ════════════════════════════════════════════════════════════════
    if p_rule_version is null then
      raise exception 'overseer_rule promotion requires a rule version';
    end if;

    -- (i) RACE-FREE KILL-SWITCH: re-read the rule lifecycle NOW, inside this
    --     txn, AFTER the candidate FOR UPDATE lock above. If an exec/admin paused
    --     (or never enabled) the rule, lifecycle is no longer 'active' and we
    --     refuse — even for a candidate already selected by the runner a moment
    --     ago. The lock serialises this re-check against any concurrent promote.
    --     Org integrity: the version's rule must belong to the candidate's org.
    select r.lifecycle, r.target_kind
      into v_rule_lifecycle, v_rule_kind
      from overseer_rule_versions rv
      join overseer_rules r on r.id = rv.rule_id
     where rv.id = p_rule_version
       and r.org_id = c.org_id;

    if v_rule_lifecycle is distinct from 'active' then
      raise exception 'rule not active (kill-switch / not enabled)';
    end if;

    -- (ii) Q5 CEILING (HARD, permanent denylist — enforced HERE, not just app):
    --      an overseer rule may auto-attest ONLY low-stakes, evidence-backed
    --      kinds at level ≤ 2. comp / promotion-readiness / rating / title kinds
    --      are PERMANENTLY human-only, regardless of agreement or confidence.
    if c.target_kind not in ('verified_task', 'achievement')
       or coalesce((c.payload->>'suggested_verification_level')::int, 1) > 2 then
      raise exception 'target_kind not eligible for auto-attestation';
    end if;

    -- Defence-in-depth: the rule's own declared target_kind must match the
    -- candidate it is about to attest (a rule for achievements cannot promote a
    -- project candidate even if both somehow slipped the ceiling above).
    if v_rule_kind is not null and v_rule_kind <> c.target_kind then
      raise exception 'rule target_kind does not match candidate';
    end if;

  else
    raise exception 'invalid attest method';
  end if;

  -- ── 3. Mint the BLUE verified_* row from c.payload, per target_kind ────
  --      IDENTICAL mint to VP-5 (achievements is the only wired verified_*
  --      table). The auto-attest path mints exactly as the human path does.
  if c.target_kind = 'achievement' then
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
      c.subject_id,
      c.org_id,
      'achievement',
      c.payload->>'description',
      (c.payload->>'achievement_date')::date,
      least(2, coalesce((c.payload->>'suggested_verification_level')::int, 2)),
      false
    )
    returning id into v_new_id;

  else
    -- verified_task and every other kind are not yet mapped to a verified_*
    -- branch (parity with VP-5). The Q5 ceiling above already restricts the
    -- overseer path to ('verified_task','achievement'); until a verified_task
    -- mint branch exists, an overseer_rule on verified_task lands here and
    -- raises — never silently mints the wrong row.
    raise exception
      'promotion of target_kind % is not supported yet (VP-5/VP-6 support achievement)',
      c.target_kind;
  end if;

  -- ── 4. Stamp the candidate as attested (the ONLY writer of this state) ──
  --      attested_by = auth.uid(): for the overseer path the service role has
  --      auth.uid() = NULL, so attested_by is null (no human). attest_method +
  --      attest_rule_version_id record WHICH rule version auto-attested it.
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
  --      Human → candidate_attested; rule → candidate_auto_promoted (with the
  --      rule version, so every auto-promotion is traceable to its logic version).
  insert into audit_log (actor_id, action, target_table, target_id, changes)
  values (
    auth.uid(),
    case when p_method = 'overseer_rule' then 'candidate_auto_promoted'
         else 'candidate_attested' end,
    'verification_candidates',
    p_candidate_id,
    jsonb_build_object(
      'candidate_id',   p_candidate_id,
      'method',         p_method,
      'rule_version',   p_rule_version,
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
  'VP-5/VP-6: THE promotion boundary. The ONLY pipeline writer into verified_* (achievements) and the ONLY path to verification_candidates.state=attested. p_method=human: authority enforced in-function via auth.uid() (caller invokes on the USER RLS client). p_method=overseer_rule (VP-6): service-role only; rule lifecycle re-checked = active INSIDE the txn after the candidate FOR UPDATE lock (race-free kill-switch); Q5 ceiling enforced here — only target_kind in (verified_task,achievement) at level <=2 may auto-attest; comp/promotion/rating/title are permanently human-only.';

-- ── GRANTS — UNCHANGED FROM VP-5 (re-stated for idempotency) ───────────
-- KEEP execute for `authenticated` (user RLS client → auth.uid()=attester);
-- REVOKE from anon + public. The service role may also call it (overseer path).
revoke execute on function promote_candidate(uuid, text, uuid) from anon, public;
grant  execute on function promote_candidate(uuid, text, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════
-- (c) Agreement-metrics VIEW — read by the Q4 enablement gate + oversight UI
--     Per rule VERSION: how its shadow proposals compared to human outcomes.
--     Only HUMAN-DECIDED shadow rows (human_action in approve|reject) count
--     toward agreement; pending/unresolved rows do not.
-- ════════════════════════════════════════════════════════════════
create or replace view overseer_version_agreement as
select
  rv.id                                       as rule_version_id,
  rv.rule_id                                  as rule_id,
  rv.org_id                                   as org_id,
  rv.version                                  as version,
  -- # of shadow decisions where the human has actually decided (the sample).
  count(*) filter (
    where sd.human_action in ('approve', 'reject')
  )                                           as decided_sample_size,
  -- # where the overseer agreed with the human.
  count(*) filter (where sd.agreed is true)   as agreed_count,
  -- agreement rate over the decided sample (null when no decided rows yet).
  case
    when count(*) filter (where sd.human_action in ('approve','reject')) = 0
      then null
    else round(
      count(*) filter (where sd.agreed is true)::numeric
      / count(*) filter (where sd.human_action in ('approve','reject')),
      4)
  end                                         as agreement_rate,
  -- distinct human attestors who decided on this version's candidates (≥2 gate).
  count(distinct vc.attested_by) filter (
    where sd.human_action = 'approve' and vc.attested_by is not null
  )                                           as distinct_attestors,
  -- age of the oldest decided shadow decision (≥14 days gate).
  min(sd.created_at) filter (
    where sd.human_action in ('approve','reject')
  )                                           as first_decided_at
from overseer_rule_versions rv
left join overseer_shadow_decisions sd on sd.rule_version_id = rv.id
left join verification_candidates  vc on vc.id = sd.candidate_id
group by rv.id, rv.rule_id, rv.org_id, rv.version;

comment on view overseer_version_agreement is
  'VP-6: per rule-version agreement metrics over HUMAN-DECIDED shadow decisions. Read by the Q4 shadow→active enablement gate (agreement_rate, decided_sample_size, distinct_attestors, first_decided_at) and the oversight UI. Inherits RLS from the underlying overseer_* / verification_candidates SELECT policies (security_invoker view).';

-- View runs with the caller's privileges so the underlying RLS still scopes
-- rows to the caller's org + role (no leak past VP-1 SELECT policies).
alter view overseer_version_agreement set (security_invoker = on);

-- ════════════════════════════════════════════════════════════════
-- (b) OVERSEER WRITE RLS POLICIES
--     VP-1 created only SELECT (manager+/leader, org-scoped). VP-1's posture
--     was "no write policy → service-role only". VP-6 ADDS the human write
--     paths Q3 settled; the service role still bypasses RLS for the runner +
--     proposals (it ignores these policies entirely). All keyed to current_org().
--
--     ROLE NOTE: current_role_name() returns the profile role string. There is
--     no separate 'executive' AND 'admin' superset helper, so admin/exec checks
--     use current_role_name() in ('executive','admin'); manager+ adds 'manager'.
-- ════════════════════════════════════════════════════════════════

-- ── OVERSEER RULES ──────────────────────────────────────────────
-- INSERT a new rule (a proposal shell): admin/exec in-org. The service role
-- (Overseer proposer) bypasses RLS, so this policy is the HUMAN proposal path.
drop policy if exists "or: admin/exec insert" on overseer_rules;
create policy "or: admin/exec insert" on overseer_rules for insert
  with check (
    org_id = current_org()
    and current_role_name() in ('executive', 'admin')
  );

-- ENABLE shadow→active (and the inverse pause back to non-active): the
-- lifecycle flip + enabled_by/at is a WEIGHTY act restricted to executive/admin
-- (Q3). USING gates which rows; WITH CHECK keeps it org-scoped. App-side
-- enableRule() additionally enforces the Q4 gate before issuing this UPDATE;
-- promote_candidate() re-checks lifecycle='active' under lock regardless.
drop policy if exists "or: exec enable" on overseer_rules;
create policy "or: exec enable" on overseer_rules for update
  using (
    org_id = current_org()
    and current_role_name() in ('executive', 'admin')
  )
  with check (
    org_id = current_org()
    and current_role_name() in ('executive', 'admin')
  );

-- PAUSE (kill-switch): manager+ over their OWN scope (the rule's scope_subject
-- is one of their reports, or they ARE the scope_subject), and admin/exec
-- org-wide. WITH CHECK pins the result to 'paused' so this policy can ONLY
-- pause — it can never (re)enable a rule (that is the exec-only policy above).
drop policy if exists "or: manager pause" on overseer_rules;
create policy "or: manager pause" on overseer_rules for update
  using (
    org_id = current_org()
    and (
      current_role_name() in ('executive', 'admin')
      or (
        current_role_name() = 'manager'
        and (
          scope_subject = auth.uid()
          or is_manager_of(scope_subject)
        )
      )
    )
  )
  with check (
    org_id = current_org()
    and lifecycle = 'paused'
  );

-- ── OVERSEER RULE VERSIONS ──────────────────────────────────────
-- INSERT a version (proposed logic): admin/exec in-org (service-role Overseer
-- proposer bypasses RLS). Immutable once written — no client UPDATE of `logic`.
drop policy if exists "orv: admin/exec insert" on overseer_rule_versions;
create policy "orv: admin/exec insert" on overseer_rule_versions for insert
  with check (
    org_id = current_org()
    and current_role_name() in ('executive', 'admin')
  );

-- APPROVE a version (stamp approved_by; advisory metrics): admin/exec in-org.
-- WITH CHECK keeps it org-scoped. The `logic` column is application-immutable by
-- convention (a new version is added rather than edited); this policy exists so
-- approved_by / shadow_* metrics can be stamped, not to mutate logic.
drop policy if exists "orv: admin/exec approve" on overseer_rule_versions;
create policy "orv: admin/exec approve" on overseer_rule_versions for update
  using (
    org_id = current_org()
    and current_role_name() in ('executive', 'admin')
  )
  with check (
    org_id = current_org()
    and current_role_name() in ('executive', 'admin')
  );

-- ── OVERSEER SHADOW DECISIONS ───────────────────────────────────
-- NO client INSERT/UPDATE: the shadow runner + human-outcome backfill are
-- SERVICE-ROLE ONLY (the service role bypasses RLS). With RLS enabled and no
-- INSERT/UPDATE policy, no authenticated client can forge or rewrite a shadow
-- decision. VP-1's "osd: manager+ read" SELECT policy is the only client access.
-- (Intentionally no policy added here — this comment documents the decision.)

-- ════════════════════════════════════════════════════════════════
-- END VP-6.
--   • promote_candidate(): overseer_rule branch real; human path unchanged.
--   • Kill-switch race-free via in-txn lifecycle re-check under the row lock.
--   • Q5 ceiling enforced in-function (denylist + level ≤ 2).
--   • Write RLS: rule/version INSERT + version approve (admin/exec), enable
--     (exec/admin), pause (manager-own-scope / admin-exec); shadow rows
--     service-role only. VP-1 SELECT policies preserved.
--   • overseer_version_agreement view (security_invoker) feeds the Q4 gate.
--   • NO model call added; `logic` stays structured/inspectable JSON.
-- ════════════════════════════════════════════════════════════════
