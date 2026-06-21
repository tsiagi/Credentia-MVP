"use client";
// components/ui/Toast.tsx
// ─────────────────────────────────────────────────────────────
// Toast system: <ToastProvider> + useToast(). Top-right, slide-in,
// 4s auto-dismiss. Replaces every browser alert() per CLAUDE.md.
// Presentation only.
//
//   const toast = useToast();
//   toast.success("Saved");  toast.error("Failed");  toast.info("…");
// ─────────────────────────────────────────────────────────────
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "./cn";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: React.ReactNode;
}

interface ToastApi {
  show: (message: React.ReactNode, tone?: ToastTone) => void;
  success: (message: React.ReactNode) => void;
  error: (message: React.ReactNode) => void;
  info: (message: React.ReactNode) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE: Record<ToastTone, { fg: string; bg: string; icon: React.ReactNode }> = {
  success: { fg: "var(--olive-600)",  bg: "var(--olive-100)",  icon: <CheckCircle2 size={16} /> },
  error:   { fg: "var(--danger-fg)",  bg: "var(--danger-bg)",  icon: <AlertCircle size={16} /> },
  info:    { fg: "var(--accent-text)", bg: "var(--accent-soft)", icon: <Info size={16} /> },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: React.ReactNode, tone: ToastTone = "info") => {
      const id = ++seq.current;
      setItems((prev) => [...prev, { id, tone, message }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, "success"),
      error: (m) => show(m, "error"),
      info: (m) => show(m, "info"),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="fixed top-4 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2" role="region" aria-label="Notifications">
            {items.map((t) => {
              const tone = TONE[t.tone];
              return (
                <div
                  key={t.id}
                  role="status"
                  className={cn(
                    "cairn-toast-in flex items-start gap-2.5 rounded-[var(--radius-md)] border px-3.5 py-3",
                  )}
                  style={{ background: "var(--surface)", borderColor: "var(--line)", boxShadow: "var(--shadow-lg)" }}
                >
                  <span className="mt-px shrink-0" style={{ color: tone.fg }} aria-hidden>
                    {tone.icon}
                  </span>
                  <div className="min-w-0 flex-1 text-[13px]" style={{ color: "var(--ink)" }}>
                    {t.message}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss notification"
                    className="-mr-1 -mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--ink-3)" }}
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a <ToastProvider>");
  return ctx;
}
