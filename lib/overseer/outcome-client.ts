// lib/overseer/outcome-client.ts
// ─────────────────────────────────────────────────────────────
// VP-6 — Client seam that reports a human attest/reject outcome to the server
// so Overseer agreement (Q4) can be measured. Fire-and-forget: a failure here
// must NEVER surface to the user or undo the attest/reject they just completed.
//
// This writes NOTHING directly — the shadow-decision backfill is service-role
// only (RLS). It POSTs to /api/overseer/outcome with the user's bearer token.
// ─────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";

/**
 * Best-effort: backfill the human's decision onto this candidate's shadow rows.
 * Swallows all errors — telemetry must not break the attest/reject flow.
 */
export async function reportHumanOutcome(
  candidateId: string,
  humanAction: "approve" | "reject",
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/overseer/outcome", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ candidateId, humanAction }),
    });
  } catch {
    // best-effort; never throw into the caller's attest/reject path.
  }
}
