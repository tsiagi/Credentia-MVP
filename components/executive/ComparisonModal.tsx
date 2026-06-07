"use client";

import { X, Trophy, AlertTriangle } from "lucide-react";
import type { OrgIntelNode } from "./types";
import { COMPARE_METRICS } from "./types";
import { getCompareMetricValue } from "@/lib/executive-org-data";

function formatValue(key: string, value: number): string {
  if (key === "employeeValue") return String(Math.round(value * 100));
  if (key === "retentionRisk") return `${Math.round(value * 100)}%`;
  return `${Math.round(value * 100)}%`;
}

export function ComparisonModal({
  nodes,
  onClose,
  onRemove,
}: {
  nodes: OrgIntelNode[];
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal aria-label="Comparison workspace">
      <button type="button" aria-label="Close comparison" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-5xl max-h-[min(640px,calc(100vh-4rem))] rounded-2xl border overflow-hidden flex flex-col shadow-2xl"
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}>
          <div>
            <h2 className="serif text-xl font-semibold">Comparison workspace</h2>
            <p className="text-[13px] opacity-60 mt-0.5">{nodes.length} items selected</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg" style={{ background: "var(--surface-2)" }}>
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[600px] text-[13px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--line)" }}>
                <th className="text-left px-5 py-3 text-[11px] uppercase tracking-widest opacity-50 font-semibold sticky left-0" style={{ background: "var(--surface)" }}>
                  Metric
                </th>
                {nodes.map((n) => (
                  <th key={n.id} className="text-left px-4 py-3 min-w-[140px]">
                    <div className="font-semibold truncate">{n.name}</div>
                    <div className="text-[11px] opacity-50 font-normal truncate">{n.role}</div>
                    <button
                      type="button"
                      onClick={() => onRemove(n.id)}
                      className="text-[10px] mt-1 opacity-50 hover:opacity-100"
                      style={{ color: "var(--warn)" }}
                    >
                      Remove
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                <td className="px-5 py-2 font-medium sticky left-0" style={{ background: "var(--surface-2)" }}>Health score</td>
                {nodes.map((n) => (
                  <td key={n.id} className="px-4 py-2 font-semibold tabular-nums" style={{ color: "var(--accent)" }}>{n.healthScore}</td>
                ))}
              </tr>
              {COMPARE_METRICS.map(({ key, label, lowerIsBetter }) => {
                const values = nodes.map((n) => getCompareMetricValue(n, key));
                const best = lowerIsBetter ? Math.min(...values) : Math.max(...values);
                const worst = lowerIsBetter ? Math.max(...values) : Math.min(...values);

                return (
                  <tr key={key} className="border-b" style={{ borderColor: "var(--line)" }}>
                    <td className="px-5 py-2.5 opacity-70 sticky left-0" style={{ background: "var(--surface)" }}>{label}</td>
                    {nodes.map((n, i) => {
                      const v = values[i];
                      const isBest = values.length > 1 && v === best && best !== worst;
                      const isWorst = values.length > 1 && v === worst && best !== worst;
                      return (
                        <td
                          key={n.id}
                          className="px-4 py-2.5 font-semibold tabular-nums"
                          style={{
                            background: isBest ? "var(--verified-bg)" : isWorst ? "var(--warn-bg)" : undefined,
                            color: isBest ? "var(--verified-fg)" : isWorst ? "var(--warn)" : undefined,
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            {formatValue(key, v)}
                            {isBest && <Trophy size={12} aria-label="Best" />}
                            {isWorst && <AlertTriangle size={12} aria-label="Concern" />}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
