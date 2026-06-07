"use client";

import { GitCompareArrows, X } from "lucide-react";

export function FloatingCompareBar({
  count,
  onCompare,
  onClear,
}: {
  count: number;
  onCompare: () => void;
  onClear: () => void;
}) {
  if (count < 2) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[55] flex items-center gap-2 px-4 py-3 rounded-2xl border shadow-xl animate-in slide-in-from-bottom-4 fade-in duration-300"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <GitCompareArrows size={18} style={{ color: "var(--accent)" }} />
      <span className="text-[14px] font-medium">{count} selected</span>
      <button
        type="button"
        onClick={onCompare}
        className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
        style={{ background: "var(--accent)" }}
      >
        Compare
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="p-2 rounded-lg opacity-60 hover:opacity-100"
        style={{ background: "var(--surface-2)" }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
