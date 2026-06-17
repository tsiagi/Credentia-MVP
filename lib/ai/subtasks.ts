// lib/ai/subtasks.ts
// ─────────────────────────────────────────────────────────────
// AI Task Evaluation — break a verified task into suggested sub-tasks.
//
// The model receives ONE verified task (title + detail) and proposes an
// ordered breakdown. Everything it returns is AI INFERENCE: it is written to
// ai_inference_tasks (amber, `pending`) by the service role only, and stays
// advisory until a human approves each suggestion (which promotes it into
// verified_tasks). The model never writes a verified fact.
//
// Mirrors lib/ai/reports.ts (prompt + fetch + service-role persist).
// ─────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const SUBTASK_MODEL = "claude-sonnet-4-20250514";
const MAX_SUBTASKS = 8;

export type ParentTask = {
  id: string;
  org_id: string;
  project_id: string | null;
  title: string;
  detail: string | null;
  assignee_id: string | null;
};

export type SuggestedSubtask = {
  title: string;
  detail: string;
  rationale: string;
  confidence: number;
};

export const SUBTASK_SYSTEM_PROMPT = `You are Credentia's internal task-planning model.

STRICT RULES (never break these):
1. Output is AI INFERENCE / decision SUPPORT only. A human must approve every
   sub-task before it becomes real work — you are suggesting, not deciding.
2. Break the ONE task provided into a short, ordered list of concrete sub-tasks.
3. Be specific and actionable; do not invent facts, people, deadlines, or
   metrics that aren't implied by the task.
4. Each sub-task needs a one-line rationale (why it's a step) and a confidence
   0.0-1.0.
5. Respond with valid JSON only — no markdown, no prose outside the JSON object.

JSON shape:
{
  "subtasks": [
    { "title": "string (imperative, <=80 chars)", "detail": "string", "rationale": "string", "confidence": 0.0-1.0 }
  ]
}

Return at most ${MAX_SUBTASKS} sub-tasks, ordered by execution sequence.`;

function buildUserPrompt(task: ParentTask): string {
  return `Task to break down:
Title: ${task.title}
Detail: ${task.detail ?? "(none provided)"}

Generate the sub-task breakdown JSON.`;
}

function parseSubtasks(text: string): SuggestedSubtask[] {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as { subtasks?: SuggestedSubtask[] };
  return (parsed.subtasks ?? []).slice(0, MAX_SUBTASKS);
}

export async function callAnthropicSubtasks(task: ParentTask): Promise<SuggestedSubtask[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: SUBTASK_MODEL,
      max_tokens: 1500,
      system: SUBTASK_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(task) }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  const text = json.content?.find((b: { type: string }) => b.type === "text")?.text;
  if (!text) throw new Error("Empty AI response");
  return parseSubtasks(text);
}

/** Persist suggestions to ai_inference_tasks (amber, pending). Service role only. */
export async function persistInferenceSubtasks(
  task: ParentTask,
  subtasks: SuggestedSubtask[],
  generatedBy: string,
): Promise<{ count: number; ids: string[] }> {
  const admin = getSupabaseAdmin();

  // Replace any prior *pending* suggestions for this task so re-runs don't pile up.
  await admin.from("ai_inference_tasks").delete().eq("parent_task_id", task.id).eq("status", "pending");

  const ids: string[] = [];
  let sequence = 0;
  for (const s of subtasks) {
    const { data, error } = await admin
      .from("ai_inference_tasks")
      .insert({
        org_id: task.org_id,
        project_id: task.project_id,
        parent_task_id: task.id,
        suggested_for: task.assignee_id,
        title: s.title.slice(0, 200),
        detail: s.detail ?? null,
        rationale: s.rationale ?? null,
        sequence: sequence++,
        confidence: Math.min(1, Math.max(0, s.confidence ?? 0.6)),
        model: SUBTASK_MODEL,
        status: "pending",
        generated_by: generatedBy,
      })
      .select("id")
      .single();
    if (error) throw error;
    ids.push(data.id as string);
  }

  await admin.from("audit_log").insert({
    actor_id: generatedBy,
    action: "ai_subtasks_generated",
    target_table: "verified_tasks",
    target_id: task.id,
    changes: { count: ids.length, model: SUBTASK_MODEL, status: "pending_review" },
  });

  return { count: ids.length, ids };
}
