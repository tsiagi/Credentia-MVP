"use client";

import type { ReactNode } from "react";
import { BadgeCheck, Sparkles } from "lucide-react";

export const VERIFICATION_LEVELS = [
  { n: 1, label: "Self Reported", fg: "#6b7280", bg: "#6b72801a" },
  { n: 2, label: "Manager Verified", fg: "#1f4ed8", bg: "#1f4ed81a" },
  { n: 3, label: "HR Verified", fg: "#7c3aed", bg: "#7c3aed1a" },
  { n: 4, label: "Company Verified", fg: "#0f6e5c", bg: "#0f6e5c1a" },
  { n: 5, label: "Multi-Source Verified", fg: "#b45309", bg: "#b453091a" },
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
