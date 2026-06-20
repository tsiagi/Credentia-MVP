// lib/overseer/runShadow.ts
// ─────────────────────────────────────────────────────────────
// VP-6 — Shadow runner + human-outcome backfill (SERVER, service-role).
//
// runShadowForCandidate(): for each shadow|active rule whose target_kind matches
// a candidate, DETERMINISTICALLY evaluate it (evaluateRule — no model call),
// write an overseer_shadow_decisions row (proposed_action + proof_of_context,
// was_enacted=false). If the rule is ACTIVE and the eval is 'approve' and it
// passes the Q5 ceiling, call promote_candidate(method='overseer_rule') to
// auto-attest, then flip that decision's was_enacted=true. A `shadow` rule NEVER
// enacts.
//
// recordHumanOutcome(): backfill human_action + agreed on a candidate's shadow
// rows so agreement can be measured (Q4). Wired into the human attest/reject
// paths.
//
// Service-role client (getSupabaseAdmin) ONLY — server-side. NEVER NEXT_PUBLIC_.
// The auto-attest RPC is called on the SAME service-role client: promote_candidate
// is SECURITY DEFINER and re-checks lifecycle='active' under the candidate lock,
// so the kill-switch is enforced server-side regardless of this runner.
// ─────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { evaluateRule, isEnactable } from "@/lib/overseer/evaluate";
import type {
  EvaluableCandidate,
  ProposedAction,
  RuleLogic,
} from "@/lib/overseer/types";
import type {
  CandidateTargetKind,
  IngestionSourceType,
} from "@/lib/verification/ingest";

export interface ShadowRunResult {
  candidateId: string;
  rulesEvaluated: number;
  decisionsWritten: number;
  enacted: boolean;
  enactedRuleVersionId: string | null;
  verifiedId: string | null;
}

/**
 * Run every shadow|active rule that matches a candidate.
 * Returns a summary; throws only on unexpected DB errors (an auto-promote that
 * fails the in-function kill-switch / Q5 re-check is caught and recorded, not
 * thrown — the shadow row is still written with was_enacted=false).
 */
export async function runShadowForCandidate(
  candidateId: string,
): Promise<ShadowRunResult> {
  const admin = getSupabaseAdmin();

  // Load the candidate (service role bypasses RLS — server-side only).
  const { data: cRow, error: cErr } = await admin
    .from("verification_candidates")
    .select("id, org_id, subject_id, target_kind, state, confidence, payload")
    .eq("id", candidateId)
    .single();
  if (cErr) throw cErr;

  const candidate = cRow as {
    id: string;
    org_id: string;
    subject_id: string;
    target_kind: CandidateTargetKind;
    state: string;
    confidence: number | null;
    payload: Record<string, unknown> | null;
  };

  const result: ShadowRunResult = {
    candidateId,
    rulesEvaluated: 0,
    decisionsWritten: 0,
    enacted: false,
    enactedRuleVersionId: null,
    verifiedId: null,
  };

  // Only run on a still-open candidate — never re-decide an attested/rejected one.
  if (candidate.state !== "pending" && candidate.state !== "shadow_approved") {
    return result;
  }

  // Assemble the deterministic evaluation inputs (evidence types + ids).
  const { data: evRows } = await admin
    .from("candidate_evidence")
    .select("ingestion_id, ingestion_events ( source_type )")
    .eq("candidate_id", candidateId);

  const evidenceIds: string[] = [];
  const evidenceTypes: IngestionSourceType[] = [];
  // The joined ingestion_events relation may be typed as an object OR an array
  // depending on inferred cardinality — normalise both shapes.
  for (const r of (evRows ?? []) as unknown as Array<{
    ingestion_id: string;
    ingestion_events:
      | { source_type: IngestionSourceType }
      | { source_type: IngestionSourceType }[]
      | null;
  }>) {
    evidenceIds.push(r.ingestion_id);
    const ie = Array.isArray(r.ingestion_events)
      ? r.ingestion_events[0]
      : r.ingestion_events;
    if (ie?.source_type) evidenceTypes.push(ie.source_type);
  }

  const suggestedLevel = Number(
    (candidate.payload as Record<string, unknown> | null)?.[
      "suggested_verification_level"
    ] ?? 1,
  );

  const evaluable: EvaluableCandidate = {
    id: candidate.id,
    org_id: candidate.org_id,
    subject_id: candidate.subject_id,
    target_kind: candidate.target_kind,
    confidence: candidate.confidence,
    suggested_level: Number.isFinite(suggestedLevel) ? suggestedLevel : 1,
    evidence_types: evidenceTypes,
    evidence_ids: evidenceIds,
  };

  // Candidate rules: shadow OR active, same org, matching target_kind.
  const { data: ruleRows, error: rErr } = await admin
    .from("overseer_rules")
    .select("id, lifecycle, target_kind, active_version_id")
    .eq("org_id", candidate.org_id)
    .eq("target_kind", candidate.target_kind)
    .in("lifecycle", ["shadow", "active"]);
  if (rErr) throw rErr;

  for (const rule of (ruleRows ?? []) as Array<{
    id: string;
    lifecycle: "shadow" | "active";
    target_kind: CandidateTargetKind;
    active_version_id: string | null;
  }>) {
    // Which version's logic to evaluate: the active version if set, else the
    // latest version (so a shadow rule still runs its newest proposed logic).
    const versionId = rule.active_version_id ?? (await latestVersionId(admin, rule.id));
    if (!versionId) continue;

    const { data: verRow } = await admin
      .from("overseer_rule_versions")
      .select("id, logic")
      .eq("id", versionId)
      .single();
    if (!verRow) continue;

    const logic = (verRow as { id: string; logic: RuleLogic }).logic;
    const evaluation = evaluateRule(logic, evaluable);
    result.rulesEvaluated += 1;

    const proposedAction: ProposedAction = evaluation.action;

    // Write the shadow decision (always was_enacted=false initially).
    const { data: decRow, error: decErr } = await admin
      .from("overseer_shadow_decisions")
      .insert({
        org_id: candidate.org_id,
        rule_id: rule.id,
        rule_version_id: versionId,
        candidate_id: candidateId,
        proposed_action: proposedAction,
        proof_of_context: evaluation.proof,
        human_action: "pending",
        was_enacted: false,
      })
      .select("id")
      .single();
    if (decErr) throw decErr;
    result.decisionsWritten += 1;

    await admin.from("audit_log").insert({
      actor_id: null,
      action: "overseer_shadow_decision",
      target_table: "overseer_shadow_decisions",
      target_id: (decRow as { id: string }).id,
      changes: {
        rule_id: rule.id,
        rule_version_id: versionId,
        candidate_id: candidateId,
        proposed_action: proposedAction,
        lifecycle: rule.lifecycle,
      },
    });

    // ── ENACT only when ACTIVE + approve + Q5-eligible, and only once. ──
    if (
      rule.lifecycle === "active" &&
      !result.enacted &&
      isEnactable(evaluation)
    ) {
      try {
        const { data: verifiedId, error: rpcErr } = await admin.rpc(
          "promote_candidate",
          {
            p_candidate_id: candidateId,
            p_method: "overseer_rule",
            p_rule_version: versionId,
          },
        );
        if (rpcErr) throw rpcErr;

        // Mark the decision enacted (the kill-switch / Q5 re-check passed in-fn).
        await admin
          .from("overseer_shadow_decisions")
          .update({ was_enacted: true })
          .eq("id", (decRow as { id: string }).id);

        result.enacted = true;
        result.enactedRuleVersionId = versionId;
        result.verifiedId = (verifiedId as string) ?? null;
      } catch {
        // The in-function kill-switch / Q5 ceiling refused (paused mid-flight,
        // ineligible kind, already attested by a human). The shadow row stays
        // was_enacted=false — never throw past this; another rule may still run.
      }
    }
  }

  return result;
}

async function latestVersionId(
  admin: ReturnType<typeof getSupabaseAdmin>,
  ruleId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("overseer_rule_versions")
    .select("id")
    .eq("rule_id", ruleId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Backfill the human's actual decision on a candidate's shadow rows so agreement
 * can be measured (Q4). Call from the human attest/reject paths.
 *
 * Sets human_action and agreed (proposed_action === humanAction) on every
 * shadow decision for the candidate that is still pending its human outcome.
 * Service-role only (the human-decided UPDATE on shadow rows is service-role per
 * RLS). Auto-enacted rows (was_enacted) are also stamped: an auto-promotion IS
 * the human-equivalent outcome of 'approve' for agreement purposes.
 */
export async function recordHumanOutcome(
  candidateId: string,
  humanAction: "approve" | "reject",
): Promise<number> {
  const admin = getSupabaseAdmin();

  const { data: rows, error } = await admin
    .from("overseer_shadow_decisions")
    .select("id, proposed_action")
    .eq("candidate_id", candidateId)
    .eq("human_action", "pending");
  if (error) throw error;

  let updated = 0;
  for (const r of (rows ?? []) as Array<{ id: string; proposed_action: ProposedAction }>) {
    const agreed = r.proposed_action === humanAction;
    const { error: upErr } = await admin
      .from("overseer_shadow_decisions")
      .update({ human_action: humanAction, agreed })
      .eq("id", r.id);
    if (upErr) throw upErr;
    updated += 1;
  }
  return updated;
}
