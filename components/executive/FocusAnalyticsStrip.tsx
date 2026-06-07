"use client";

import { AlertTriangle, Lightbulb } from "lucide-react";
import type { OrgIntelNode } from "./types";
import { FOCUS_METRICS } from "./types";
import { MetricBadge } from "./MetricBadge";
import { getNodeMetric, getRiskLevel } from "@/lib/executive-org-data";
import { RiskIndicator } from "./RiskIndicator";

export function FocusAnalyticsStrip({ node }: { node: OrgIntelNode }) {
  const risk = getRiskLevel(node);

  return (
    <div
      className="shrink-0 border-t px-5 py-4"
      style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}
    >
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest opacity-50">Analytics</h3>
        <RiskIndicator level={risk} score={node.healthScore} compact />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-3">
        {FOCUS_METRICS.map((m) => (
          <MetricBadge key={m} metric={m} value={getNodeMetric(node, m)} compact />
        ))}
      </div>

      {(node.alerts.length > 0 || node.recommendations.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {node.alerts.slice(0, 2).map((a, i) => (
            <span
              key={`a-${i}`}
              className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full"
              style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
            >
              <AlertTriangle size={11} /> {a}
            </span>
          ))}
          {node.recommendations.slice(0, 1).map((r, i) => (
            <span
              key={`r-${i}`}
              className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border"
              style={{ borderColor: "var(--line)", background: "var(--surface)" }}
            >
              <Lightbulb size={11} /> {r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
