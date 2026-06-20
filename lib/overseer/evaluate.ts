// lib/overseer/evaluate.ts
// ─────────────────────────────────────────────────────────────
// VP-6 — DETERMINISTIC rule evaluation. NO model call.
//
// evaluateRule() scores a candidate against a rule's STRUCTURED predicate logic
// (RuleLogic). It is a pure function: same inputs → same output, always. It
// produces a proposed action + which predicates matched + a TEMPLATED reasoning
// string (proof-of-context). The reasoning is assembled from the predicate
// results — it is never model-generated and never executed.
//
// This is the seam a future model-based PROPOSER would plug into: the proposer
// would author the RuleLogic JSON; this evaluator would still run it
// deterministically. VP-6 wires no proposer model — rules are human/template
// authored.
// ─────────────────────────────────────────────────────────────
import {
  type EvaluableCandidate,
  type EvaluationResult,
  type MatchedPredicate,
  type ProofOfContext,
  type RuleLogic,
  Q5_ALLOWED_KINDS,
  Q5_MAX_LEVEL,
} from "@/lib/overseer/types";

/**
 * Evaluate a candidate against structured rule logic. Deterministic.
 *
 * Returns 'approve' ONLY when every applicable predicate passes AND the Q5
 * ceiling holds (allowed kind + level ≤ 2 — mirrored from the SQL so the runner
 * never even attempts an ineligible auto-promote). Otherwise 'abstain'
 * (predicates unmet) — never a bare 'reject', since a rule abstaining leaves the
 * candidate for a human. ('reject' is reserved for an explicit deny predicate, a
 * future extension; absent one we abstain.)
 */
export function evaluateRule(
  logic: RuleLogic,
  candidate: EvaluableCandidate,
): EvaluationResult {
  const checks: MatchedPredicate[] = [];

  // — kind gate (the rule only acts on its declared kind) —
  const kindOk = logic.target_kind === candidate.target_kind;
  checks.push({
    predicate: "target_kind",
    passed: kindOk,
    detail: `rule=${logic.target_kind} candidate=${candidate.target_kind}`,
  });

  // — Q5 hard ceiling (kind allowlist + level ≤ 2), mirrored from SQL —
  const kindAllowed = Q5_ALLOWED_KINDS.includes(candidate.target_kind);
  checks.push({
    predicate: "q5_kind_allowed",
    passed: kindAllowed,
    detail: kindAllowed
      ? `${candidate.target_kind} is auto-attestable`
      : `${candidate.target_kind} is permanently human-only`,
  });

  const levelCeilingOk = candidate.suggested_level <= Q5_MAX_LEVEL;
  checks.push({
    predicate: "q5_level_ceiling",
    passed: levelCeilingOk,
    detail: `level ${candidate.suggested_level} <= ${Q5_MAX_LEVEL}`,
  });

  // — confidence floor —
  let confidenceOk = true;
  if (logic.min_confidence != null) {
    confidenceOk = (candidate.confidence ?? 0) >= logic.min_confidence;
    checks.push({
      predicate: "min_confidence",
      passed: confidenceOk,
      // detail keeps the raw number for replay/audit; the UI never renders it.
      detail: `confidence ${candidate.confidence ?? "null"} >= ${logic.min_confidence}`,
    });
  }

  // — rule-author level cap (may be stricter than Q5) —
  let ruleLevelOk = true;
  if (logic.max_level != null) {
    ruleLevelOk = candidate.suggested_level <= logic.max_level;
    checks.push({
      predicate: "max_level",
      passed: ruleLevelOk,
      detail: `level ${candidate.suggested_level} <= ${logic.max_level}`,
    });
  }

  // — required evidence types (at least one match) —
  let evidenceTypeOk = true;
  if (logic.require_evidence_types?.length) {
    evidenceTypeOk = logic.require_evidence_types.some((t) =>
      candidate.evidence_types.includes(t),
    );
    checks.push({
      predicate: "require_evidence_types",
      passed: evidenceTypeOk,
      detail: `requires one of [${logic.require_evidence_types.join(", ")}]; have [${candidate.evidence_types.join(", ")}]`,
    });
  }

  // — minimum evidence count —
  let evidenceCountOk = true;
  if (logic.min_evidence_count != null) {
    evidenceCountOk = candidate.evidence_ids.length >= logic.min_evidence_count;
    checks.push({
      predicate: "min_evidence_count",
      passed: evidenceCountOk,
      detail: `${candidate.evidence_ids.length} >= ${logic.min_evidence_count}`,
    });
  }

  const allPassed = checks.every((c) => c.passed);
  const action = allPassed ? "approve" : "abstain";

  const reasoning = buildReasoning(action, checks);

  const proof: ProofOfContext = {
    evidence_ids: candidate.evidence_ids,
    confidence: candidate.confidence,
    matched_predicates: checks,
    reasoning,
  };

  return { action, matchedPredicates: checks, proof };
}

/** Templated, deterministic reasoning string. Never model-generated. */
function buildReasoning(
  action: "approve" | "reject" | "abstain",
  checks: MatchedPredicate[],
): string {
  if (action === "approve") {
    return `All ${checks.length} predicate(s) passed: ${checks
      .map((c) => c.predicate)
      .join(", ")}. Overseer would approve (subject to the active-rule + Q5 ceiling re-check in promote_candidate).`;
  }
  const failed = checks.filter((c) => !c.passed);
  return `Abstaining — ${failed.length} predicate(s) unmet: ${failed
    .map((c) => `${c.predicate} (${c.detail})`)
    .join("; ")}. Leaving for human review.`;
}

/** True only if the action + ceiling permit an actual auto-enact attempt. */
export function isEnactable(result: EvaluationResult): boolean {
  if (result.action !== "approve") return false;
  const q5 = result.matchedPredicates.filter(
    (p) => p.predicate === "q5_kind_allowed" || p.predicate === "q5_level_ceiling",
  );
  return q5.every((p) => p.passed);
}
