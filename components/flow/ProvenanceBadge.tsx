// components/flow/ProvenanceBadge.tsx
// ─────────────────────────────────────────────────────────────
// The single source of truth for how a trust tier LOOKS. Every tier is
// visually unambiguous and token-driven (never hardcoded hex):
//   ATTESTED → ShieldCheck + blue   (--verified-fg / --verified-bg)
//   ASSERTED → Circle    + neutral, DASHED outline (explicitly unverified)
//   INFERRED → Sparkles  + amber    (--inferred-fg / --inferred-bg)
// ─────────────────────────────────────────────────────────────
"use client";

import React from "react";
import { ShieldCheck, Sparkles, CircleDashed } from "lucide-react";
import type { ProvenanceTier } from "@/lib/flow";

const META: Record<
  ProvenanceTier,
  { label: string; icon: React.ReactNode; fg: string; bg: string; dashed?: boolean }
> = {
  ATTESTED: {
    label: "Attested",
    icon: <ShieldCheck size={12} strokeWidth={2.5} />,
    fg: "var(--verified-fg)",
    bg: "var(--verified-bg)",
  },
  ASSERTED: {
    label: "Asserted",
    icon: <CircleDashed size={12} strokeWidth={2.5} />,
    fg: "var(--ink-3)",
    bg: "transparent",
    dashed: true,
  },
  INFERRED: {
    label: "Inferred · AI",
    icon: <Sparkles size={12} strokeWidth={2.5} />,
    fg: "var(--inferred-fg)",
    bg: "var(--inferred-bg)",
  },
};

export function ProvenanceBadge({
  tier,
  size = "md",
  withLabel = true,
}: {
  tier: ProvenanceTier;
  size?: "sm" | "md";
  withLabel?: boolean;
}) {
  const m = META[tier];
  const pad = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${pad}`}
      style={{
        color: m.fg,
        background: m.bg,
        fontSize: size === "sm" ? 10.5 : 11.5,
        border: m.dashed ? "1px dashed var(--line-strong)" : `1px solid transparent`,
        letterSpacing: 0.2,
      }}
      title={
        tier === "ATTESTED"
          ? "Backed by a linked evidence artifact"
          : tier === "ASSERTED"
            ? "Self-reported — unverified"
            : "AI-generated — not verified, quarantined"
      }
    >
      {m.icon}
      {withLabel && m.label}
    </span>
  );
}
