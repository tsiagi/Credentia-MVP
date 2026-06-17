"use client";
// components/tasks/TaskDelegationPanel.tsx
// ─────────────────────────────────────────────────────────────
// Management interface (managers / directors / VPs): delegate a
// natural-language task to a direct report under a mandatory Strategic
// Pillar. Replaces the old free-form achievement input as the manager's
// way of getting categorised work into the system. Completed tasks can be
// promoted to L2 Manager-Verified achievements via the bridge.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import { Send, Target, ShieldCheck, Loader2 } from "lucide-react";
import { Reveal } from "@/components/ui/motion";
import { PillarSelect } from "./PillarSelect";
import {
  fetchPillars, delegateTask, fetchDelegatedTasks, promoteTaskToAchievement,
  type StrategicPillar, type TaskRow,
} from "@/lib/tasks";
import { fetchDirectReports, displayName, type ProfileLite } from "@/lib/workforce";

export function TaskDelegationPanel({ userId, orgId }: { userId: string; orgId: string | null }) {
  const [reports, setReports] = useState<ProfileLite[]>([]);
  const [pillars, setPillars] = useState<StrategicPillar[]>([]);
  const [recent, setRecent] = useState<TaskRow[]>([]);
  const [form, setForm] = useState({ employeeId: "", pillarId: "", title: "", detail: "" });
  const [busy, setBusy] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pillarName = useMemo(() => Object.fromEntries(pillars.map((p) => [p.id, p.name])), [pillars]);
  const nameOf = useMemo(() => Object.fromEntries(reports.map((r) => [r.id, displayName(r)])), [reports]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rep, pl, del] = await Promise.all([
          fetchDirectReports(userId),
          orgId ? fetchPillars(orgId) : Promise.resolve([]),
          fetchDelegatedTasks(userId),
        ]);
        if (cancelled) return;
        setReports(rep);
        setPillars(pl);
        setRecent(del.slice(0, 6));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load delegation data.");
      }
    })();
    return () => { cancelled = true; };
  }, [userId, orgId]);

  async function delegate() {
    if (!form.employeeId || !form.pillarId || !form.title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await delegateTask(userId, orgId, {
        employeeId: form.employeeId, pillarId: form.pillarId, title: form.title, detail: form.detail,
      });
      setRecent((prev) => [created, ...prev].slice(0, 6));
      setForm({ employeeId: "", pillarId: "", title: "", detail: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delegate the task.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(task: TaskRow) {
    setPromoting(task.id);
    setError(null);
    try {
      const achId = await promoteTaskToAchievement(userId, task);
      setRecent((prev) => prev.map((t) => (t.id === task.id ? { ...t, achievement_id: achId } : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify the task.");
    } finally {
      setPromoting(null);
    }
  }

  return (
    <div className="border rounded-2xl p-6" style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
      <div className="flex items-center gap-2 mb-1">
        <Target size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">Delegate a Task</h3>
      </div>
      <p className="text-[13px] opacity-60 mb-4">Assign work in plain language, pick who owns it, and categorise it by strategic pillar.</p>

      <div className="space-y-3">
        <textarea
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Describe the task… e.g. “Pull together the Q3 churn analysis for the EMEA accounts”"
          rows={2}
          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none"
          style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }}
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ borderColor: "var(--line)", background: "var(--surface)", color: form.employeeId ? "var(--ink)" : "var(--ink-3)" }}
          >
            <option value="" disabled>Assign to…</option>
            {reports.map((r) => <option key={r.id} value={r.id}>{displayName(r)}</option>)}
          </select>
          <PillarSelect pillars={pillars} value={form.pillarId} onChange={(id) => setForm({ ...form, pillarId: id })} />
          <button
            onClick={delegate}
            disabled={!form.employeeId || !form.pillarId || !form.title.trim() || busy}
            className="ml-auto px-4 py-2 rounded-lg text-sm font-medium text-white inline-flex items-center gap-1.5 transition active:scale-[0.98] disabled:opacity-40"
            style={{ background: "var(--accent)" }}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Delegate
          </button>
        </div>
        {reports.length === 0 && (
          <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>No direct reports found — an admin sets reporting lines.</p>
        )}
      </div>

      {error && <p className="text-[13px] px-3 py-2 rounded-lg mt-3" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}

      {/* recently delegated */}
      {recent.length > 0 && (
        <div className="mt-6">
          <div className="text-[12px] uppercase tracking-widest opacity-50 mb-2">Recently delegated</div>
          <div className="space-y-2">
            {recent.map((t, i) => (
              <Reveal key={t.id} delay={i * 50} className="rounded-xl border p-3 flex items-center gap-3"
                style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{t.title}</span>
                    {pillarName[t.pillar_id] && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{pillarName[t.pillar_id]}</span>
                    )}
                  </div>
                  <div className="text-[12px] opacity-60 mt-0.5">{nameOf[t.employee_id] ?? "Report"} · {t.status}</div>
                </div>
                {t.status === "complete" && !t.achievement_id && (
                  <button onClick={() => verify(t)} disabled={promoting === t.id}
                    className="px-2.5 py-1.5 rounded-lg text-[12px] font-medium inline-flex items-center gap-1 border transition active:scale-[0.97] disabled:opacity-40"
                    style={{ borderColor: "var(--verified-fg)", color: "var(--verified-fg)" }}>
                    {promoting === t.id ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />} Verify
                  </button>
                )}
                {t.achievement_id && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>
                    <ShieldCheck size={11} /> L2 verified
                  </span>
                )}
              </Reveal>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
