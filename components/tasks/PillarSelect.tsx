"use client";
// components/tasks/PillarSelect.tsx
// Mandatory Strategic Pillar dropdown, sourced from the admin-configurable
// strategic_pillars table (so admins can add options without a code change).
import React from "react";
import type { StrategicPillar } from "@/lib/tasks";

export function PillarSelect({
  pillars, value, onChange, placeholder = "Strategic pillar…",
}: {
  pillars: StrategicPillar[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required
      className="px-3 py-2 rounded-lg border text-sm outline-none"
      style={{ borderColor: "var(--line)", background: "var(--surface)", color: value ? "var(--ink)" : "var(--ink-3)" }}
    >
      <option value="" disabled>{placeholder}</option>
      {pillars.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}
