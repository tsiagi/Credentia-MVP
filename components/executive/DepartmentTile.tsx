"use client";

import { ChevronRight, Users } from "lucide-react";
import type { OrgIntelNode } from "./types";
import { RiskIndicator } from "./RiskIndicator";
import { getRiskLevel } from "@/lib/executive-org-data";

function pct(v: number, isRisk = false) {
  return isRisk ? `${Math.round(v * 100)}% risk` : `${Math.round(v * 100)}%`;
}

const PEER_METRICS = (node: OrgIntelNode) => [
  { label: "Productivity", value: pct(node.productivityScore) },
  { label: "Morale", value: pct(node.moraleScore) },
  { label: "Health", value: String(node.healthScore) },
  { label: "Innovation", value: pct(node.innovationScore) },
  { label: "Retention", value: pct(node.retentionRisk, true) },
  { label: "Comp", value: pct(node.compensationHealth) },
];

export function DepartmentTile({
  node,
  selected,
  onClick,
  hero = false,
  compact = false,
}: {
  node: OrgIntelNode;
  selected: boolean;
  onClick: () => void;
  hero?: boolean;
  compact?: boolean;
}) {
  const risk = getRiskLevel(node);
  const hasChildren = Boolean(node.children?.length);
  const isHero = hero && node.level === "ceo";

  const padding = isHero ? "p-6 sm:p-8" : compact ? "p-3 sm:p-4" : "p-5 sm:p-6";
  const minH = isHero ? "min-h-[140px]" : compact ? "min-h-[120px]" : "min-h-[180px]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border transition-all duration-200 w-full group hover:shadow-md ${padding} ${minH}`}
      style={{
        borderColor: selected ? "var(--accent)" : "var(--line)",
        background: selected ? "var(--accent-soft)" : "var(--surface)",
        boxShadow: selected ? "0 0 0 2px var(--accent-soft)" : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          {!compact && (
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-50 truncate">
              {node.department}
            </div>
          )}
          <div
            className={`font-semibold serif leading-tight truncate ${
              isHero ? "text-2xl sm:text-3xl" : compact ? "text-[15px]" : "text-lg sm:text-xl"
            }`}
            style={{ color: "var(--ink)" }}
          >
            {node.name}
          </div>
          <div className={`opacity-60 truncate ${compact ? "text-[11px]" : "text-[13px]"} mt-0.5`}>{node.role}</div>
        </div>
        {hasChildren && !compact && (
          <span className="shrink-0 p-1.5 rounded-lg opacity-50 group-hover:opacity-100 transition" style={{ background: "var(--surface-2)" }}>
            <ChevronRight size={16} />
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <span className={`font-semibold tabular-nums serif ${compact ? "text-lg" : "text-2xl"}`} style={{ color: "var(--accent)" }}>
          {node.healthScore}
        </span>
        <RiskIndicator level={risk} compact />
      </div>

      {!compact && (
        <div className="flex items-center gap-1.5 text-[12px] opacity-60 mb-3">
          <Users size={13} /> {node.employeeCount} people
        </div>
      )}

      <div className={`grid gap-1.5 ${compact ? "grid-cols-2" : isHero ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`}>
        {PEER_METRICS(node).slice(0, compact ? 4 : 6).map((m) => (
          <div key={m.label} className="rounded-lg px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
            <div className="text-[10px] opacity-55 truncate">{m.label}</div>
            <div className="text-[11px] sm:text-[12px] font-semibold tabular-nums">{m.value}</div>
          </div>
        ))}
      </div>

      {hasChildren && !compact && (
        <div className="text-[11px] mt-3 opacity-45 group-hover:opacity-70 transition">
          Click to unfold {node.children!.length} direct reports →
        </div>
      )}
    </button>
  );
}
