// app/api/overseer/outcome/route.ts
// ─────────────────────────────────────────────────────────────
// VP-6 — Record a human's attest/reject outcome onto a candidate's shadow
// decisions so Overseer agreement (Q4) can be measured.
//
// POST { candidateId, humanAction: 'approve' | 'reject' }
//
// Called by the client AFTER a successful human attest or reject (see
// lib/overseer/outcome-client.ts wired into lib/verification/promote.ts &
// staging.ts). The shadow-decision UPDATE is service-role only (RLS), so this
// server route is the seam. We verify the caller can SEE the candidate (RLS on
// the user client) before backfilling, then run an auto-pause check on any rule
// whose enacted decision just got a human outcome.
//
// This is best-effort telemetry: a failure here must NOT undo the attest/reject
// the user already completed. The client calls it fire-and-forget.
// ─────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAsUser } from "@/lib/supabase-admin";
import { recordHumanOutcome } from "@/lib/overseer/runShadow";
import { checkAutoPause } from "@/lib/overseer/enable";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const client = getSupabaseAsUser(token);
  const { data: auth, error: authErr } = await client.auth.getUser();
  if (authErr || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { candidateId?: string; humanAction?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.candidateId || (body.humanAction !== "approve" && body.humanAction !== "reject")) {
    return NextResponse.json(
      { error: "candidateId and humanAction (approve|reject) required" },
      { status: 400 },
    );
  }

  // Authority gate: the caller must be able to READ this candidate under RLS
  // (subject / manager-of / org-leader). If RLS hides it, we refuse — no
  // cross-org or unauthorized outcome backfill.
  const { data: candidate } = await client
    .from("verification_candidates")
    .select("id")
    .eq("id", body.candidateId)
    .maybeSingle();
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not visible" }, { status: 403 });
  }

  // Find which rules had shadow decisions on this candidate (for auto-pause).
  const { data: decisions } = await client
    .from("overseer_shadow_decisions")
    .select("rule_id")
    .eq("candidate_id", body.candidateId);
  const ruleIds = [
    ...new Set(((decisions ?? []) as Array<{ rule_id: string }>).map((d) => d.rule_id)),
  ];

  const updated = await recordHumanOutcome(
    body.candidateId,
    body.humanAction as "approve" | "reject",
  );

  // Live safety: re-check each touched rule's agreement; auto-pause if it dipped.
  const paused: string[] = [];
  for (const ruleId of ruleIds) {
    try {
      if (await checkAutoPause(ruleId)) paused.push(ruleId);
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({ ok: true, updated, paused });
}
