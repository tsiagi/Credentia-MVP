"use client";

import type { ReactNode } from "react";
import { BadgeCheck, Sparkles } from "lucide-react";

export const VERIFICATION_LEVELS = [
  { n: 1, label: "Self Reported", fg: "var(--ink-3)", bg: "var(--surface-2)" },
  { n: 2, label: "Manager Verified", fg: "var(--accent-text)", bg: "var(--accent-soft)" },
  { n: 3, label: "HR Verified", fg: "var(--inferred-fg)", bg: "var(--inferred-bg)" },
  { n: 4, label: "Company Verified", fg: "var(--verified-fg)", bg: "var(--verified-bg)" },
  { n: 5, label: "Multi-Source Verified", fg: "var(--warn-fg)", bg: "var(--warn-bg)" },
] as const;

export function LevelBadge({ level }: { level: number }) {
  const l = VERIFICATION_LEVELS.find((x) => x.n === level) ?? VERIFICATION_LEVELS[0];
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: l.bg, color: l.fg }}
    >
      <BadgeCheck size={12} /> L{l.n} · {l.label}
    </span>
  );
}

export function VerifiedTag() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full"
      style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}
    >
      <BadgeCheck size={12} /> VERIFIED
    </span>
  );
}

export function SelfReportedTag() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full"
      style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}
    >
      Self-Reported
    </span>
  );
}

export function InferredTag() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full"
      style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}
    >
      <Sparkles size={12} /> AI INFERENCE
    </span>
  );
}

export function levelFromVerified(isVerified: boolean, level?: number) {
  if (level != null && level >= 1) return level;
  return isVerified ? 2 : 1;
}

export function isVerifiedLevel(level: number) {
  return level >= 2;
}

export function SectionSplitHeader({
  verified,
  title,
  sub,
}: {
  verified: boolean;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-semibold">{title}</h3>
        {verified ? <VerifiedTag /> : <SelfReportedTag />}
      </div>
      {sub && <p className="text-[13px] opacity-60 mt-1">{sub}</p>}
    </div>
  );
}

export function PassportCard({
  children,
  className = "",
  style = {},
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-2xl border ${className}`}
      style={{
        borderColor: "var(--line)",
        background: "var(--surface)",
        boxShadow: "0 1px 2px rgba(0,0,0,.04)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
