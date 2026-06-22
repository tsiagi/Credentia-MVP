// components/ui/Badge.tsx
// ─────────────────────────────────────────────────────────────
// Core-Roborate badge primitive + the two TRUST presets.
//
// Non-negotiable (CLAUDE.md): verified facts are blue + ShieldCheck,
// AI inferences are amber + Sparkles. Both pull from the central
// --verified-* / --inferred-* tokens — never raw hex, never mixed.
// Presentation only.
// ─────────────────────────────────────────────────────────────
import React from "react";
import { ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "accent" | "verified" | "inferred" | "success" | "warn" | "danger";

const TONE: Record<BadgeTone, { fg: string; bg: string }> = {
  neutral:  { fg: "var(--ink-2)",      bg: "var(--surface-2)" },
  accent:   { fg: "var(--accent-text)", bg: "var(--accent-soft)" },
  verified: { fg: "var(--verified-fg)", bg: "var(--verified-bg)" },
  inferred: { fg: "var(--inferred-fg)", bg: "var(--inferred-bg)" },
  success:  { fg: "var(--olive-600)",   bg: "var(--olive-100)" },
  warn:     { fg: "var(--warn-fg)",      bg: "var(--warn-bg)" },
  danger:   { fg: "var(--danger-fg)",    bg: "var(--danger-bg)" },
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: React.ReactNode;
}

export function Badge({ tone = "neutral", icon, className, children, style, ...rest }: BadgeProps) {
  const t = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-pill)]",
        "px-2 py-0.5 text-[11px] font-semibold leading-none tracking-wide whitespace-nowrap",
        className,
      )}
      style={{ color: t.fg, background: t.bg, ...style }}
      {...rest}
    >
      {icon && <span className="inline-flex shrink-0" aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}

/** Trust preset — a fact attested by a real human. Blue + shield. */
export function VerifiedBadge({ label = "Verified", className, ...rest }: { label?: string } & BadgeProps) {
  return (
    <Badge tone="verified" icon={<ShieldCheck size={12} />} className={className} {...rest}>
      {label}
    </Badge>
  );
}

/** Trust preset — a model-generated estimate. Amber + sparkle. Never framed as fact. */
export function AIEstimateBadge({ label = "AI Estimate", className, ...rest }: { label?: string } & BadgeProps) {
  return (
    <Badge tone="inferred" icon={<Sparkles size={12} />} className={className} {...rest}>
      {label}
    </Badge>
  );
}
