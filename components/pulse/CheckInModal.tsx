"use client";
// components/pulse/CheckInModal.tsx
// Morning check-in: "How are you feeling today?" — shown on first login of the day.
import React, { useState } from "react";
import { Sun, X } from "lucide-react";
import { MoodPicker } from "./MoodPicker";
import { saveCheckIn, type PulseMood } from "@/lib/pulse";

export function CheckInModal({
  userId, orgId, onDone, onDismiss,
}: { userId: string; orgId: string | null; onDone: () => void; onDismiss?: () => void }) {
  const [mood, setMood] = useState<PulseMood | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (mood == null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveCheckIn(userId, orgId, mood, note);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your check-in.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(2,6,23,0.45)", backdropFilter: "blur(4px)" }}>
      <div className="core-roborate-pop w-full max-w-md rounded-2xl border p-6"
        style={{ background: "var(--surface)", borderColor: "var(--line)", boxShadow: "var(--shadow-lg)" }}>
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-xl" style={{ background: "var(--accent-soft)" }}>
            <Sun size={20} style={{ color: "var(--accent)" }} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">How are you feeling today?</h3>
            <p className="text-[13px] opacity-60 mt-0.5">A quick daily check-in. Your individual response is private.</p>
          </div>
          {onDismiss && (
            <button onClick={onDismiss} aria-label="Dismiss" className="p-1 rounded-lg hover:bg-[var(--surface-2)]">
              <X size={18} style={{ color: "var(--ink-3)" }} />
            </button>
          )}
        </div>

        <MoodPicker value={mood} onChange={setMood} />

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything on your mind? (optional)"
          rows={2}
          className="mt-4 w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none"
          style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }}
        />

        {error && <p className="text-[13px] mt-3 px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}

        <button
          onClick={submit}
          disabled={mood == null || busy}
          className="mt-4 w-full py-2.5 rounded-xl text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
          style={{ background: "var(--accent)" }}
        >
          {busy ? "Saving…" : "Start my day"}
        </button>
      </div>
    </div>
  );
}
