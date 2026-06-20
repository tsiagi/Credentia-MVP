// lib/overseer/types.ts
// ─────────────────────────────────────────────────────────────
// VP-6 — Overseer AI shared types.
//
// The Overseer's decision LOGIC is STRUCTURED, INSPECTABLE JSON predicates —
// never free-floating model prose treated as truth. This file defines the
// predicate shape, the deterministic evaluation result, and the row shapes.
// The runner (runShadow.ts) evaluates `RuleLogic` deterministically — there is
// NO model call anywhere in VP-6. `rationale` is advisory prose for the human
// reviewer only; it is never executed.
// ─────────────────────────────────────────────────────────────
import type {
  CandidateTargetKind,
  IngestionSourceType,
} from "@/lib/verification/ingest";

/** Rule lifecycle (mirrors overseer_rules.lifecycle CHECK). */
export type RuleLifecycle = "draft" | "shadow" | "active" | "paused" | "retired";

/** A proposed action the deterministic evaluator can emit. */
export type ProposedAction = "approve" | "reject" | "abstain";

/**
 * STRUCTURED, INSPECTABLE decision logic — the body of an overseer_rule_version.
 * Evaluated deterministically (evaluateRule). NOT prose, NOT executed code.
 *
 * Stored verbatim as the `logic` jsonb. Every field is an inspectable predicate
 * over candidate fields / evidence. Adding a model-based proposer later only
 * changes WHO authors this JSON — never how it is evaluated.
 */
export interface RuleLogic {
  /** The candidate kind this rule may act on (must match the rule row). */
  target_kind: CandidateTargetKind;
  /** Minimum advisory confidence (0..1) for an 'approve'. */
  min_confidence?: number;
  /**
   * Evidence source types at least one of which must back the candidate for an
   * 'approve' (e.g. ['verified_task']). Empty/absent = no evidence-type gate.
   */
  require_evidence_types?: IngestionSourceType[];
  /** Minimum number of distinct evidence links required for an 'approve'. */
  min_evidence_count?: number;
  /**
   * Hard ceiling on the candidate's suggested verification level this rule will
   * auto-approve. Capped at 2 by the Q5 SQL ceiling regardless; this lets a rule
   * be even stricter (e.g. max_level: 1).
   */
  max_level?: number;
}

/** The deterministic input the evaluator scores (assembled by the runner). */
export interface EvaluableCandidate {
  id: string;
  org_id: string;
  subject_id: string;
  target_kind: CandidateTargetKind;
  /** Advisory model self-estimate 0..1 (never rendered numerically in trust UI). */
  confidence: number | null;
  /** suggested_verification_level lifted from payload (defaults to 1). */
  suggested_level: number;
  /** Evidence source types linked to this candidate. */
  evidence_types: IngestionSourceType[];
  /** ingestion_events ids backing this candidate (provenance chain). */
  evidence_ids: string[];
}

/**
 * PROOF-OF-CONTEXT: the exact inputs + which predicates matched + a TEMPLATED
 * reasoning string. Written to overseer_shadow_decisions.proof_of_context.
 * Replayable and shown to the human reviewer. The reasoning is template-authored
 * from the matched predicates — NOT model-generated.
 */
export interface ProofOfContext {
  evidence_ids: string[];
  /** Advisory confidence (kept for replay; UI shows a band, never this number). */
  confidence: number | null;
  /** Each predicate the evaluator checked and whether it passed. */
  matched_predicates: MatchedPredicate[];
  /** Templated, deterministic human-readable summary of the decision. */
  reasoning: string;
}

export interface MatchedPredicate {
  predicate: string;
  passed: boolean;
  detail: string;
}

export interface EvaluationResult {
  action: ProposedAction;
  matchedPredicates: MatchedPredicate[];
  proof: ProofOfContext;
}

/** Row shapes (reads). */
export interface OverseerRuleRow {
  id: string;
  org_id: string;
  name: string;
  target_kind: CandidateTargetKind;
  scope: "team" | "department" | "org";
  scope_subject: string | null;
  lifecycle: RuleLifecycle;
  enabled_by: string | null;
  enabled_at: string | null;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OverseerRuleVersionRow {
  id: string;
  rule_id: string;
  org_id: string;
  version: number;
  logic: RuleLogic;
  rationale: string | null;
  shadow_agreement_rate: number | null;
  shadow_sample_size: number;
  proposed_by: string | null;
  approved_by: string | null;
  created_at: string;
}

export interface ShadowDecisionRow {
  id: string;
  org_id: string;
  rule_id: string;
  rule_version_id: string;
  candidate_id: string;
  proposed_action: ProposedAction;
  proof_of_context: ProofOfContext;
  human_action: "approve" | "reject" | "pending" | null;
  agreed: boolean | null;
  was_enacted: boolean;
  created_at: string;
}

/** Per-version agreement metrics (overseer_version_agreement view). */
export interface VersionAgreement {
  rule_version_id: string;
  rule_id: string;
  org_id: string;
  version: number;
  decided_sample_size: number;
  agreed_count: number;
  agreement_rate: number | null;
  distinct_attestors: number;
  first_decided_at: string | null;
}

// ── Q4 enablement gate thresholds (platform floor; orgs may set stricter) ──
// Settled policy: agreement ≥0.95 over ≥50 human-decided shadow decisions,
// ≥2 distinct attestors, ≥14 days. Platform floor 0.90 / 30 decisions.
export const Q4_GATE = {
  minAgreementRate: 0.95,
  minDecidedSamples: 50,
  minDistinctAttestors: 2,
  minAgeDays: 14,
} as const;

export const Q4_PLATFORM_FLOOR = {
  minAgreementRate: 0.9,
  minDecidedSamples: 30,
} as const;

// Live auto-pause trigger: agreement below this on a live (active) rule.
export const AUTO_PAUSE_AGREEMENT = 0.9;

// Q5 ceiling (also enforced in SQL): auto-attest only these kinds, level ≤ 2.
export const Q5_ALLOWED_KINDS: CandidateTargetKind[] = ["verified_task", "achievement"];
export const Q5_MAX_LEVEL = 2;
