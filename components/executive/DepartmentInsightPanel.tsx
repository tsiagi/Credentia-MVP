"use client";

import { AlertTriangle, Lightbulb, TrendingUp, Users, PanelRight } from "lucide-react";
import type { OrgIntelNode } from "./types";
import { METRIC_LABELS, type MetricKey } from "./types";
import { RiskIndicator } from "./RiskIndicator";
import { MetricBadge } from "./MetricBadge";
import { getNodeMetric, getRiskLevel } from "@/lib/executive-org-data";

const ALL_METRICS: MetricKey[] = [
  "productivity", "morale", "innovation", "retentionRisk",
  "compensationHealth", "promotionReadiness", "skillsGrowth",
  "revenueImpact", "operationalEfficiency", "customerImpact",
  "complianceHealth", "workloadBalance",
];

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const w = 140, h = 36;
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / (max - min || 1)) * (h - 6) - 3}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-9">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function DepartmentInsightPanel({ node }: { node: OrgIntelNode | null }) {
  if (!node) {
    return (
      <aside
        className="hidden lg:flex flex-col w-[360px] xl:w-[400px] shrink-0 border-l items-center justify-center p-8 text-center"
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      >
        <PanelRight size={32} className="opacity-20 mb-3" />
        <p className="text-[14px] opacity-50 max-w-xs leading-relaxed">
          Select a department or team tile to view health breakdown, trends, and leadership actions.
        </p>
      </aside>
    );
  }

  const risk = getRiskLevel(node);

  return (
    <aside
      className="w-full lg:w-[360px] xl:w-[400px] shrink-0 border-l overflow-y-auto"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      aria-label={`Insights for ${node.name}`}
    >
      <div className="sticky top-0 z-10 border-b px-5 py-4 backdrop-blur" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--surface) 94%, transparent)" }}>
        <div className="text-[11px] uppercase tracking-widest opacity-50">{node.department}</div>
        <h2 className="serif text-xl font-semibold">{node.name}</h2>
        <p className="text-[13px] opacity-60">{node.role}</p>
      </div>

      <div className="p-5 space-y-5">
        <section>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <div>
              <div className="text-[11px] uppercase tracking-widest opacity-50">Health score</div>
              <div className="text-4xl font-semibold serif tabular-nums" style={{ color: "var(--accent)" }}>{node.healthScore}</div>
            </div>
            <RiskIndicator level={risk} score={node.healthScore} />
          </div>
          <div className="flex items-center gap-2 text-[13px] opacity-70">
            <Users size={14} /> {node.employeeCount} employees in scope
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
            <div className="text-[10px] font-semibold opacity-55 mb-1">{METRIC_LABELS.productivity} trend</div>
            <MiniSparkline data={node.trends.productivity} color="var(--accent)" />
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
            <div className="text-[10px] font-semibold opacity-55 mb-1">{METRIC_LABELS.morale} trend</div>
            <MiniSparkline data={node.trends.morale} color="var(--verified-fg)" />
          </div>
        </section>

        <section>
          <h3 className="text-[11px] uppercase tracking-widest opacity-50 mb-2">Metrics</h3>
          <div className="grid grid-cols-2 gap-2">
            {ALL_METRICS.map((m) => (
              <MetricBadge key={m} metric={m} value={getNodeMetric(node, m)} compact />
            ))}
          </div>
        </section>

        {node.alerts.length > 0 && (
          <section>
            <h3 className="text-[11px] uppercase tracking-widest opacity-50 mb-2 flex items-center gap-1">
              <AlertTriangle size={12} style={{ color: "var(--warn)" }} /> Key alerts
            </h3>
            <ul className="space-y-2">
              {node.alerts.map((a, i) => (
                <li key={i} className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{a}</li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="text-[11px] uppercase tracking-widest opacity-50 mb-2 flex items-center gap-1">
            <Lightbulb size={12} /> Leadership actions
          </h3>
          <ul className="space-y-2">
            {(node.recommendations.length ? node.recommendations : [
              "Review weekly pulse for this team",
              "Validate comp recommendations in Comp Intelligence",
            ]).map((r, i) => (
              <li key={i} className="text-[13px] px-3 py-2 rounded-lg border" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>{r}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--inferred-bg)" }}>
          <h3 className="text-[11px] uppercase tracking-widest opacity-50 mb-2 flex items-center gap-1">
            <TrendingUp size={12} /> Pipeline
          </h3>
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div><span className="opacity-60">Promotion ready</span><div className="font-semibold">{Math.round(node.promotionReadiness * 100)}%</div></div>
            <div><span className="opacity-60">Comp health</span><div className="font-semibold">{Math.round(node.compensationHealth * 100)}%</div></div>
            <div><span className="opacity-60">New processes</span><div className="font-semibold">{Math.round(node.innovationScore * 100)}%</div></div>
            <div><span className="opacity-60">Skills growth</span><div className="font-semibold">{Math.round(node.skillsGrowth * 100)}%</div></div>
          </div>
        </section>
      </div>
    </aside>
  );
}
