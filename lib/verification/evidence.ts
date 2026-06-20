// lib/verification/evidence.ts
// ─────────────────────────────────────────────────────────────
// VP-3 — Passive Messenger evidence: content-suppression controls.
//
// Browser client (lib/supabase.ts) + RLS only — NEVER the service role. These
// helpers flip a single boolean each:
//   • conversations.evidence_suppressed — per-conversation "Exclude from
//     verification evidence". Honored in BOTH org privacy modes. Updatable via
//     the existing column-agnostic "conv: participant update" RLS policy (the
//     same path setThreadMemoryDefault uses for agent_memory_default).
//
// Per-message suppression (messages.evidence_suppressed, honored only in 'strict'
// mode) has NO client write path in VP-3: opening a broad messages UPDATE policy
// would also let senders edit already-sent (and possibly already-ingested) message
// bodies, which would undermine evidence integrity. When strict-mode per-message
// UI is built, it must go through a column-scoped SECURITY DEFINER RPC that sets
// ONLY evidence_suppressed — not a general UPDATE policy. Deferred here.
//
// SEPARATION (never blurred): this is the VERIFICATION-EVIDENCE pipeline. It is
// DISTINCT from the Digital-Twin memory toggle (agent_memory_default /
// save_to_agent_memory / "Off the Record"). Suppressing evidence does NOT change
// learning, and vice-versa. Neither helper touches body text, candidates, or any
// verified_* row — they only set a privacy boolean.
//
// No audit log is written here: like markConversationRead, these are
// low-stakes, potentially frequent privacy toggles, not auditable security
// events, and the evidence pipeline deliberately avoids per-message audit spam.
// (Promotion / attestation — the auditable events — live in VP-5, server-side.)
// ─────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";

/**
 * Set whether a conversation is excluded from verification evidence. When true,
 * evidence ingested from this thread's messages is marked `redacted`
 * (content-suppressed) — in both 'standard' and 'strict' org privacy modes.
 * RLS ("conv: participant update") restricts this to a participant of the
 * conversation within their org.
 */
export async function setConversationEvidenceSuppressed(
  conversationId: string,
  suppressed: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ evidence_suppressed: suppressed, updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) throw error;
}
