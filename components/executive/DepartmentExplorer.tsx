"use client";

import { useCallback, useState } from "react";
import type { OrgIntelNode } from "./types";
import { COHORT_LABEL } from "./types";
import { BreadcrumbTrail } from "./BreadcrumbTrail";
import { DepartmentTile } from "./DepartmentTile";
import { CohortGrid } from "./CohortGrid";

export function DepartmentExplorer({
  root,
  selected,
  onSelect,
}: {
  root: OrgIntelNode;
  selected: OrgIntelNode | null;
  onSelect: (node: OrgIntelNode) => void;
}) {
  /** Each entry is a node chosen from the cohort above it — unfolds layer by layer */
  const [trail, setTrail] = useState<OrgIntelNode[]>([root]);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [animKey, setAnimKey] = useState(0);

  const handlePeerClick = useCallback((parentLevelIndex: number, peer: OrgIntelNode) => {
    onSelect(peer);
    setTrail((t) => [...t.slice(0, parentLevelIndex + 1), peer]);
    setAnimKey((k) => k + 1);
  }, [onSelect]);

  const navigateBreadcrumb = useCallback((index: number) => {
    setTrail((t) => {
      const next = t.slice(0, index + 1);
      onSelect(next[next.length - 1]);
      return next;
    });
    setAnimKey((k) => k + 1);
  }, [onSelect]);

  const jumpToLevel = useCallback((index: number) => {
    navigateBreadcrumb(index);
  }, [navigateBreadcrumb]);

  const toggleCluster = useCallback((clusterId: string) => {
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <BreadcrumbTrail path={trail} onNavigate={navigateBreadcrumb} />

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div key={animKey} className="space-y-0 transition-opacity duration-300 ease-out">
          {trail.map((node, i) => {
            const children = node.children ?? [];
            const isLast = i === trail.length - 1;
            const selectedInCohort = trail[i + 1]?.id ?? (isLast && selected?.id !== node.id ? selected?.id : null);

            return (
              <section
                key={`${node.id}-${i}`}
                className={i > 0 ? "mt-8 pt-8 border-t animate-in fade-in slide-in-from-bottom-2 duration-300" : ""}
                style={i > 0 ? { borderColor: "var(--line)" } : undefined}
              >
                {i === 0 ? (
                  <DepartmentTile
                    node={node}
                    selected={isLast}
                    onClick={() => {
                      onSelect(node);
                      setTrail([root]);
                    }}
                    hero
                  />
                ) : (
                  <DepartmentTile
                    node={node}
                    selected={isLast}
                    onClick={() => jumpToLevel(i)}
                    compact={!isLast}
                  />
                )}

                {children.length > 0 ? (
                  <CohortGrid
                    label={COHORT_LABEL[node.level]}
                    peers={children}
                    selectedId={selectedInCohort ?? null}
                    onSelectPeer={(peer) => handlePeerClick(i, peer)}
                    expandedClusters={expandedClusters}
                    onToggleCluster={toggleCluster}
                  />
                ) : isLast ? (
                  <p
                    className="mt-6 text-[14px] opacity-55 py-8 text-center rounded-xl border"
                    style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}
                  >
                    No further reporting levels — use breadcrumbs to explore another branch.
                  </p>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
