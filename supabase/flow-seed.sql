-- ════════════════════════════════════════════════════════════════
-- Credentia · FLOW — demo seed (Demo Corp)
--
-- Demonstrates all three provenance tiers and a NON-TRIVIAL burndown gap:
--   committed            = 40 pts
--   ATTESTED done        = 16 pts  (FLOW-1, FLOW-2, FLOW-5 — artifact-backed → Shipped)
--   ASSERTED-only done   =  8 pts  (FLOW-3, FLOW-4 — self-reported → Done, no evidence)
--   ⇒ asserted line trails attested by 8 pts: "8 points of unverified progress".
--
-- Plus 4 quarantined INFERENCES (never in the ledger until promoted).
-- Idempotent: re-running rebuilds the demo board cleanly.
-- ════════════════════════════════════════════════════════════════
do $$
declare
  v_org   uuid := 'f47ac10b-58cc-4372-a567-0e02b2c3d479';  -- Demo Corp
  v_mgr   uuid := 'a64b7eb5-895d-49d6-8be3-7cedab12f08b';  -- Jordan Lee (manager)
  v_maya  uuid := '72f30183-e6ff-4230-8042-03b9aa3e0157';  -- Maya Chen
  v_devin uuid := '37235c54-eb43-4c07-99dc-cb1f87be1ce3';  -- Devin Park
  v_sasha uuid := 'c85d79da-1537-47c6-846e-256b31922718';  -- Sasha Romano
  v_exec  uuid := 'fdb03267-0f75-4f73-a11d-f2eaaa99dba6';  -- Alex Morgan (executive)
  v_board uuid;
  c_back uuid; c_prog uuid; c_rev uuid; c_done uuid; c_ship uuid;
  i1 uuid; i2 uuid; i3 uuid; i4 uuid; i5 uuid; i6 uuid; i7 uuid; i8 uuid;
  a1 uuid; a2 uuid; a5 uuid;
  am1 uuid; am2 uuid; am3 uuid; ae1 uuid;
begin
  -- ── teardown prior demo (disable append-only guard for the teardown only) ──
  alter table flow_transition_events disable trigger flow_ledger_no_update;
  delete from flow_boards where org_id = v_org and name = 'Q3 Platform Sprint — Provenance Demo';
  alter table flow_transition_events enable trigger flow_ledger_no_update;

  insert into flow_boards (org_id, name, description, created_by, sprint_start, sprint_end, sprint_points_committed)
  values (v_org, 'Q3 Platform Sprint — Provenance Demo',
          'Every status carries a trust tier. Solid burndown = attested only; dashed = self-reported included.',
          v_mgr, date '2026-06-09', date '2026-06-23', 40)
  returning id into v_board;

  -- ── columns (evidence-gating lives here) ──
  insert into flow_columns (board_id, org_id, name, sort_order, is_terminal, required_tier)
    values (v_board, v_org, 'Backlog', 0, false, null) returning id into c_back;
  insert into flow_columns (board_id, org_id, name, sort_order, is_terminal, required_tier)
    values (v_board, v_org, 'In Progress', 1, false, null) returning id into c_prog;
  insert into flow_columns (board_id, org_id, name, sort_order, is_terminal, required_tier)
    values (v_board, v_org, 'In Review', 2, false, 'ASSERTED') returning id into c_rev;
  insert into flow_columns (board_id, org_id, name, sort_order, is_terminal, required_tier)
    values (v_board, v_org, 'Done · Self-reported', 3, true, null) returning id into c_done;
  insert into flow_columns (board_id, org_id, name, sort_order, is_terminal, required_tier)
    values (v_board, v_org, 'Shipped · Verified', 4, true, 'ATTESTED') returning id into c_ship;

  -- ── items ──
  insert into flow_items (org_id, board_id, title, description, point_estimate, owner_id, created_by)
    values (v_org, v_board, 'Auth token rotation', 'Rotate signing keys + refresh-token revocation.', 5, v_maya, v_mgr) returning id into i1;
  insert into flow_items (org_id, board_id, title, description, point_estimate, owner_id, created_by)
    values (v_org, v_board, 'Billing webhook retries', 'Idempotent retry queue for Stripe webhooks.', 8, v_devin, v_mgr) returning id into i2;
  insert into flow_items (org_id, board_id, title, description, point_estimate, owner_id, created_by)
    values (v_org, v_board, 'Org chart CSV export', 'Export the d3 org tree to CSV.', 3, v_sasha, v_mgr) returning id into i3;
  insert into flow_items (org_id, board_id, title, description, point_estimate, owner_id, created_by)
    values (v_org, v_board, 'Search reindex job', 'Nightly reindex for the verified resume network.', 5, v_maya, v_mgr) returning id into i4;
  insert into flow_items (org_id, board_id, title, description, point_estimate, owner_id, created_by)
    values (v_org, v_board, 'Dashboard skeleton loaders', 'Skeletons on all data-fetching cards.', 3, v_sasha, v_mgr) returning id into i5;
  insert into flow_items (org_id, board_id, title, description, point_estimate, owner_id, created_by)
    values (v_org, v_board, 'SCIM dedupe', 'Collapse duplicate SCIM-provisioned profiles.', 8, v_devin, v_mgr) returning id into i6;
  insert into flow_items (org_id, board_id, title, description, point_estimate, owner_id, created_by)
    values (v_org, v_board, 'Audit hash-chain UI', 'Render tamper-evident chain verification.', 5, v_maya, v_mgr) returning id into i7;
  insert into flow_items (org_id, board_id, title, description, point_estimate, owner_id, created_by)
    values (v_org, v_board, 'Pulse survey v2', 'New pulse question bank + scoring.', 3, v_sasha, v_mgr) returning id into i8;

  -- ── evidence artifacts (required before the ATTESTED events that cite them) ──
  insert into flow_evidence_artifacts (org_id, item_id, kind, uri, label, added_by)
    values (v_org, i1, 'merged_pr', 'https://github.com/credentia/app/pull/411', 'PR #411 — key rotation (merged)', v_maya) returning id into a1;
  insert into flow_evidence_artifacts (org_id, item_id, kind, uri, label, added_by)
    values (v_org, i2, 'deploy', 'deploy:prod:2026-06-16:7f3ac2', 'Prod deploy 7f3ac2', v_devin) returning id into a2;
  insert into flow_evidence_artifacts (org_id, item_id, kind, uri, label, added_by)
    values (v_org, i5, 'merged_pr', 'https://github.com/credentia/app/pull/418', 'PR #418 — skeletons (merged)', v_sasha) returning id into a5;

  -- ── ledger: create events at sprint start (all begin in Backlog, ASSERTED) ──
  insert into flow_transition_events (org_id, item_id, board_id, event_type, provenance_tier, to_column_id, actor_id, reason, created_at)
  select v_org, x.id, v_board, 'create', 'ASSERTED', c_back, v_mgr, 'Sprint planning', timestamptz '2026-06-09 09:00-04'
  from (values (i1),(i2),(i3),(i4),(i5),(i6),(i7),(i8)) as x(id);

  -- helper macro-by-hand: status events --------------------------------------
  -- FLOW-1 → Shipped (ATTESTED, artifact a1)
  insert into flow_transition_events (org_id,item_id,board_id,event_type,provenance_tier,to_column_id,actor_id,reason,created_at) values
    (v_org,i1,v_board,'status','ASSERTED',c_prog,v_maya,'Picked up',timestamptz '2026-06-10 10:00-04'),
    (v_org,i1,v_board,'status','ASSERTED',c_rev,v_maya,'PR open',timestamptz '2026-06-11 16:00-04');
  insert into flow_transition_events (org_id,item_id,board_id,event_type,provenance_tier,to_column_id,artifact_id,actor_id,reason,created_at) values
    (v_org,i1,v_board,'status','ATTESTED',c_ship,a1,v_maya,'Merged + deployed',timestamptz '2026-06-12 14:00-04');

  -- FLOW-2 → Shipped (ATTESTED, artifact a2)
  insert into flow_transition_events (org_id,item_id,board_id,event_type,provenance_tier,to_column_id,actor_id,reason,created_at) values
    (v_org,i2,v_board,'status','ASSERTED',c_prog,v_devin,'Started',timestamptz '2026-06-11 09:30-04'),
    (v_org,i2,v_board,'status','ASSERTED',c_rev,v_devin,'Ready for review',timestamptz '2026-06-15 11:00-04');
  insert into flow_transition_events (org_id,item_id,board_id,event_type,provenance_tier,to_column_id,artifact_id,actor_id,reason,created_at) values
    (v_org,i2,v_board,'status','ATTESTED',c_ship,a2,v_devin,'Shipped to prod',timestamptz '2026-06-16 15:00-04');

  -- FLOW-3 → Done self-reported (ASSERTED, NO artifact) — counts asserted only
  insert into flow_transition_events (org_id,item_id,board_id,event_type,provenance_tier,to_column_id,actor_id,reason,created_at) values
    (v_org,i3,v_board,'status','ASSERTED',c_prog,v_sasha,'Started',timestamptz '2026-06-12 13:00-04'),
    (v_org,i3,v_board,'status','ASSERTED',c_done,v_sasha,'Done — exported locally, will attach PR later',timestamptz '2026-06-14 17:00-04');

  -- FLOW-4 → Done self-reported (ASSERTED, NO artifact) — counts asserted only
  insert into flow_transition_events (org_id,item_id,board_id,event_type,provenance_tier,to_column_id,actor_id,reason,created_at) values
    (v_org,i4,v_board,'status','ASSERTED',c_prog,v_maya,'Started',timestamptz '2026-06-15 10:00-04'),
    (v_org,i4,v_board,'status','ASSERTED',c_done,v_maya,'Reindex running nightly — calling it done',timestamptz '2026-06-18 18:00-04');

  -- FLOW-5 → Shipped (ATTESTED, artifact a5)
  insert into flow_transition_events (org_id,item_id,board_id,event_type,provenance_tier,to_column_id,actor_id,reason,created_at) values
    (v_org,i5,v_board,'status','ASSERTED',c_prog,v_sasha,'Started',timestamptz '2026-06-17 09:00-04'),
    (v_org,i5,v_board,'status','ASSERTED',c_rev,v_sasha,'PR open',timestamptz '2026-06-18 12:00-04');
  insert into flow_transition_events (org_id,item_id,board_id,event_type,provenance_tier,to_column_id,artifact_id,actor_id,reason,created_at) values
    (v_org,i5,v_board,'status','ATTESTED',c_ship,a5,v_sasha,'Merged',timestamptz '2026-06-19 16:00-04');

  -- FLOW-6 → In Review (ASSERTED), still open
  insert into flow_transition_events (org_id,item_id,board_id,event_type,provenance_tier,to_column_id,actor_id,reason,created_at) values
    (v_org,i6,v_board,'status','ASSERTED',c_prog,v_devin,'Started',timestamptz '2026-06-16 09:00-04'),
    (v_org,i6,v_board,'status','ASSERTED',c_rev,v_devin,'Up for review',timestamptz '2026-06-20 09:30-04');

  -- FLOW-7 → In Progress (ASSERTED)
  insert into flow_transition_events (org_id,item_id,board_id,event_type,provenance_tier,to_column_id,actor_id,reason,created_at) values
    (v_org,i7,v_board,'status','ASSERTED',c_prog,v_maya,'Started',timestamptz '2026-06-19 11:00-04');

  -- FLOW-8 stays in Backlog (only the create event)

  -- ── INFERENCE QUARANTINE (never in the ledger until a human promotes) ──
  insert into flow_inferences (org_id, board_id, item_id, kind, summary, detail, predicted_value, confidence, model) values
    (v_org, v_board, i6, 'predicted_slip',
      'SCIM dedupe likely to slip ~4 days past sprint end',
      'Velocity on 8-pt items this sprint trends to ~12 days; entered review only on day 11.',
      jsonb_build_object('slip_date','2026-06-27','days',4), 0.72, 'flow-forecaster-v0'),
    (v_org, v_board, i4, 'risk_flag',
      'FLOW-4 marked Done but is self-reported with no evidence artifact',
      'Asserted completion with no merged PR / deploy / approval. Counts toward the dashed line only.',
      jsonb_build_object('tier','ASSERTED','points',5), 0.66, 'flow-forecaster-v0'),
    (v_org, v_board, i7, 'dependency_bottleneck',
      'Audit hash-chain UI appears blocked on SCIM dedupe (FLOW-6)',
      'Shared identity-resolution module; FLOW-7 commits reference the dedupe branch.',
      jsonb_build_object('blocked_by','SCIM dedupe'), 0.58, 'flow-forecaster-v0'),
    (v_org, v_board, i7, 'status_suggestion',
      'FLOW-7 looks ready for review — suggest moving to In Review',
      'Owner pushed a PR-shaped branch; recent activity matches items that moved to review.',
      jsonb_build_object('to_column_id', c_rev::text), 0.61, 'flow-forecaster-v0');

  -- ── Leader / manager VERIFICATION ACTIVITY ──
  -- Co-sign approvals on already-shipped (already-ATTESTED) items. These are
  -- ATTESTED transitions to the same terminal column, so they DO NOT change the
  -- burndown gap (the first terminal-entry per item is still the original ship);
  -- they exist to populate the executive's "Verification activity" stats:
  --   Manager approvals = 3 (Jordan Lee), Executive approvals = 1 (Alex Morgan).
  insert into flow_evidence_artifacts (org_id, item_id, kind, uri, label, added_by) values
    (v_org, i1, 'approval', 'signoff://flow/' || i1 || '?by=mgr',  'Manager review — Jordan Lee',  v_mgr)  returning id into am1;
  insert into flow_evidence_artifacts (org_id, item_id, kind, uri, label, added_by) values
    (v_org, i2, 'approval', 'signoff://flow/' || i2 || '?by=mgr',  'Manager review — Jordan Lee',  v_mgr)  returning id into am2;
  insert into flow_evidence_artifacts (org_id, item_id, kind, uri, label, added_by) values
    (v_org, i5, 'approval', 'signoff://flow/' || i5 || '?by=mgr',  'Manager review — Jordan Lee',  v_mgr)  returning id into am3;
  insert into flow_evidence_artifacts (org_id, item_id, kind, uri, label, added_by) values
    (v_org, i2, 'approval', 'signoff://flow/' || i2 || '?by=exec', 'Executive sign-off — Alex Morgan', v_exec) returning id into ae1;

  insert into flow_transition_events (org_id,item_id,board_id,event_type,provenance_tier,to_column_id,artifact_id,actor_id,reason,created_at) values
    (v_org,i1,v_board,'status','ATTESTED',c_ship,am1,v_mgr, 'Manager co-sign',       timestamptz '2026-06-20 09:00-04'),
    (v_org,i2,v_board,'status','ATTESTED',c_ship,am2,v_mgr, 'Manager co-sign',       timestamptz '2026-06-20 09:05-04'),
    (v_org,i5,v_board,'status','ATTESTED',c_ship,am3,v_mgr, 'Manager co-sign',       timestamptz '2026-06-20 09:10-04'),
    (v_org,i2,v_board,'status','ATTESTED',c_ship,ae1,v_exec,'Executive sign-off',    timestamptz '2026-06-20 10:00-04');

  raise notice 'FLOW demo seeded on board %', v_board;
end $$;
