// components/flow/FlowBoard.tsx
// ─────────────────────────────────────────────────────────────
// Provenance-native board — the project-management ("Team Work" / "My Work")
// section. Three regions, deliberately separate:
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
import { Layers, Calendar, Target, ShieldCheck, Plus, ChevronDown, X, Loader2 } from "lucide-react";
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
  createBoard,
  createItem,
} from "@/lib/flow";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { ConfidenceBurndown } from "./ConfidenceBurndown";
import { InferenceSidebar } from "./InferenceSidebar";
import { ItemDetailDrawer } from "./ItemDetailDrawer";

type Variant = "team" | "personal";

export function FlowBoard({ userId, orgId, variant = "personal" }: { userId: string; orgId: string; variant?: Variant }) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [columns, setColumns] = useState<FlowColumn[]>([]);
  const [items, setItems] = useState<FlowItem[]>([]);
  const [states, setStates] = useState<FlowItemState[]>([]);
  const [inferences, setInferences] = useState<Inference[]>([]);
  const [artifacts, setArtifacts] = useState<EvidenceArtifact[]>([]);
  const [burndown, setBurndown] = useState<Burndown | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [selected, setSelected] = useState<FlowItem | null>(null);
  const [busyInf, setBusyInf] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);

  const board = useMemo(() => boards.find((b) => b.id === selectedId) ?? null, [boards, selectedId]);

  const applyBoardData = useCallback(async (boardId: string) => {
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

  const selectBoard = useCallback((id: string) => {
    setBoardLoading(true);
    setSelectedId(id);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const bs = await listBoards();
        setBoards(bs);
        const initial = bs.find((x) => x.name.includes("Provenance Demo")) ?? bs[0] ?? null;
        if (initial) {
          setBoardLoading(true);
          setSelectedId(initial.id);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  const stateByItem = useMemo(() => new Map(states.map((s) => [s.item_id, s])), [states]);
  const colNameById = useMemo(() => new Map(columns.map((c) => [c.id, c.name])), [columns]);
  const itemTitleById = useMemo(() => new Map(items.map((i) => [i.id, i.title])), [items]);
  const artifactByItem = useMemo(() => {
    const m = new Map<string, EvidenceArtifact>();
    for (const a of artifacts) if (a.item_id && !m.has(a.item_id)) m.set(a.item_id, a);
    return m;
  }, [artifacts]);
  const backlogColumn = columns[0] ?? null; // getColumns returns sort_order asc

  function tierForItem(itemId: string): ProvenanceTier {
    return (stateByItem.get(itemId)?.current_tier as ProvenanceTier) ?? "ASSERTED";
  }

  async function handlePromote(inf: Inference) {
    setBusyInf(inf.id);
    try {
      await promoteInference(inf.id);
      await refresh();
    } catch (e) {
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

  async function handleCreateBoard(input: { name: string; sprintStart: string; sprintEnd: string }) {
    const { board: b } = await createBoard({
      orgId,
      name: input.name,
      createdBy: userId,
      sprintStart: input.sprintStart || null,
      sprintEnd: input.sprintEnd || null,
    });
    setBoards((bs) => [...bs, b]);
    selectBoard(b.id);
    setShowNewBoard(false);
  }

  async function handleAddItem(input: { title: string; points: number; description: string }) {
    if (!board || !backlogColumn) return;
    await createItem({
      orgId,
      boardId: board.id,
      backlogColumnId: backlogColumn.id,
      title: input.title,
      description: input.description || null,
      pointEstimate: input.points,
      ownerId: userId,
      createdBy: userId,
    });
    setShowAddItem(false);
    await refresh();
  }

  // ── Section intro (always shown — the section is "about" provenance) ──
  const intro = (
    <div className="mb-5">
      <div className="flex items-center gap-2 flex-wrap text-[12px]">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium"
          style={{ color: "var(--verified-fg)", background: "var(--verified-bg)" }}>
          <ShieldCheck size={12} /> Attested · evidence-backed
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium"
          style={{ color: "var(--ink-3)", border: "1px dashed var(--line-strong)" }}>
          Asserted · self-reported
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium"
          style={{ color: "var(--inferred-fg)", background: "var(--inferred-bg)" }}>
          Inferred · AI, quarantined
        </span>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 rounded-xl animate-pulse" style={{ background: "var(--surface-2)" }} />
        <div className="h-[260px] rounded-2xl animate-pulse" style={{ background: "var(--surface-2)" }} />
        <div className="h-[400px] rounded-2xl animate-pulse" style={{ background: "var(--surface-2)" }} />
      </div>
    );
  }

  if (!board) {
    return (
      <div>
        {intro}
        <div className="border rounded-2xl p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          <Layers size={26} className="mx-auto mb-2" style={{ color: "var(--ink-3)" }} />
          <p className="font-medium" style={{ color: "var(--ink)" }}>No boards yet</p>
          <p className="text-[13px] mt-1 mb-4 max-w-md mx-auto" style={{ color: "var(--ink-3)" }}>
            Create a provenance board. Every status you record will carry a trust tier — attested, asserted, or inferred.
          </p>
          <button onClick={() => setShowNewBoard(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition active:scale-[0.98]"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
            <Plus size={14} /> New board
          </button>
        </div>
        {showNewBoard && <NewBoardModal onClose={() => setShowNewBoard(false)} onCreate={handleCreateBoard} />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {intro}

      {/* Board header + controls */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {boards.length > 1 ? (
              <div className="relative">
                <select
                  value={selectedId ?? ""}
                  onChange={(e) => selectBoard(e.target.value)}
                  className="appearance-none text-[20px] font-semibold pr-7 pl-0 bg-transparent cursor-pointer"
                  style={{ color: "var(--ink)" }}
                >
                  {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--ink-3)" }} />
              </div>
            ) : (
              <h2 className="text-[20px] font-semibold truncate" style={{ color: "var(--ink)" }}>{board.name}</h2>
            )}
            {boardLoading && <Loader2 size={15} className="animate-spin" style={{ color: "var(--ink-3)" }} />}
          </div>
          {board.description && <p className="text-[13px] mt-0.5 max-w-2xl" style={{ color: "var(--ink-3)" }}>{board.description}</p>}
          <div className="flex items-center gap-4 mt-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
            {board.sprint_start && (
              <span className="inline-flex items-center gap-1"><Calendar size={13} />{board.sprint_start} → {board.sprint_end}</span>
            )}
            {board.sprint_points_committed != null && (
              <span className="inline-flex items-center gap-1"><Target size={13} />{board.sprint_points_committed} pts committed</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddItem(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition active:scale-[0.98]"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
            <Plus size={14} /> Add item
          </button>
          <button onClick={() => setShowNewBoard(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition active:scale-[0.98]"
            style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
            <Plus size={14} /> New board
          </button>
        </div>
      </div>

      {/* Signature feature */}
      <ConfidenceBurndown data={burndown} loading={boardLoading && !burndown} />

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

      {showNewBoard && <NewBoardModal onClose={() => setShowNewBoard(false)} onCreate={handleCreateBoard} />}
      {showAddItem && <AddItemModal variant={variant} onClose={() => setShowAddItem(false)} onCreate={handleAddItem} />}
    </div>
  );
}

// ── Modals ───────────────────────────────────────────────────
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }} onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border p-5 animate-in fade-in zoom-in-95 duration-150"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>{title}</h3>
          <button onClick={onClose} className="p-1 rounded-md" style={{ color: "var(--ink-3)" }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NewBoardModal({ onClose, onCreate }: { onClose: () => void; onCreate: (i: { name: string; sprintStart: string; sprintEnd: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [sprintStart, setSprintStart] = useState("");
  const [sprintEnd, setSprintEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setError("Board name is required."); return; }
    setSaving(true); setError(null);
    try { await onCreate({ name: name.trim(), sprintStart, sprintEnd }); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to create board"); setSaving(false); }
  }

  return (
    <ModalShell title="New provenance board" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Board name">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 Platform Sprint"
            className="w-full rounded-lg border px-2.5 py-2 text-[13px] bg-[var(--surface)]" style={{ borderColor: "var(--line)", color: "var(--ink)" }} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sprint start"><input type="date" value={sprintStart} onChange={(e) => setSprintStart(e.target.value)}
            className="w-full rounded-lg border px-2.5 py-2 text-[13px] bg-[var(--surface)]" style={{ borderColor: "var(--line)", color: "var(--ink)" }} /></Field>
          <Field label="Sprint end"><input type="date" value={sprintEnd} onChange={(e) => setSprintEnd(e.target.value)}
            className="w-full rounded-lg border px-2.5 py-2 text-[13px] bg-[var(--surface)]" style={{ borderColor: "var(--line)", color: "var(--ink)" }} /></Field>
        </div>
        <p className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          Comes with Backlog → In Progress → In Review → Done (self-reported) → Shipped (evidence-gated, ATTESTED only).
        </p>
        {error && <p className="text-[12px]" style={{ color: "var(--danger-fg, #EF4444)" }}>{error}</p>}
        <button onClick={submit} disabled={saving}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition active:scale-[0.98] disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create board
        </button>
      </div>
    </ModalShell>
  );
}

function AddItemModal({ variant, onClose, onCreate }: { variant: Variant; onClose: () => void; onCreate: (i: { title: string; points: number; description: string }) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [points, setPoints] = useState(3);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError(null);
    try { await onCreate({ title: title.trim(), points, description }); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to add item"); setSaving(false); }
  }

  return (
    <ModalShell title={variant === "team" ? "Add team work item" : "Add work item"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Title">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auth token rotation"
            className="w-full rounded-lg border px-2.5 py-2 text-[13px] bg-[var(--surface)]" style={{ borderColor: "var(--line)", color: "var(--ink)" }} />
        </Field>
        <Field label="Description (optional)">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="w-full rounded-lg border px-2.5 py-2 text-[13px] bg-[var(--surface)] resize-none" style={{ borderColor: "var(--line)", color: "var(--ink)" }} />
        </Field>
        <Field label="Point estimate">
          <input type="number" min={1} value={points} onChange={(e) => setPoints(Math.max(1, Number(e.target.value) || 1))}
            className="w-24 rounded-lg border px-2.5 py-2 text-[13px] bg-[var(--surface)]" style={{ borderColor: "var(--line)", color: "var(--ink)" }} />
        </Field>
        <p className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          Lands in Backlog as an <span className="font-medium">Asserted</span> create event. Promote it through the columns from the card.
        </p>
        {error && <p className="text-[12px]" style={{ color: "var(--danger-fg, #EF4444)" }}>{error}</p>}
        <button onClick={submit} disabled={saving}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition active:scale-[0.98] disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add to backlog
        </button>
      </div>
    </ModalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11.5px] font-medium block mb-1" style={{ color: "var(--ink-3)" }}>{label}</span>
      {children}
    </label>
  );
}
