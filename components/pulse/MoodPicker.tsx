"use client";
// components/pulse/MoodPicker.tsx
// Shared 1–5 emoji sentiment picker for the daily check-in / check-out.
import React from "react";
import type { PulseMood } from "@/lib/pulse";

const SCALE: { v: PulseMood; emoji: string; label: string }[] = [
  { v: 1, emoji: "😞", label: "Struggling" },
  { v: 2, emoji: "😕", label: "Low" },
  { v: 3, emoji: "😐", label: "Okay" },
  { v: 4, emoji: "🙂", label: "Good" },
  { v: 5, emoji: "😄", label: "Great" },
];

export function MoodPicker({ value, onChange }: { value: PulseMood | null; onChange: (v: PulseMood) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      {SCALE.map((s) => {
        const active = value === s.v;
        return (
          <button
            key={s.v}
            type="button"
            onClick={() => onChange(s.v)}
            aria-label={s.label}
            aria-pressed={active}
            className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border transition active:scale-95"
            style={{
              borderColor: active ? "var(--accent-line)" : "var(--line)",
              background: active ? "var(--accent-soft)" : "var(--surface)",
              boxShadow: active ? "var(--shadow-xs)" : "none",
            }}
          >
            <span className="text-2xl leading-none" style={{ filter: active ? "none" : "grayscale(0.4)" }}>{s.emoji}</span>
            <span className="text-[10px] font-medium" style={{ color: active ? "var(--accent)" : "var(--ink-3)" }}>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
