// components/ui/PageHeader.tsx
// ─────────────────────────────────────────────────────────────
// Standard page heading: eyebrow + title + subtitle on the left,
// action buttons top-right. Pairs with the Batch 3 app shell.
// Presentation only.
// ─────────────────────────────────────────────────────────────
import React from "react";
import { cn } from "./cn";

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Small uppercase label above the title (e.g. section / role). */
  eyebrow?: React.ReactNode;
  /** Action buttons rendered top-right. */
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="cairn-eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-[13px]" style={{ color: "var(--ink-3)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
