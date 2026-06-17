"use client";
// components/reports/LeadershipReportView.tsx
// ─────────────────────────────────────────────────────────────
// Executive / admin view of the AI leadership report. Generates via the
// server route (/api/ai/reports) and renders the four required sections:
// Process Bottlenecks, Productivity vs Morale, Revenue & Growth Impact,
// Retention Risk. Everything here is AI INFERENCE — labelled advisory.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import {
  Sparkles, AlertOctagon, Activity, TrendingUp, ShieldAlert, Loader2, RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Report = {
  bottlenecks?: { theme: string; frequency: number; examplePillars?: string[]; summary: string }[];
  productivityVsMorale?: { correlation: string; narrative: string };
  revenueImpact?: { tasksOnRevenuePillar: number; verifiedRevenueImpact: number; narrative: string };
  retentionRisks?: { count: number; narrative: string };
  disclaimer?: string;
};

type ReportRow = {
  id: string;
  scope: string;
  period_type: string;
  period_start: string;
  period_end: string;
  report: Report;
  created_at: string;
};

export function LeadershipReportView({ scope = "org", periodType = "weekly" }: { scope?: "team" | "department" | "org"; periodType?: "weekly" | "monthly" }) {
  const [latest, setLatest] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadLatest() {
    const { data } = await supabase
      .from("ai_inference_reports")
      .select("id, scope, period_type, period_start, period_end, report, created_at")
      .eq("scope", scope)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatest((data as ReportRow) ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await loadLatest(); } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load reports."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("You need to be signed in to generate a report.");

      const res = await fetch("/api/ai/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scope, periodType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Report generation failed.");
      await loadLatest();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Report generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  const r = latest?.report;

  return (
    <div className="border rounded-2xl p-6" style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={18} style={{ color: "var(--inferred-fg)" }} />
        <h3 className="font-semibold">Leadership Report</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}>AI INFERENCE</span>
        <button onClick={generate} disabled={generating}
          className="ml-auto px-3 py-1.5 rounded-lg text-[13px] font-medium text-white inline-flex items-center gap-1.5 transition active:scale-[0.98] disabled:opacity-40"
          style={{ background: "var(--inferred-fg)" }}>
          {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {latest ? "Regenerate" : "Generate"}
        </button>
      </div>
      <p className="text-[13px] opacity-60 mb-4">
        {latest
          ? `${latest.period_type} · ${latest.period_start} → ${latest.period_end} · generated ${new Date(latest.created_at).toLocaleString()}`
          : "Synthesised from check-ins, task completion, pillars, and blocker notes. Advisory only."}
      </p>

      {error && <p className="text-[13px] px-3 py-2 rounded-lg mb-3" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}

      {loading ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: "var(--surface-2)" }} />)}</div>
      ) : !r ? (
        <div className="py-10 text-center">
          <Sparkles size={26} style={{ color: "var(--inferred-fg)" }} className="mx-auto mb-2" />
          <p className="font-medium">No report yet</p>
          <p className="text-[13px] opacity-60 mt-1">Generate one to synthesise this period&apos;s operational data.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Process bottlenecks */}
          <Section icon={AlertOctagon} title="Process Bottlenecks" tone="warn">
            {r.bottlenecks?.length ? (
              <ul className="space-y-2">
                {r.bottlenecks.map((b, i) => (
                  <li key={i} className="text-[13px]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{b.theme}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>×{b.frequency}</span>
                    </div>
                    <p className="opacity-70 mt-0.5">{b.summary}</p>
                  </li>
                ))}
              </ul>
            ) : <Empty>No recurring blockers reported.</Empty>}
          </Section>

          {/* Productivity vs morale */}
          <Section icon={Activity} title="Productivity vs Morale" tone="accent">
            {r.productivityVsMorale ? (
              <>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                  {r.productivityVsMorale.correlation} correlation
                </span>
                <p className="text-[13px] opacity-75 mt-2">{r.productivityVsMorale.narrative}</p>
              </>
            ) : <Empty>Not enough data this period.</Empty>}
          </Section>

          {/* Revenue & growth impact */}
          <Section icon={TrendingUp} title="Revenue & Growth Impact" tone="verified">
            {r.revenueImpact ? (
              <>
                <div className="flex gap-4 mb-1">
                  <Metric label="Revenue-pillar tasks" value={String(r.revenueImpact.tasksOnRevenuePillar)} />
                  <Metric label="Verified impact" value={`$${(r.revenueImpact.verifiedRevenueImpact || 0).toLocaleString()}`} />
                </div>
                <p className="text-[13px] opacity-75 mt-1">{r.revenueImpact.narrative}</p>
              </>
            ) : <Empty>No revenue-pillar activity.</Empty>}
          </Section>

          {/* Retention risk */}
          <Section icon={ShieldAlert} title="Retention Risk" tone="inferred">
            {r.retentionRisks ? (
              <>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}>
                  {r.retentionRisks.count} flagged
                </span>
                <p className="text-[13px] opacity-75 mt-2">{r.retentionRisks.narrative}</p>
              </>
            ) : <Empty>No retention signals.</Empty>}
          </Section>
        </div>
      )}

      {r?.disclaimer && (
        <p className="text-[11px] opacity-55 mt-4 inline-flex items-center gap-1.5">
          <Sparkles size={12} style={{ color: "var(--inferred-fg)" }} /> {r.disclaimer}
        </p>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, tone, children }: { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; title: string; tone: "warn" | "accent" | "verified" | "inferred"; children: React.ReactNode }) {
  const fg = `var(--${tone === "verified" ? "verified-fg" : tone === "inferred" ? "inferred-fg" : tone === "warn" ? "warn" : "accent"})`;
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} style={{ color: fg }} />
        <span className="text-[13px] font-semibold">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-semibold tabular">{value}</div>
      <div className="text-[11px] opacity-55">{label}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] opacity-50">{children}</p>;
}
