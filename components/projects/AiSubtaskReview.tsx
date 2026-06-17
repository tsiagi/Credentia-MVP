"use client";
// components/projects/AiSubtaskReview.tsx
// ─────────────────────────────────────────────────────────────
// The hard wall between AI suggestion and verified fact, made visible.
//
// Pending ai_inference_tasks render in AMBER with the sparkle icon — they are
// explicitly NOT verified work. Approving one calls the bridge
// (approveInferenceTask) which inserts a real verified_task (blue) and flips
// the suggestion to 'approved'. Rejecting leaves it in the amber table forever.
// Nothing here is ever presented as a fact until a human approves it.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { Sparkles, Check, X, ShieldCheck, Loader2 } from "lucide-react";
import { Reveal } from "@/components/ui/motion";
import {
  fetchInferenceSubtasks, approveInferenceTask, rejectInferenceTask,
  type InferenceTask, type VerifiedTask,
} from "@/lib/projects";

export function AiSubtaskReview({
  parentTaskId, userId, onApproved,
}: {
  parentTaskId: string;
  userId: string;
  onApproved?: (task: VerifiedTask) => void;
}) {
  const [items, setItems] = useState<InferenceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchInferenceSubtasks(parentTaskId);
        if (!cancelled) setItems(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load suggestions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [parentTaskId]);

  const pending = items.filter((i) => i.status === "pending");

  async function approve(inf: InferenceTask) {
    setBusy(inf.id); setError(null);
    try {
      const task = await approveInferenceTask(userId, inf);
      setItems((prev) => prev.map((i) => (i.id === inf.id ? { ...i, status: "approved", approved_task_id: task.id } : i)));
      onApproved?.(task);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve this suggestion.");
    } finally { setBusy(null); }
  }

  async function reject(inf: InferenceTask) {
    setBusy(inf.id); setError(null);
    try {
      await rejectInferenceTask(userId, inf.id);
      setItems((prev) => prev.map((i) => (i.id === inf.id ? { ...i, status: "rejected" } : i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reject this suggestion.");
    } finally { setBusy(null); }
  }

  if (loading) {
    return (
      <div className="mt-3 space-y-2">
        {[0, 1].map((i) => <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: "var(--surface-2)" }} />)}
      </div>
    );
  }

  if (!pending.length) {
    return (
      <p className="mt-3 text-[12px]" style={{ color: "var(--ink-3)" }}>
        No pending AI suggestions. Use “Break down with AI” to generate some.
      </p>
    );
  }

  return (
    <div
      className="mt-3 rounded-xl border p-3 cairn-pulse"
      style={{ borderColor: "var(--inferred-fg)", background: "var(--inferred-bg)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={14} style={{ color: "var(--inferred-fg)" }} />
        <span className="text-[12px] font-semibold tracking-wide" style={{ color: "var(--inferred-fg)" }}>
          AI ESTIMATE · {pending.length} suggested sub-task{pending.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto text-[11px]" style={{ color: "var(--inferred-fg)" }}>
          Approve to add as a verified task
        </span>
      </div>

      {error && (
        <p className="text-[12px] px-2 py-1 rounded mb-2" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>
      )}

      <div className="space-y-2">
        {pending.map((inf, idx) => (
          <Reveal
            key={inf.id} delay={idx * 50}
            className="rounded-lg border p-3 flex items-start gap-3"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          >
            <Sparkles size={14} className="mt-0.5 shrink-0" style={{ color: "var(--inferred-fg)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>{inf.title}</p>
              {inf.detail && <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-2)" }}>{inf.detail}</p>}
              {inf.rationale && (
                <p className="text-[11px] mt-1 italic" style={{ color: "var(--ink-3)" }}>Why: {inf.rationale}</p>
              )}
              {inf.confidence != null && (
                <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}>
                  confidence {Math.round(inf.confidence * 100)}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => approve(inf)} disabled={busy === inf.id}
                title="Approve → add as a verified task"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
                style={{ background: "var(--verified-fg)" }}
              >
                {busy === inf.id ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Approve
              </button>
              <button
                onClick={() => reject(inf)} disabled={busy === inf.id}
                title="Reject suggestion"
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition active:scale-[0.98] disabled:opacity-40"
                style={{ background: "var(--surface-2)", color: "var(--ink-3)" }}
              >
                <X size={14} />
              </button>
            </div>
          </Reveal>
        ))}
      </div>

      {items.some((i) => i.status === "approved") && (
        <p className="mt-2 text-[11px] inline-flex items-center gap-1" style={{ color: "var(--verified-fg)" }}>
          <Check size={12} /> Approved suggestions are now verified tasks on the board.
        </p>
      )}
    </div>
  );
}
