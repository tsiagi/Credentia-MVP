"use client";

import { useCallback, useMemo, useState } from "react";
import { buildOrgIntelTree, computeExecutiveSummary, flattenOrgTree } from "@/lib/executive-org-data";
import type { OrgIntelNode } from "./types";
import { ExecutiveSummaryBar } from "./ExecutiveSummaryBar";
import { OrgMindMap } from "./OrgMindMap";
import { ComparisonModal } from "./ComparisonModal";
import { FloatingCompareBar } from "./FloatingCompareBar";

export function ExecutiveDashboard() {
  const root = useMemo(() => buildOrgIntelTree(), []);
  const summary = useMemo(() => computeExecutiveSummary(flattenOrgTree(root)), [root]);
  const allNodes = useMemo(() => flattenOrgTree(root), [root]);

  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);

  const compareNodes = useMemo(
    () => allNodes.filter((n) => compareIds.has(n.id)),
    [allNodes, compareIds],
  );

  const toggleCompare = useCallback((node: OrgIntelNode) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  }, []);

  const clearCompare = useCallback(() => setCompareIds(new Set()), []);

  const removeFromCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (compareIds.size <= 2) setShowCompare(false);
  }, [compareIds.size]);

  return (
    <div className="flex flex-col -mx-5 md:-mx-0 min-h-[calc(100vh-3.5rem)]" style={{ background: "var(--bg)" }}>
      <ExecutiveSummaryBar summary={summary} />

      <div className="flex-1 px-4 py-5 sm:px-6">
        <div className="mb-4">
          <div className="cairn-eyebrow flex items-center gap-1.5">Org health · command center</div>
          <h1 className="serif text-2xl sm:text-3xl font-semibold mt-1">{root.department}</h1>
          <p className="text-[14px] opacity-60 mt-1 max-w-2xl">
            A live map of the organization. Click any department to zoom into its leader and direct reports, compare teams
            side by side, or print the focused view. Every score here is an AI inference — internal decision support only.
          </p>
        </div>

        <OrgMindMap root={root} compareIds={compareIds} onToggleCompare={toggleCompare} />
      </div>

      <FloatingCompareBar
        count={compareIds.size}
        onCompare={() => setShowCompare(true)}
        onClear={clearCompare}
      />

      {showCompare && compareNodes.length >= 2 && (
        <ComparisonModal
          nodes={compareNodes}
          onClose={() => setShowCompare(false)}
          onRemove={removeFromCompare}
        />
      )}
    </div>
  );
}
