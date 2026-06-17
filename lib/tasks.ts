// lib/tasks.ts
// ─────────────────────────────────────────────────────────────
// Smart Task Delegation & Categorization.
//
//  • Managers/leaders delegate natural-language tasks to a direct report,
//    categorised by a mandatory Strategic Pillar.
//  • Employees see today's tasks, toggle status, and must give a blocker
//    note for Partial / Not Complete (enforced here AND by a DB CHECK).
//  • Employees self-report ad-hoc tasks under the same pillars.
//
// BRIDGE to the verified layer (confirmed design): when a manager promotes a
// completed task, we insert an L2 Manager-Verified achievement and link it.
// Tasks are operational; achievements stay the attested record. The two layers
// never merge — this only copies a manager-attested summary across the boundary.
//
// All reads/writes go through the browser client + RLS (lib/supabase.ts).
// ─────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";
import { displayName, type ProfileLite } from "@/lib/workforce";

export type TaskStatus = "assigned" | "complete" | "partial" | "incomplete";
export type TaskSource = "delegated" | "self_reported";

export type StrategicPillar = {
  id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
  active: boolean;
};

export type TaskRow = {
  id: string;
  org_id: string | null;
  employee_id: string;
  assigned_by: string | null;
  pillar_id: string;
  pillarName?: string;
  who?: string;
  title: string;
  detail: string | null;
  source: TaskSource;
  task_date: string;
  status: TaskStatus;
  blocker_note: string | null;
  completed_at: string | null;
  achievement_id: string | null;
};

const TASK_SELECT =
  "id, org_id, employee_id, assigned_by, pillar_id, title, detail, source, task_date, status, blocker_note, completed_at, achievement_id";

/** A blocker note is mandatory for partial / incomplete (UI + DB both enforce). */
export function blockerRequired(status: TaskStatus): boolean {
  return status === "partial" || status === "incomplete";
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Strategic Pillars (admin-configurable dropdown source) ────────
export async function fetchPillars(orgId: string): Promise<StrategicPillar[]> {
  const { data, error } = await supabase
    .from("strategic_pillars")
    .select("id, name, sort_order, is_default, active")
    .eq("org_id", orgId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as StrategicPillar[];
}

// ── Reads ─────────────────────────────────────────────────────────
function attachPillarNames(rows: TaskRow[], pillars: StrategicPillar[]): TaskRow[] {
  const byId = Object.fromEntries(pillars.map((p) => [p.id, p.name]));
  return rows.map((r) => ({ ...r, pillarName: byId[r.pillar_id] }));
}

/** An employee's tasks for a given day (defaults to today). */
export async function fetchAssignedTasks(employeeId: string, date = todayLocal()): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("employee_id", employeeId)
    .eq("task_date", date)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TaskRow[];
}

/** A manager's view of tasks they delegated to their reports (most recent first). */
export async function fetchDelegatedTasks(managerId: string): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("assigned_by", managerId)
    .order("task_date", { ascending: false });

  if (error) throw error;
  return (data ?? []) as TaskRow[];
}

/** Convenience: tasks for the day with pillar names + reporter names resolved. */
export async function fetchEmployeeBoard(
  employeeId: string,
  orgId: string,
  date = todayLocal(),
): Promise<TaskRow[]> {
  const [tasks, pillars] = await Promise.all([fetchAssignedTasks(employeeId, date), fetchPillars(orgId)]);
  return attachPillarNames(tasks, pillars);
}

// ── Writes ────────────────────────────────────────────────────────
/** Manager/leader delegates a task to a direct report. */
export async function delegateTask(
  managerId: string,
  orgId: string | null,
  input: { employeeId: string; pillarId: string; title: string; detail?: string; taskDate?: string },
): Promise<TaskRow> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      org_id: orgId,
      employee_id: input.employeeId,
      assigned_by: managerId,
      pillar_id: input.pillarId,
      title: input.title.trim(),
      detail: input.detail?.trim() || null,
      source: "delegated",
      task_date: input.taskDate ?? todayLocal(),
      status: "assigned",
    })
    .select(TASK_SELECT)
    .single();

  if (error) throw error;

  await writeAuditLog({
    actorId: managerId,
    action: "task_delegated",
    targetTable: "tasks",
    targetId: data.id,
    changes: { employee_id: input.employeeId, pillar_id: input.pillarId },
  });

  return data as TaskRow;
}

/** Employee self-reports an ad-hoc task they handled (same pillars). */
export async function addSelfTask(
  employeeId: string,
  orgId: string | null,
  input: { pillarId: string; title: string; detail?: string; status?: TaskStatus; blockerNote?: string },
): Promise<TaskRow> {
  const status = input.status ?? "complete";
  if (blockerRequired(status) && !input.blockerNote?.trim()) {
    throw new Error("A blocker note is required for partial or incomplete tasks.");
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      org_id: orgId,
      employee_id: employeeId,
      assigned_by: null,
      pillar_id: input.pillarId,
      title: input.title.trim(),
      detail: input.detail?.trim() || null,
      source: "self_reported",
      task_date: todayLocal(),
      status,
      blocker_note: blockerRequired(status) ? input.blockerNote!.trim() : null,
      completed_at: status === "complete" ? new Date().toISOString() : null,
    })
    .select(TASK_SELECT)
    .single();

  if (error) throw error;

  await writeAuditLog({
    actorId: employeeId,
    action: "task_self_reported",
    targetTable: "tasks",
    targetId: data.id,
    changes: { pillar_id: input.pillarId, status },
  });

  return data as TaskRow;
}

/** Employee updates a task's status. Blocker note required for partial/incomplete. */
export async function updateTaskStatus(
  employeeId: string,
  taskId: string,
  status: TaskStatus,
  blockerNote?: string,
): Promise<TaskRow> {
  if (blockerRequired(status) && !blockerNote?.trim()) {
    throw new Error("Please describe the blockers or reasons that prevented completion.");
  }

  const { data, error } = await supabase
    .from("tasks")
    .update({
      status,
      blocker_note: blockerRequired(status) ? blockerNote!.trim() : null,
      completed_at: status === "complete" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .select(TASK_SELECT)
    .single();

  if (error) throw error;

  await writeAuditLog({
    actorId: employeeId,
    action: "task_status_updated",
    targetTable: "tasks",
    targetId: taskId,
    changes: { status, hasBlocker: blockerRequired(status) },
  });

  return data as TaskRow;
}

/**
 * BRIDGE — a manager promotes a completed task into an L2 Manager-Verified
 * achievement and links it back. Relies on the "ach: manager insert verified"
 * RLS policy (manager-of, submitted_by self, L2, not pending_executive).
 * No-op if the task isn't complete or was already promoted.
 */
export async function promoteTaskToAchievement(managerId: string, task: TaskRow): Promise<string> {
  if (task.status !== "complete") throw new Error("Only completed tasks can be verified as achievements.");
  if (task.achievement_id) return task.achievement_id;

  const description = task.detail ? `${task.title}: ${task.detail}` : task.title;

  const { data: ach, error: achErr } = await supabase
    .from("achievements")
    .insert({
      profile_id: task.employee_id,
      org_id: task.org_id,
      kind: "achievement",
      description,
      achievement_date: task.completed_at ? task.completed_at.slice(0, 10) : task.task_date,
      verification_level: 2, // Manager Verified
      submitted_by: managerId,
      pending_executive: false,
    })
    .select("id")
    .single();

  if (achErr) throw achErr;

  const { error: linkErr } = await supabase
    .from("tasks")
    .update({ achievement_id: ach.id, updated_at: new Date().toISOString() })
    .eq("id", task.id);
  if (linkErr) throw linkErr;

  await writeAuditLog({
    actorId: managerId,
    action: "task_promoted_to_achievement",
    targetTable: "tasks",
    targetId: task.id,
    changes: { achievement_id: ach.id, profile_id: task.employee_id, verification_level: 2 },
  });

  return ach.id as string;
}

/** Resolve display names for an assignee dropdown (reuses workforce helpers). */
export function reportLabel(p: ProfileLite): { id: string; label: string } {
  return { id: p.id, label: displayName(p) };
}
