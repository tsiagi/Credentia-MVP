"use client";

import { useState } from "react";
import {
  Building2,
  Users,
  AlertTriangle,
  ChevronRight,
  Lightbulb,
  UserCheck,
  GitBranch,
  Layers,
  Printer,
} from "lucide-react";
import type { MetricKey, OrgIntelNode } from "./types";
import { getRiskLevel, getNodeMetric } from "@/lib/executive-org-data";
import { RiskIndicator } from "./RiskIndicator";
import { MetricBadge } from "./MetricBadge";

/* ─────────────────────────────────────────────────────────────────────────
   MindMapNode — the single visual atom of the executive org mind-map.

   One component, three display modes that morph into one another as the
   camera zooms:
     · "company"  — the central hub (overview)
     · "compact"  — a small department / team node card
     · "expanded" — a focused node opened into a detail card (the manager view)

   Core-Roborate idiom throughout: soft surface, hairline cool border, radius-lg,
   serif numerals, earthen risk tints. Whole card is the click target; the
   compare / print affordances stop propagation.
   ───────────────────────────────────────────────────────────────────────── */

/** 0 = company hub, 1 = department, 2 = team */
export type MindTier = 0 | 1 | 2;
export type MindMode = "company" | "compact" | "expanded";

/** Metrics shown in the expanded detail card's grid. */
export const MIND_METRICS: MetricKey[] = [
  "productivity",
  "morale",
  "retentionRisk",
  "promotionReadiness",
];

const RISK_DOT: Record<string, string> = {
  healthy: "var(--verified-fg)",
  attention: "var(--warn-fg)",
  high: "var(--danger-fg)",
};

const RISK_PILL_BG: Record<string, string> = {
  healthy: "var(--verified-bg)",
  attention: "var(--warn-bg)",
  high: "var(--danger-bg)",
};

const RISK_LABEL: Record<string, string> = {
  healthy: "Healthy",
  attention: "Watch",
  high: "High risk",
};

/** Map a raw OrgIntelNode + its tier to mind-map display strings. The repo's
 *  data carries a person's `name`/`role` and a `department`; the mind-map shows
 *  the org unit as the title and the attesting leader as the sub-line. */
export function nodeMeta(node: OrgIntelNode, tier: MindTier) {
  if (tier === 0) {
    return { eyebrow: "Company-wide", title: node.department, lead: `${node.name} · ${node.role}` };
  }
  if (tier === 1) {
    return { eyebrow: "Department", title: node.department, lead: `${node.name} · ${node.role}` };
  }
  return { eyebrow: `${node.department} · Team`, title: node.name, lead: node.role };
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/* ── sparkline (non-scaling, inline) ──────────────────────────────────── */
export function Sparkline({
  data,
  width = 64,
  height = 24,
}: {
  data: number[];
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * (height - 4) - 2).toFixed(1)}`)
    .join(" ");
  const rising = data[data.length - 1] >= data[0];
  const stroke = rising ? "var(--verified-fg)" : "var(--warn-fg)";
  return (
    <svg width={width} height={height} aria-hidden style={{ overflow: "visible", display: "block" }}>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── compact node (company hub, department, or team) ──────────────────── */
function CompactNode({
  node,
  tier,
  width,
  onClick,
  highlighted,
}: {
  node: OrgIntelNode;
  tier: MindTier;
  width: number;
  onClick: () => void;
  highlighted?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const risk = getRiskLevel(node);
  const meta = nodeMeta(node, tier);
  const isCompany = tier === 0;
  const childCount = node.children?.length ?? 0;
  const alertCount = node.alerts.length;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: "unset",
        boxSizing: "border-box",
        cursor: "pointer",
        width,
        display: "flex",
        flexDirection: "column",
        gap: 9,
        padding: isCompany ? 18 : 14,
        borderRadius: "var(--radius-lg)",
        border: highlighted
          ? "1px solid color-mix(in srgb, var(--warn-fg) 45%, transparent)"
          : `1px solid ${hover ? "var(--accent-line)" : "var(--line)"}`,
        background: "var(--surface)",
        boxShadow: highlighted ? "0 0 0 3px var(--warn-bg)" : hover ? "var(--shadow-md)" : "var(--shadow-sm)",
        transition:
          "box-shadow var(--duration-base) var(--ease-out), border-color var(--duration-fast) var(--ease-out)",
      }}
    >
      {isCompany ? (
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span
            style={{
              width: 38,
              height: 38,
              flexShrink: 0,
              borderRadius: "var(--radius-md)",
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Building2 size={19} color="var(--on-accent)" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div
              className="serif"
              style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.015em", lineHeight: 1.1 }}
            >
              {meta.title}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              {node.employeeCount.toLocaleString()} people · {childCount} departments
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {meta.eyebrow}
          </div>
          <div
            className="serif"
            style={{ fontSize: 16.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1.15 }}
          >
            {meta.title}
          </div>
          <div
            style={{ fontSize: 11.5, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {meta.lead}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span
            className="serif tabular"
            style={{
              fontSize: isCompany ? 34 : 28,
              fontWeight: 600,
              color: "var(--accent)",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {node.healthScore}
          </span>
          <span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>health</span>
        </div>
        <Sparkline data={node.trends.productivity} width={isCompany ? 78 : 60} height={24} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            fontWeight: 600,
            color: RISK_DOT[risk],
            borderRadius: "var(--radius-pill)",
            background: RISK_PILL_BG[risk],
            padding: "2px 8px",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: RISK_DOT[risk] }} />
          {RISK_LABEL[risk]}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--ink-3)" }}>
          <Users size={12} /> {node.employeeCount.toLocaleString()}
        </span>
        {alertCount > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, color: "var(--warn-fg)" }}>
            <AlertTriangle size={11} /> {alertCount}
          </span>
        )}
      </div>

      {!isCompany && childCount > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11.5,
            color: hover ? "var(--accent-text)" : "var(--ink-3)",
            transition: "color var(--duration-fast) var(--ease-out)",
          }}
        >
          Open {childCount} teams <ChevronRight size={13} />
        </div>
      )}
    </button>
  );
}

/* ── expanded detail card (the focused "manager" view) ────────────────── */
function ExpandedNode({
  node,
  tier,
  childCount,
  compareChecked,
  onCompareToggle,
  onPrint,
}: {
  node: OrgIntelNode;
  tier: MindTier;
  childCount: number;
  compareChecked?: boolean;
  onCompareToggle?: () => void;
  onPrint: () => void;
}) {
  const risk = getRiskLevel(node);
  const meta = nodeMeta(node, tier);
  return (
    <div
      style={{
        width: 340,
        boxSizing: "border-box",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--accent-line)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-lg)",
        animation: "mmRise 0.45s var(--ease-out)",
      }}
    >
      {/* header */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)" }}>
          {meta.eyebrow}
        </div>
        <div
          className="serif"
          style={{ fontSize: 23, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.08, marginTop: 2 }}
        >
          {meta.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-3)", marginTop: 3 }}>
          <UserCheck size={13} color="var(--accent)" /> {meta.lead}
        </div>
      </div>

      {/* health + trend + risk */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, paddingBottom: 13, borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
          <span
            className="serif tabular"
            style={{ fontSize: 44, fontWeight: 600, color: "var(--accent)", letterSpacing: "-0.025em", lineHeight: 1 }}
          >
            {node.healthScore}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>health</span>
        </div>
        <div style={{ marginBottom: 3 }}>
          <Sparkline data={node.trends.productivity} width={78} height={28} />
        </div>
        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
          <RiskIndicator level={risk} compact />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--ink-3)" }}>
            <Users size={12} /> {node.employeeCount.toLocaleString()} people
          </span>
        </div>
      </div>

      {/* metric grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
        {MIND_METRICS.map((m) => (
          <MetricBadge key={m} metric={m} value={getNodeMetric(node, m)} compact />
        ))}
      </div>

      {/* alerts / recommendations */}
      {(node.alerts.length > 0 || node.recommendations.length > 0) && (
        <div style={{ display: "grid", gap: 9, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          {node.alerts.length > 0 && (
            <div style={{ display: "grid", gap: 5 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--warn-fg)" }}>
                Flags
              </div>
              {node.alerts.map((a) => (
                <div key={a} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.4 }}>
                  <AlertTriangle size={13} color="var(--warn-fg)" style={{ marginTop: 1, flexShrink: 0 }} /> {a}
                </div>
              ))}
            </div>
          )}
          {node.recommendations.length > 0 && (
            <div style={{ display: "grid", gap: 5 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: "var(--inferred-fg)",
                }}
              >
                Recommended · you decide · AI inference
              </div>
              {node.recommendations.map((r) => (
                <div key={r} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.4 }}>
                  <Lightbulb size={13} color="var(--inferred-fg)" style={{ marginTop: 1, flexShrink: 0 }} /> {r}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* actions */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12, borderTop: "1px solid var(--line)", flexWrap: "wrap" }}
      >
        {childCount > 0 ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)" }}>
            <GitBranch size={13} color="var(--accent)" /> {childCount} direct reports
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--ink-3)" }}>
            <Users size={13} /> Front-line team
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7 }}>
          {onCompareToggle && (
            <button
              type="button"
              onClick={onCompareToggle}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 11px",
                borderRadius: "var(--radius-pill)",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                fontSize: 11.5,
                fontWeight: 600,
                border: `1px solid ${compareChecked ? "var(--accent-line)" : "var(--line)"}`,
                background: compareChecked ? "var(--accent-soft)" : "var(--surface)",
                color: compareChecked ? "var(--accent-text)" : "var(--ink-3)",
              }}
            >
              <Layers size={13} /> {compareChecked ? "Comparing" : "Compare"}
            </button>
          )}
          <button
            type="button"
            onClick={onPrint}
            title="Print this view"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 12px",
              borderRadius: "var(--radius-pill)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              fontSize: 11.5,
              fontWeight: 600,
              border: 0,
              background: "var(--accent)",
              color: "var(--on-accent)",
            }}
          >
            <Printer size={13} /> Print view
          </button>
        </div>
      </div>
    </div>
  );
}

export function MindMapNode(props: {
  node: OrgIntelNode;
  tier: MindTier;
  mode: MindMode;
  onClick: () => void;
  childCount: number;
  compareChecked?: boolean;
  onCompareToggle?: () => void;
  highlighted?: boolean;
  onPrint: () => void;
}) {
  const { node, tier, mode } = props;
  if (mode === "expanded") {
    return (
      <ExpandedNode
        node={node}
        tier={tier}
        childCount={props.childCount}
        compareChecked={props.compareChecked}
        onCompareToggle={props.onCompareToggle}
        onPrint={props.onPrint}
      />
    );
  }
  const width = tier === 0 ? 246 : tier === 1 ? 188 : 172;
  return <CompactNode node={node} tier={tier} width={width} onClick={props.onClick} highlighted={props.highlighted} />;
}
