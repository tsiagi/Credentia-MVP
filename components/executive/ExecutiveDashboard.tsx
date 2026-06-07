"use client";

import { useCallback, useMemo, useState } from "react";
import { buildOrgIntelTree, computeExecutiveSummary, flattenOrgTree } from "@/lib/executive-org-data";
import type { OrgIntelNode } from "./types";
import { ExecutiveSummaryBar } from "./ExecutiveSummaryBar";
import { ExecutiveLanding } from "./ExecutiveLanding";
import { FocusWorkspace } from "./FocusWorkspace";
import { ComparisonModal } from "./ComparisonModal";
import { FloatingCompareBar } from "./FloatingCompareBar";

export function ExecutiveDashboard() {
  const root = useMemo(() => buildOrgIntelTree(), []);
  const summary = useMemo(() => computeExecutiveSummary(flattenOrgTree(root)), [root]);
  const allNodes = useMemo(() => flattenOrgTree(root), [root]);

  const [focusPath, setFocusPath] = useState<OrgIntelNode[] | null>(null);
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

  const enterFocus = useCallback((node: OrgIntelNode) => {
    const path: OrgIntelNode[] = [root];
    if (node.id !== root.id) path.push(node);
    setFocusPath(path);
  }, [root]);

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
    <div className="flex flex-col -mx-5 md:-mx-0 h-[calc(100vh-3.5rem)] min-h-[520px] overflow-hidden" style={{ background: "var(--bg)" }}>
      <ExecutiveSummaryBar summary={summary} />

      <ExecutiveLanding
        root={root}
        onEnterFocus={enterFocus}
        compareIds={compareIds}
        onToggleCompare={toggleCompare}
      />

      {focusPath && (
        <FocusWorkspace
          path={focusPath}
          onPathChange={setFocusPath}
          onClose={() => setFocusPath(null)}
          compareIds={compareIds}
          onToggleCompare={toggleCompare}
        />
      )}

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
