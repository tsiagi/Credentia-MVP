-- ════════════════════════════════════════════════════════════════
-- Security fix #2 — close owner self-attestation on verified_* tables
-- Run AFTER rls-policies.sql (and the later additive policy files).
-- Idempotent: safe to re-run.
--
-- PROBLEM (audit #2):
--   rls-policies.sql grants the row owner `FOR ALL ... WITH CHECK
--   (profile_id = auth.uid())` on verified_facts / achievements / kpis /
--   projects / process_improvements. Nothing constrained verification_level
--   or status, so a user could open DevTools and:
--     supabase.from('achievements').insert({ profile_id: me,
--                                            verification_level: 5, ... })
--   minting a fully "verified" (level-5) credential, or flip status to
--   'approved' on their own KPI / process improvement — completely bypassing
--   the VP-5 promote_candidate() attestation wall and destroying the
--   verified-vs-inferred invariant.
--
-- FIX:
--   Replace each `owner all` with scoped policies. Owners may freely READ all
--   of their own rows, and may INSERT/UPDATE/DELETE only DRAFT rows
--   (verification_level = 1, and status not self-advanced past 'pending'/
--   'clarify'). Raising verification_level (>1) or setting status='approved'
--   is reachable ONLY through the manager / leader / promote_candidate paths,
--   whose policies are unchanged. RLS permissive policies are OR'd, so manager
--   verification keeps working.
--
-- NOTE: process_improvements has no verification_level column — its
--   attestation field is `status`, so the owner gate uses status only.
-- ════════════════════════════════════════════════════════════════

-- ── verified_facts ──────────────────────────────────────────────
drop policy if exists "facts: owner all" on verified_facts;
create policy "facts: owner select" on verified_facts for select
  using (profile_id = auth.uid());
create policy "facts: owner insert draft" on verified_facts for insert
  with check (profile_id = auth.uid() and verification_level = 1);
create policy "facts: owner update draft" on verified_facts for update
  using (profile_id = auth.uid() and verification_level = 1)
  with check (profile_id = auth.uid() and verification_level = 1);
create policy "facts: owner delete draft" on verified_facts for delete
  using (profile_id = auth.uid() and verification_level = 1);

-- ── achievements ────────────────────────────────────────────────
drop policy if exists "ach: owner all" on achievements;
create policy "ach: owner select" on achievements for select
  using (profile_id = auth.uid());
-- pending_executive may be true (team submit awaiting exec) — still level 1.
create policy "ach: owner insert draft" on achievements for insert
  with check (profile_id = auth.uid() and verification_level = 1);
create policy "ach: owner update draft" on achievements for update
  using (profile_id = auth.uid() and verification_level = 1)
  with check (profile_id = auth.uid() and verification_level = 1);
create policy "ach: owner delete draft" on achievements for delete
  using (profile_id = auth.uid() and verification_level = 1);

-- ── kpis (owner column is employee_id; gate level AND status) ────
drop policy if exists "kpi: owner all" on kpis;
create policy "kpi: owner select" on kpis for select
  using (employee_id = auth.uid());
create policy "kpi: owner insert draft" on kpis for insert
  with check (employee_id = auth.uid() and verification_level = 1
              and status in ('pending', 'clarify'));
-- Owner may edit a not-yet-verified KPI (e.g. update progress) but cannot
-- self-approve or raise the verification level.
create policy "kpi: owner update draft" on kpis for update
  using (employee_id = auth.uid() and verification_level = 1)
  with check (employee_id = auth.uid() and verification_level = 1
              and status in ('pending', 'clarify'));
create policy "kpi: owner delete draft" on kpis for delete
  using (employee_id = auth.uid() and verification_level = 1);

-- ── projects ────────────────────────────────────────────────────
drop policy if exists "proj: owner all" on projects;
create policy "proj: owner select" on projects for select
  using (profile_id = auth.uid());
create policy "proj: owner insert draft" on projects for insert
  with check (profile_id = auth.uid() and verification_level = 1);
create policy "proj: owner update draft" on projects for update
  using (profile_id = auth.uid() and verification_level = 1)
  with check (profile_id = auth.uid() and verification_level = 1);
create policy "proj: owner delete draft" on projects for delete
  using (profile_id = auth.uid() and verification_level = 1);

-- ── process_improvements (no verification_level; gate status) ────
drop policy if exists "pi: owner all" on process_improvements;
create policy "pi: owner select" on process_improvements for select
  using (profile_id = auth.uid());
create policy "pi: owner insert draft" on process_improvements for insert
  with check (profile_id = auth.uid() and status in ('pending', 'clarify'));
create policy "pi: owner update draft" on process_improvements for update
  using (profile_id = auth.uid() and status in ('pending', 'clarify'))
  with check (profile_id = auth.uid() and status in ('pending', 'clarify'));
create policy "pi: owner delete draft" on process_improvements for delete
  using (profile_id = auth.uid() and status in ('pending', 'clarify'));
