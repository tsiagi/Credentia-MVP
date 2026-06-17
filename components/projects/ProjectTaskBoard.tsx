"use client";
// components/projects/ProjectTaskBoard.tsx
// ─────────────────────────────────────────────────────────────
// Project workspace over verified_tasks (the BLUE layer). Three interchangeable
// views — Board (Kanban), Timeline (by due date), and List — share the same
// task primitives. Projects carry a focus/goal and a start→target schedule.
// Each task can be broken down by AI into ai_inference sub-tasks (AMBER); only
// human-approved suggestions become real tasks. Managers can Verify → L2 a
// completed task into the existing achievement chain.
//
// Presentation + RLS data layer only (lib/projects.ts). No AI row is ever
// written from the client.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  KanbanSquare, Plus, Sparkles, ShieldCheck, Loader2, ChevronDown, BadgeCheck,
  CalendarDays, List as ListIcon, GanttChartSquare, X, CalendarClock, Target, Clock,
} from "lucide-react";
import { Reveal } from "@/components/ui/motion";
import { AiSubtaskReview } from "./AiSubtaskReview";
import {
  fetchProjects, fetchTasks, fetchTeamTasks, createTask, createProject, updateTaskBoardStatus,
  promoteTaskToVerifiedAchievement,
  BOARD_COLUMNS, type WorkProject, type VerifiedTask, type TaskBoardStatus, type TaskPriority,
} from "@/lib/projects";
import { fetchDirectReports, displayName, type ProfileLite } from "@/lib/workforce";

type ProjectView = "board" | "timeline" | "list";

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: "var(--ink-3)", medium: "var(--accent)", high: "var(--warn-fg)", urgent: "var(--danger-fg)",
};

// ── date helpers ──────────────────────────────────────────────────
function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function isOverdue(iso: string | null, status: TaskBoardStatus): boolean {
  if (!iso || status === "done") return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(`${iso}T00:00:00`) < today;
}
type Bucket = "overdue" | "week" | "upcoming" | "none";
function bucketOf(t: VerifiedTask): Bucket {
  if (!t.due_date) return "none";
  if (isOverdue(t.due_date, t.status)) return "overdue";
  const due = new Date(`${t.due_date}T00:00:00`).getTime();
  const wk = Date.now() + 7 * 86400000;
  return due <= wk ? "week" : "upcoming";
}
const BUCKET_META: { key: Bucket; label: string; color: string }[] = [
  { key: "overdue", label: "Overdue", color: "var(--danger-fg)" },
  { key: "week", label: "This week", color: "var(--accent)" },
  { key: "upcoming", label: "Upcoming", color: "var(--ink-2)" },
  { key: "none", label: "No date", color: "var(--ink-3)" },
];

// ── shared task primitives (module-level so they aren't re-created on render) ──
function DuePill({ t }: { t: VerifiedTask }) {
  const label = fmtDate(t.due_date);
  if (!label) return null;
  const over = isOverdue(t.due_date, t.status);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
      style={over
        ? { background: "var(--danger-bg)", color: "var(--danger-fg)" }
        : { background: "var(--surface-2)", color: "var(--ink-3)" }}>
      <CalendarClock size={10} /> {label}
    </span>
  );
}

function TaskBadges({ t, assigneeName }: { t: VerifiedTask; assigneeName?: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
        style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>
        <ShieldCheck size={10} /> {t.origin === "ai_approved" ? "Verified · from AI" : "Verified"}
      </span>
      {t.achievement_id && (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
          style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}>
          <BadgeCheck size={10} /> L2 achievement
        </span>
      )}
      <DuePill t={t} />
      {assigneeName && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--surface-2)", color: "var(--ink-3)" }}>
          {assigneeName}
        </span>
      )}
    </div>
  );
}

type TaskHandlers = {
  isTeam: boolean;
  userId: string;
  aiBusy: string | null;
  verifyBusy: string | null;
  openReview: string | null;
  onMove: (t: VerifiedTask, s: TaskBoardStatus) => void;
  onBreakdown: (t: VerifiedTask) => void;
  onToggleReview: (id: string) => void;
  onVerify: (t: VerifiedTask) => void;
  onApproved: (t: VerifiedTask) => void;
};

function TaskActions({ t, h }: { t: VerifiedTask; h: TaskHandlers }) {
  return (
    <div className="flex items-center gap-1 mt-2 flex-wrap">
      <select value={t.status} onChange={(e) => h.onMove(t, e.target.value as TaskBoardStatus)}
        className="px-2 py-1 rounded-md border text-[11px] outline-none"
        style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink-2)" }}>
        {BOARD_COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <button onClick={() => h.onBreakdown(t)} disabled={h.aiBusy === t.id}
        title="Suggest sub-tasks with AI"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition active:scale-[0.98] disabled:opacity-50"
        style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}>
        {h.aiBusy === t.id ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} AI
      </button>
      <button onClick={() => h.onToggleReview(t.id)}
        className="px-2 py-1 rounded-md text-[11px] transition"
        style={{ background: "var(--surface-2)", color: "var(--ink-3)" }}>
        {h.openReview === t.id ? "Hide" : "Review"}
      </button>
      {h.isTeam && t.status === "done" && !t.achievement_id && (
        <button onClick={() => h.onVerify(t)} disabled={h.verifyBusy === t.id}
          title="Verify → Manager-Verified (L2) achievement"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-white transition active:scale-[0.98] disabled:opacity-50"
          style={{ background: "var(--verified-fg)" }}>
          {h.verifyBusy === t.id ? <Loader2 size={11} className="animate-spin" /> : <BadgeCheck size={11} />} Verify → L2
        </button>
      )}
    </div>
  );
}

function TaskCard({ t, h, assigneeName, delay = 0 }: { t: VerifiedTask; h: TaskHandlers; assigneeName?: string; delay?: number }) {
  return (
    <Reveal delay={delay} className="rounded-lg border p-3 cairn-lift" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <div className="flex items-start gap-2">
        <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PRIORITY_COLOR[t.priority] }} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>{t.title}</p>
          {t.detail && <p className="text-[12px] mt-0.5 line-clamp-2" style={{ color: "var(--ink-2)" }}>{t.detail}</p>}
          <TaskBadges t={t} assigneeName={assigneeName} />
        </div>
      </div>
      <TaskActions t={t} h={h} />
      {h.openReview === t.id && <AiSubtaskReview parentTaskId={t.id} userId={h.userId} onApproved={h.onApproved} />}
    </Reveal>
  );
}

/**
 * variant "personal" — an IC's own board (assignee = self).
 * variant "team" — a manager's board: delegate to direct reports, and
 * "Verify → L2" a completed task into a Manager-Verified achievement.
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
  const [view, setView] = useState<ProjectView>("board");

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ title: string; detail: string; priority: TaskPriority; assigneeId: string; dueDate: string }>(
    { title: "", detail: "", priority: "medium", assigneeId: userId, dueDate: "" },
  );
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState<string | null>(null);
  const [openReview, setOpenReview] = useState<string | null>(null);

  // project creation modal
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectDraft, setProjectDraft] = useState({ name: "", focus: "", startDate: "", targetDate: "" });

  useEffect(() => {
    if (!isTeam) return;
    let cancelled = false;
    (async () => {
      try {
        const rs = await fetchDirectReports(userId);
        if (!cancelled) setReports(rs);
      } catch { /* non-fatal */ }
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
        if (projectId !== "all") rows = await fetchTasks({ projectId });
        else if (isTeam) rows = await fetchTeamTasks([userId, ...reports.map((r) => r.id)]);
        else rows = await fetchTasks({ assigneeId: userId });
        if (!cancelled) setTasks(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load tasks.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, userId, isTeam, reports]);

  const nameById = useMemo(() => {
    const m: Record<string, string> = { [userId]: "Me" };
    for (const r of reports) m[r.id] = displayName(r);
    return m;
  }, [reports, userId]);

  const selectedProject = projectId === "all" ? null : projects.find((p) => p.id === projectId) ?? null;

  const columns = useMemo(() => {
    const by: Record<TaskBoardStatus, VerifiedTask[]> = { todo: [], in_progress: [], blocked: [], done: [] };
    for (const t of tasks) by[t.status].push(t);
    return by;
  }, [tasks]);

  const timeline = useMemo(() => {
    const by: Record<Bucket, VerifiedTask[]> = { overdue: [], week: [], upcoming: [], none: [] };
    for (const t of tasks) by[bucketOf(t)].push(t);
    const cmp = (a: VerifiedTask, b: VerifiedTask) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
    (Object.keys(by) as Bucket[]).forEach((k) => by[k].sort(cmp));
    return by;
  }, [tasks]);

  async function addTask() {
    if (!draft.title.trim()) return;
    setError(null);
    try {
      const created = await createTask(userId, orgId, {
        title: draft.title, detail: draft.detail || undefined,
        projectId: projectId === "all" ? null : projectId, priority: draft.priority,
        assigneeId: isTeam ? draft.assigneeId : userId,
        dueDate: draft.dueDate || null,
      });
      setTasks((prev) => [...prev, created]);
      setDraft({ title: "", detail: "", priority: "medium", assigneeId: userId, dueDate: "" });
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
    } finally { setVerifyBusy(null); }
  }

  async function submitProject() {
    if (!projectDraft.name.trim()) return;
    setProjectBusy(true); setError(null);
    try {
      const p = await createProject(userId, orgId, {
        name: projectDraft.name,
        description: projectDraft.focus || undefined,
        teamLeadId: isTeam ? userId : null,
        startDate: projectDraft.startDate || null,
        targetDate: projectDraft.targetDate || null,
      });
      setProjects((prev) => [p, ...prev]);
      setProjectId(p.id);
      setProjectDraft({ name: "", focus: "", startDate: "", targetDate: "" });
      setShowProjectModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the project.");
    } finally { setProjectBusy(false); }
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
    } finally { setAiBusy(null); }
  }

  const handlers: TaskHandlers = {
    isTeam, userId, aiBusy, verifyBusy, openReview,
    onMove: moveTask, onBreakdown: breakDownWithAI,
    onToggleReview: (id) => setOpenReview((cur) => (cur === id ? null : id)),
    onVerify: verifyTask,
    onApproved: (t) => setTasks((prev) => [...prev, t]),
  };

  const VIEWS: { key: ProjectView; label: string; icon: React.ReactNode }[] = [
    { key: "board", label: "Board", icon: <KanbanSquare size={14} /> },
    { key: "timeline", label: "Timeline", icon: <GanttChartSquare size={14} /> },
    { key: "list", label: "List", icon: <ListIcon size={14} /> },
  ];

  return (
    <div className="border rounded-2xl p-6" style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
      {/* header */}
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <KanbanSquare size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">{isTeam ? "Team Board" : "My Work"}</h3>
        <div className="relative ml-2">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value as string | "all")}
            className="appearance-none pl-3 pr-8 py-1.5 rounded-lg border text-[13px] outline-none"
            style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }}>
            <option value="all">{isTeam ? "All team tasks" : "My tasks (all)"}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--ink-3)" }} />
        </div>

        {/* view switcher */}
        <div className="ml-auto flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: "var(--surface-2)" }}>
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => setView(v.key)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition"
              style={view === v.key ? { background: "var(--surface)", color: "var(--ink)" } : { color: "var(--ink-3)" }}>
              {v.icon} {v.label}
            </button>
          ))}
        </div>

        <button onClick={() => setShowProjectModal(true)}
          className="px-3 py-1.5 rounded-lg text-[13px] font-medium inline-flex items-center gap-1 transition active:scale-[0.98]"
          style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
          <Plus size={14} /> New project
        </button>
        <button onClick={() => setCreating((v) => !v)}
          className="px-3 py-1.5 rounded-lg text-[13px] font-medium inline-flex items-center gap-1 transition active:scale-[0.98]"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
          <Plus size={14} style={{ transform: creating ? "rotate(45deg)" : "none", transition: "transform var(--duration-base)" }} /> New task
        </button>
      </div>

      {/* project schedule banner */}
      {selectedProject ? (
        <div className="flex items-center gap-3 mb-4 mt-2 flex-wrap text-[12px]" style={{ color: "var(--ink-2)" }}>
          {selectedProject.description && <span className="opacity-80">{selectedProject.description}</span>}
          {(selectedProject.start_date || selectedProject.target_date) && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: "var(--surface-2)" }}>
              <CalendarDays size={12} />
              {fmtDate(selectedProject.start_date) ?? "—"} <span style={{ color: "var(--ink-3)" }}>→</span>
              <Target size={12} /> {fmtDate(selectedProject.target_date) ?? "—"}
            </span>
          )}
        </div>
      ) : (
        <p className="text-[13px] opacity-60 mb-4">
          {isTeam
            ? "Delegate work, review AI suggestions, and verify completed tasks into Manager-Verified (L2) achievements."
            : "Every card here is a verified task. AI can suggest a breakdown — you approve what becomes real work."}
        </p>
      )}

      {/* create task form */}
      <div className="grid transition-all duration-300" style={{ gridTemplateRows: creating ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className="p-4 rounded-xl border mb-4 cairn-pop" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Task title"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none mb-2"
              style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }} />
            <textarea value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
              placeholder="Details (optional)" rows={2}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none mb-2 resize-none"
              style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }} />
            <div className="flex items-center gap-2 flex-wrap">
              <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as TaskPriority })}
                className="px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}>
                <option value="low">Low</option><option value="medium">Medium</option>
                <option value="high">High</option><option value="urgent">Urgent</option>
              </select>
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink-2)" }}>
                <CalendarClock size={14} style={{ color: "var(--ink-3)" }} />
                <input type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
                  className="bg-transparent outline-none text-sm" style={{ color: "var(--ink)" }} />
              </label>
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
      ) : view === "board" ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
          {BOARD_COLUMNS.map((col) => (
            <div key={col.key} className="rounded-xl p-2" style={{ background: "var(--surface-2)" }}>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-[12px] font-semibold" style={{ color: "var(--ink-2)" }}>{col.label}</span>
                <span className="text-[11px] px-1.5 rounded-full" style={{ background: "var(--surface)", color: "var(--ink-3)" }}>{columns[col.key].length}</span>
              </div>
              <div className="space-y-2 min-h-[40px]">
                {columns[col.key].map((t, idx) => (
                  <TaskCard key={t.id} t={t} h={handlers} delay={idx * 40} assigneeName={isTeam ? nameById[t.assignee_id ?? ""] : undefined} />
                ))}
                {columns[col.key].length === 0 && <p className="text-[11px] text-center py-3" style={{ color: "var(--ink-3)" }}>—</p>}
              </div>
            </div>
          ))}
        </div>
      ) : view === "timeline" ? (
        <div className="space-y-4">
          {BUCKET_META.map((b) => (
            <div key={b.key}>
              <div className="flex items-center gap-2 mb-2">
                <Clock size={13} style={{ color: b.color }} />
                <span className="text-[12px] font-semibold" style={{ color: "var(--ink-2)" }}>{b.label}</span>
                <span className="text-[11px] px-1.5 rounded-full" style={{ background: "var(--surface-2)", color: "var(--ink-3)" }}>{timeline[b.key].length}</span>
                <div className="flex-1 h-px ml-1" style={{ background: "var(--line)" }} />
              </div>
              {timeline[b.key].length === 0 ? (
                <p className="text-[11px] pl-5" style={{ color: "var(--ink-3)" }}>—</p>
              ) : (
                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                  {timeline[b.key].map((t, idx) => (
                    <TaskCard key={t.id} t={t} h={handlers} delay={idx * 30} assigneeName={isTeam ? nameById[t.assignee_id ?? ""] : undefined} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--line)" }}>
          <div className="grid items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
            style={{ background: "var(--surface-2)", color: "var(--ink-3)", gridTemplateColumns: isTeam ? "1fr 120px 90px 90px 140px" : "1fr 90px 90px 140px" }}>
            <span>Task</span>{isTeam && <span>Assignee</span>}<span>Priority</span><span>Due</span><span>Status</span>
          </div>
          {tasks.length === 0 ? (
            <p className="text-[13px] text-center py-8" style={{ color: "var(--ink-3)" }}>No tasks yet.</p>
          ) : tasks.map((t) => (
            <div key={t.id} className="border-t" style={{ borderColor: "var(--line)" }}>
              <div className="grid items-center gap-2 px-3 py-2.5" style={{ gridTemplateColumns: isTeam ? "1fr 120px 90px 90px 140px" : "1fr 90px 90px 140px" }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PRIORITY_COLOR[t.priority] }} />
                    <span className="text-[13px] font-medium truncate" style={{ color: "var(--ink)" }}>{t.title}</span>
                    {t.achievement_id && <BadgeCheck size={12} style={{ color: "var(--accent-text)" }} />}
                  </div>
                </div>
                {isTeam && <span className="text-[12px] truncate" style={{ color: "var(--ink-2)" }}>{nameById[t.assignee_id ?? ""] ?? "—"}</span>}
                <span className="text-[12px] capitalize" style={{ color: PRIORITY_COLOR[t.priority] }}>{t.priority}</span>
                <span className="text-[12px]" style={{ color: isOverdue(t.due_date, t.status) ? "var(--danger-fg)" : "var(--ink-3)" }}>{fmtDate(t.due_date) ?? "—"}</span>
                <TaskActions t={t} h={handlers} />
              </div>
              {openReview === t.id && (
                <div className="px-3 pb-3"><AiSubtaskReview parentTaskId={t.id} userId={userId} onApproved={handlers.onApproved} /></div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* project creation modal */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "color-mix(in srgb, var(--ink) 45%, transparent)", backdropFilter: "blur(2px)" }}
          onClick={() => !projectBusy && setShowProjectModal(false)}>
          <div className="w-full max-w-md rounded-2xl border shadow-2xl cairn-pop" style={{ background: "var(--surface)", borderColor: "var(--line)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}>
              <KanbanSquare size={18} style={{ color: "var(--accent)" }} />
              <h4 className="font-semibold">New project</h4>
              <button onClick={() => setShowProjectModal(false)} className="ml-auto w-7 h-7 grid place-items-center rounded-md" style={{ color: "var(--ink-3)" }}><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[12px] font-medium" style={{ color: "var(--ink-2)" }}>Project name</label>
                <input value={projectDraft.name} onChange={(e) => setProjectDraft({ ...projectDraft, name: e.target.value })}
                  placeholder="e.g. Q3 Onboarding Revamp" autoFocus
                  className="w-full mt-1 px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }} />
              </div>
              <div>
                <label className="text-[12px] font-medium" style={{ color: "var(--ink-2)" }}>What is the focus / goal?</label>
                <textarea value={projectDraft.focus} onChange={(e) => setProjectDraft({ ...projectDraft, focus: e.target.value })}
                  placeholder="What outcome does this project drive? Who is it for, and what does success look like?" rows={3}
                  className="w-full mt-1 px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                  style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-medium inline-flex items-center gap-1" style={{ color: "var(--ink-2)" }}><CalendarDays size={12} /> Start date</label>
                  <input type="date" value={projectDraft.startDate} onChange={(e) => setProjectDraft({ ...projectDraft, startDate: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }} />
                </div>
                <div>
                  <label className="text-[12px] font-medium inline-flex items-center gap-1" style={{ color: "var(--ink-2)" }}><Target size={12} /> Target date</label>
                  <input type="date" value={projectDraft.targetDate} onChange={(e) => setProjectDraft({ ...projectDraft, targetDate: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: "var(--line)" }}>
              <button onClick={() => setShowProjectModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>Cancel</button>
              <button onClick={submitProject} disabled={!projectDraft.name.trim() || projectBusy}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white inline-flex items-center gap-1.5 transition active:scale-[0.98] disabled:opacity-40"
                style={{ background: "var(--accent)" }}>
                {projectBusy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
