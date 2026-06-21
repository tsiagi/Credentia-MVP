// components/messaging/MessageComposer.tsx
// ─────────────────────────────────────────────────────────────
// The thread composer (M1) with the per-message memory toggle preserved
// byte-for-byte in behavior (--inferred-* + Sparkles/EyeOff), plus throttled
// typing-broadcast emit (M6).
//
// Trust boundary: the "Save to Agent Memory" / "Off the Record" pill is the
// only trust affordance and stays amber + Sparkles / muted + EyeOff. Typing
// (M6) carries only a boolean — no content, no learning.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Send, Sparkles, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/components/ui";

const TYPING_THROTTLE_MS = 1500;
const TYPING_IDLE_MS = 2500;
/** Max textarea height before it scrolls instead of growing (~6 lines). */
const COMPOSER_MAX_HEIGHT = 140;

export function MessageComposer({
  draft,
  saveToMemory,
  sending,
  onDraftChange,
  onToggleMemory,
  onSend,
  onTyping,
}: {
  draft: string;
  saveToMemory: boolean;
  sending: boolean;
  onDraftChange: (value: string) => void;
  onToggleMemory: () => void;
  onSend: () => void;
  /** Optional typing emitter (M6). Throttled here; cleared on send/idle. */
  onTyping?: (typing: boolean) => void;
}) {
  const lastEmit = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  // Auto-grow: reset to scrollHeight (capped), then scroll past the cap.
  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_HEIGHT ? "auto" : "hidden";
  }, []);

  // Re-measure whenever the draft changes (incl. external resets after send).
  useLayoutEffect(() => {
    autoGrow();
  }, [draft, autoGrow]);

  function clearIdle() {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
  }

  function signalTyping() {
    if (!onTyping) return;
    const now = Date.now();
    if (now - lastEmit.current > TYPING_THROTTLE_MS) {
      lastEmit.current = now;
      onTyping(true);
    }
    clearIdle();
    idleTimer.current = setTimeout(() => onTyping?.(false), TYPING_IDLE_MS);
  }

  function stopTyping() {
    clearIdle();
    lastEmit.current = 0;
    onTyping?.(false);
  }

  return (
    <div className="p-3 border-t" style={{ borderColor: "var(--line)" }}>
      {/* the explicit per-message memory toggle — trust affordance */}
      <button
        type="button"
        onClick={onToggleMemory}
        aria-pressed={saveToMemory}
        className={cn(
          "mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
          "transition active:scale-[0.98]",
        )}
        style={
          saveToMemory
            ? { background: "var(--inferred-bg)", color: "var(--inferred-fg)" }
            : { background: "var(--surface-2)", color: "var(--ink-3)" }
        }
      >
        {saveToMemory ? (
          <>
            <Sparkles size={12} /> Save to Agent Memory
          </>
        ) : (
          <>
            <EyeOff size={12} /> Off the record
          </>
        )}
      </button>

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            onDraftChange(e.target.value);
            signalTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              stopTyping();
              onSend();
              // Keep focus in the composer after sending.
              textareaRef.current?.focus();
            }
          }}
          onBlur={stopTyping}
          placeholder="Write a message…"
          rows={1}
          aria-label="Message"
          className="flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{
            borderColor: "var(--line)",
            background: "var(--surface)",
            color: "var(--ink)",
            maxHeight: COMPOSER_MAX_HEIGHT,
          }}
        />
        <button
          type="button"
          onClick={() => {
            stopTyping();
            onSend();
            textareaRef.current?.focus();
          }}
          disabled={!draft.trim() || sending}
          aria-label="Send message"
          className="grid h-10 w-10 place-items-center rounded-xl text-white transition active:scale-[0.98] disabled:opacity-40"
          style={{ background: "var(--accent)" }}
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
