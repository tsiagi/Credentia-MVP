// lib/verification/promote.ts
// ─────────────────────────────────────────────────────────────
// VP-5 — THE promotion boundary, client seam.
//
// attestCandidate() is the one client entry point that turns an AMBER
// verification candidate into a BLUE verified record. It does this ONLY by
// calling the server-side SECURITY DEFINER function promote_candidate()
// (supabase/verification-vp5-promote.sql) via RPC.
//
// CRITICAL — auth.uid() / client choice (do not change to the admin client):
//   The RPC's human-authority gate uses is_manager_of()/is_org_leader_of()/
//   current_role_name(), all resolving against auth.uid(). It MUST run on the
//   BROWSER (RLS) client (lib/supabase.ts) so auth.uid() is the attesting
//   manager. On the admin/service-role client auth.uid() is NULL and the gate
//   would reject every attest. The function is SECURITY DEFINER, so it still
//   bypasses RLS to write the verified row and stamp the candidate.
//
// WALL: this file does NOT, and cannot, write a verified_* row or set
// state='attested' directly. RLS forbids it; the only path is the RPC. There is
// no client UPDATE to 'attested' anywhere — VP-1's reject policy pins WITH CHECK
// to 'rejected'.
// ─────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";
import { reportHumanOutcome } from "@/lib/overseer/outcome-client";

/**
 * Promote (attest) a verification candidate into a verified record.
 *
 * Calls promote_candidate() on the browser RLS client so that the in-function
 * authority check sees the attesting manager as auth.uid(). The function mints
 * the blue verified_* row (currently `achievements`), stamps the candidate
 * state='attested', and writes the audit entry — all server-side, atomically.
 *
 * @param candidateId the verification_candidates.id to attest.
 * @returns the id of the newly minted verified record (e.g. an achievements id).
 * @throws the underlying Postgres error message (e.g. 'not authorized to attest
 *         for this subject', 'already attested') for the caller to surface.
 */
export async function attestCandidate(candidateId: string): Promise<string> {
  const { data, error } = await supabase.rpc("promote_candidate", {
    p_candidate_id: candidateId,
    p_method: "human",
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Attestation did not return a verified record id.");

  // VP-6: record this human 'approve' against any Overseer shadow decisions on
  // the candidate so agreement (Q4) can be measured. Fire-and-forget — never
  // blocks or fails the attest the user just completed.
  void reportHumanOutcome(candidateId, "approve");

  return data as string;
}
