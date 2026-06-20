// lib/verification/doc-eligibility.ts
// ─────────────────────────────────────────────────────────────
// VP-4 — The single, mechanical AI-ingest eligibility gate for documentation.
//
// THE CONTRACT (hard, non-advisory):
//   No `documentation` row may enter a prompt or `agent_memory` unless it is
//   BOTH `status='verified'` AND `ai_ingest_state='cleared'`.
//
// This is the verified-vs-inferred wall applied to RETRIEVAL: only verified
// (blue), AI-cleared knowledge may become model input. An unverified, un-cleared,
// or quarantined doc is MECHANICALLY excluded from every model-input path.
//
// The DB trigger guard_doc_verification() (supabase/verification-vp4-doc-gate.sql)
// is the authoritative gate on the WRITE side — it controls when a doc may become
// 'cleared'. THIS module is the gate on the READ side: every code path that pulls
// doc content toward a model MUST funnel through `CLEARED_DOC_FILTER` /
// `eligibleDocsQuery` / `assertDocCleared`. Together they are defense-in-depth:
// even if a future caller forgot the filter, `assertDocCleared` (called by the
// ingestion writer) refuses any row that is not both verified and cleared.
//
// DO NOT add a doc → model-input path that bypasses this module. If you are
// writing the FIRST code that ingests a doc into agent_memory or a prompt, it
// MUST use these helpers. That is the whole point of VP-4.
//
// This module is client-safe (pure constants + a pure assertion + a query
// builder that takes the caller's own Supabase client). It performs NO
// service-role work itself; the org/visibility/role checks still come from RLS
// on whichever client the caller passes in (browser+RLS for read, the user-
// scoped client in the ingest route). Trust-color is irrelevant here — this is
// data eligibility, not UI.
// ─────────────────────────────────────────────────────────────
import type { SupabaseClient } from "@supabase/supabase-js";

/** The two column conditions, exactly. Verified (blue) AND AI-cleared. */
export const CLEARED_DOC_STATUS = "verified" as const;
export const CLEARED_DOC_INGEST_STATE = "cleared" as const;

/**
 * The canonical filter object. Spread/iterate this to apply the gate to any
 * query, so the eligibility predicate lives in exactly ONE place. Changing the
 * rule means changing this constant, nothing else.
 *
 *   status='verified' AND ai_ingest_state='cleared'
 */
export const CLEARED_DOC_FILTER = {
  status: CLEARED_DOC_STATUS,
  ai_ingest_state: CLEARED_DOC_INGEST_STATE,
} as const;

/** Minimal shape any eligibility check needs from a doc row. */
export interface DocEligibilityShape {
  status?: string | null;
  ai_ingest_state?: string | null;
}

/**
 * Pure predicate. True ONLY when the doc is verified AND cleared. Use this to
 * filter in-memory arrays as a belt-and-suspenders check after a query, or in
 * tests. It does not, by itself, scope org/visibility — RLS does that.
 */
export function isDocCleared(doc: DocEligibilityShape): boolean {
  return (
    doc.status === CLEARED_DOC_STATUS &&
    doc.ai_ingest_state === CLEARED_DOC_INGEST_STATE
  );
}

/**
 * Hard assertion for the WRITE/ingestion path. Throws if a doc that is not both
 * verified AND cleared is about to be ingested into agent_memory or placed in a
 * prompt. Call this immediately before any such write so a forgotten filter
 * cannot silently leak unvetted content into model input.
 *
 * `docId` is included in the message purely for audit/debugging — never the body.
 */
export function assertDocCleared(doc: DocEligibilityShape, docId?: string): void {
  if (!isDocCleared(doc)) {
    throw new Error(
      `doc-eligibility: refused doc ${docId ?? "<unknown>"} — only status='${CLEARED_DOC_STATUS}' ` +
        `AND ai_ingest_state='${CLEARED_DOC_INGEST_STATE}' docs may become model input ` +
        `(got status='${doc.status ?? "null"}', ai_ingest_state='${doc.ai_ingest_state ?? "null"}').`,
    );
  }
}

/**
 * The canonical eligible-docs query builder. Returns a Supabase query already
 * scoped by the gate (`status='verified' AND ai_ingest_state='cleared'`) on top
 * of whatever org/visibility/role RLS the passed-in client enforces.
 *
 * Pass the user-scoped client (getSupabaseAsUser) for ingestion so doc
 * visibility ('org' | 'managers' | 'private') is enforced by RLS — an
 * employee's agent can never absorb manager-only docs. Pass the browser client
 * for read-side context assembly. NEVER hand-roll the .eq() pair elsewhere;
 * call this so the gate is applied in exactly one place.
 *
 * @param client  any Supabase client (its RLS provides org/visibility scope)
 * @param columns the select list (default: id, title, body for ingestion)
 */
export function eligibleDocsQuery(
  client: SupabaseClient,
  columns = "id, title, body, status, ai_ingest_state",
) {
  return client
    .from("documentation")
    .select(columns)
    .eq("status", CLEARED_DOC_FILTER.status)
    .eq("ai_ingest_state", CLEARED_DOC_FILTER.ai_ingest_state);
}
