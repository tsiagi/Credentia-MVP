// components/flow/ConfidenceBurndown.tsx
// ─────────────────────────────────────────────────────────────
// Signature feature — Confidence-Weighted Burndown.
//
//   Solid line  = ATTESTED progress (only artifact-backed completions count)
//   Dashed line = ASSERTED progress (self-reported + attested)
//
// The shaded gap between them is the risk signal, labelled explicitly:
//   "X points of unverified progress".
// ─────────────────────────────────────────────────────────────
"use client";

import React from "react";
import { ShieldCheck, CircleDashed, TriangleAlert } from "lucide-react";
import type { Burndown } from "@/lib/flow";

const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 34 };

export function ConfidenceBurndown({ data, loading }: { data: Burndown | null; loading?: boolean }) {
  if (loading || !data) {
    return <div className="h-[260px] rounded-2xl animate-pulse" style={{ background: "var(--surface-2)" }} />;
  }

  const { series, committed, gap_points } = data;
  const n = series.length;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxY = Math.max(committed, 1);

  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / maxY) * innerH;

  const line = (key: "attested_remaining" | "asserted_remaining") =>
    series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");

  // Gap band between the two remaining lines (asserted is always ≤ attested remaining).
  const band =
    series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.attested_remaining).toFixed(1)}`).join(" ") +
    " " +
    series
      .map((p, i) => `L ${x(n - 1 - i).toFixed(1)} ${y(series[n - 1 - i].asserted_remaining).toFixed(1)}`)
      .join(" ") +
    " Z";

  const yTicks = [0, Math.round(maxY / 2), maxY];

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div>
          <h3 className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
            Confidence-Weighted Burndown
          </h3>
          <p className="text-[12.5px] mt-0.5" style={{ color: "var(--ink-3)" }}>
            Solid counts only artifact-backed work. The gap is progress no one has verified.
          </p>
        </div>
        <div
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2"
          style={{
            background: gap_points > 0 ? "var(--inferred-bg)" : "var(--verified-bg)",
            color: gap_points > 0 ? "var(--inferred-fg)" : "var(--verified-fg)",
          }}
        >
          {gap_points > 0 ? <TriangleAlert size={16} /> : <ShieldCheck size={16} />}
          <span className="text-[13px] font-semibold tabular-nums">
            {gap_points > 0 ? `${gap_points} points of unverified progress` : "All progress is verified"}
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }} role="img"
        aria-label={`Burndown. ${gap_points} points of unverified progress.`}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="var(--ink-3)">
              {t}
            </text>
          </g>
        ))}

        {/* gap band */}
        <path d={band} fill="var(--inferred-fg)" opacity={0.12} />

        {/* asserted (dashed, neutral) */}
        <path d={line("asserted_remaining")} fill="none" stroke="var(--ink-3)" strokeWidth={2} strokeDasharray="5 4" />
        {/* attested (solid, blue) */}
        <path d={line("attested_remaining")} fill="none" stroke="var(--verified-fg)" strokeWidth={2.5} />

        {/* x-axis end labels */}
        <text x={PAD.left} y={H - 8} fontSize={9} fill="var(--ink-3)">
          {series[0]?.date.slice(5)}
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={9} fill="var(--ink-3)">
          {series[n - 1]?.date.slice(5)}
        </text>
      </svg>

      <div className="flex items-center gap-5 mt-2 text-[12px]" style={{ color: "var(--ink-2)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ width: 18, height: 0, borderTop: "2.5px solid var(--verified-fg)" }} />
          <ShieldCheck size={12} style={{ color: "var(--verified-fg)" }} /> Attested remaining
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ width: 18, height: 0, borderTop: "2px dashed var(--ink-3)" }} />
          <CircleDashed size={12} style={{ color: "var(--ink-3)" }} /> Asserted remaining
        </span>
      </div>
    </div>
  );
}
