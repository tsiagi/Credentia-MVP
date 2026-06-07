"use client";

import {
  Activity, Users, AlertTriangle, TrendingUp, DollarSign, Lightbulb, Heart,
} from "lucide-react";
import type { ExecutiveSummary } from "./types";

function StatPill({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-xl border shrink-0 min-w-[140px]"
      style={{
        borderColor: "var(--line)",
        background: "var(--surface)",
        color: warn ? "var(--warn)" : "var(--ink)",
      }}
    >
      <Icon size={15} className="shrink-0 opacity-60" style={{ color: warn ? "var(--warn)" : "var(--accent)" }} />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider opacity-50 truncate">{label}</div>
        <div className="text-[15px] font-semibold tabular-nums serif">{value}</div>
      </div>
    </div>
  );
}

export function ExecutiveSummaryBar({ summary }: { summary: ExecutiveSummary }) {
  return (
    <div
      className="sticky top-14 sm:top-16 z-20 border-b px-4 py-2.5 overflow-x-auto"
      style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--bg) 94%, transparent)" }}
    >
      <div className="flex items-center gap-2 min-w-max">
        <StatPill icon={Heart} label="Company health" value={summary.companyHealth} />
        <StatPill icon={Users} label="Total employees" value={summary.totalEmployees} />
        <StatPill icon={AlertTriangle} label="High-risk depts" value={summary.highRiskDepartments} warn={summary.highRiskDepartments > 0} />
        <StatPill icon={TrendingUp} label="Promotion-ready" value={summary.promotionReady} />
        <StatPill icon={DollarSign} label="Comp actions pending" value={summary.pendingCompActions} warn={summary.pendingCompActions > 3} />
        <StatPill icon={Lightbulb} label="New processes" value={summary.newProcessImprovements} />
        <div className="hidden lg:flex items-center gap-1.5 text-[11px] opacity-45 px-2">
          <Activity size={12} /> Live workforce intelligence · mock data
        </div>
      </div>
    </div>
  );
}
