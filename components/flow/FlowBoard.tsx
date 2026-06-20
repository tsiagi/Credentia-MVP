// components/flow/FlowBoard.tsx
// ─────────────────────────────────────────────────────────────
// Provenance-native board. Three regions, deliberately separate:
//   1. Confidence-Weighted Burndown (attested vs asserted)
//   2. The canonical board — columns of work items, each card stamped with the
//      provenance tier of its CURRENT state (projected from the ledger).
//   3. The inference quarantine sidebar — a separate component tree; AI output
//      lives there and only crosses into the board via explicit promotion.
//
// Reads/writes go through lib/flow.ts (RLS + gated RPCs). No status is stored
// on the item — the board renders the ledger projection (flow_item_state).
// ─────────────────────────────────────────────────────────────
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, Calendar, Target, ShieldCheck } from "lucide-react";
import {
  type FlowBoard as Board,
  type FlowColumn,
  type FlowItem,
  type FlowItemState,
  type Inference,
  type EvidenceArtifact,
  type Burndown,
  type ProvenanceTier,
  listBoards,
  getColumns,
  getItems,
  getItemStates,
  getInferences,
  getArtifacts,
  getBurndown,
  promoteInference,
  generateInferences,
} from "@/lib/flow";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { ConfidenceBurndown } from "./ConfidenceBurndown";
import { InferenceSidebar } from "./InferenceSidebar";
import { ItemDetailDrawer } from "./ItemDetailDrawer";

export function FlowBoard({ userId, orgId }: { userId: string; orgId: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [columns, setColumns] = useState<FlowColumn[]>([]);
  const [items, setItems] = useState<FlowItem[]>([]);
  const [states, setStates] = useState<FlowItemState[]>([]);
  const [inferences, setInferences] = useState<Inference[]>([]);
  const [artifacts, setArtifacts] = useState<EvidenceArtifact[]>([]);
  const [burndown, setBurndown] = useState<Burndown | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FlowItem | null>(null);
  const [busyInf, setBusyInf] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadBoardData = useCallback(async (boardId: string) => {
    const [cols, its, sts, infs] = await Promise.all([
      getColumns(boardId),
      getItems(boardId),
      getItemStates(boardId),
      getInferences(boardId),
    ]);
    setColumns(cols);
    setItems(its);
    setStates(sts);
    setInferences(infs);
    setArtifacts(await getArtifacts(its.map((i) => i.id)));
    getBurndown(boardId).then(setBurndown).catch(() => setBurndown(null));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const boards = await listBoards();
        const b = boards.find((x) => x.name.includes("Provenance Demo")) ?? boards[0] ?? null;
        setBoard(b);
        if (b) await loadBoardData(b.id);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadBoardData]);

  const refresh = useCallback(async () => {
    if (board) await loadBoardData(board.id);
  }, [board, loadBoardData]);

  const stateByItem = useMemo(() => new Map(states.map((s) => [s.item_id, s])), [states]);
  const colNameById = useMemo(() => new Map(columns.map((c) => [c.id, c.name])), [columns]);
  const itemTitleById = useMemo(() => new Map(items.map((i) => [i.id, i.title])), [items]);
  const artifactByItem = useMemo(() => {
    const m = new Map<string, EvidenceArtifact>();
    for (const a of artifacts) if (a.item_id && !m.has(a.item_id)) m.set(a.item_id, a);
    return m;
  }, [artifacts]);

  function tierForItem(itemId: string): ProvenanceTier {
    return (stateByItem.get(itemId)?.current_tier as ProvenanceTier) ?? "ASSERTED";
  }

  async function handlePromote(inf: Inference) {
    setBusyInf(inf.id);
    try {
      await promoteInference(inf.id);
      await refresh();
    } catch (e) {
      // surfaced inline; keep the sidebar usable
      console.error(e);
      alert(e instanceof Error ? e.message : "Promotion failed");
    } finally {
      setBusyInf(null);
    }
  }

  async function handleGenerate() {
    if (!board) return;
    setGenerating(true);
    try {
      await generateInferences(board.id);
      setInferences(await getInferences(board.id));
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-[260px] rounded-2xl animate-pulse" style={{ background: "var(--surface-2)" }} />
        <div className="h-[400px] rounded-2xl animate-pulse" style={{ background: "var(--surface-2)" }} />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="border rounded-2xl p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <Layers size={26} className="mx-auto mb-2" style={{ color: "var(--ink-3)" }} />
        <p className="font-medium" style={{ color: "var(--ink)" }}>No Flow board yet</p>
        <p className="text-[13px] mt-1" style={{ color: "var(--ink-3)" }}>Seed the demo board to explore the provenance model.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Board header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[20px] font-semibold" style={{ color: "var(--ink)" }}>{board.name}</h2>
          {board.description && <p className="text-[13px] mt-0.5 max-w-2xl" style={{ color: "var(--ink-3)" }}>{board.description}</p>}
        </div>
        <div className="flex items-center gap-4 text-[12px]" style={{ color: "var(--ink-3)" }}>
          {board.sprint_start && (
            <span className="inline-flex items-center gap-1"><Calendar size={13} />{board.sprint_start} → {board.sprint_end}</span>
          )}
          {board.sprint_points_committed != null && (
            <span className="inline-flex items-center gap-1"><Target size={13} />{board.sprint_points_committed} pts committed</span>
          )}
        </div>
      </div>

      {/* Signature feature */}
      <ConfidenceBurndown data={burndown} />

      {/* Board + quarantine — two separate trees side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Canonical board */}
        <div className="overflow-x-auto">
          <div className="flex gap-3 min-w-max pb-2">
            {columns.map((col) => {
              const colItems = items.filter((i) => stateByItem.get(i.id)?.current_column_id === col.id);
              return (
                <div key={col.id} className="w-[230px] flex-shrink-0">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="inline-flex items-center gap-1.5">
                      <span className="text-[12.5px] font-semibold" style={{ color: "var(--ink)" }}>{col.name}</span>
                      <span className="text-[11px] font-mono px-1.5 rounded" style={{ color: "var(--ink-3)", background: "var(--surface-2)" }}>{colItems.length}</span>
                    </div>
                    {col.required_tier === "ATTESTED" && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: "var(--verified-fg)" }} title="Evidence-gated: ATTESTED only">
                        <ShieldCheck size={11} />
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 rounded-xl p-2 min-h-[80px]" style={{ background: "var(--surface-2)" }}>
                    {colItems.map((it) => {
                      const tier = tierForItem(it.id);
                      const art = artifactByItem.get(it.id);
                      return (
                        <button
                          key={it.id}
                          onClick={() => setSelected(it)}
                          className="w-full text-left rounded-lg border p-2.5 transition hover:shadow-sm active:scale-[0.99]"
                          style={{
                            background: "var(--surface)",
                            borderColor: tier === "ATTESTED" ? "var(--verified-fg)" : "var(--line)",
                            borderLeftWidth: 3,
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[12.5px] font-medium leading-snug" style={{ color: "var(--ink)" }}>{it.title}</span>
                            <span className="text-[11px] font-mono flex-shrink-0" style={{ color: "var(--ink-3)" }}>{it.point_estimate}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-2">
                            <ProvenanceBadge tier={tier} size="sm" />
                            {tier === "ATTESTED" && art && (
                              <span className="text-[10px] truncate" style={{ color: "var(--verified-fg)" }} title={art.uri}>
                                {art.kind}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {colItems.length === 0 && (
                      <p className="text-[11px] text-center py-3" style={{ color: "var(--ink-3)" }}>—</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quarantine — separate component tree */}
        <InferenceSidebar
          inferences={inferences}
          itemTitleById={itemTitleById}
          onPromote={handlePromote}
          onGenerate={handleGenerate}
          busyId={busyInf}
          generating={generating}
        />
      </div>

      {selected && (
        <ItemDetailDrawer
          item={selected}
          columns={columns}
          colNameById={colNameById}
          me={{ id: userId, orgId }}
          onClose={() => setSelected(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
