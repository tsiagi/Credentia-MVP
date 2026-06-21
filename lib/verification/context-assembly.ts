// lib/verification/context-assembly.ts
// ─────────────────────────────────────────────────────────────
// VP-4 — Provenance-preserving context-assembly CONTRACT (design §6).
//
// Full per-user context assembly (the harness that builds model input from a
// user's verified facts + prior inferences) is NOT yet built. This module
// encodes its CONTRACT as types + a documented assembler skeleton, so that when
// the assembler IS built it physically cannot flatten provenance away.
//
// THE WALL, applied to retrieval:
//   • Verified (blue) items and ai_inferred / in_staging (amber) items are
//     returned in SEPARATE arrays — never a single flattened string/list that
//     erases which inputs are attested and which are model guesses.
//   • The `verified` array may include a documentation item ONLY when that doc
//     passed the VP-4 gate (status='verified' AND ai_ingest_state='cleared').
//     This is enforced mechanically by assembleVerifiedDocContext() routing
//     every doc through lib/verification/doc-eligibility.ts.
//   • A model handed this context can always tell, per item, whether an input
//     is attested truth or its own prior estimate.
//
// org_id / role scope is provided by the caller's RLS-scoped client — an
// employee's assembly reads only their own scope; a manager's may include team
// verified facts via is_manager_of (enforced by RLS, not by this module).
// ─────────────────────────────────────────────────────────────
import type { SupabaseClient } from "@supabase/supabase-js";
import { eligibleDocsQuery, isDocCleared } from "@/lib/verification/doc-eligibility";

/**
 * One provenance-tagged context item (design §6). Never a flat string: the
 * `source` discriminator and the provenance fields travel WITH the value so a
 * flattening bug cannot strip them.
 */
export type RetrievedContextItem = {
  value: string;
  source: "verified" | "ai_inferred" | "in_staging";
  /** Present only when source==='verified'. The human (or rule) that attested. */
  attestor?: string;
  attestMethod?: "human" | "overseer_rule";
  /** Present for ai_inferred / in_staging. Advisory only; never rendered numerically. */
  confidence?: number;
  /** ingestion_events ids — the provenance chain back to source rows. */
  evidenceIds?: string[];
  /** For traceability/audit: the source table + row this item came from. */
  sourceTable?: string;
  sourceId?: string;
};

/**
 * The assembled context handed to the harness. The two memory CLASSES are kept
 * in SEPARATE arrays by construction — there is intentionally no combined
 * `items` field, so no caller can accidentally merge them. Every element of
 * `verified` MUST have source==='verified'; every element of `inferred` MUST
 * NOT. assertContextWallIntact() enforces this at runtime.
 */
export interface AssembledContext {
  /** Blue. Attested truth. Includes ONLY VP-4-cleared docs + verified_* rows. */
  verified: RetrievedContextItem[];
  /** Amber. ai_inference_* + verification_candidates (pending/shadow_approved). */
  inferred: RetrievedContextItem[];
  /** The subject the context was assembled for (for audit + scope checks). */
  subjectId: string;
  orgId: string;
}

/**
 * Runtime wall check. Throws if a verified item leaked into the inferred array
 * or vice-versa — the single invariant every assembler must satisfy before its
 * output is allowed near a prompt. Cheap; call it at the end of every assembler.
 */
export function assertContextWallIntact(ctx: AssembledContext): void {
  for (const item of ctx.verified) {
    if (item.source !== "verified") {
      throw new Error(
        `context-assembly: non-verified item (source='${item.source}') found in the verified array — provenance wall breached.`,
      );
    }
  }
  for (const item of ctx.inferred) {
    if (item.source === "verified") {
      throw new Error(
        "context-assembly: verified item found in the inferred array — provenance wall breached.",
      );
    }
  }
}

/**
 * Assemble the VERIFIED-doc slice of context for a subject. This is the ONLY
 * supported way to put documentation into the verified context array: it pulls
 * docs through eligibleDocsQuery (status='verified' AND ai_ingest_state=
 * 'cleared') and double-checks each row with isDocCleared before tagging it
 * source==='verified'. A doc that is not cleared is silently absent — never
 * downgraded into the inferred array (an unvetted doc is not "an inference," it
 * is simply ineligible).
 *
 * The passed client's RLS supplies org + visibility + role scope. No service
 * role is used here.
 */
export async function assembleVerifiedDocContext(
  client: SupabaseClient,
): Promise<RetrievedContextItem[]> {
  const { data, error } = await eligibleDocsQuery(
    client,
    "id, title, body, status, ai_ingest_state, verified_by",
  );
  if (error) throw error;

  const items: RetrievedContextItem[] = [];
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    title: string;
    body: string;
    status: string;
    ai_ingest_state: string;
    verified_by: string | null;
  }>;
  for (const doc of rows) {
    // Belt-and-suspenders: even though the query filtered, re-assert before
    // tagging anything 'verified'. A row that somehow slips the filter is dropped.
    if (!isDocCleared(doc)) continue;
    items.push({
      value: `${doc.title}: ${(doc.body ?? "").slice(0, 600)}`,
      source: "verified",
      attestor: doc.verified_by ?? undefined,
      attestMethod: "human",
      sourceTable: "documentation",
      sourceId: doc.id,
    });
  }
  return items;
}
