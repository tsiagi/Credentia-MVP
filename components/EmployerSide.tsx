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
// ─────────────────────────────────────────────────────────────
import React, { useState } from "react";
import {
  BadgeCheck, ShieldCheck, Target, FolderGit2, Award, GraduationCap,
  TrendingUp, Lightbulb, Crown, Check, X, MessageSquareWarning,
  Sparkles, Info, ChevronRight, Plus,
} from "lucide-react";

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

  return (
    <div className="space-y-6">
      <div className={card} style={{ ...cardStyle, padding: 24 }}>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={18} style={{ color: "var(--accent)" }} />
          <h3 className="font-semibold">Verification Center</h3>
          <span className="ml-auto text-[13px] px-2.5 py-1 rounded-full"
            style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
            {pending.length} pending
          </span>
        </div>
        <p className="text-[13px] opacity-60 mb-4">
          Each approval creates a permanent verification record and raises the item's verification level.
        </p>

        <div className="space-y-3">
          {items.map((it) => {
            const Icon = KIND_ICON[it.kind] || Target;
            const done = it.status !== "pending";
            return (
              <div key={it.id} className="p-4 rounded-xl border"
                style={{ borderColor: "var(--line)",
                  background: it.status === "rejected" ? "var(--warn-bg)" : "var(--surface-2)" }}>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg shrink-0" style={{ background: "var(--accent-soft, #0f6e5c1a)" }}>
                    <Icon size={18} style={{ color: "var(--accent)" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{it.title}</span>
                      <LevelBadge level={it.level} />
                    </div>
                    <div className="text-[13px] opacity-70 mt-0.5">{it.who} · {it.impact}</div>
                    <div className="text-[13px] opacity-60 mt-1">{it.desc}</div>

                    {!done ? (
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <button onClick={() => act(it.id, "approve")}
                          className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-white inline-flex items-center gap-1"
                          style={{ background: "var(--verified-fg)" }}>
                          <Check size={14} /> Approve
                        </button>
                        <button onClick={() => act(it.id, "clarify")}
                          className="px-3 py-1.5 rounded-lg text-[13px] font-medium inline-flex items-center gap-1 border"
                          style={{ borderColor: "var(--line)", color: "var(--ink)" }}>
                          <MessageSquareWarning size={14} /> Request clarification
                        </button>
                        <button onClick={() => act(it.id, "reject")}
                          className="px-3 py-1.5 rounded-lg text-[13px] font-medium inline-flex items-center gap-1 border"
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
            );
          })}
        </div>
      </div>

      {/* legend */}
      <div className={card} style={{ ...cardStyle, padding: 20 }}>
        <div className="text-[12px] uppercase tracking-widest opacity-60 mb-3">Verification levels</div>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => <LevelBadge key={l.n} level={l.n} />)}
        </div>
      </div>
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
  return (
    <div className={card} style={{ ...cardStyle, padding: 24, background: "var(--inferred-bg)" }}>
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={18} style={{ color: "var(--inferred-fg)" }} />
        <h3 className="font-semibold">AI Coaching Insights</h3>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "var(--surface)", color: "var(--inferred-fg)" }}>ADVISORY ONLY</span>
      </div>
      <p className="text-[13px] opacity-70 mb-4">
        Evidence-based guidance. These never make a decision — you do.
      </p>
      <div className="space-y-3">
        {insights.map((i, idx) => (
          <div key={idx} className="p-4 rounded-xl" style={{ background: "var(--surface)" }}>
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
        ))}
      </div>
    </div>
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

  return (
    <div className={card} style={{ ...cardStyle, padding: 24 }}>
      <div className="flex items-center gap-2 mb-4">
        <Target size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">My KPIs</h3>
        <button onClick={() => setAdding(!adding)}
          className="ml-auto px-3 py-1.5 rounded-lg text-[13px] font-medium text-white inline-flex items-center gap-1"
          style={{ background: "var(--accent)" }}>
          <Plus size={14} /> Add KPI
        </button>
      </div>

      {adding && (
        <div className="p-4 rounded-xl border mb-4 flex gap-2 flex-wrap items-end"
          style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
          <input placeholder="KPI title" value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }} />
          <input placeholder="Target" value={draft.target}
            onChange={(e) => setDraft({ ...draft, target: e.target.value })}
            className="w-24 px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }} />
          <button onClick={addKpi} className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: "var(--accent)" }}>Save</button>
        </div>
      )}

      <div className="space-y-4">
        {kpis.map((k) => (
          <div key={k.id}>
            <div className="flex items-center justify-between text-[14px] mb-1.5">
              <span className="font-medium">{k.title}</span>
              <span className="opacity-60">
                {k.unit === "$" ? "$" : ""}{k.current.toLocaleString()}{k.unit !== "$" ? k.unit : ""} / {k.unit === "$" ? "$" : ""}{k.target.toLocaleString()}{k.unit !== "$" ? k.unit : ""}
              </span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
              <div className="h-full rounded-full" style={{
                width: pct(k) + "%",
                background: pct(k) >= 100 ? "var(--verified-fg)" : "var(--accent)" }} />
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[12px] capitalize px-2 py-0.5 rounded-full" style={{
                background: k.status === "approved" ? "var(--verified-bg)" : "var(--surface-2)",
                color: k.status === "approved" ? "var(--verified-fg)" : "var(--ink-2)" }}>
                {k.status.replace("_", " ")}
              </span>
              {pct(k) >= 100 && <span className="text-[12px]" style={{ color: "var(--verified-fg)" }}>target met</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════ EXPORTED SHELL ════════════════
export default function EmployerSide({ role = "manager" }: { role?: string }) {
  const isManager = role === "manager" || role === "executive" || role === "admin";
  const [tab, setTab] = useState(isManager ? "verify" : "kpis");

  const tabs = isManager
    ? [{ id: "verify", label: "Verification Center" }, { id: "coaching", label: "AI Coaching" }, { id: "kpis", label: "KPIs" }]
    : [{ id: "kpis", label: "My KPIs" }];

  return (
    <div className="space-y-5">
      {tabs.length > 1 && (
        <div className="flex gap-1 p-1 rounded-xl w-max" style={{ background: "var(--surface-2)" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5 transition"
              style={{ background: tab === t.id ? "var(--surface)" : "transparent",
                color: tab === t.id ? "var(--accent)" : "var(--ink-2)" }}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {tab === "verify" && <VerificationCenter />}
      {tab === "coaching" && <CoachingInsights />}
      {tab === "kpis" && <KpiSystem />}
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
