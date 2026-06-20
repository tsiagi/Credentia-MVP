// components/flow/FlowOversight.tsx
// ─────────────────────────────────────────────────────────────
// Leader (executive / HR) verification surface for Flow — the "Work Oversight"
// tab. Provenance-native: the attested-vs-asserted gap up top, then a queue of
// the exact items that make up that gap — work the team self-reported as done
// but that carries NO evidence.
//
// A leader's sign-off IS the evidence: "Attest" attaches an `approval` artifact
// (the human, accountable record) and writes an ATTESTED transition via the
// same gated RPC, flipping the item ASSERTED → ATTESTED. The solid burndown
// line moves down as the gap closes. No schema change — attestation = evidence,
// and a leader sign-off is a kind of evidence.
// ─────────────────────────────────────────────────────────────
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, ChevronDown, Loader2, CircleDashed, BadgeCheck, Calendar, Target } from "lucide-react";
import {
  type FlowBoard as Board,
  type FlowColumn,
  type FlowItem,
  type FlowItemState,
  type Burndown,
  listBoards,
  getColumns,
  getItems,
  getItemStates,
  getBurndown,
  addArtifact,
  recordTransition,
} from "@/lib/flow";
import { ConfidenceBurndown } from "./ConfidenceBurndown";
import { ProvenanceBadge } from "./ProvenanceBadge";

export function FlowOversight({ userId, orgId, role }: { userId: string; orgId: string; role: string }) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [columns, setColumns] = useState<FlowColumn[]>([]);
  const [items, setItems] = useState<FlowItem[]>([]);
  const [states, setStates] = useState<FlowItemState[]>([]);
  const [burndown, setBurndown] = useState<Burndown | null>(null);
  const [ownerName, setOwnerName] = useState<Map<string, string>>(new Map());
  const [leaderName, setLeaderName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const board = useMemo(() => boards.find((b) => b.id === selectedId) ?? null, [boards, selectedId]);

  const applyBoardData = useCallback(async (boardId: string) => {
    const [cols, its, sts] = await Promise.all([getColumns(boardId), getItems(boardId), getItemStates(boardId)]);
    setColumns(cols);
    setItems(its);
    setStates(sts);
    const ownerIds = Array.from(new Set(its.map((i) => i.owner_id).filter(Boolean))) as string[];
    if (ownerIds.length) {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ownerIds);
      setOwnerName(new Map((data ?? []).map((p) => [p.id as string, (p.full_name as string) ?? "—"])));
    }
    getBurndown(boardId).then(setBurndown).catch(() => setBurndown(null));
  }, []);

  const selectBoard = useCallback((id: string) => {
    setBoardLoading(true);
    setSelectedId(id);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [bs, me] = await Promise.all([
          listBoards(),
          supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
        ]);
        setBoards(bs);
        setLeaderName((me.data?.full_name as string) ?? "");
        const initial = bs.find((x) => x.name.includes("Provenance Demo")) ?? bs[0] ?? null;
        if (initial) {
          setBoardLoading(true);
          setSelectedId(initial.id);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    (async () => {
      await applyBoardData(selectedId);
      if (active) setBoardLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [selectedId, applyBoardData]);

  const refresh = useCallback(async () => {
    if (selectedId) await applyBoardData(selectedId);
  }, [selectedId, applyBoardData]);

  const terminalCols = useMemo(() => new Set(columns.filter((c) => c.is_terminal).map((c) => c.id)), [columns]);
  const colName = useMemo(() => new Map(columns.map((c) => [c.id, c.name])), [columns]);
  const stateByItem = useMemo(() => new Map(states.map((s) => [s.item_id, s])), [states]);

  // The verify queue = the burndown gap: completed (terminal) work that is still
  // only ASSERTED — self-reported with no evidence.
  const queue = useMemo(
    () =>
      items
        .map((it) => ({ it, st: stateByItem.get(it.id) }))
        .filter(({ st }) => st && st.current_column_id && terminalCols.has(st.current_column_id) && st.current_tier === "ASSERTED")
        .map(({ it, st }) => ({ it, st: st! })),
    [items, stateByItem, terminalCols],
  );

  const unverifiedPoints = queue.reduce((s, { it }) => s + Number(it.point_estimate), 0);

  async function attest(item: FlowItem, currentColumnId: string) {
    setBusyId(item.id);
    setError(null);
    try {
      const stamp = new Date().toISOString();
      const art = await addArtifact({
        orgId,
        itemId: item.id,
        kind: "approval",
        uri: `signoff://flow/${item.id}?by=${userId}&at=${stamp}`,
        label: `Signed off by ${leaderName || "leadership"}`,
        addedBy: userId,
      });
      // Same terminal column, now ATTESTED — the leader sign-off is the evidence.
      await recordTransition({
        itemId: item.id,
        toColumnId: currentColumnId,
        tier: "ATTESTED",
        artifactId: art.id,
        reason: `Leader sign-off${leaderName ? ` — ${leaderName}` : ""}`,
        eventType: "status",
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Attestation failed");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 rounded-xl animate-pulse" style={{ background: "var(--surface-2)" }} />
        <div className="h-[260px] rounded-2xl animate-pulse" style={{ background: "var(--surface-2)" }} />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="border rounded-2xl p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <ShieldCheck size={26} className="mx-auto mb-2" style={{ color: "var(--ink-3)" }} />
        <p className="font-medium" style={{ color: "var(--ink)" }}>No work boards to oversee yet</p>
        <p className="text-[13px] mt-1" style={{ color: "var(--ink-3)" }}>Once teams create provenance boards, unverified work shows up here for sign-off.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {boards.length > 1 ? (
              <div className="relative">
                <select value={selectedId ?? ""} onChange={(e) => selectBoard(e.target.value)}
                  className="appearance-none text-[20px] font-semibold pr-7 pl-0 bg-transparent cursor-pointer" style={{ color: "var(--ink)" }}>
                  {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--ink-3)" }} />
              </div>
            ) : (
              <h2 className="text-[20px] font-semibold truncate" style={{ color: "var(--ink)" }}>{board.name}</h2>
            )}
            {boardLoading && <Loader2 size={15} className="animate-spin" style={{ color: "var(--ink-3)" }} />}
          </div>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--ink-3)" }}>
            Sign off self-reported work to turn it into an attested, evidence-backed fact.
          </p>
          <div className="flex items-center gap-4 mt-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
            {board.sprint_start && <span className="inline-flex items-center gap-1"><Calendar size={13} />{board.sprint_start} → {board.sprint_end}</span>}
            {board.sprint_points_committed != null && <span className="inline-flex items-center gap-1"><Target size={13} />{board.sprint_points_committed} pts committed</span>}
          </div>
        </div>

        <div className="inline-flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: unverifiedPoints > 0 ? "var(--inferred-bg)" : "var(--verified-bg)", color: unverifiedPoints > 0 ? "var(--inferred-fg)" : "var(--verified-fg)" }}>
          {unverifiedPoints > 0 ? <CircleDashed size={16} /> : <ShieldCheck size={16} />}
          <span className="text-[13px] font-semibold tabular-nums">
            {unverifiedPoints > 0 ? `${unverifiedPoints} pts awaiting your sign-off` : "All completed work is verified"}
          </span>
        </div>
      </div>

      <ConfidenceBurndown data={burndown} loading={boardLoading && !burndown} />

      {/* Verify queue */}
      <div className="rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: "var(--line)" }}>
          <h3 className="text-[14px] font-semibold inline-flex items-center gap-2" style={{ color: "var(--ink)" }}>
            <CircleDashed size={15} style={{ color: "var(--ink-3)" }} /> Unverified completed work
          </h3>
          <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>{queue.length} item{queue.length === 1 ? "" : "s"}</span>
        </div>

        {error && <div className="px-5 pt-3 text-[12px]" style={{ color: "var(--danger-fg, #EF4444)" }}>{error}</div>}

        {queue.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <BadgeCheck size={26} className="mx-auto mb-2" style={{ color: "var(--verified-fg)" }} />
            <p className="font-medium" style={{ color: "var(--ink)" }}>Nothing to verify</p>
            <p className="text-[13px] mt-1" style={{ color: "var(--ink-3)" }}>Every completed item on this board is backed by evidence.</p>
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
            {queue.map(({ it, st }) => {
              const busy = busyId === it.id;
              return (
                <li key={it.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-medium" style={{ color: "var(--ink)" }}>{it.title}</span>
                      <span className="text-[11px] font-mono" style={{ color: "var(--ink-3)" }}>{it.point_estimate} pts</span>
                      <ProvenanceBadge tier="ASSERTED" size="sm" />
                    </div>
                    <p className="text-[11.5px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                      {colName.get(st.current_column_id ?? "") ?? "—"}
                      {it.owner_id && ownerName.get(it.owner_id) ? ` · ${ownerName.get(it.owner_id)}` : ""}
                      {st.as_of ? ` · self-reported ${new Date(st.as_of).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => attest(it, st.current_column_id as string)}
                    disabled={busy}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold transition active:scale-[0.98] disabled:opacity-50"
                    style={{ background: "var(--verified-fg)", color: "white" }}
                    title="Attach a signed approval and mark this work ATTESTED"
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                    {busy ? "Signing…" : "Attest (sign-off)"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        Signing off attaches an <span className="font-medium">approval</span> artifact and records an ATTESTED transition —
        the solid burndown line drops as the gap closes. {role === "hr" ? "HR" : "Executive"} sign-off is itself the evidence.
      </p>
    </div>
  );
}
