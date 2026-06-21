// components/admin/MetricsDashboard.tsx
// A responsive grid of MetricCards + an automatic AI-disclosure note whenever
// any metric is an inference. Shared by both admin dashboards; the caller
// prepares the metric list for its scope (platform-wide vs single-company).
"use client";

import React from "react";
import { Info } from "lucide-react";
import { MetricCard, type MetricCardProps } from "./MetricCard";

export interface MetricsDashboardProps {
  metrics: (MetricCardProps & { key: string })[];
  /** Columns at lg breakpoint. Default 3. */
  columns?: 2 | 3 | 4;
  loading?: boolean;
}

const COLS: Record<NonNullable<MetricsDashboardProps["columns"]>, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

export function MetricsDashboard({ metrics, columns = 3, loading }: MetricsDashboardProps) {
  const hasInferred = metrics.some((m) => m.tone === "inferred");

  if (loading) {
    return (
      <div className={`grid gap-4 sm:grid-cols-2 ${COLS[columns]}`} aria-busy="true">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--radius-lg)] border p-6 space-y-3"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          >
            <div className="h-3 w-24 rounded animate-pulse" style={{ background: "var(--surface-2)" }} />
            <div className="h-8 w-28 rounded animate-pulse" style={{ background: "var(--surface-2)" }} />
            <div className="h-3 w-full rounded animate-pulse" style={{ background: "var(--surface-2)" }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={`grid gap-4 sm:grid-cols-2 ${COLS[columns]}`}>
        {metrics.map(({ key, ...m }) => (
          <MetricCard key={key} {...m} />
        ))}
      </div>
      {hasInferred && (
        <p
          className="text-[12px] flex items-start gap-1.5 px-1"
          style={{ color: "var(--ink-3)" }}
        >
          <Info size={13} className="mt-0.5 shrink-0" style={{ color: "var(--inferred-fg)" }} />
          Amber metrics are AI-generated estimates (counts of model-produced suggestions),
          shown for usage visibility only — never verified facts or decisions.
        </p>
      )}
    </div>
  );
}
