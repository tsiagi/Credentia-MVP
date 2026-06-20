// lib/verification/ingest.ts
// ─────────────────────────────────────────────────────────────
// SERVER-ONLY staging writers for the continuous verification pipeline (VP-1).
//
// These are the ONLY writers into the staging tables (ingestion_events,
// verification_candidates, candidate_evidence). They run with the SERVICE-ROLE
// client (getSupabaseAdmin → SUPABASE_SERVICE_ROLE_KEY, server-side only — never
// exposed via NEXT_PUBLIC_), mirroring the inference-write pattern in
// lib/ai/persist.ts and lib/ai/subtasks.ts.
//
// WALL (never violated): everything written here is AI INFERENCE / staging
// (AMBER). NOTHING here writes a verified_* row, and nothing here sets
// state='attested' — promotion to verified is the sole responsibility of
// promote_candidate() (VP-5). Candidates land 'pending'.
//
// NOT yet called by any producer. VP-2 (task-as-verifier) and VP-3 (passive
// message ingestion) wire producers into these entry points.
// ─────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type IngestionSourceType =
  | "documentation"
  | "message"
  | "verified_task"
  | "kpi"
  | "project";

export type ConsentBasis =
  | "org_policy"
  | "explicit_opt_in"
  | "task_context"
  | "doc_submission";

export type CandidateTargetKind =
  | "verified_fact"
  | "achievement"
  | "verified_task"
  | "kpi"
  | "project"
  | "documentation";

export interface RecordIngestionInput {
  orgId: string;
  /** The person this evidence is about. */
  subjectId: string | null;
  sourceType: IngestionSourceType;
  /** The source row id (e.g. verified_tasks.id, messages.id). */
  sourceId: string;
  consentBasis: ConsentBasis;
  /** True when the subject exercised per-conversation/message content-suppression. */
  redacted?: boolean;
  /** Actor who triggered ingestion; null = automated/system. */
  ingestedBy?: string | null;
}

export interface IngestionEventRow {
  id: string;
  org_id: string;
  subject_id: string | null;
  source_type: IngestionSourceType;
  source_id: string;
  consent_basis: ConsentBasis;
  redacted: boolean;
  ingested_by: string | null;
  created_at: string;
}

/** Evidence link for stageCandidate — references an existing ingestion_events row. */
export interface EvidenceLink {
  ingestionId: string;
  /** 0..1 — how much this evidence supported the claim (advisory). */
  weight?: number | null;
  note?: string | null;
}

export interface StageCandidateInput {
  orgId: string;
  subjectId: string;
  targetKind: CandidateTargetKind;
  claim: string;
  /** Fields that would be written on promotion (kind/label/etc.). */
  payload?: Record<string, unknown>;
  /** Model self-estimate 0..1 (advisory; never rendered numerically in the UI). */
  confidence?: number | null;
  /** Model id, or null for a deterministic (non-model) staging path. */
  model?: string | null;
  /** Actor who triggered staging; null = system. */
  generatedBy?: string | null;
  /** Evidence rows that support this candidate (candidate_evidence links). */
  evidence?: EvidenceLink[];
}

export interface VerificationCandidateRow {
  id: string;
  org_id: string;
  subject_id: string;
  target_kind: CandidateTargetKind;
  claim: string;
  state: "pending" | "shadow_approved" | "attested" | "rejected" | "superseded";
  confidence: number | null;
  model: string | null;
  created_at: string;
}

function clampConfidence(n: number): number {
  return Math.min(1, Math.max(0, n));
}

async function writeServerAudit(
  actorId: string | null,
  action: string,
  targetTable: string,
  targetId: string,
  changes: Record<string, unknown>,
) {
  const admin = getSupabaseAdmin();
  await admin.from("audit_log").insert({
    actor_id: actorId,
    action,
    target_table: targetTable,
    target_id: targetId,
    changes,
  });
}

/**
 * Record one raw evidence item entering the pipeline. Idempotent on
 * (org_id, source_type, source_id) via the table's unique constraint —
 * calling twice for the same source returns the existing row, never a
 * duplicate. Writes an `evidence_ingested` audit row on first insert.
 *
 * Service-role only. Provenance/consent root; never a verified fact.
 */
export async function recordIngestionEvent(
  input: RecordIngestionInput,
): Promise<IngestionEventRow> {
  const admin = getSupabaseAdmin();

  // Idempotent: upsert on the unique (org_id, source_type, source_id) key.
  // ignoreDuplicates so a second call is a no-op insert; we then read the row.
  const { error: upsertError } = await admin
    .from("ingestion_events")
    .upsert(
      {
        org_id: input.orgId,
        subject_id: input.subjectId,
        source_type: input.sourceType,
        source_id: input.sourceId,
        consent_basis: input.consentBasis,
        redacted: input.redacted ?? false,
        ingested_by: input.ingestedBy ?? null,
      },
      { onConflict: "org_id,source_type,source_id", ignoreDuplicates: true },
    );
  if (upsertError) throw upsertError;

  const { data: row, error: readError } = await admin
    .from("ingestion_events")
    .select(
      "id, org_id, subject_id, source_type, source_id, consent_basis, redacted, ingested_by, created_at",
    )
    .eq("org_id", input.orgId)
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .single();
  if (readError) throw readError;

  const event = row as IngestionEventRow;

  // Audit on first sighting only (created_at within the last few seconds is a
  // weak signal; instead we always audit but tag whether it was a fresh insert
  // by comparing — kept simple: audit every call, the action is idempotent and
  // the audit trail of repeated ingestion attempts is itself useful).
  await writeServerAudit(input.ingestedBy ?? null, "evidence_ingested", "ingestion_events", event.id, {
    source_type: input.sourceType,
    source_id: input.sourceId,
    consent_basis: input.consentBasis,
    redacted: event.redacted,
    subject_id: input.subjectId,
  });

  return event;
}

/**
 * Stage an AMBER verification_candidate ('pending') and link its supporting
 * evidence (candidate_evidence). Service-role only. NEVER sets state='attested'
 * and NEVER writes a verified_* row — promotion is promote_candidate() (VP-5).
 * Writes a `verification_candidate_staged` audit row.
 */
export async function stageCandidate(
  input: StageCandidateInput,
): Promise<VerificationCandidateRow> {
  const admin = getSupabaseAdmin();

  const { data: inserted, error: insertError } = await admin
    .from("verification_candidates")
    .insert({
      org_id: input.orgId,
      subject_id: input.subjectId,
      target_kind: input.targetKind,
      claim: input.claim,
      payload: input.payload ?? {},
      state: "pending", // AMBER. Never 'attested' here.
      confidence:
        input.confidence == null ? null : clampConfidence(input.confidence),
      model: input.model ?? null,
      generated_by: input.generatedBy ?? null,
    })
    .select(
      "id, org_id, subject_id, target_kind, claim, state, confidence, model, created_at",
    )
    .single();
  if (insertError) throw insertError;

  const candidate = inserted as VerificationCandidateRow;

  // Link evidence (provenance preserved end-to-end).
  if (input.evidence?.length) {
    const links = input.evidence.map((e) => ({
      candidate_id: candidate.id,
      ingestion_id: e.ingestionId,
      weight: e.weight == null ? null : clampConfidence(e.weight),
      note: e.note ?? null,
    }));
    const { error: linkError } = await admin
      .from("candidate_evidence")
      .upsert(links, { onConflict: "candidate_id,ingestion_id", ignoreDuplicates: true });
    if (linkError) throw linkError;
  }

  await writeServerAudit(
    input.generatedBy ?? null,
    "verification_candidate_staged",
    "verification_candidates",
    candidate.id,
    {
      target_kind: input.targetKind,
      subject_id: input.subjectId,
      model: candidate.model,
      evidence_count: input.evidence?.length ?? 0,
    },
  );

  return candidate;
}
