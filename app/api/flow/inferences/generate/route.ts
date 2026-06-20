// app/api/flow/inferences/generate/route.ts
// ─────────────────────────────────────────────────────────────
// The ONLY writer to the inference quarantine (flow_inferences).
//
// Runs server-side with the service-role key (never exposed to the browser).
// AI output is written to the QUARANTINE store only — it never touches the
// canonical ledger. A human must explicitly PROMOTE an inference (separate
// RPC) before any of it becomes an ASSERTED fact.
//
// The "model" here is a deterministic heuristic over the live ledger so the
// MVP runs without an API key; swap generateInferences() for a real model
// call (server-side) without changing the trust boundary.
// ─────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

type NewInference = {
  org_id: string;
  board_id: string;
  item_id: string | null;
  kind: "predicted_slip" | "risk_flag" | "dependency_bottleneck" | "status_suggestion";
  summary: string;
  detail: string | null;
  predicted_value: Record<string, unknown>;
  confidence: number;
  model: string;
};

const MODEL = "flow-forecaster-v0";

/**
 * Heuristic inference generator. Reads the ledger projection and flags the two
 * patterns the provenance model is built to surface:
 *   • risk_flag — an item sitting "done" via ASSERTED with no evidence artifact
 *   • predicted_slip — an open item unlikely to finish before sprint end
 */
function generateInferences(args: {
  orgId: string;
  boardId: string;
  sprintEnd: string | null;
  items: { id: string; title: string; point_estimate: number }[];
  terminalCols: Set<string>;
  states: { item_id: string; current_column_id: string | null; current_tier: string | null; current_artifact_id: string | null }[];
}): NewInference[] {
  const out: NewInference[] = [];
  const stateByItem = new Map(args.states.map((s) => [s.item_id, s]));

  for (const it of args.items) {
    const st = stateByItem.get(it.id);
    if (!st) continue;
    const isTerminal = st.current_column_id ? args.terminalCols.has(st.current_column_id) : false;

    // Unverified "done": terminal + ASSERTED + no artifact.
    if (isTerminal && st.current_tier === "ASSERTED" && !st.current_artifact_id) {
      out.push({
        org_id: args.orgId,
        board_id: args.boardId,
        item_id: it.id,
        kind: "risk_flag",
        summary: `"${it.title}" is marked done but self-reported with no evidence artifact`,
        detail: "Asserted completion with no merged PR / deploy / approval. Counts toward the dashed line only.",
        predicted_value: { tier: "ASSERTED", points: it.point_estimate },
        confidence: 0.66,
        model: MODEL,
      });
    }

    // Open and large near sprint end → predicted slip.
    if (!isTerminal && args.sprintEnd) {
      const daysLeft = Math.ceil((new Date(args.sprintEnd).getTime() - Date.now()) / 86400000);
      if (it.point_estimate >= 5 && daysLeft <= 5) {
        out.push({
          org_id: args.orgId,
          board_id: args.boardId,
          item_id: it.id,
          kind: "predicted_slip",
          summary: `"${it.title}" (${it.point_estimate} pts) likely to slip past sprint end`,
          detail: `Open ${it.point_estimate}-pt item with ${daysLeft} day(s) left in the sprint window.`,
          predicted_value: { days_left: daysLeft, points: it.point_estimate },
          confidence: 0.7,
          model: MODEL,
        });
      }
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const userClient = getSupabaseAsUser(token);
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { boardId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

  // Authorize via the user's RLS view of the board (cross-tenant safe).
  const { data: board } = await userClient
    .from("flow_boards")
    .select("id, org_id, sprint_end")
    .eq("id", body.boardId)
    .single();
  if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

  const [{ data: items }, { data: cols }, { data: states }] = await Promise.all([
    userClient.from("flow_items").select("id, title, point_estimate").eq("board_id", board.id),
    userClient.from("flow_columns").select("id, is_terminal").eq("board_id", board.id),
    userClient
      .from("flow_item_state")
      .select("item_id, current_column_id, current_tier, current_artifact_id")
      .eq("board_id", board.id),
  ]);

  const terminalCols = new Set((cols ?? []).filter((c) => c.is_terminal).map((c) => c.id as string));
  const inferences = generateInferences({
    orgId: board.org_id as string,
    boardId: board.id as string,
    sprintEnd: board.sprint_end as string | null,
    items: (items ?? []) as { id: string; title: string; point_estimate: number }[],
    terminalCols,
    states: (states ?? []) as { item_id: string; current_column_id: string | null; current_tier: string | null; current_artifact_id: string | null }[],
  });

  if (inferences.length === 0) return NextResponse.json({ ok: true, written: 0 });

  // Service-role write — the ONLY path into the quarantine. Never the canonical ledger.
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("flow_inferences").insert(inferences);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, written: inferences.length });
}
