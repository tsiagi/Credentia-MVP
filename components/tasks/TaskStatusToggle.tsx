"use client";
// components/tasks/TaskStatusToggle.tsx
// Three-state completion toggle: Complete / Partial / Not Complete.
import React from "react";
import { Check, CircleDashed, X } from "lucide-react";
import type { TaskStatus } from "@/lib/tasks";

const OPTIONS: { v: Exclude<TaskStatus, "assigned">; label: string; icon: React.ComponentType<{ size?: number }>; fg: string; bg: string }[] = [
  { v: "complete",   label: "Complete",     icon: Check,        fg: "var(--verified-fg)", bg: "var(--verified-bg)" },
  { v: "partial",    label: "Partial",      icon: CircleDashed, fg: "var(--warn)",        bg: "var(--warn-bg)" },
  { v: "incomplete", label: "Not Complete", icon: X,            fg: "var(--danger-fg)",   bg: "var(--danger-bg)" },
];

export function TaskStatusToggle({
  value, onChange, disabled,
}: { value: TaskStatus; onChange: (s: Exclude<TaskStatus, "assigned">) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex gap-1 p-1 rounded-xl" style={{ background: "var(--surface-2)" }}>
      {OPTIONS.map((o) => {
        const active = value === o.v;
        const Icon = o.icon;
        return (
          <button
            key={o.v}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className="px-2.5 py-1.5 rounded-lg text-[12px] font-medium inline-flex items-center gap-1 transition active:scale-[0.97] disabled:opacity-40"
            style={{
              background: active ? o.bg : "transparent",
              color: active ? o.fg : "var(--ink-2)",
              boxShadow: active ? "var(--shadow-xs)" : "none",
            }}
          >
            <Icon size={13} /> {o.label}
          </button>
        );
      })}
    </div>
  );
}
