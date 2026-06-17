"use client";
// components/EmployerSide.tsx
// ─────────────────────────────────────────────────────────────
// WORKFORCE VERIFY — Employer side: Verification Center + KPI System
// Drop this file into /components and render <EmployerSide role={...} />
// from your manager/employee dashboards.
//
// Trust model preserved:
//  • 5 verification levels shown as badges everywhere
//  • approve / reject / request-clarification on every item
//  • AI coaching insights are advisory, labeled, and carry evidence
// Mock data is inline; the Cursor prompts at the bottom wire it to Supabase.
//
// Presentation is a bento-grid redesign with staggered entrance
// animations, count-up metrics, growing progress bars, and progressive
// disclosure. All data/state/handlers are unchanged from the original.
// ─────────────────────────────────────────────────────────────
import React, { useState } from "react";
import {
  BadgeCheck, ShieldCheck, Target, FolderGit2, Award, GraduationCap,
  TrendingUp, Lightbulb, Crown, Check, X, MessageSquareWarning,
  Sparkles, Info, ChevronRight, ChevronLeft, ChevronDown, Plus,
  Clock, Layers, Gauge,
} from "lucide-react";
import { AnimatedNumber, GrowBar, Reveal } from "@/components/ui/motion";

// ── verification levels (the spec's 5 tiers) ──────────────────
const LEVELS = [
  { n: 1, label: "Self Reported",       fg: "#6b7280", bg: "#6b72801a" },
  { n: 2, label: "Manager Verified",    fg: "#1f4ed8", bg: "#1f4ed81a" },
  { n: 3, label: "HR Verified",         fg: "#7c3aed", bg: "#7c3aed1a" },
  { n: 4, label: "Company Verified",    fg: "var(--verified-fg)", bg: "var(--verified-bg)" },
  { n: 5, label: "Multi-Source Verified", fg: "#b45309", bg: "#b453091a" },
];
function LevelBadge({ level }: { level: number }) {
  const l = LEVELS.find((x) => x.n === level) || LEVELS[0];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: l.bg, color: l.fg }}>
      <BadgeCheck size={12} /> L{l.n} · {l.label}
    </span>
  );
}

const KIND_ICON: Record<string, any> = {
  kpi: Target, project: FolderGit2, certification: GraduationCap,
  promotion: TrendingUp, award: Award, process_improvement: Lightbulb, leadership: Crown,
};

const card = "rounded-2xl border";
const cardStyle = { borderColor: "var(--line)", background: "var(--surface)" } as React.CSSProperties;

// ════════════════ DISPLAY PRIMITIVES (presentation only) ════════════════
// Motion primitives (useCountUp / AnimatedNumber / Reveal / GrowBar) live in
// components/ui/motion.tsx and are shared with the live ManagerView.

/** Compact stat tile for the bento header strip. */
function StatTile({
  icon: Icon, label, value, decimals = 0, prefix = "", suffix = "", tone = "ink", delay = 0,
}: {
  icon: any; label: string; value: number; decimals?: number;
  prefix?: string; suffix?: string; tone?: "ink" | "accent" | "verified" | "inferred" | "warn"; delay?: number;
}) {
  const toneMap: Record<string, { fg: string; bg: string }> = {
    ink:      { fg: "var(--ink)", bg: "var(--surface-2)" },
    accent:   { fg: "var(--accent)", bg: "var(--accent-soft)" },
    verified: { fg: "var(--verified-fg)", bg: "var(--verified-bg)" },
    inferred: { fg: "var(--inferred-fg)", bg: "var(--inferred-bg)" },
    warn:     { fg: "var(--warn)", bg: "var(--warn-bg)" },
  };
  const t = toneMap[tone];
  return (
    <Reveal delay={delay} className={`${card} cairn-lift cairn-icon-host`}
      style={{ ...cardStyle, padding: 18 }}>
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-xl shrink-0" style={{ background: t.bg }}>
          <Icon size={18} className="cairn-icon" style={{ color: t.fg }} />
        </div>
        <div className="text-[12px] uppercase tracking-widest opacity-60">{label}</div>
      </div>
      <div className="mt-3 text-[30px] leading-none font-semibold" style={{ color: t.fg }}>
        <AnimatedNumber value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
      </div>
    </Reveal>
  );
}

// ════════════════ VERIFICATION CENTER (manager) ════════════════
function VerificationCenter() {
  const [items, setItems] = useState([
    { id: "1", kind: "project", title: "Global equity migration", who: "A. Rivera",
      desc: "Migrated 12-country equity plan to new platform.", impact: "$240k saved", level: 1, status: "pending" },
    { id: "2", kind: "kpi", title: "Reconciliation accuracy 99.8%", who: "J. Okafor",
      desc: "Exceeded target of 98% across Q1.", impact: "Exceeded by 1.8pts", level: 1, status: "pending" },
    { id: "3", kind: "certification", title: "Shareworks Master Cert", who: "M. Chen",
      desc: "Completed advanced certification.", impact: "New competency", level: 2, status: "approved" },
  ]);
  // progressive disclosure: which queue item is expanded
  const [expanded, setExpanded] = useState<string | null>(null);
  // collapsible legend
  const [legendOpen, setLegendOpen] = useState(false);

  function act(id: string, action: "approve" | "reject" | "clarify") {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      if (action === "approve") return { ...it, status: "approved", level: Math.max(it.level, 2) };
      if (action === "reject") return { ...it, status: "rejected" };
      return { ...it, status: "clarify" };
    }));
    // → Cursor: also INSERT an audit_trail row here (see prompts at bottom)
  }

  const pending = items.filter((i) => i.status === "pending");
  const approved = items.filter((i) => i.status === "approved");
  const avgLevel = items.length
    ? items.reduce((s, i) => s + i.level, 0) / items.length
    : 0;

  return (
    <div className="space-y-6">
      {/* ── bento header: live metrics derived from items state ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={Clock} label="Pending" value={pending.length} tone="warn" delay={0} />
        <StatTile icon={Check} label="Approved" value={approved.length} tone="verified" delay={70} />
        <StatTile icon={Layers} label="In queue" value={items.length} tone="accent" delay={140} />
        <StatTile icon={Gauge} label="Avg level" value={avgLevel} decimals={1} prefix="L" tone="inferred" delay={210} />
      </div>

      {/* ── verification queue ── */}
      <Reveal delay={260} className={card} style={{ ...cardStyle, padding: 24 }}>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={18} style={{ color: "var(--accent)" }} />
          <h3 className="font-semibold">Verification Center</h3>
          <span className="ml-auto text-[13px] px-2.5 py-1 rounded-full"
            style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
            {pending.length} pending
          </span>
        </div>
        <p className="text-[13px] opacity-60 mb-4">
          Each approval creates a permanent verification record and raises the item&apos;s verification level.
          <span className="opacity-80"> Tap a card to see the detail.</span>
        </p>

        <div className="space-y-3">
          {items.map((it, idx) => {
            const Icon = KIND_ICON[it.kind] || Target;
            const done = it.status !== "pending";
            const isOpen = expanded === it.id;
            return (
              <Reveal key={it.id} delay={300 + idx * 70}>
                <div className={`rounded-xl border cairn-lift cairn-icon-host overflow-hidden`}
                  style={{ borderColor: isOpen ? "var(--accent-line)" : "var(--line)",
                    background: it.status === "rejected" ? "var(--warn-bg)" : "var(--surface-2)" }}>
                  {/* clickable summary row — progressive disclosure */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : it.id)}
                    className="w-full text-left p-4 flex items-start gap-3">
                    <div className="p-2 rounded-lg shrink-0" style={{ background: "var(--accent-soft)" }}>
                      <Icon size={18} className="cairn-icon" style={{ color: "var(--accent)" }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{it.title}</span>
                        <LevelBadge level={it.level} />
                        {done && (
                          <span className="text-[11px] font-medium capitalize px-2 py-0.5 rounded-full" style={{
                            background: it.status === "approved" ? "var(--verified-bg)"
                              : it.status === "rejected" ? "var(--warn-bg)" : "var(--surface)",
                            color: it.status === "approved" ? "var(--verified-fg)"
                              : it.status === "rejected" ? "var(--warn)" : "var(--ink-2)" }}>
                            {it.status === "clarify" ? "clarification requested" : it.status}
                          </span>
                        )}
                      </div>
                      <div className="text-[13px] opacity-70 mt-0.5">{it.who} · {it.impact}</div>
                    </div>
                    <ChevronDown size={18} className="shrink-0 mt-1 transition-transform"
                      style={{ color: "var(--ink-3)", transform: isOpen ? "rotate(180deg)" : "none" }} />
                  </button>

                  {/* expandable detail + actions */}
                  <div className="grid transition-all duration-300"
                    style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
                    <div className="overflow-hidden">
                      <div className="px-4 pb-4 pl-[68px]">
                        <div className="text-[13px] opacity-70">{it.desc}</div>
                        {!done ? (
                          <div className="flex gap-2 mt-3 flex-wrap">
                            <button onClick={() => act(it.id, "approve")}
                              className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-white inline-flex items-center gap-1 transition active:scale-[0.98]"
                              style={{ background: "var(--verified-fg)" }}>
                              <Check size={14} /> Approve
                            </button>
                            <button onClick={() => act(it.id, "clarify")}
                              className="px-3 py-1.5 rounded-lg text-[13px] font-medium inline-flex items-center gap-1 border transition active:scale-[0.98] hover:bg-[var(--surface)]"
                              style={{ borderColor: "var(--line)", color: "var(--ink)" }}>
                              <MessageSquareWarning size={14} /> Request clarification
                            </button>
                            <button onClick={() => act(it.id, "reject")}
                              className="px-3 py-1.5 rounded-lg text-[13px] font-medium inline-flex items-center gap-1 border transition active:scale-[0.98] hover:bg-[var(--warn-bg)]"
                              style={{ borderColor: "var(--line)", color: "var(--warn)" }}>
                              <X size={14} /> Reject
                            </button>
                          </div>
                        ) : (
                          <div className="mt-2 text-[12px] font-medium capitalize" style={{
                            color: it.status === "approved" ? "var(--verified-fg)"
                              : it.status === "rejected" ? "var(--warn)" : "var(--ink-2)" }}>
                            {it.status === "clarify" ? "Clarification requested" : it.status}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Reveal>

      {/* legend — collapsed by default (progressive disclosure) */}
      <Reveal delay={520} className={card} style={{ ...cardStyle, padding: 20 }}>
        <button onClick={() => setLegendOpen((v) => !v)}
          className="w-full flex items-center gap-2 text-[12px] uppercase tracking-widest opacity-60">
          <ChevronRight size={14} className="transition-transform"
            style={{ transform: legendOpen ? "rotate(90deg)" : "none" }} />
          Verification levels
        </button>
        <div className="grid transition-all duration-300"
          style={{ gridTemplateRows: legendOpen ? "1fr" : "0fr" }}>
          <div className="overflow-hidden">
            <div className="flex flex-wrap gap-2 pt-3">
              {LEVELS.map((l) => <LevelBadge key={l.n} level={l.n} />)}
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

// ════════════════ AI COACHING INSIGHTS (advisory) ════════════════
function CoachingInsights() {
  const insights = [
    { kind: "promotion_ready", label: "Promotion ready", who: "M. Chen",
      evidence: "3 L4-verified projects, KPI attainment 112%, peer kudos trending up over 2 quarters." },
    { kind: "overworked", label: "Appears overworked", who: "J. Okafor",
      evidence: "Workload sentiment down, 4 concurrent projects, after-hours activity elevated 3 weeks running." },
  ];
  // interactive carousel index
  const [idx, setIdx] = useState(0);
  const go = (n: number) => setIdx((prev) => (prev + n + insights.length) % insights.length);

  return (
    <Reveal className={`${card} cairn-pulse`} style={{ ...cardStyle, padding: 24, background: "var(--inferred-bg)" }}>
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={18} style={{ color: "var(--inferred-fg)" }} />
        <h3 className="font-semibold">AI Coaching Insights</h3>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "var(--surface)", color: "var(--inferred-fg)" }}>ADVISORY ONLY</span>
      </div>
      <p className="text-[13px] opacity-70 mb-4">
        Evidence-based guidance. These never make a decision — you do.
      </p>

      {/* swipeable carousel: one insight at a time, secondary data revealed on demand */}
      <div className="relative overflow-hidden rounded-xl">
        <div className="flex transition-transform duration-400 ease-out"
          style={{ transform: `translateX(-${idx * 100}%)` }}>
          {insights.map((i, k) => (
            <div key={k} className="w-full shrink-0">
              <div className="p-4 rounded-xl" style={{ background: "var(--surface)" }}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{i.who}</span>
                  <span className="text-[12px] px-2 py-0.5 rounded-full"
                    style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}>{i.label}</span>
                </div>
                <div className="text-[13px] opacity-70 mt-1.5 flex items-start gap-1.5">
                  <Info size={14} className="mt-0.5 shrink-0" style={{ color: "var(--inferred-fg)" }} />
                  <span>{i.evidence}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* carousel controls */}
      <div className="flex items-center gap-3 mt-4">
        <button onClick={() => go(-1)} aria-label="Previous insight"
          className="p-1.5 rounded-lg border transition active:scale-[0.95] hover:bg-[var(--surface)]"
          style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}>
          <ChevronLeft size={16} />
        </button>
        <div className="flex gap-1.5">
          {insights.map((_, k) => (
            <button key={k} onClick={() => setIdx(k)} aria-label={`Insight ${k + 1}`}
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: k === idx ? 22 : 8,
                background: k === idx ? "var(--inferred-fg)" : "var(--line-strong)",
              }} />
          ))}
        </div>
        <button onClick={() => go(1)} aria-label="Next insight"
          className="p-1.5 rounded-lg border transition active:scale-[0.95] hover:bg-[var(--surface)]"
          style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}>
          <ChevronRight size={16} />
        </button>
        <span className="ml-auto text-[12px] opacity-60 tabular">{idx + 1} / {insights.length}</span>
      </div>
    </Reveal>
  );
}

// ════════════════ KPI SYSTEM (employee) ════════════════
function KpiSystem() {
  const [kpis, setKpis] = useState([
    { id: "k1", title: "Reconciliation accuracy", target: 98, current: 99.8, unit: "%", status: "submitted" },
    { id: "k2", title: "Plan rollouts completed", target: 12, current: 9, unit: "", status: "in_progress" },
    { id: "k3", title: "Cost savings identified", target: 150000, current: 240000, unit: "$", status: "approved" },
  ]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", target: "", unit: "%" });

  function pct(k: any) {
    return Math.min(100, Math.round((k.current / k.target) * 100));
  }
  function addKpi() {
    if (!draft.title || !draft.target) return;
    setKpis([...kpis, { id: "k" + Date.now(), title: draft.title, target: Number(draft.target),
      current: 0, unit: draft.unit, status: "in_progress" }]);
    setDraft({ title: "", target: "", unit: "%" });
    setAdding(false);
  }

  const metCount = kpis.filter((k) => pct(k) >= 100).length;
  const avgAttainment = kpis.length
    ? kpis.reduce((s, k) => s + pct(k), 0) / kpis.length
    : 0;

  return (
    <div className="space-y-6">
      {/* ── bento header: derived KPI metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatTile icon={Target} label="Tracked KPIs" value={kpis.length} tone="accent" delay={0} />
        <StatTile icon={Check} label="Targets met" value={metCount} tone="verified" delay={70} />
        <StatTile icon={Gauge} label="Avg attainment" value={avgAttainment} suffix="%" tone="ink" delay={140} />
      </div>

      <Reveal delay={180} className={card} style={{ ...cardStyle, padding: 24 }}>
        <div className="flex items-center gap-2 mb-4">
          <Target size={18} style={{ color: "var(--accent)" }} />
          <h3 className="font-semibold">My KPIs</h3>
          <button onClick={() => setAdding(!adding)}
            className="ml-auto px-3 py-1.5 rounded-lg text-[13px] font-medium text-white inline-flex items-center gap-1 transition active:scale-[0.98]"
            style={{ background: "var(--accent)" }}>
            <Plus size={14} className="transition-transform" style={{ transform: adding ? "rotate(45deg)" : "none" }} /> Add KPI
          </button>
        </div>

        <div className="grid transition-all duration-300" style={{ gridTemplateRows: adding ? "1fr" : "0fr" }}>
          <div className="overflow-hidden">
            <div className="p-4 rounded-xl border mb-4 flex gap-2 flex-wrap items-end cairn-pop"
              style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
              <input placeholder="KPI title" value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }} />
              <input placeholder="Target" value={draft.target}
                onChange={(e) => setDraft({ ...draft, target: e.target.value })}
                className="w-24 px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }} />
              <button onClick={addKpi} className="px-4 py-2 rounded-lg text-sm font-medium text-white transition active:scale-[0.98]"
                style={{ background: "var(--accent)" }}>Save</button>
            </div>
          </div>
        </div>

        {/* KPI cards as a responsive bento grid */}
        <div className="grid sm:grid-cols-2 gap-4">
          {kpis.map((k, idx) => {
            const met = pct(k) >= 100;
            return (
              <Reveal key={k.id} delay={220 + idx * 80}
                className="rounded-xl border p-4 cairn-lift"
                style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-medium text-[14px]">{k.title}</span>
                  <span className="text-[13px] font-semibold tabular shrink-0" style={{ color: met ? "var(--verified-fg)" : "var(--accent)" }}>
                    <AnimatedNumber value={pct(k)} suffix="%" />
                  </span>
                </div>
                <GrowBar pct={pct(k)} met={met} />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[12px] opacity-60 tabular">
                    {k.unit === "$" ? "$" : ""}{k.current.toLocaleString()}{k.unit !== "$" ? k.unit : ""}
                    {" / "}
                    {k.unit === "$" ? "$" : ""}{k.target.toLocaleString()}{k.unit !== "$" ? k.unit : ""}
                  </span>
                  <span className="text-[12px] capitalize px-2 py-0.5 rounded-full" style={{
                    background: k.status === "approved" ? "var(--verified-bg)" : "var(--surface-2)",
                    color: k.status === "approved" ? "var(--verified-fg)" : "var(--ink-2)" }}>
                    {k.status.replace("_", " ")}
                  </span>
                </div>
                {met && (
                  <div className="mt-2 text-[12px] inline-flex items-center gap-1" style={{ color: "var(--verified-fg)" }}>
                    <Check size={13} /> target met
                  </div>
                )}
              </Reveal>
            );
          })}
        </div>
      </Reveal>
    </div>
  );
}

// ════════════════ EXPORTED SHELL ════════════════
export default function EmployerSide({ role = "manager" }: { role?: string }) {
  const isManager = role === "manager" || role === "executive" || role === "admin";
  const [tab, setTab] = useState(isManager ? "verify" : "kpis");

  const tabs = isManager
    ? [{ id: "verify", label: "Verification Center", icon: ShieldCheck },
       { id: "coaching", label: "AI Coaching", icon: Sparkles },
       { id: "kpis", label: "KPIs", icon: Target }]
    : [{ id: "kpis", label: "My KPIs", icon: Target }];

  return (
    <div className="space-y-6">
      {tabs.length > 1 && (
        <div className="flex gap-1 p-1 rounded-xl w-max" style={{ background: "var(--surface-2)" }}>
          {tabs.map((t) => {
            const TabIcon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5 transition active:scale-[0.98]"
                style={{
                  background: active ? "var(--surface)" : "transparent",
                  color: active ? "var(--accent)" : "var(--ink-2)",
                  boxShadow: active ? "var(--shadow-xs)" : "none",
                }}>
                <TabIcon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* keyed wrapper re-triggers the entrance animation on tab change */}
      <div key={tab} className="cairn-reveal">
        {tab === "verify" && <VerificationCenter />}
        {tab === "coaching" && <CoachingInsights />}
        {tab === "kpis" && <KpiSystem />}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   CURSOR PROMPTS — paste these one at a time when you're ready to
   connect this screen to Supabase. Each is small to save your limit.

   1) "In @components/EmployerSide.tsx, replace the mock `items` state in
       VerificationCenter with a load from the verification_items table
       using @lib/supabase.ts, filtered to the current manager's reports."

   2) "In the act() function, after updating status, INSERT a row into
       audit_trail (actor_id = current user, action, target_table=
       'verification_items', target_id, detail). Beginner-friendly."

   3) "Connect KpiSystem add/save to the kpis table; load existing on mount."

   Keep verification_items and ai inference data in their own tables —
   never store a coaching insight as if it were a verified fact.
   ════════════════════════════════════════════════════════════════ */
