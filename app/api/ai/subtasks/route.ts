import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";
import { callAnthropicSubtasks, persistInferenceSubtasks, type ParentTask } from "@/lib/ai/subtasks";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

/**
 * POST /api/ai/subtasks  { taskId }
 * Evaluate a verified task and write AI-suggested sub-tasks to
 * ai_inference_tasks (amber, pending). The suggestions are NOT verified work —
 * a human must approve each one in the UI to promote it into verified_tasks.
 */
export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Authorization: Bearer <access_token> required" }, { status: 401 });
  }

  const userClient = getSupabaseAsUser(token);
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }
  const callerId = authData.user.id;

  // #5 — per-user rate limit (each call is an Anthropic generation).
  const rl = await checkRateLimit("ai-single", callerId);
  if (!rl.success) return tooManyRequests(rl);

  let body: { taskId?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  if (!body.taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  // Load the parent task THROUGH the caller's RLS — they may only break down a
  // task they can actually see (own / assigned / managed). The service role is
  // used afterwards only to write the amber suggestions.
  const { data: task, error: taskErr } = await userClient
    .from("verified_tasks")
    .select("id, org_id, project_id, title, detail, assignee_id")
    .eq("id", body.taskId)
    .single();
  if (taskErr || !task) {
    return NextResponse.json({ error: "Task not found or not accessible" }, { status: 404 });
  }

  try {
    getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfigured" }, { status: 503 });
  }

  try {
    const suggestions = await callAnthropicSubtasks(task as ParentTask);
    const { count, ids } = await persistInferenceSubtasks(task as ParentTask, suggestions, callerId);
    return NextResponse.json({
      taskId: task.id,
      count,
      ids,
      status: "pending_review",
      disclaimer:
        "AI INFERENCE — these sub-tasks are suggestions. Approve each one to add it to the verified task list.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sub-task generation failed" },
      { status: 500 },
    );
  }
}
