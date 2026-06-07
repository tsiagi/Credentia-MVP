"use client";

import { ChevronDown, ChevronUp, Users } from "lucide-react";
import type { OrgIntelNode } from "./types";
import { COHORT_CLUSTER_THRESHOLD } from "./types";
import { DepartmentTile } from "./DepartmentTile";
import { avgMetric } from "@/lib/executive-org-data";

export type ClusterGroup = {
  id: string;
  label: string;
  members: OrgIntelNode[];
};

export function buildCohortDisplay(children: OrgIntelNode[]): { tiles: OrgIntelNode[]; cluster: ClusterGroup | null } {
  const homogeneous =
    children.length > 0 &&
    children.every((c) => c.level === "contributor") &&
    children.length > COHORT_CLUSTER_THRESHOLD;

  if (homogeneous) {
    const role = children[0]?.role ?? "Contributors";
    return {
      tiles: [],
      cluster: {
        id: `cluster-${children[0].parentId}`,
        label: `${role}s (${children.length})`,
        members: children,
      },
    };
  }

  return { tiles: children, cluster: null };
}

function ClusterTile({
  cluster,
  expanded,
  onToggle,
  selectedId,
  onSelectMember,
}: {
  cluster: ClusterGroup;
  expanded: boolean;
  onToggle: () => void;
  selectedId: string | null;
  onSelectMember: (node: OrgIntelNode) => void;
}) {
  const avgHealth = Math.round(
    cluster.members.reduce((s, m) => s + m.healthScore, 0) / cluster.members.length,
  );

  return (
    <div className="col-span-full space-y-4">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left rounded-2xl border p-5 sm:p-6 transition-all hover:shadow-md"
        style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-50">Aggregated cohort</div>
            <div className="text-xl font-semibold serif mt-1">{cluster.label}</div>
            <div className="text-[13px] opacity-60 mt-1 flex items-center gap-1.5">
              <Users size={14} /> {cluster.members.length} peers · avg health {avgHealth}
            </div>
          </div>
          <span className="shrink-0 p-2 rounded-lg" style={{ background: "var(--surface)" }}>
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </span>
        </div>
        <p className="text-[12px] opacity-55 mt-3">
          {expanded ? "Collapse cohort" : "Expand to compare all members side-by-side"}
        </p>
      </button>

      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pl-2 border-l-2" style={{ borderColor: "var(--accent)" }}>
          {cluster.members.map((m) => (
            <DepartmentTile
              key={m.id}
              node={m}
              selected={selectedId === m.id}
              onClick={() => onSelectMember(m)}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CohortGrid({
  label,
  peers,
  selectedId,
  onSelectPeer,
  expandedClusters,
  onToggleCluster,
}: {
  label?: string;
  peers: OrgIntelNode[];
  selectedId: string | null;
  onSelectPeer: (node: OrgIntelNode) => void;
  expandedClusters: Set<string>;
  onToggleCluster: (clusterId: string) => void;
}) {
  const { tiles, cluster } = buildCohortDisplay(peers);

  if (!peers.length) return null;

  const cohortTitle = label || (peers[0] ? `${peers[0].role} cohort` : "Direct reports");

  return (
    <section
      className="mt-6 pt-6 border-t transition-all duration-300 ease-out"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-4">
        <div>
          <h3 className="text-[12px] font-semibold uppercase tracking-widest opacity-50">{cohortTitle}</h3>
          <p className="text-[13px] opacity-60 mt-0.5">
            {peers.length} direct reports · compare peers side-by-side
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] opacity-55 tabular-nums">
          <span>Avg health <strong className="opacity-100">{Math.round(peers.reduce((s, p) => s + p.healthScore, 0) / peers.length)}</strong></span>
          <span>Avg prod <strong className="opacity-100">{Math.round(avgMetric(peers, "productivity") * 100)}%</strong></span>
          <span>Avg morale <strong className="opacity-100">{Math.round(avgMetric(peers, "morale") * 100)}%</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
        {cluster ? (
          <ClusterTile
            cluster={cluster}
            expanded={expandedClusters.has(cluster.id)}
            onToggle={() => onToggleCluster(cluster.id)}
            selectedId={selectedId}
            onSelectMember={onSelectPeer}
          />
        ) : (
          tiles.map((peer) => (
            <DepartmentTile
              key={peer.id}
              node={peer}
              selected={selectedId === peer.id}
              onClick={() => onSelectPeer(peer)}
            />
          ))
        )}
      </div>
    </section>
  );
}
