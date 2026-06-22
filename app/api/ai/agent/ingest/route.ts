import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";
import { eligibleDocsQuery, assertDocCleared } from "@/lib/verification/doc-eligibility";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

type MemoryRow = {
  agent_id: string;
  owner_id: string;
  org_id: string;
  source_type: "verified_task" | "documentation" | "message";
  source_id: string;
  content: string;
};

/**
 * POST /api/ai/agent/ingest
 * Teach the caller's Scout from VERIFIED facts only:
 *   • completed verified_tasks assigned to them
 *   • verified documentation they are allowed to see
 *   • messages they explicitly saved to memory
 *
 * Eligible sources are read THROUGH the caller's own RLS, so documentation
 * visibility ('org' / 'managers' / 'private') is enforced by the same policies
 * that govern the app — an employee's agent can never absorb manager-only docs.
 * Only the write to agent_memory uses the service role (that table has no
 * client INSERT policy by design).
 */
export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Authorization: Bearer <access_token> required" }, { status: 401 });
  }

  const userClient = getSupabaseAsUser(token);
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }
  const ownerId = authData.user.id;

  // #5 — per-user rate limit (memory ingestion scans + writes).
  const rl = await checkRateLimit("ai-ingest", ownerId);
  if (!rl.success) return tooManyRequests(rl);

  const { data: agent, error: agentErr } = await userClient
    .from("user_agents")
    .select("id, org_id, enabled, learn_from_tasks, learn_from_docs, learn_from_messages")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (agentErr) return NextResponse.json({ error: agentErr.message }, { status: 400 });
  if (!agent) {
    return NextResponse.json({ error: "Provision your Scout before training it." }, { status: 400 });
  }
  if (!agent.enabled) {
    return NextResponse.json({ error: "This agent is disabled." }, { status: 400 });
  }

  const rows: MemoryRow[] = [];
  const base = { agent_id: agent.id as string, owner_id: ownerId, org_id: agent.org_id as string };

  // ── 1. Completed verified tasks (blue) ──
  if (agent.learn_from_tasks) {
    const { data } = await userClient
      .from("verified_tasks")
      .select("id, title, detail")
      .eq("assignee_id", ownerId)
      .eq("status", "done");
    for (const t of data ?? []) {
      rows.push({
        ...base,
        source_type: "verified_task",
        source_id: t.id as string,
        content: t.detail ? `${t.title} — ${t.detail}` : (t.title as string),
      });
    }
  }

  // ── 2. AI-CLEARED documentation the owner may see ──
  // VP-4 gate: a doc may enter agent_memory ONLY when status='verified' AND
  // ai_ingest_state='cleared'. eligibleDocsQuery applies that filter on top of
  // the user-scoped RLS (which enforces visibility 'org'/'managers'/'private'),
  // so an employee's agent can never absorb a manager-only OR an un-cleared doc.
  // assertDocCleared is belt-and-suspenders: if a row ever slips the filter, the
  // ingestion refuses it rather than silently learning unvetted content.
  if (agent.learn_from_docs) {
    const { data } = await eligibleDocsQuery(userClient, "id, title, body, status, ai_ingest_state");
    const docs = (data ?? []) as unknown as Array<{
      id: string;
      title: string;
      body: string | null;
      status: string;
      ai_ingest_state: string;
    }>;
    for (const d of docs) {
      assertDocCleared(d, d.id); // hard guard: verified AND cleared, or throw.
      const body = d.body ?? "";
      rows.push({
        ...base,
        source_type: "documentation",
        source_id: d.id,
        content: `${d.title}: ${body.slice(0, 600)}`,
      });
    }
  }

  // ── 3. Messages the owner explicitly saved to memory ──
  if (agent.learn_from_messages) {
    const { data } = await userClient
      .from("messages")
      .select("id, body")
      .eq("sender_id", ownerId)
      .eq("save_to_agent_memory", true);
    for (const m of data ?? []) {
      rows.push({ ...base, source_type: "message", source_id: m.id as string, content: m.body as string });
    }
  }

  if (!rows.length) {
    return NextResponse.json({ learned: 0, note: "No new verified facts to learn yet." });
  }

  // Service-role upsert — idempotent on (agent_id, source_type, source_id).
  const admin = getSupabaseAdmin();
  const { error: upErr } = await admin
    .from("agent_memory")
    .upsert(rows, { onConflict: "agent_id,source_type,source_id" });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  await admin.from("audit_log").insert({
    actor_id: ownerId,
    action: "agent_memory_ingested",
    target_table: "user_agents",
    target_id: agent.id,
    changes: {
      total: rows.length,
      tasks: rows.filter((r) => r.source_type === "verified_task").length,
      docs: rows.filter((r) => r.source_type === "documentation").length,
      messages: rows.filter((r) => r.source_type === "message").length,
    },
  });

  return NextResponse.json({
    learned: rows.length,
    disclaimer:
      "Training data is verified facts only. The agent's suggestions remain AI inference (advisory).",
  });
}
