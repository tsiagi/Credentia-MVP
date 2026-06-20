// components/flow/InferenceSidebar.tsx
// ─────────────────────────────────────────────────────────────
// THE QUARANTINE — a deliberately separate component tree from the canonical
// board. AI inferences live here and ONLY here until a human promotes one.
//
//   • Distinct amber region with an unmistakable "AI — NOT VERIFIED" header.
//   • Each card shows kind, confidence, and the source model.
//   • "Promote to Asserted" moves a COPY into the ledger (RPC), tagged with the
//     originating inference id. Nothing here is ever auto-applied.
//
// This component never renders into the board's column tree, and the board
// never renders inferences — the separation is structural in the UI too.
// ─────────────────────────────────────────────────────────────
"use client";

import React from "react";
import { Sparkles, ArrowRightToLine, RefreshCw, TriangleAlert, GitBranch, Clock, ListChecks } from "lucide-react";
import type { Inference, InferenceKind } from "@/lib/flow";

const KIND_META: Record<InferenceKind, { label: string; icon: React.ReactNode }> = {
  predicted_slip: { label: "Predicted slip", icon: <Clock size={13} /> },
  risk_flag: { label: "Risk flag", icon: <TriangleAlert size={13} /> },
  dependency_bottleneck: { label: "Dependency bottleneck", icon: <GitBranch size={13} /> },
  status_suggestion: { label: "Status suggestion", icon: <ListChecks size={13} /> },
};

export function InferenceSidebar({
  inferences,
  itemTitleById,
  onPromote,
  onGenerate,
  busyId,
  generating,
}: {
  inferences: Inference[];
  itemTitleById: Map<string, string>;
  onPromote: (inf: Inference) => void;
  onGenerate: () => void;
  busyId: string | null;
  generating: boolean;
}) {
  const quarantined = inferences.filter((i) => i.status === "quarantined");

  return (
    <aside
      className="rounded-2xl border overflow-hidden flex flex-col"
      style={{ borderColor: "var(--inferred-fg)", background: "var(--inferred-bg)" }}
      aria-label="AI inference quarantine — not verified"
    >
      <div className="px-4 py-3 border-b" style={{ borderColor: "color-mix(in srgb, var(--inferred-fg) 28%, transparent)" }}>
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5" style={{ color: "var(--inferred-fg)" }}>
            <Sparkles size={15} />
            <span className="text-[12px] font-bold tracking-wide uppercase">AI — Not Verified</span>
          </div>
          <button
            onClick={onGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1 text-[11.5px] font-medium rounded-md px-2 py-1 transition active:scale-[0.98] disabled:opacity-50"
            style={{ color: "var(--inferred-fg)", background: "color-mix(in srgb, var(--inferred-fg) 12%, transparent)" }}
          >
            <RefreshCw size={12} className={generating ? "animate-spin" : ""} /> Scan
          </button>
        </div>
        <p className="text-[11.5px] mt-1.5" style={{ color: "var(--inferred-fg)", opacity: 0.85 }}>
          Quarantined model output. It never enters the board until you promote it.
        </p>
      </div>

      <div className="p-3 space-y-2.5 overflow-y-auto" style={{ maxHeight: 520 }}>
        {quarantined.length === 0 && (
          <div className="text-center py-8 text-[12.5px]" style={{ color: "var(--inferred-fg)", opacity: 0.8 }}>
            <Sparkles size={20} className="mx-auto mb-2 opacity-70" />
            No active inferences. Hit <span className="font-semibold">Scan</span> to analyze the board.
          </div>
        )}

        {quarantined.map((inf) => {
          const meta = KIND_META[inf.kind];
          const promotable = inf.kind === "status_suggestion";
          const busy = busyId === inf.id;
          return (
            <div
              key={inf.id}
              className="rounded-xl border bg-[var(--surface)] p-3"
              style={{ borderColor: "color-mix(in srgb, var(--inferred-fg) 30%, transparent)" }}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--inferred-fg)" }}>
                  {meta.icon} {meta.label}
                </span>
                {inf.confidence != null && (
                  <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded" style={{ color: "var(--ink-3)", background: "var(--surface-2)" }}>
                    {Math.round(inf.confidence * 100)}% conf
                  </span>
                )}
              </div>

              <p className="text-[12.5px] font-medium leading-snug" style={{ color: "var(--ink)" }}>
                {inf.summary}
              </p>
              {inf.detail && (
                <p className="text-[11.5px] mt-1 leading-snug" style={{ color: "var(--ink-3)" }}>
                  {inf.detail}
                </p>
              )}
              {inf.item_id && itemTitleById.get(inf.item_id) && (
                <p className="text-[11px] mt-1.5" style={{ color: "var(--ink-3)" }}>
                  ↳ {itemTitleById.get(inf.item_id)}
                </p>
              )}

              <div className="flex items-center gap-1.5 mt-2.5">
                {promotable ? (
                  <button
                    onClick={() => onPromote(inf)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold rounded-md px-2.5 py-1.5 transition active:scale-[0.98] disabled:opacity-50"
                    style={{ background: "var(--ink-3)", color: "var(--on-accent)" }}
                    title="Move a copy into the ledger as ASSERTED (traceable to this inference)"
                  >
                    <ArrowRightToLine size={12} className={busy ? "animate-pulse" : ""} />
                    {busy ? "Promoting…" : "Promote → Asserted"}
                  </button>
                ) : (
                  <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                    Insight only — review on the item
                  </span>
                )}
              </div>
              <p className="text-[10px] mt-2" style={{ color: "var(--ink-3)", opacity: 0.8 }}>
                {inf.model} · {new Date(inf.created_at).toLocaleString()}
              </p>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
