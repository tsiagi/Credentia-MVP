"use client";
// components/pulse/CheckOutModal.tsx
// End-of-day check-out: "How was your workday?" — triggered when ending the day / signing out.
import React, { useState } from "react";
import { Moon, X } from "lucide-react";
import { MoodPicker } from "./MoodPicker";
import { saveCheckOut, type PulseMood } from "@/lib/pulse";

export function CheckOutModal({
  userId, orgId, onDone, onDismiss,
}: { userId: string; orgId: string | null; onDone: () => void; onDismiss?: () => void }) {
  const [sentiment, setSentiment] = useState<PulseMood | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (sentiment == null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveCheckOut(userId, orgId, sentiment, note);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your check-out.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(2,6,23,0.45)", backdropFilter: "blur(4px)" }}>
      <div className="cairn-pop w-full max-w-md rounded-2xl border p-6"
        style={{ background: "var(--surface)", borderColor: "var(--line)", boxShadow: "var(--shadow-lg)" }}>
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-xl" style={{ background: "var(--inferred-bg)" }}>
            <Moon size={20} style={{ color: "var(--inferred-fg)" }} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">How was your workday?</h3>
            <p className="text-[13px] opacity-60 mt-0.5">A quick sign-off. Helps surface team trends — your individual entry stays private.</p>
          </div>
          {onDismiss && (
            <button onClick={onDismiss} aria-label="Dismiss" className="p-1 rounded-lg hover:bg-[var(--surface-2)]">
              <X size={18} style={{ color: "var(--ink-3)" }} />
            </button>
          )}
        </div>

        <MoodPicker value={sentiment} onChange={setSentiment} />

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What stood out today? (optional)"
          rows={2}
          className="mt-4 w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none"
          style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }}
        />

        {error && <p className="text-[13px] mt-3 px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}

        <button
          onClick={submit}
          disabled={sentiment == null || busy}
          className="mt-4 w-full py-2.5 rounded-xl text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
          style={{ background: "var(--inferred-fg)" }}
        >
          {busy ? "Saving…" : "End my day"}
        </button>
      </div>
    </div>
  );
}
