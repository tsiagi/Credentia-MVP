"use client";

import { Building2, ChevronRight } from "lucide-react";
import type { OrgIntelNode } from "./types";
import { COHORT_LABEL } from "./types";
import { FocusCard } from "./FocusCard";
import { RiskIndicator } from "./RiskIndicator";
import { getRiskLevel } from "@/lib/executive-org-data";

export function ExecutiveLanding({
  root,
  onEnterFocus,
  compareIds,
  onToggleCompare,
}: {
  root: OrgIntelNode;
  onEnterFocus: (node: OrgIntelNode) => void;
  compareIds: Set<string>;
  onToggleCompare: (node: OrgIntelNode) => void;
}) {
  const children = root.children ?? [];
  const risk = getRiskLevel(root);

  return (
    <div className="flex-1 min-h-0 flex flex-col px-4 py-5 sm:px-6 overflow-hidden">
      <div className="shrink-0 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-widest opacity-50 flex items-center gap-1.5">
              <Building2 size={14} /> Executive Dashboard
            </div>
            <h1 className="serif text-2xl sm:text-3xl font-semibold mt-1">{root.name}</h1>
            <p className="text-[14px] opacity-60 mt-1 max-w-xl">
              Select a department or leader to enter focus mode. Compare peers without scrolling through the org chart.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider opacity-50">Company health</div>
              <div className="text-3xl font-semibold tabular-nums serif" style={{ color: "var(--accent)" }}>{root.healthScore}</div>
            </div>
            <RiskIndicator level={risk} />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest opacity-50">
            {COHORT_LABEL[root.level]}
          </h2>
          <span className="text-[12px] opacity-45">Click to open focus workspace</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 content-start auto-rows-fr min-h-0">
          {children.map((node) => (
            <FocusCard
              key={node.id}
              node={node}
              onOpen={() => onEnterFocus(node)}
              compareChecked={compareIds.has(node.id)}
              onCompareToggle={() => onToggleCompare(node)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => onEnterFocus(root)}
          className="shrink-0 mt-4 flex items-center justify-center gap-2 text-[13px] font-medium py-3 rounded-xl border transition hover:shadow-sm"
          style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--accent)" }}
        >
          Open company overview in focus mode <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
