// components/ui/EmptyState.tsx
// ─────────────────────────────────────────────────────────────
// Centered empty placeholder: icon + message + optional CTA.
// Per CLAUDE.md, data surfaces must never render a blank space.
// Presentation only.
// ─────────────────────────────────────────────────────────────
import React from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** CTA — typically a <Button>. */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && (
        <div
          className="mb-3 flex size-12 items-center justify-center rounded-[var(--radius-lg)]"
          style={{ background: "var(--surface-2)", color: "var(--ink-3)" }}
          aria-hidden
        >
          {icon}
        </div>
      )}
      <p className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
        {title}
      </p>
      {description && (
        <p className="mt-1 max-w-sm text-[12px]" style={{ color: "var(--ink-3)" }}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
