-- ════════════════════════════════════════════════════════════════
-- Core-Roborate — VP-6b: DB-level Q4 enablement gate (hardening)
--
-- Additive, idempotent migration. Run AFTER verification-vp6-overseer.sql.
--
-- WHY
--   VP-6 enforced the Q4 agreement gate only in app code (lib/overseer/enable.ts):
--   an exec/admin could set an overseer rule lifecycle='active' via a direct
--   PostgREST/SQL UPDATE, bypassing the "proven agreement" bar (the Q5 ceiling,
--   kill-switch, and audit still bound the blast radius, but the gate itself was
--   not authoritative). This trigger makes the Q4 gate a HARD, non-bypassable DB
--   invariant: NO path — app route, raw API, or admin SQL — can transition a rule
--   INTO 'active' unless its active version meets the gate.
--
-- WHAT IT CHECKS (on the transition into 'active' only)
--   Over the active version's HUMAN-DECIDED shadow decisions (mirrors the
--   overseer_version_agreement view):
--     • decided sample      ≥ 50
--     • agreement rate       ≥ 0.95
--     • distinct attestors    ≥ 2
--     • oldest decision age   ≥ 14 days
--   (These are the standard Q4 gate values, matching lib/overseer/types.ts
--   Q4_GATE. The platform floor is 0.90/30; should org-configurable LOOSER gates
--   ever be added, relax these constants toward the floor and let the app enforce
--   the stricter org value. Today there is no org config, so DB == app gate.)
--
-- NO auth.uid() BYPASS — this is intentional and the whole point. Even the
-- service role (the legitimate enableRule path) must clear the gate; enableRule
-- already checks it in app, so it passes. Leaving 'active' (pause/retire) and all
-- other lifecycles are unaffected.
-- ════════════════════════════════════════════════════════════════

create or replace function guard_overseer_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_decided    integer;
  v_agreed     integer;
  v_attestors  integer;
  v_first      timestamptz;
  -- Standard Q4 gate (see header). Floor is 0.90/30 if org-config is added later.
  c_min_rate      constant numeric := 0.95;
  c_min_sample    constant integer := 50;
  c_min_attestors constant integer := 2;
  c_min_age_days  constant integer := 14;
begin
  -- Only guard the transition INTO 'active' (fresh enable or re-enable).
  if new.lifecycle = 'active'
     and (tg_op = 'INSERT' or old.lifecycle is distinct from 'active') then

    if new.active_version_id is null then
      raise exception 'Q4 gate: cannot activate a rule with no active version';
    end if;

    -- Agreement metrics for the version being activated, over HUMAN-DECIDED
    -- shadow decisions. SECURITY DEFINER so the gate sees all rows regardless of
    -- the caller's RLS. Org-scoped to the rule's org.
    select
      count(*) filter (where sd.human_action in ('approve', 'reject')),
      count(*) filter (where sd.agreed is true),
      count(distinct vc.attested_by) filter (
        where sd.human_action = 'approve' and vc.attested_by is not null
      ),
      min(sd.created_at) filter (where sd.human_action in ('approve', 'reject'))
    into v_decided, v_agreed, v_attestors, v_first
    from overseer_shadow_decisions sd
    left join verification_candidates vc on vc.id = sd.candidate_id
    where sd.rule_version_id = new.active_version_id
      and sd.org_id = new.org_id;

    v_decided   := coalesce(v_decided, 0);
    v_agreed    := coalesce(v_agreed, 0);
    v_attestors := coalesce(v_attestors, 0);

    if v_decided < c_min_sample then
      raise exception 'Q4 gate: need >= % human-decided shadow decisions (have %)',
        c_min_sample, v_decided;
    end if;
    if (v_agreed::numeric / v_decided) < c_min_rate then
      raise exception 'Q4 gate: agreement % below required %',
        round(v_agreed::numeric / v_decided, 4), c_min_rate;
    end if;
    if v_attestors < c_min_attestors then
      raise exception 'Q4 gate: need >= % distinct human attestors (have %)',
        c_min_attestors, v_attestors;
    end if;
    if v_first is null or v_first > now() - (c_min_age_days || ' days')::interval then
      raise exception 'Q4 gate: need >= % days of shadow history', c_min_age_days;
    end if;
  end if;

  return new;
end;
$$;

comment on function guard_overseer_activation() is
  'VP-6b: hard DB-level Q4 gate. Blocks any transition of an overseer rule INTO lifecycle=active unless its active version meets agreement >=0.95 over >=50 human-decided shadow decisions, >=2 distinct attestors, >=14 days. No auth.uid() bypass — authoritative regardless of path (closes the app-only enforcement gap).';

drop trigger if exists trg_overseer_activation_gate on overseer_rules;
create trigger trg_overseer_activation_gate
  before insert or update on overseer_rules
  for each row execute function guard_overseer_activation();

-- Trigger functions are never RPC-callable.
revoke execute on function guard_overseer_activation() from anon, authenticated, public;
