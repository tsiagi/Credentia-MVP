// components/admin/MetricCard.tsx
// One metric tile, shared by the superadmin (platform-wide) and company-admin
// (single-org) dashboards.
//
// Trust language is enforced HERE, centrally (CLAUDE.md non-negotiable):
//   tone="verified" → blue + ShieldCheck + "Verified" badge (attested facts)
//   tone="inferred" → amber + Sparkles + "AI Estimate" badge (model output)
//   tone="neutral"  → administrative fact (headcount, billing) — no trust badge
// Never hardcode trust colours at the call site; pass a tone.
"use client";

import React from "react";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Card, VerifiedBadge, AIEstimateBadge, cn } from "@/components/ui";

export type MetricTone = "verified" | "inferred" | "neutral";

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: MetricTone;
  icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  trend?: { dir: "up" | "down" | "flat"; label?: string };
  /** Override the trust-badge label (e.g. "AI inference"). */
  badgeLabel?: string;
}

function TrendChip({ dir, label }: NonNullable<MetricCardProps["trend"]>) {
  const Icon = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : Minus;
  const color =
    dir === "up" ? "var(--verified-fg)" : dir === "down" ? "var(--warn-fg)" : "var(--ink-3)";
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color }}>
      <Icon size={13} />
      {label}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  tone = "neutral",
  icon: Icon,
  trend,
  badgeLabel,
}: MetricCardProps) {
  // Inferred metrics get the amber surface so the AI boundary is unmistakable
  // even before reading the badge — same idiom as the inference panels.
  const inferred = tone === "inferred";
  return (
    <Card
      padding="md"
      style={inferred ? { background: "var(--inferred-bg)" } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <Icon
              size={16}
              style={{ color: inferred ? "var(--inferred-fg)" : "var(--accent)" }}
            />
          )}
          <span className="core-roborate-eyebrow truncate">{label}</span>
        </div>
        {tone === "verified" && <VerifiedBadge label={badgeLabel ?? "Verified"} />}
        {tone === "inferred" && <AIEstimateBadge label={badgeLabel ?? "AI Estimate"} />}
      </div>
      <div
        className={cn("mt-2 text-[30px] font-semibold serif tabular")}
        style={{ color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.05 }}
      >
        {value}
      </div>
      <div className="mt-1 flex items-center gap-2 flex-wrap">
        {trend && <TrendChip {...trend} />}
        {sub && <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>{sub}</span>}
      </div>
    </Card>
  );
}
