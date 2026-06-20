// app/api/flow/burndown/route.ts
// ─────────────────────────────────────────────────────────────
// Confidence-Weighted Burndown — computed from the append-only ledger.
//
//   attested_remaining  (solid line) — only ATTESTED completions reduce it.
//   asserted_remaining  (dashed line) — ASSERTED + ATTESTED completions.
//
// The gap between the two lines = points of UNVERIFIED progress (the risk
// signal). One endpoint returns both series. RLS-scoped to the caller's org.
// ─────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAsUser } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

function dayList(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const d = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const boardId = req.nextUrl.searchParams.get("board_id");
  if (!boardId) return NextResponse.json({ error: "board_id required" }, { status: 400 });

  const client = getSupabaseAsUser(token);
  const { data: auth } = await client.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: board, error: bErr } = await client
    .from("flow_boards")
    .select("id, sprint_start, sprint_end, sprint_points_committed")
    .eq("id", boardId)
    .single();
  if (bErr || !board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

  const [{ data: items }, { data: cols }, { data: events }] = await Promise.all([
    client.from("flow_items").select("id, point_estimate").eq("board_id", boardId),
    client.from("flow_columns").select("id, is_terminal").eq("board_id", boardId),
    client
      .from("flow_transition_events")
      .select("item_id, provenance_tier, to_column_id, created_at, event_type")
      .eq("board_id", boardId)
      .in("event_type", ["create", "status"])
      .order("created_at", { ascending: true }),
  ]);

  const terminal = new Set((cols ?? []).filter((c) => c.is_terminal).map((c) => c.id));
  const points = new Map<string, number>((items ?? []).map((i) => [i.id as string, Number(i.point_estimate)]));
  const committed =
    board.sprint_points_committed != null
      ? Number(board.sprint_points_committed)
      : Array.from(points.values()).reduce((a, b) => a + b, 0);

  // First date an item entered a terminal column, per tier.
  const attestedDoneAt = new Map<string, string>();
  const assertedDoneAt = new Map<string, string>();
  for (const e of events ?? []) {
    if (!e.to_column_id || !terminal.has(e.to_column_id)) continue;
    const day = String(e.created_at).slice(0, 10);
    const id = e.item_id as string;
    if (!assertedDoneAt.has(id)) assertedDoneAt.set(id, day); // any-tier terminal entry
    if (e.provenance_tier === "ATTESTED" && !attestedDoneAt.has(id)) attestedDoneAt.set(id, day);
  }

  const sumDoneBy = (m: Map<string, string>, day: string) => {
    let s = 0;
    for (const [id, doneDay] of m) if (doneDay <= day) s += points.get(id) ?? 0;
    return s;
  };

  const start = board.sprint_start ?? new Date().toISOString().slice(0, 10);
  const end = board.sprint_end ?? start;
  const today = new Date().toISOString().slice(0, 10);

  const series = dayList(start, end).map((date) => {
    // Don't draw progress into the future beyond today.
    const clamp = date > today ? today : date;
    return {
      date,
      attested_remaining: Math.max(0, committed - sumDoneBy(attestedDoneAt, clamp)),
      asserted_remaining: Math.max(0, committed - sumDoneBy(assertedDoneAt, clamp)),
    };
  });

  const attested_done = sumDoneBy(attestedDoneAt, today);
  const asserted_done = sumDoneBy(assertedDoneAt, today);

  return NextResponse.json({
    board_id: boardId,
    sprint_start: start,
    sprint_end: end,
    committed,
    series,
    attested_done,
    asserted_done,
    gap_points: asserted_done - attested_done,
  });
}
