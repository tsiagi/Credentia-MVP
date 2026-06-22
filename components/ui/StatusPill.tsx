// components/ui/StatusPill.tsx
// ─────────────────────────────────────────────────────────────
// Lifecycle / state pill with a leading status dot. Semantic
// statuses map to Core-Roborate tokens. Use Badge for labels; use this
// for entity state (pending / active / inactive / flagged …).
// Presentation only.
// ─────────────────────────────────────────────────────────────
import React from "react";
import { cn } from "./cn";

export type Status =
  | "active"
  | "pending"
  | "inactive"
  | "flagged"
  | "verified"
  | "info";

const STATUS: Record<Status, { fg: string; bg: string; dot: string; label: string }> = {
  active:   { fg: "var(--olive-600)",   bg: "var(--olive-100)",   dot: "var(--olive-500)",   label: "Active" },
  pending:  { fg: "var(--warn-fg)",      bg: "var(--warn-bg)",      dot: "var(--warn-fg)",      label: "Pending" },
  inactive: { fg: "var(--ink-3)",        bg: "var(--surface-2)",    dot: "var(--ink-3)",        label: "Inactive" },
  flagged:  { fg: "var(--danger-fg)",    bg: "var(--danger-bg)",    dot: "var(--danger-fg)",    label: "Flagged" },
  verified: { fg: "var(--verified-fg)",  bg: "var(--verified-bg)",  dot: "var(--verified-fg)",  label: "Verified" },
  info:     { fg: "var(--accent-text)",  bg: "var(--accent-soft)",  dot: "var(--accent)",       label: "Info" },
};

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: Status;
  /** Override the default label for the status. */
  label?: string;
}

export function StatusPill({ status, label, className, style, ...rest }: StatusPillProps) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)]",
        "px-2 py-0.5 text-[11px] font-semibold leading-none whitespace-nowrap",
        className,
      )}
      style={{ color: s.fg, background: s.bg, ...style }}
      {...rest}
    >
      <span className="inline-block size-1.5 rounded-full shrink-0" style={{ background: s.dot }} aria-hidden />
      {label ?? s.label}
    </span>
  );
}
