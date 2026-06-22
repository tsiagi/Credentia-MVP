"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Target, GitBranch, Minimize2, Maximize2, Minus, Plus, Compass, Info, Sparkles, ShieldCheck, ChevronRight } from "lucide-react";
import type { OrgIntelNode } from "./types";
import { METRIC_LABELS } from "./types";
import { getRiskLevel, getNodeMetric } from "@/lib/executive-org-data";
import { MindMapNode, MIND_METRICS, nodeMeta, pct } from "./MindMapNode";
import type { MindTier } from "./MindMapNode";

/* ─────────────────────────────────────────────────────────────────────────
   OrgMindMap — node-based org mind-map for the Executive command center's
   "Org health" view. Replaces the tile drill-down with a pannable, zoomable
   canvas driven entirely by the existing OrgIntelNode tree.

   · Overview: company hub at the centre, departments branching out (radial)
     or descending (tree). Switch layouts with the segmented control.
   · Click a department → camera pans + scales in, the node morphs into a
     detail card, and its teams branch out as direct reports.
   · Click a team → camera zooms further; the team node opens its detail.
   · "Overview" + breadcrumb return to the macro view; +/− nudge zoom.
   · "Print view" (on the focused detail card) prints just the current node
     and its direct reports on a clean white page via a body-level portal.

   The camera is a single transformed layer; SVG connectors and HTML nodes
   live in a fixed 1800×1200 world inside it. Overlays sit outside the camera
   so they never scale.
   ───────────────────────────────────────────────────────────────────────── */

const WORLD_W = 1800;
const WORLD_H = 1200;
const RING_R = 380; // radial: company → department radius
const BRANCH_DX = 470; // focus: horizontal offset from a dept card to its team column
const BRANCH_GAP = 172; // focus: vertical spacing between team cards in the column

type Pos = { x: number; y: number };
type LayoutMode = "radial" | "tree";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function OrgMindMap({
  root,
  compareIds,
  onToggleCompare,
}: {
  root: OrgIntelNode;
  compareIds: Set<string>;
  onToggleCompare: (node: OrgIntelNode) => void;
}) {
  const departments = useMemo(() => root.children ?? [], [root]);

  // tier lookup + flat node list (company, departments, teams)
  const { allNodes, tierOf, parentDeptOf, findNode } = useMemo(() => {
    const tierMap = new Map<string, MindTier>();
    const parentDept = new Map<string, OrgIntelNode>();
    const byId = new Map<string, OrgIntelNode>();
    const list: OrgIntelNode[] = [root];
    tierMap.set(root.id, 0);
    byId.set(root.id, root);
    for (const d of departments) {
      tierMap.set(d.id, 1);
      byId.set(d.id, d);
      list.push(d);
      for (const t of d.children ?? []) {
        tierMap.set(t.id, 2);
        byId.set(t.id, t);
        parentDept.set(t.id, d);
        list.push(t);
      }
    }
    return {
      allNodes: list,
      tierOf: (n: OrgIntelNode) => tierMap.get(n.id) ?? 2,
      parentDeptOf: (n: OrgIntelNode) => parentDept.get(n.id) ?? null,
      findNode: (id: string) => byId.get(id) ?? null,
    };
  }, [root, departments]);

  const [layout, setLayout] = useState<LayoutMode>("radial");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [userZoom, setUserZoom] = useState(1);
  const [printing, setPrinting] = useState(false);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  // focusing a node or switching layout resets the user's manual zoom nudge
  const focusOn = (id: string | null) => {
    setFocusId(id);
    setUserZoom(1);
  };
  const changeLayout = (m: LayoutMode) => {
    setLayout(m);
    setUserZoom(1);
  };

  // measure viewport (ignore transient zero-size measurements)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setDims((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const focusNode = focusId ? findNode(focusId) : null;

  // ── layout: world coordinates for every node ────────────────────────
  const pos = useMemo(() => {
    const p: Record<string, Pos> = {};
    const placeTeams = (d: OrgIntelNode) => {
      const dp = p[d.id];
      const teams = d.children ?? [];
      const n = teams.length;
      teams.forEach((t, i) => {
        p[t.id] = { x: dp.x + BRANCH_DX, y: dp.y + (i - (n - 1) / 2) * BRANCH_GAP };
      });
    };
    if (layout === "tree") {
      p[root.id] = { x: WORLD_W / 2, y: 190 };
      const x0 = 250;
      const x1 = WORLD_W - 250;
      const step = departments.length > 1 ? (x1 - x0) / (departments.length - 1) : 0;
      departments.forEach((d, i) => {
        p[d.id] = { x: x0 + i * step, y: 500 };
      });
      departments.forEach(placeTeams);
    } else {
      const cx = WORLD_W / 2;
      const cy = WORLD_H / 2;
      p[root.id] = { x: cx, y: cy };
      departments.forEach((d, i) => {
        const a = -Math.PI / 2 + i * ((Math.PI * 2) / departments.length);
        p[d.id] = { x: cx + RING_R * Math.cos(a), y: cy + RING_R * Math.sin(a) };
      });
      departments.forEach(placeTeams);
    }
    return p;
  }, [layout, root, departments]);

  // ── camera target ───────────────────────────────────────────────────
  const vw = dims.w || 1000;
  const vh = dims.h || 600;
  const target = (() => {
    if (!focusNode) {
      if (layout === "tree") return { cx: WORLD_W / 2, cy: 360, s: clamp(vw / 1720, 0.4, 0.92) };
      return { cx: WORLD_W / 2, cy: WORLD_H / 2, s: clamp(Math.min(vw, vh) / 1120, 0.46, 1) };
    }
    if (tierOf(focusNode) === 1) {
      const d = pos[focusNode.id];
      const n = focusNode.children?.length ?? 0;
      const colH = (n - 1) * BRANCH_GAP;
      const s = clamp(Math.min(vw / 820, vh / (colH + 320)), 0.52, 1.05);
      return { cx: d.x + 215, cy: d.y, s };
    }
    const t = pos[focusNode.id];
    return { cx: t.x, cy: t.y, s: clamp(vh / 560, 0.6, 1.05) };
  })();

  const scale = clamp(target.s * userZoom, 0.3, 3);
  const tx = vw / 2 - target.cx * scale;
  const ty = vh / 2 - target.cy * scale;

  // ── breadcrumb trail ────────────────────────────────────────────────
  const trail: { id: string; name: string }[] = (() => {
    const t = [{ id: root.id, name: nodeMeta(root, 0).title }];
    if (!focusNode) return t;
    if (tierOf(focusNode) === 1) {
      t.push({ id: focusNode.id, name: nodeMeta(focusNode, 1).title });
      return t;
    }
    const dept = parentDeptOf(focusNode);
    if (dept) t.push({ id: dept.id, name: nodeMeta(dept, 1).title });
    t.push({ id: focusNode.id, name: nodeMeta(focusNode, 2).title });
    return t;
  })();

  // ── per-node visibility / mode given the current focus ──────────────
  function nodeVis(node: OrgIntelNode): { show: boolean; dim?: number; mode?: "company" | "compact" | "expanded" } {
    const tier = tierOf(node);
    if (!focusNode) {
      if (tier === 0) return { show: true, dim: 1, mode: "company" };
      if (tier === 1) return { show: true, dim: 1, mode: "compact" };
      return { show: false };
    }
    const fTier = tierOf(focusNode);
    if (fTier === 1) {
      if (node.id === focusNode.id) return { show: true, dim: 1, mode: "expanded" };
      if (tier === 0) return { show: true, dim: 0.42, mode: "company" };
      if (tier === 1) return { show: true, dim: 0.2, mode: "compact" };
      return parentDeptOf(node)?.id === focusNode.id ? { show: true, dim: 1, mode: "compact" } : { show: false };
    }
    // focus is a team
    const parent = parentDeptOf(focusNode);
    if (node.id === focusNode.id) return { show: true, dim: 1, mode: "expanded" };
    if (parent && node.id === parent.id) return { show: true, dim: 0.5, mode: "compact" };
    if (tier === 2 && parent && parentDeptOf(node)?.id === parent.id) return { show: true, dim: 0.22, mode: "compact" };
    return { show: false };
  }

  // ── connectors ───────────────────────────────────────────────────────
  const spokePath = (p: Pos, c: Pos) => {
    if (layout === "tree") {
      const my = (p.y + c.y) / 2;
      return `M ${p.x} ${p.y} C ${p.x} ${my}, ${c.x} ${my}, ${c.x} ${c.y}`;
    }
    return `M ${p.x} ${p.y} L ${c.x} ${c.y}`;
  };
  const branchPath = (p: Pos, c: Pos) => {
    const mx = (p.x + c.x) / 2;
    return `M ${p.x} ${p.y} C ${mx} ${p.y}, ${mx} ${c.y}, ${c.x} ${c.y}`;
  };

  const connectors: { key: string; d: string; op: number; accent: boolean }[] = [];
  for (const d of departments) {
    const cp = pos[root.id];
    const dp = pos[d.id];
    let op = 0.5;
    let accent = false;
    if (focusNode) {
      if (focusNode.id === d.id) {
        op = 0.85;
        accent = true;
      } else if (tierOf(focusNode) === 2 && parentDeptOf(focusNode)?.id === d.id) {
        op = 0.4;
        accent = true;
      } else {
        op = 0.1;
      }
    }
    connectors.push({ key: `c-${d.id}`, d: spokePath(cp, dp), op, accent });
    for (const t of d.children ?? []) {
      const tp = pos[t.id];
      let top = 0;
      let tac = false;
      if (focusNode && focusNode.id === d.id) {
        top = 0.55;
      } else if (focusNode && tierOf(focusNode) === 2 && parentDeptOf(focusNode)?.id === d.id) {
        top = focusNode.id === t.id ? 0.85 : 0.18;
        tac = focusNode.id === t.id;
      }
      connectors.push({ key: `c-${d.id}-${t.id}`, d: branchPath(dp, tp), op: top, accent: tac });
    }
  }

  // ── print lifecycle ───────────────────────────────────────────────────
  useEffect(() => {
    if (!printing) return;
    document.body.classList.add("mm-printing");
    const t = setTimeout(() => window.print(), 60);
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
      document.body.classList.remove("mm-printing");
    };
  }, [printing]);

  const portal =
    typeof document !== "undefined"
      ? createPortal(<PrintReport node={focusNode} tier={focusNode ? tierOf(focusNode) : 0} />, document.body)
      : null;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <style dangerouslySetInnerHTML={{ __html: MM_CSS }} />

      {/* top bar: breadcrumb + layout toggle */}
      <div data-no-print style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <nav style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            {trail.map((b, i) => (
              <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {i > 0 && <ChevronRight size={13} color="var(--ink-3)" />}
                <button
                  type="button"
                  onClick={() => focusOn(i === 0 ? null : trail[i].id)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    fontWeight: i === trail.length - 1 ? 600 : 500,
                    color: i === trail.length - 1 ? "var(--ink)" : "var(--ink-3)",
                  }}
                >
                  {b.name}
                </button>
              </span>
            ))}
          </nav>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--inferred-fg)", fontWeight: 600 }}>
            <Sparkles size={13} /> AI inference · decision support
          </span>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: 4,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--line)",
            background: "var(--surface)",
          }}
        >
          {([
            { id: "radial", label: "Radial", Icon: Target },
            { id: "tree", label: "Tree", Icon: GitBranch },
          ] as const).map((o) => {
            const on = layout === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => changeLayout(o.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 13px",
                  borderRadius: "var(--radius-sm)",
                  border: 0,
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  background: on ? "var(--accent)" : "transparent",
                  color: on ? "var(--on-accent)" : "var(--ink-2)",
                  transition: "background var(--duration-fast) var(--ease-out)",
                }}
              >
                <o.Icon size={14} /> {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* the canvas */}
      <div
        ref={viewportRef}
        className="mm-canvas"
        onClick={() => focusOn(null)}
        style={{
          position: "relative",
          height: "clamp(480px, 64vh, 720px)",
          overflow: "hidden",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--line)",
          background:
            "radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--surface) 70%, transparent), transparent 70%), var(--bg)",
          backgroundImage: "radial-gradient(var(--line) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      >
        {/* camera */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: WORLD_W,
            height: WORLD_H,
            transformOrigin: "0 0",
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transition: "transform 0.66s cubic-bezier(0.22, 0.61, 0.36, 1)",
            willChange: "transform",
          }}
        >
          {/* connectors */}
          <svg width={WORLD_W} height={WORLD_H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }} aria-hidden>
            {connectors.map((c) => (
              <path
                key={c.key}
                d={c.d}
                fill="none"
                vectorEffect="non-scaling-stroke"
                stroke={c.accent ? "var(--accent)" : "var(--line-strong)"}
                strokeWidth={c.accent ? 2.2 : 1.4}
                strokeLinecap="round"
                style={{ opacity: c.op, transition: "opacity 0.5s var(--ease-out), stroke 0.4s var(--ease-out)" }}
              />
            ))}
          </svg>

          {/* nodes */}
          {allNodes.map((node) => {
            const vis = nodeVis(node);
            const p = pos[node.id];
            if (!vis.show || !p) {
              return p ? (
                <div
                  key={node.id}
                  style={{
                    position: "absolute",
                    left: p.x,
                    top: p.y,
                    transform: "translate(-50%, -50%) scale(0.6)",
                    opacity: 0,
                    pointerEvents: "none",
                    transition: "opacity 0.5s var(--ease-out), transform 0.6s var(--ease-out)",
                  }}
                />
              ) : null;
            }
            const deemph = (vis.dim ?? 1) < 1 ? 0.92 : 1;
            const isExpanded = vis.mode === "expanded";
            return (
              <div
                key={node.id}
                style={{
                  position: "absolute",
                  left: p.x,
                  top: p.y,
                  transform: `translate(-50%, -50%) scale(${deemph})`,
                  opacity: vis.dim,
                  zIndex: isExpanded ? 5 : (vis.dim ?? 1) < 1 ? 1 : 2,
                  pointerEvents: "auto",
                  transition: "opacity 0.5s var(--ease-out), transform 0.6s cubic-bezier(0.22,0.61,0.36,1)",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isExpanded) focusOn(node.id);
                }}
              >
                <MindMapNode
                  node={node}
                  tier={tierOf(node)}
                  mode={vis.mode!}
                  onClick={() => focusOn(node.id)}
                  childCount={node.children?.length ?? 0}
                  compareChecked={compareIds.has(node.id)}
                  onCompareToggle={() => onToggleCompare(node)}
                  onPrint={() => setPrinting(true)}
                />
              </div>
            );
          })}
        </div>

        {/* overlay: back + zoom */}
        <div data-no-print style={{ position: "absolute", top: 14, right: 14, display: "flex", alignItems: "center", gap: 8 }}>
          {focusNode && (
            <MapButton
              icon={<Minimize2 size={15} />}
              onClick={(e) => {
                e.stopPropagation();
                focusOn(null);
              }}
              title="Back to overview"
            >
              Overview
            </MapButton>
          )}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 4, borderRadius: "var(--radius-md)", border: "1px solid var(--line)", background: "var(--surface)" }}
          >
            <MapButton icon={<Minus size={15} />} onClick={() => setUserZoom((z) => clamp(z * 0.82, 0.5, 2.4))} title="Zoom out" />
            <MapButton icon={<Maximize2 size={15} />} onClick={() => setUserZoom(1)} title="Reset zoom" />
            <MapButton icon={<Plus size={15} />} onClick={() => setUserZoom((z) => clamp(z * 1.22, 0.5, 2.4))} title="Zoom in" />
          </div>
        </div>

        {/* overlay: hint */}
        <div
          data-no-print
          style={{
            position: "absolute",
            left: 16,
            bottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 11.5,
            color: "var(--ink-3)",
            background: "color-mix(in srgb, var(--surface) 80%, transparent)",
            backdropFilter: "blur(6px)",
            padding: "6px 11px",
            borderRadius: "var(--radius-pill)",
            border: "1px solid var(--line)",
          }}
        >
          <Compass size={13} color="var(--accent)" />
          {focusNode ? "Click a branching node to dive deeper · click empty space to zoom out" : "Click a department to zoom in and reveal its teams"}
        </div>
      </div>

      {/* legend / framing line */}
      <div data-no-print style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--ink-3)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--verified-fg)" }} /> Healthy
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--warn-fg)" }} /> Needs attention
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--danger-fg)" }} /> High risk
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Info size={13} /> Scores are AI inferences · internal only, never on a verified passport
        </span>
      </div>

      {portal}
    </div>
  );
}

/* ── overlay control button ───────────────────────────────────────────── */
function MapButton({
  icon,
  children,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  children?: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: children ? "7px 12px" : 8,
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        fontSize: 12.5,
        fontWeight: 600,
        border: "1px solid var(--line)",
        background: hover ? "var(--surface-2)" : "var(--surface)",
        color: "var(--ink-2)",
        transition: "background var(--duration-fast) var(--ease-out)",
      }}
    >
      {icon}
      {children}
    </button>
  );
}

/* ── print report (rendered into a body-level portal) ─────────────────── */
function PrintReport({ node, tier }: { node: OrgIntelNode | null; tier: MindTier }) {
  if (!node) return null;
  const risk = getRiskLevel(node);
  const riskLabel = risk === "healthy" ? "Healthy" : risk === "attention" ? "Needs attention" : "High risk";
  const reports = node.children ?? [];
  const meta = nodeMeta(node, tier);
  return (
    <div className="mm-print-portal" aria-hidden>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "8mm 4mm", color: "#1b212b", fontFamily: "var(--font-sans)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#5C7290", fontWeight: 700 }}>
          <ShieldCheck size={14} color="#5C7290" /> Core-Roborate · Executive command center
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, borderBottom: "2px solid #232A37", paddingBottom: 12, marginTop: 6 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280" }}>{meta.eyebrow}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.05, marginTop: 3 }}>{meta.title}</div>
            <div style={{ fontSize: 13.5, color: "#374151", marginTop: 4 }}>{meta.lead}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, minWidth: 150 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 600, color: "#5C7290", lineHeight: 1 }}>{node.healthScore}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>composite health · {riskLabel}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{node.employeeCount.toLocaleString()} people</div>
          </div>
        </div>

        {/* metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 16 }}>
          {MIND_METRICS.map((m) => (
            <div key={m} style={{ border: "1px solid #d6dbe6", borderRadius: 8, padding: "9px 11px" }}>
              <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>{METRIC_LABELS[m]}</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{pct(getNodeMetric(node, m))}</div>
            </div>
          ))}
        </div>

        {/* alerts / recs */}
        {(node.alerts.length > 0 || node.recommendations.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: node.alerts.length && node.recommendations.length ? "1fr 1fr" : "1fr", gap: 18, marginTop: 18 }}>
            {node.alerts.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#A5731F", marginBottom: 6 }}>Flags</div>
                {node.alerts.map((a) => (
                  <div key={a} style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 4, color: "#374151" }}>
                    • {a}
                  </div>
                ))}
              </div>
            )}
            {node.recommendations.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6F4554", marginBottom: 6 }}>
                  Recommended · you decide (AI inference)
                </div>
                {node.recommendations.map((r) => (
                  <div key={r} style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 4, color: "#374151" }}>
                    • {r}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* direct reports table */}
        {reports.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Direct reports · {reports.length} teams</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#6b7280", borderBottom: "1px solid #232A37" }}>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Team</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Lead</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>People</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Health</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Retention risk</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((t) => {
                  const r = getRiskLevel(t);
                  return (
                    <tr key={t.id} style={{ borderBottom: "1px solid #e1e5ee" }}>
                      <td style={{ padding: "7px 8px", fontWeight: 600 }}>{t.name}</td>
                      <td style={{ padding: "7px 8px", color: "#374151" }}>{t.role}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.employeeCount}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "#5C7290" }}>{t.healthScore}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct(t.retentionRisk)}</td>
                      <td style={{ padding: "7px 8px", color: r === "high" ? "#9a3324" : r === "attention" ? "#A5731F" : "#586340", fontWeight: 600 }}>
                        {r === "healthy" ? "Healthy" : r === "attention" ? "Watch" : "High risk"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 22, paddingTop: 10, borderTop: "1px solid #d6dbe6", fontSize: 10.5, color: "#6b7280", lineHeight: 1.5 }}>
          Health, risk and readiness figures are <strong>AI inferences</strong> computed from verified inputs — internal decision support only,
          never written to an employee&apos;s verified passport, never applied automatically. Generated from the Core-Roborate executive command center.
        </div>
      </div>
    </div>
  );
}

const MM_CSS = `
@keyframes mmRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.mm-print-portal { display: none; }
@media (prefers-reduced-motion: reduce) {
  .mm-canvas [style*="transition"] { transition: none !important; }
}
@media print {
  body.mm-printing > *:not(.mm-print-portal) { display: none !important; }
  body.mm-printing .mm-print-portal { display: block !important; position: static !important; background: #fff !important; }
  .mm-print-portal { background: #fff; }
}
`;
