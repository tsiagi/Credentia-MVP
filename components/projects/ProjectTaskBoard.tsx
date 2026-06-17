"use client";
// components/projects/ProjectTaskBoard.tsx
// ─────────────────────────────────────────────────────────────
// Jira/Monday-style Kanban over verified_tasks (the BLUE layer). Columns are
// To do / In progress / Blocked / Done; every card is a human-owned or
// human-approved task. Each card offers "Break down with AI" which calls the
// server route to generate ai_inference sub-tasks (AMBER) — those render in the
// AiSubtaskReview panel and only become real tasks once approved.
//
// Presentation + RLS data layer only (lib/projects.ts). No AI row is ever
// written from the client.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  KanbanSquare, Plus, Sparkles, ShieldCheck, Loader2, ChevronDown, FolderKanban, BadgeCheck,
} from "lucide-react";
import { Reveal } from "@/components/ui/motion";
import { AiSubtaskReview } from "./AiSubtaskReview";
import {
  fetchProjects, fetchTasks, fetchTeamTasks, createTask, createProject, updateTaskBoardStatus,
  promoteTaskToVerifiedAchievement,
  BOARD_COLUMNS, type WorkProject, type VerifiedTask, type TaskBoardStatus, type TaskPriority,
} from "@/lib/projects";
import { fetchDirectReports, displayName, type ProfileLite } from "@/lib/workforce";

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: "var(--ink-3)", medium: "var(--accent)", high: "var(--warn-fg)", urgent: "var(--danger-fg)",
};

/**
 * variant "personal" — an IC's own board (assignee = self).
 * variant "team" — a manager's board: delegate to direct reports, and
 * "Verify → L2" a completed task into a Manager-Verified achievement
 * (continues the existing verification chain).
 */
export function ProjectTaskBoard({
  userId, orgId, variant = "personal",
}: { userId: string; orgId: string; variant?: "personal" | "team" }) {
  const isTeam = variant === "team";
  const [projects, setProjects] = useState<WorkProject[]>([]);
  const [projectId, setProjectId] = useState<string | "all">("all");
  const [tasks, setTasks] = useState<VerifiedTask[]>([]);
  const [reports, setReports] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ title: string; detail: string; priority: TaskPriority; assigneeId: string }>(
    { title: "", detail: "", priority: "medium", assigneeId: userId },
  );
  const [newProject, setNewProject] = useState("");
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState<string | null>(null);
  const [openReview, setOpenReview] = useState<string | null>(null);

  // Manager board: load direct reports for delegation + team task scope.
  useEffect(() => {
    if (!isTeam) return;
    let cancelled = false;
    (async () => {
      try {
        const rs = await fetchDirectReports(userId);
        if (!cancelled) setReports(rs);
      } catch {
        /* non-fatal — board still works for the manager's own tasks */
      }
    })();
    return () => { cancelled = true; };
  }, [isTeam, userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ps = await fetchProjects();
        if (!cancelled) setProjects(ps);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load projects.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let rows: VerifiedTask[];
        if (projectId !== "all") {
          rows = await fetchTasks({ projectId });
        } else if (isTeam) {
          rows = await fetchTeamTasks([userId, ...reports.map((r) => r.id)]);
        } else {
          rows = await fetchTasks({ assigneeId: userId });
        }
        if (!cancelled) setTasks(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load tasks.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, userId, isTeam, reports]);

  const columns = useMemo(() => {
    const by: Record<TaskBoardStatus, VerifiedTask[]> = { todo: [], in_progress: [], blocked: [], done: [] };
    for (const t of tasks) by[t.status].push(t);
    return by;
  }, [tasks]);

  async function addTask() {
    if (!draft.title.trim()) return;
    setError(null);
    try {
      const created = await createTask(userId, orgId, {
        title: draft.title, detail: draft.detail || undefined,
        projectId: projectId === "all" ? null : projectId, priority: draft.priority,
        // Team board delegates to the chosen report; personal board defaults to self.
        assigneeId: isTeam ? draft.assigneeId : userId,
      });
      setTasks((prev) => [...prev, created]);
      setDraft({ title: "", detail: "", priority: "medium", assigneeId: userId });
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the task.");
    }
  }

  async function verifyTask(task: VerifiedTask) {
    setVerifyBusy(task.id); setError(null);
    try {
      const achievementId = await promoteTaskToVerifiedAchievement(userId, task);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, achievement_id: achievementId } : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify this task.");
    } finally {
      setVerifyBusy(null);
    }
  }

  async function addProject() {
    if (!newProject.trim()) return;
    try {
      const p = await createProject(userId, orgId, { name: newProject });
      setProjects((prev) => [p, ...prev]);
      setNewProject("");
      setProjectId(p.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the project.");
    }
  }

  async function moveTask(task: VerifiedTask, status: TaskBoardStatus) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      await updateTaskBoardStatus(userId, task.id, status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move the task.");
    }
  }

  async function breakDownWithAI(task: VerifiedTask) {
    setAiBusy(task.id); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in again to use AI breakdown.");
      const res = await fetch("/api/ai/subtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ taskId: task.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "AI breakdown failed.");
      setOpenReview(task.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI breakdown failed.");
    } finally {
      setAiBusy(null);
    }
  }

  return (
    <div className="border rounded-2xl p-6" style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <KanbanSquare size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">{isTeam ? "Team Board" : "My Work"}</h3>

        {/* project selector */}
        <div className="relative ml-2">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value as string | "all")}
            className="appearance-none pl-3 pr-8 py-1.5 rounded-lg border text-[13px] outline-none"
            style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }}
          >
            <option value="all">{isTeam ? "All team tasks" : "My tasks (all)"}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--ink-3)" }} />
        </div>

        <button
          onClick={() => setCreating((v) => !v)}
          className="ml-auto px-3 py-1.5 rounded-lg text-[13px] font-medium inline-flex items-center gap-1 transition active:scale-[0.98]"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <Plus size={14} style={{ transform: creating ? "rotate(45deg)" : "none", transition: "transform var(--duration-base)" }} /> New task
        </button>
      </div>
      <p className="text-[13px] opacity-60 mb-4">
        {isTeam
          ? "Delegate work to your team and review AI suggestions. Verify a completed task to promote it to a Manager-Verified (L2) achievement."
          : "Every card here is a verified task. AI can suggest a breakdown — you approve what becomes real work."}
      </p>

      {/* create project inline */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <FolderKanban size={14} style={{ color: "var(--ink-3)" }} />
        <input
          value={newProject} onChange={(e) => setNewProject(e.target.value)}
          placeholder="New project name…"
          className="px-3 py-1.5 rounded-lg border text-[13px] outline-none"
          style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
        />
        <button onClick={addProject} disabled={!newProject.trim()}
          className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition active:scale-[0.98] disabled:opacity-40"
          style={{ background: "var(--surface-2)", color: "var(--ink)" }}>Create project</button>
      </div>

      {/* create task form */}
      <div className="grid transition-all duration-300" style={{ gridTemplateRows: creating ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className="p-4 rounded-xl border mb-4 cairn-pop" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
            <input
              value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Task title"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none mb-2"
              style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
            />
            <textarea
              value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
              placeholder="Details (optional)" rows={2}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none mb-2 resize-none"
              style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as TaskPriority })}
                className="px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}>
                <option value="low">Low</option><option value="medium">Medium</option>
                <option value="high">High</option><option value="urgent">Urgent</option>
              </select>
              {isTeam && (
                <select value={draft.assigneeId} onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value })}
                  className="px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}>
                  <option value={userId}>Assign to me</option>
                  {reports.map((r) => <option key={r.id} value={r.id}>{displayName(r)}</option>)}
                </select>
              )}
              <button onClick={addTask} disabled={!draft.title.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
                style={{ background: "var(--accent)" }}>Add task</button>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-[13px] px-3 py-2 rounded-lg mb-3" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}

      {loading ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
          {BOARD_COLUMNS.map((c) => <div key={c.key} className="h-40 rounded-xl animate-pulse" style={{ background: "var(--surface-2)" }} />)}
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
          {BOARD_COLUMNS.map((col) => (
            <div key={col.key} className="rounded-xl p-2" style={{ background: "var(--surface-2)" }}>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-[12px] font-semibold" style={{ color: "var(--ink-2)" }}>{col.label}</span>
                <span className="text-[11px] px-1.5 rounded-full" style={{ background: "var(--surface)", color: "var(--ink-3)" }}>
                  {columns[col.key].length}
                </span>
              </div>
              <div className="space-y-2 min-h-[40px]">
                {columns[col.key].map((t, idx) => (
                  <Reveal key={t.id} delay={idx * 40}
                    className="rounded-lg border p-3 cairn-lift"
                    style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                    <div className="flex items-start gap-2">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PRIORITY_COLOR[t.priority] }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>{t.title}</p>
                        {t.detail && <p className="text-[12px] mt-0.5 line-clamp-2" style={{ color: "var(--ink-2)" }}>{t.detail}</p>}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {/* provenance: human vs AI-approved — both are VERIFIED, but we keep the trail */}
                          {t.origin === "ai_approved" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                              style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>
                              <ShieldCheck size={10} /> Verified · from AI suggestion
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                              style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>
                              <ShieldCheck size={10} /> Verified
                            </span>
                          )}
                          {t.achievement_id && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                              style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}>
                              <BadgeCheck size={10} /> L2 achievement
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* move + AI actions */}
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      <select value={t.status} onChange={(e) => moveTask(t, e.target.value as TaskBoardStatus)}
                        className="px-2 py-1 rounded-md border text-[11px] outline-none"
                        style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink-2)" }}>
                        {BOARD_COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                      <button onClick={() => breakDownWithAI(t)} disabled={aiBusy === t.id}
                        title="Suggest sub-tasks with AI"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition active:scale-[0.98] disabled:opacity-50"
                        style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}>
                        {aiBusy === t.id ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} AI
                      </button>
                      <button onClick={() => setOpenReview(openReview === t.id ? null : t.id)}
                        className="px-2 py-1 rounded-md text-[11px] transition"
                        style={{ background: "var(--surface-2)", color: "var(--ink-3)" }}>
                        {openReview === t.id ? "Hide" : "Review"}
                      </button>
                      {/* Manager verification bridge: promote a done task into an L2 achievement */}
                      {isTeam && t.status === "done" && !t.achievement_id && (
                        <button onClick={() => verifyTask(t)} disabled={verifyBusy === t.id}
                          title="Verify → Manager-Verified (L2) achievement"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-white transition active:scale-[0.98] disabled:opacity-50"
                          style={{ background: "var(--verified-fg)" }}>
                          {verifyBusy === t.id ? <Loader2 size={11} className="animate-spin" /> : <BadgeCheck size={11} />} Verify → L2
                        </button>
                      )}
                    </div>

                    {openReview === t.id && (
                      <AiSubtaskReview
                        parentTaskId={t.id} userId={userId}
                        onApproved={(task) => setTasks((prev) => [...prev, task])}
                      />
                    )}
                  </Reveal>
                ))}
                {columns[col.key].length === 0 && (
                  <p className="text-[11px] text-center py-3" style={{ color: "var(--ink-3)" }}>—</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
