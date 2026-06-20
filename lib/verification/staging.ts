// lib/verification/staging.ts
// ─────────────────────────────────────────────────────────────
// BROWSER (RLS) reads + the single client write for verification candidates.
//
// All access is the browser client (lib/supabase.ts) + RLS — never the
// service role. RLS scopes every row to current_org() and to the reviewer's
// authority (subject / manager-of / org-leader-of). See verification-pipeline.sql.
//
// WALL (never violated): candidates are AI INFERENCE / staging (AMBER). The
// ONLY mutation here is reject (pending|shadow_approved → rejected). There is
// NO client path to state='attested' — RLS forbids it and this file provides
// no writer for it. Attestation is promote_candidate() (VP-5, server-side).
//
// Confidence is exposed ONLY as a coarse Low/Med/High band (Q6) — never a
// numeric probability — via confidenceBand(). The raw `confidence` numeric is
// intentionally NOT included in the read shapes returned to the UI.
// ─────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";
import { reportHumanOutcome } from "@/lib/overseer/outcome-client";
import type {
  CandidateTargetKind,
  IngestionSourceType,
} from "@/lib/verification/ingest";

export type CandidateState =
  | "pending"
  | "shadow_approved"
  | "attested"
  | "rejected"
  | "superseded";

/** Coarse confidence band shown in trust UI. NEVER a numeric probability. */
export type ConfidenceBand = "Low" | "Med" | "High";

export type CandidateRow = {
  id: string;
  org_id: string;
  subject_id: string;
  target_kind: CandidateTargetKind;
  claim: string;
  state: CandidateState;
  /** Coarse band only — the raw numeric is deliberately not surfaced (Q6). */
  band: ConfidenceBand | null;
  model: string | null;
  created_at: string;
  updated_at: string;
};

export type EvidenceRow = {
  candidate_id: string;
  ingestion_id: string;
  weight: number | null;
  note: string | null;
  source_type: IngestionSourceType;
  source_id: string;
  consent_basis: string;
  redacted: boolean;
  created_at: string;
};

// Select the candidate fields the UI needs. NOTE: `confidence` is fetched only
// so it can be mapped to a band here; it is never returned numerically.
const CANDIDATE_SELECT =
  "id, org_id, subject_id, target_kind, claim, state, confidence, model, created_at, updated_at";

/** Map an advisory 0..1 confidence to the coarse trust band (Q6 — never numeric). */
export function confidenceBand(confidence: number | null | undefined): ConfidenceBand | null {
  if (confidence == null) return null;
  if (confidence >= 0.8) return "High";
  if (confidence >= 0.5) return "Med";
  return "Low";
}

type RawCandidate = {
  id: string;
  org_id: string;
  subject_id: string;
  target_kind: CandidateTargetKind;
  claim: string;
  state: CandidateState;
  confidence: number | null;
  model: string | null;
  created_at: string;
  updated_at: string;
};

function toCandidateRow(r: RawCandidate): CandidateRow {
  return {
    id: r.id,
    org_id: r.org_id,
    subject_id: r.subject_id,
    target_kind: r.target_kind,
    claim: r.claim,
    state: r.state,
    band: confidenceBand(r.confidence),
    model: r.model,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/**
 * Candidates a manager/leader may review — their reports' in-review candidates.
 * RLS already limits visibility to subjects the caller manages/leads within
 * their org, so this only needs the state filter. Defaults to the amber
 * in-review states (pending, shadow_approved).
 */
export async function listCandidatesForReviewer(
  opts: { states?: CandidateState[] } = {},
): Promise<CandidateRow[]> {
  const states = opts.states ?? ["pending", "shadow_approved"];
  const { data, error } = await supabase
    .from("verification_candidates")
    .select(CANDIDATE_SELECT)
    .in("state", states)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RawCandidate[]).map(toCandidateRow);
}

/**
 * Candidates about a specific subject (their own self-view, or a reviewer
 * scoping to one report). RLS still enforces that the caller may see them.
 */
export async function listCandidatesForSubject(
  subjectId: string,
  opts: { states?: CandidateState[] } = {},
): Promise<CandidateRow[]> {
  const states = opts.states ?? ["pending", "shadow_approved"];
  const { data, error } = await supabase
    .from("verification_candidates")
    .select(CANDIDATE_SELECT)
    .eq("subject_id", subjectId)
    .in("state", states)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RawCandidate[]).map(toCandidateRow);
}

/**
 * Provenance for one candidate: candidate_evidence joined to ingestion_events.
 * Read-only proof (source type + link). RLS gates both tables.
 */
export async function getCandidateEvidence(candidateId: string): Promise<EvidenceRow[]> {
  const { data, error } = await supabase
    .from("candidate_evidence")
    .select(
      "candidate_id, ingestion_id, weight, note, ingestion_events ( source_type, source_id, consent_basis, redacted, created_at )",
    )
    .eq("candidate_id", candidateId);
  if (error) throw error;

  type RawEvidence = {
    candidate_id: string;
    ingestion_id: string;
    weight: number | null;
    note: string | null;
    ingestion_events:
      | {
          source_type: IngestionSourceType;
          source_id: string;
          consent_basis: string;
          redacted: boolean;
          created_at: string;
        }
      | null;
  };

  return ((data ?? []) as unknown as RawEvidence[]).map((r) => ({
    candidate_id: r.candidate_id,
    ingestion_id: r.ingestion_id,
    weight: r.weight,
    note: r.note,
    source_type: r.ingestion_events?.source_type ?? ("documentation" as IngestionSourceType),
    source_id: r.ingestion_events?.source_id ?? "",
    consent_basis: r.ingestion_events?.consent_basis ?? "",
    redacted: r.ingestion_events?.redacted ?? false,
    created_at: r.ingestion_events?.created_at ?? "",
  }));
}

/**
 * Reject a candidate (the ONLY client write). Transitions a pending /
 * shadow_approved candidate to 'rejected' under RLS — the policy's WITH CHECK
 * pins the result to 'rejected', so this can never reach 'attested'. Writes a
 * `candidate_rejected` audit row.
 */
export async function rejectCandidate(
  candidateId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  const { error } = await supabase
    .from("verification_candidates")
    .update({
      state: "rejected",
      rejected_by: actorId,
      rejected_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId)
    .in("state", ["pending", "shadow_approved"]);
  if (error) throw error;

  await writeAuditLog({
    actorId,
    action: "candidate_rejected",
    targetTable: "verification_candidates",
    targetId: candidateId,
    changes: { reason },
  });

  // VP-6: record this human 'reject' against any Overseer shadow decisions on
  // the candidate so agreement (Q4) can be measured. Fire-and-forget.
  void reportHumanOutcome(candidateId, "reject");
}

/**
 * Resolve subject_id → display name for candidate cards (reviewer scope shows
 * WHO a claim is about). Browser client + RLS — only returns profiles the caller
 * may already see (same org). Missing/blank names fall back to "Unknown member".
 */
export async function fetchSubjectNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return {};
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  if (error) return {};
  const out: Record<string, string> = {};
  for (const p of (data ?? []) as { id: string; full_name: string | null }[]) {
    out[p.id] = (p.full_name ?? "").trim() || "Unknown member";
  }
  return out;
}

/** Human-readable label for a candidate's target kind (UI).
 * NOTE: these label CANDIDATES (amber, not-yet-verified), so the label must
 * never contain the word "Verified" — a `verified_fact` candidate is a
 * *proposed* fact, not a verified one. Keeping "Verified" off this surface
 * preserves the trust wall (the word only ever appears on real verified_* rows). */
export function targetKindLabel(kind: CandidateTargetKind): string {
  const labels: Record<CandidateTargetKind, string> = {
    verified_fact: "Proposed fact",
    achievement: "Achievement",
    verified_task: "Task",
    kpi: "KPI",
    project: "Project",
    documentation: "Documentation",
  };
  return labels[kind] ?? kind;
}

/** Human-readable label for an evidence source type (UI provenance). */
export function sourceTypeLabel(source: IngestionSourceType): string {
  const labels: Record<IngestionSourceType, string> = {
    documentation: "Documentation",
    message: "Message",
    verified_task: "Completed task",
    kpi: "KPI",
    project: "Project",
  };
  return labels[source] ?? source;
}
