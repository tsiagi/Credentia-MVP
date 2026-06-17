"use client";
// components/tasks/EmployeeTaskBoard.tsx
// ─────────────────────────────────────────────────────────────
// Employee view of today's tasks. Each task has a Complete / Partial /
// Not Complete toggle; choosing Partial or Not Complete reveals a MANDATORY
// blocker note (enforced here and by a DB CHECK). Employees can also add
// ad-hoc tasks they handled, under the same Strategic Pillars.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { ListChecks, Plus, Sparkles, Inbox } from "lucide-react";
import { Reveal } from "@/components/ui/motion";
import { TaskStatusToggle } from "./TaskStatusToggle";
import { PillarSelect } from "./PillarSelect";
import {
  fetchEmployeeBoard, updateTaskStatus, addSelfTask, fetchPillars, blockerRequired,
  type TaskRow, type TaskStatus, type StrategicPillar,
} from "@/lib/tasks";

export function EmployeeTaskBoard({ userId, orgId }: { userId: string; orgId: string }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [pillars, setPillars] = useState<StrategicPillar[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({}); // blocker text per task
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // add ad-hoc task form
  const [adding, setAdding] = useState(false);
  const [adhoc, setAdhoc] = useState({ title: "", pillarId: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [board, pl] = await Promise.all([fetchEmployeeBoard(userId, orgId), fetchPillars(orgId)]);
        if (cancelled) return;
        setTasks(board);
        setPillars(pl);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load your tasks.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, orgId]);

  async function setStatus(task: TaskRow, status: Exclude<TaskStatus, "assigned">) {
    const blocker = drafts[task.id] ?? task.blocker_note ?? "";
    if (blockerRequired(status) && !blocker.trim()) {
      // reveal the field; persist only once a reason is given
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
      return;
    }
    setError(null);
    try {
      const updated = await updateTaskStatus(userId, task.id, status, blocker);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...updated, pillarName: t.pillarName } : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the task.");
    }
  }

  async function saveBlocker(task: TaskRow) {
    const blocker = drafts[task.id] ?? "";
    if (!blocker.trim()) return;
    try {
      const updated = await updateTaskStatus(userId, task.id, task.status, blocker);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...updated, pillarName: t.pillarName } : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the blocker note.");
    }
  }

  async function addAdHoc() {
    if (!adhoc.title.trim() || !adhoc.pillarId) return;
    try {
      const created = await addSelfTask(userId, orgId, { pillarId: adhoc.pillarId, title: adhoc.title, status: "complete" });
      const name = pillars.find((p) => p.id === adhoc.pillarId)?.name;
      setTasks((prev) => [...prev, { ...created, pillarName: name }]);
      setAdhoc({ title: "", pillarId: "" });
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the task.");
    }
  }

  return (
    <div className="border rounded-2xl p-6" style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
      <div className="flex items-center gap-2 mb-1">
        <ListChecks size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">Today&apos;s Tasks</h3>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto px-3 py-1.5 rounded-lg text-[13px] font-medium inline-flex items-center gap-1 transition active:scale-[0.98]"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <Plus size={14} className="transition-transform" style={{ transform: adding ? "rotate(45deg)" : "none" }} /> Add task
        </button>
      </div>
      <p className="text-[13px] opacity-60 mb-4">Mark each task complete. If something was blocked, tell us why — it helps unblock the team.</p>

      {/* ad-hoc self-report */}
      <div className="grid transition-all duration-300" style={{ gridTemplateRows: adding ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className="p-4 rounded-xl border mb-4 flex flex-wrap gap-2 items-center cairn-pop"
            style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
            <Sparkles size={14} style={{ color: "var(--accent)" }} />
            <input
              value={adhoc.title}
              onChange={(e) => setAdhoc({ ...adhoc, title: e.target.value })}
              placeholder="What did you handle? (ad-hoc task)"
              className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
            />
            <PillarSelect pillars={pillars} value={adhoc.pillarId} onChange={(id) => setAdhoc({ ...adhoc, pillarId: id })} />
            <button onClick={addAdHoc} disabled={!adhoc.title.trim() || !adhoc.pillarId}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
              style={{ background: "var(--accent)" }}>Add</button>
          </div>
        </div>
      </div>

      {error && <p className="text-[13px] px-3 py-2 rounded-lg mb-3" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "var(--surface-2)" }} />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="py-10 grid place-items-center text-center">
          <Inbox size={26} style={{ color: "var(--ink-3)" }} className="mb-2" />
          <p className="font-medium">No tasks yet today</p>
          <p className="text-[13px] opacity-60 mt-1 max-w-sm">Tasks your manager delegates appear here. You can also add ad-hoc work you handled.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((t, idx) => {
            const needBlocker = blockerRequired(t.status);
            return (
              <Reveal key={t.id} delay={idx * 60} className="rounded-xl border p-4"
                style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{t.title}</span>
                      {t.pillarName && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{t.pillarName}</span>
                      )}
                      {t.source === "self_reported" && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--surface)", color: "var(--ink-3)" }}>self-reported</span>
                      )}
                      {t.achievement_id && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>verified</span>
                      )}
                    </div>
                    {t.detail && <p className="text-[13px] opacity-65 mt-0.5">{t.detail}</p>}
                  </div>
                  <TaskStatusToggle value={t.status} onChange={(s) => setStatus(t, s)} />
                </div>

                {/* conditional, mandatory blocker prompt */}
                <div className="grid transition-all duration-300" style={{ gridTemplateRows: needBlocker ? "1fr" : "0fr" }}>
                  <div className="overflow-hidden">
                    <div className="pt-3">
                      <label className="text-[12px] font-medium" style={{ color: "var(--warn)" }}>
                        What blockers or reasons prevented completion today?
                      </label>
                      <div className="flex gap-2 mt-1.5">
                        <input
                          value={drafts[t.id] ?? t.blocker_note ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                          placeholder="Required — e.g. waiting on data from Finance"
                          className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none"
                          style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
                        />
                        <button onClick={() => saveBlocker(t)} disabled={!(drafts[t.id] ?? t.blocker_note ?? "").trim()}
                          className="px-3 py-2 rounded-lg text-[13px] font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
                          style={{ background: "var(--warn)" }}>Save</button>
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
