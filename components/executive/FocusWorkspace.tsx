"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import type { OrgIntelNode } from "./types";
import { COHORT_LABEL } from "./types";
import { BreadcrumbTrail } from "./BreadcrumbTrail";
import { FocusCard } from "./FocusCard";
import { FocusAnalyticsStrip } from "./FocusAnalyticsStrip";
import { buildCohortDisplay } from "./CohortGrid";
import { Users } from "lucide-react";
import { RiskIndicator } from "./RiskIndicator";
import { getRiskLevel } from "@/lib/executive-org-data";

const PAGE_SIZE = 6;

export function FocusWorkspace({
  path,
  onPathChange,
  onClose,
  compareIds,
  onToggleCompare,
}: {
  path: OrgIntelNode[];
  onPathChange: (path: OrgIntelNode[]) => void;
  onClose: () => void;
  compareIds: Set<string>;
  onToggleCompare: (node: OrgIntelNode) => void;
}) {
  const [slideDir, setSlideDir] = useState<"forward" | "back">("forward");
  const [animKey, setAnimKey] = useState(0);
  const [clusterMembers, setClusterMembers] = useState<OrgIntelNode[] | null>(null);
  const [clusterLabel, setClusterLabel] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const focus = path[path.length - 1];
  const children = focus.children ?? [];
  const { tiles, cluster } = buildCohortDisplay(children);
  const risk = getRiskLevel(focus);
  const cohortTitle = COHORT_LABEL[focus.level];

  const navigateTo = useCallback((next: OrgIntelNode[], dir: "forward" | "back") => {
    setSlideDir(dir);
    setAnimKey((k) => k + 1);
    setClusterMembers(null);
    setClusterLabel(null);
    setPage(0);
    onPathChange(next);
  }, [onPathChange]);

  const drillInto = useCallback((node: OrgIntelNode) => {
    navigateTo([...path, node], "forward");
  }, [path, navigateTo]);

  const openCluster = useCallback(() => {
    if (!cluster) return;
    setSlideDir("forward");
    setAnimKey((k) => k + 1);
    setClusterMembers(cluster.members);
    setClusterLabel(cluster.label);
    setPage(0);
  }, [cluster]);

  const breadcrumbNavigate = useCallback((index: number) => {
    navigateTo(path.slice(0, index + 1), "back");
  }, [path, navigateTo]);

  const goBack = useCallback(() => {
    if (clusterMembers) {
      setClusterMembers(null);
      setClusterLabel(null);
      setPage(0);
      setAnimKey((k) => k + 1);
      return;
    }
    if (path.length > 1) {
      navigateTo(path.slice(0, -1), "back");
    } else {
      onClose();
    }
  }, [clusterMembers, path, navigateTo, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") goBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goBack]);

  const displayNodes = clusterMembers ?? (cluster ? [] : tiles);
  const totalPages = Math.max(1, Math.ceil(displayNodes.length / PAGE_SIZE));
  const pageNodes = displayNodes.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const viewingCluster = Boolean(clusterMembers);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center p-0 sm:p-4 md:p-6" role="dialog" aria-modal aria-label={`Focus: ${focus.name}`}>
      <button
        type="button"
        aria-label="Close workspace"
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
        onClick={onClose}
      />

      <div
        className="relative flex flex-col w-full max-w-6xl my-auto h-[calc(100vh-3.5rem)] sm:h-[min(720px,calc(100vh-4rem))] rounded-none sm:rounded-2xl border overflow-hidden shadow-2xl"
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="shrink-0 border-b" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: "var(--line)" }}>
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium px-2.5 py-1.5 rounded-lg hover:opacity-80 transition"
              style={{ color: "var(--accent)", background: "var(--accent-soft)" }}
            >
              <ArrowLeft size={15} /> Back
            </button>
            <div className="flex-1 min-w-0">
              <BreadcrumbTrail path={path} onNavigate={breadcrumbNavigate} inline />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-2 rounded-lg hover:opacity-70 transition shrink-0"
              style={{ background: "var(--surface-2)" }}
            >
              <X size={18} />
            </button>
          </div>

          <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-widest opacity-50">{focus.department}</div>
              <h2 className="serif text-2xl sm:text-3xl font-semibold truncate">{focus.name}</h2>
              <p className="text-[13px] opacity-60 mt-0.5">{focus.role}</p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wider opacity-50">Health</div>
                <div className="text-3xl font-semibold tabular-nums serif" style={{ color: "var(--accent)" }}>{focus.healthScore}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wider opacity-50">Employees</div>
                <div className="text-xl font-semibold tabular-nums flex items-center gap-1 justify-center">
                  <Users size={16} className="opacity-50" /> {focus.employeeCount}
                </div>
              </div>
              <RiskIndicator level={risk} />
            </div>
          </div>
        </header>

        {/* Middle — peer cards, fixed height, no page scroll */}
        <div className="flex-1 min-h-0 overflow-hidden px-5 py-4">
          <div
            key={animKey}
            className={`h-full flex flex-col transition-all duration-300 ease-out ${
              slideDir === "forward" ? "animate-in slide-in-from-right-4 fade-in" : "animate-in slide-in-from-left-4 fade-in"
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
              <h3 className="text-[12px] font-semibold uppercase tracking-widest opacity-50">
                {viewingCluster ? clusterLabel : cohortTitle}
              </h3>
              {!viewingCluster && children.length > 0 && (
                <span className="text-[12px] opacity-50">{children.length} direct reports</span>
              )}
              {viewingCluster && (
                <span className="text-[12px] opacity-50">{clusterMembers!.length} members</span>
              )}
            </div>

            {cluster && !viewingCluster ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 content-start">
                {tiles.map((peer) => (
                  <FocusCard
                    key={peer.id}
                    node={peer}
                    onOpen={() => drillInto(peer)}
                    compareChecked={compareIds.has(peer.id)}
                    onCompareToggle={() => onToggleCompare(peer)}
                  />
                ))}
                <FocusCard
                  clusterLabel={cluster.label}
                  memberCount={cluster.members.length}
                  onOpen={openCluster}
                />
              </div>
            ) : displayNodes.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 content-start auto-rows-fr">
                  {pageNodes.map((peer) => (
                    <FocusCard
                      key={peer.id}
                      node={peer}
                      onOpen={() => drillInto(peer)}
                      compareChecked={compareIds.has(peer.id)}
                      onCompareToggle={() => onToggleCompare(peer)}
                    />
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3 mt-3 shrink-0">
                    <button
                      type="button"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                      className="text-[12px] px-3 py-1.5 rounded-lg border disabled:opacity-30"
                      style={{ borderColor: "var(--line)" }}
                    >
                      Previous
                    </button>
                    <span className="text-[12px] opacity-50 tabular-nums">
                      {page + 1} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                      className="text-[12px] px-3 py-1.5 rounded-lg border disabled:opacity-30"
                      style={{ borderColor: "var(--line)" }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div
                className="flex-1 flex items-center justify-center rounded-xl border text-[14px] opacity-55"
                style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}
              >
                No further reporting levels at this node.
              </div>
            )}
          </div>
        </div>

        <FocusAnalyticsStrip node={focus} />
      </div>
    </div>
  );
}
