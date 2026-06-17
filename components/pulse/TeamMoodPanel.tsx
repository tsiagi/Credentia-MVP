"use client";
// components/pulse/TeamMoodPanel.tsx
// ─────────────────────────────────────────────────────────────
// Manager / executive view of team sentiment. Shows the k-anonymised
// team_pulse_trend() aggregate (never an individual's raw daily mood) plus
// advisory AI retention flags. Both are AI INFERENCE / supporting metrics —
// labelled, never a decision.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { Activity, Sparkles, AlertTriangle } from "lucide-react";
import { fetchTeamPulseTrend, type PulseTrendPoint } from "@/lib/pulse";
import { supabase } from "@/lib/supabase";

type RetentionFlag = { id: string; employee_id: string; severity: string; signal: string };

const SEVERITY: Record<string, { fg: string; bg: string; label: string }> = {
  watch:    { fg: "var(--ink-2)",    bg: "var(--surface-2)",  label: "Watch" },
  elevated: { fg: "var(--warn)",     bg: "var(--warn-bg)",    label: "Elevated" },
  high:     { fg: "var(--danger-fg)", bg: "var(--danger-bg)", label: "High" },
};

export function TeamMoodPanel({ days = 14 }: { days?: number }) {
  const [trend, setTrend] = useState<PulseTrendPoint[]>([]);
  const [flags, setFlags] = useState<RetentionFlag[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, f] = await Promise.all([
          fetchTeamPulseTrend(days),
          supabase.from("ai_retention_flags").select("id, employee_id, severity, signal").order("created_at", { ascending: false }),
        ]);
        if (cancelled) return;
        setTrend(t);
        const rows = (f.data ?? []) as RetentionFlag[];
        setFlags(rows);
        if (rows.length) {
          const ids = [...new Set(rows.map((r) => r.employee_id))];
          const { data: profs } = await supabase.from("profiles").select("id, full_name, title").in("id", ids);
          setNames(Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name?.trim() || p.title?.trim() || "Team member"])));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load team sentiment.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  const maxResp = Math.max(1, ...trend.map((p) => p.responses));

  return (
    <div className="border rounded-2xl p-6" style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
      <div className="flex items-center gap-2 mb-1">
        <Activity size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">Team Sentiment</h3>
        <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}>
          <Sparkles size={11} /> AGGREGATE · ADVISORY
        </span>
      </div>
      <p className="text-[13px] opacity-60 mb-4">Daily team averages only (min. 3 responses per day). Individual entries stay private.</p>

      {error && <p className="text-[13px] px-3 py-2 rounded-lg mb-3" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}

      {loading ? (
        <div className="h-32 rounded-xl animate-pulse" style={{ background: "var(--surface-2)" }} />
      ) : trend.length === 0 ? (
        <p className="text-[13px] opacity-60 py-6 text-center">Not enough responses yet to show a trend.</p>
      ) : (
        <div className="flex items-end gap-1.5 h-32">
          {trend.map((p) => (
            <div key={p.pulse_date} className="flex-1 flex flex-col items-center gap-1 group" title={`${p.pulse_date} · in ${p.avg_checkin ?? "—"} / out ${p.avg_checkout ?? "—"} · ${p.responses} responses`}>
              <div className="w-full flex items-end justify-center gap-0.5 flex-1">
                <div className="w-1/2 rounded-t" style={{ height: `${((p.avg_checkin ?? 0) / 5) * 100}%`, background: "var(--accent)", opacity: 0.5 + 0.5 * (p.responses / maxResp) }} />
                <div className="w-1/2 rounded-t" style={{ height: `${((p.avg_checkout ?? 0) / 5) * 100}%`, background: "var(--inferred-fg)", opacity: 0.5 + 0.5 * (p.responses / maxResp) }} />
              </div>
              <span className="text-[9px] opacity-40">{p.pulse_date.slice(5)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 text-[11px] opacity-60">
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--accent)" }} /> Check-in</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--inferred-fg)" }} /> Check-out</span>
      </div>

      {/* AI retention flags — advisory */}
      {flags.length > 0 && (
        <div className="mt-5 pt-5 border-t" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={14} style={{ color: "var(--inferred-fg)" }} />
            <span className="text-[12px] font-semibold">Retention signals</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}>AI ESTIMATE</span>
          </div>
          <div className="space-y-2">
            {flags.map((fl) => {
              const sev = SEVERITY[fl.severity] ?? SEVERITY.watch;
              return (
                <div key={fl.id} className="flex items-start gap-2 p-3 rounded-xl" style={{ background: sev.bg }}>
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: sev.fg }} />
                  <div className="text-[13px]">
                    <span className="font-medium">{names[fl.employee_id] ?? "Team member"}</span>
                    <span className="ml-1.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "var(--surface)", color: sev.fg }}>{sev.label}</span>
                    <p className="opacity-70 mt-0.5">{fl.signal}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] opacity-50 mt-2">Advisory only — a prompt to check in, not a conclusion. Sentiment can dip for many reasons.</p>
        </div>
      )}
    </div>
  );
}
