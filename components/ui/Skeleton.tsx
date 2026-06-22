// components/ui/Skeleton.tsx
// ─────────────────────────────────────────────────────────────
// Loading placeholders. Use these instead of spinners on
// data-fetching surfaces (per CLAUDE.md: never a blank state).
// Respects prefers-reduced-motion via the .core-roborate-skeleton class.
// Presentation only.
// ─────────────────────────────────────────────────────────────
import React from "react";
import { cn } from "./cn";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind width/height utilities, e.g. "h-4 w-32". */
  className?: string;
  /** Render as a circle (for avatars). */
  circle?: boolean;
}

export function Skeleton({ className, circle = false, style, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn("core-roborate-skeleton", circle ? "rounded-full" : "rounded-[var(--radius-sm)]", className)}
      style={style}
      {...rest}
    />
  );
}

/** A block of stacked text lines for paragraph placeholders. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
