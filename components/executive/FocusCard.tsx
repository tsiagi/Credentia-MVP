"use client";

import { ChevronRight, Users } from "lucide-react";
import type { OrgIntelNode } from "./types";
import { RiskIndicator } from "./RiskIndicator";
import { getRiskLevel } from "@/lib/executive-org-data";

function pct(v: number, isRisk = false) {
  return isRisk ? `${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`;
}

export function FocusCard({
  node,
  onOpen,
  compareChecked,
  onCompareToggle,
  clusterLabel,
  memberCount,
}: {
  node?: OrgIntelNode;
  onOpen: () => void;
  compareChecked?: boolean;
  onCompareToggle?: () => void;
  /** Aggregated cohort tile (no individual node) */
  clusterLabel?: string;
  memberCount?: number;
}) {
  const isCluster = Boolean(clusterLabel);
  const risk = node ? getRiskLevel(node) : "healthy";
  const hasChildren = isCluster || Boolean(node?.children?.length);

  return (
    <div
      className="relative flex flex-col rounded-2xl border transition-all duration-200 hover:shadow-lg min-h-[200px] max-h-[240px]"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      {onCompareToggle && node && (
        <label
          className="absolute top-3 right-3 z-10 flex items-center gap-1.5 text-[11px] opacity-70 cursor-pointer select-none px-2 py-1 rounded-lg"
          style={{ background: "var(--surface-2)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={compareChecked}
            onChange={onCompareToggle}
            className="rounded accent-[var(--accent)]"
          />
          Compare
        </label>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="flex flex-col flex-1 text-left p-5 group"
      >
        <div className="flex items-start justify-between gap-2 mb-3 pr-16">
          <div className="min-w-0">
            {!isCluster && node && (
              <div className="text-[10px] font-bold uppercase tracking-wider opacity-50 truncate">
                {node.department}
              </div>
            )}
            <div className="font-semibold serif text-lg sm:text-xl leading-tight truncate" style={{ color: "var(--ink)" }}>
              {isCluster ? clusterLabel : node!.name}
            </div>
            {!isCluster && node && (
              <div className="text-[12px] opacity-60 truncate mt-0.5">{node.role}</div>
            )}
            {isCluster && (
              <div className="text-[12px] opacity-60 mt-0.5 flex items-center gap-1">
                <Users size={13} /> {memberCount} members
              </div>
            )}
          </div>
          {hasChildren && (
            <span
              className="shrink-0 p-2 rounded-xl opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
              style={{ background: "var(--surface-2)" }}
            >
              <ChevronRight size={18} />
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-3xl font-semibold tabular-nums serif" style={{ color: "var(--accent)" }}>
            {isCluster ? "—" : node!.healthScore}
          </span>
          {!isCluster && node && <RiskIndicator level={risk} compact />}
        </div>

        {!isCluster && node && (
          <>
            <div className="flex items-center gap-1.5 text-[12px] opacity-60 mb-3">
              <Users size={13} /> {node.employeeCount} in scope
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-auto">
              {[
                { label: "Prod", value: pct(node.productivityScore) },
                { label: "Morale", value: pct(node.moraleScore) },
                { label: "Retention", value: pct(node.retentionRisk, true) },
              ].map((m) => (
                <div key={m.label} className="rounded-lg px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
                  <div className="text-[9px] opacity-50">{m.label}</div>
                  <div className="text-[11px] font-semibold tabular-nums">{m.value}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {isCluster && (
          <p className="text-[12px] opacity-55 mt-auto">Open cohort to review all members</p>
        )}
      </button>
    </div>
  );
}
