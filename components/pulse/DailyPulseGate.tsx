"use client";
// components/pulse/DailyPulseGate.tsx
// ─────────────────────────────────────────────────────────────
// Orchestrates the daily pulse:
//   • On first login of the day (no check-in row yet) → CheckInModal.
//   • Once checked in but not checked out → a floating "End my day" button
//     that opens CheckOutModal (also the natural place to hook sign-out).
// Drop <DailyPulseGate userId={...} orgId={...} /> into the authenticated shell.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { Moon } from "lucide-react";
import { CheckInModal } from "./CheckInModal";
import { CheckOutModal } from "./CheckOutModal";
import { fetchTodayPulse } from "@/lib/pulse";

type Stage = "loading" | "checkin" | "day" | "checkout" | "done";

export function DailyPulseGate({ userId, orgId }: { userId: string; orgId: string | null }) {
  const [stage, setStage] = useState<Stage>("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await fetchTodayPulse(userId);
        if (cancelled) return;
        if (!row || row.checkin_mood == null) setStage("checkin");
        else if (row.checkout_sentiment == null) setStage("day");
        else setStage("done");
      } catch {
        if (!cancelled) setStage("done"); // never block the app on a pulse error
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (stage === "checkin") {
    return (
      <CheckInModal
        userId={userId}
        orgId={orgId}
        onDone={() => setStage("day")}
        onDismiss={() => setStage("day")}
      />
    );
  }

  if (stage === "checkout") {
    return (
      <CheckOutModal
        userId={userId}
        orgId={orgId}
        onDone={() => setStage("done")}
        onDismiss={() => setStage("day")}
      />
    );
  }

  if (stage === "day") {
    return (
      <button
        onClick={() => setStage("checkout")}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-medium border shadow-lg transition active:scale-[0.97] hover:bg-[var(--surface-2)]"
        style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--ink)" }}
      >
        <Moon size={15} style={{ color: "var(--inferred-fg)" }} /> End my day
      </button>
    );
  }

  return null;
}
