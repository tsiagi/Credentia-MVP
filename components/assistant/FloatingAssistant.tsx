"use client";
// components/assistant/FloatingAssistant.tsx
// ─────────────────────────────────────────────────────────────
// Bottom-right floating bubble that toggles between Messages and the user's
// Cred-Bot. Expandable. Full Cred-Bot SETUP lives in Settings — here we show a
// compact status + a peek at what it has learned (verified facts, blue), with a
// shortcut to configure. Its outputs remain AI estimates (amber).
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import {
  MessageSquare, Bot, X, Maximize2, Minimize2, Sparkles, ShieldCheck, Settings as SettingsIcon, GraduationCap,
} from "lucide-react";
import { ChatInterface } from "@/components/messaging/ChatInterface";
import { fetchMyAgent, fetchAgentMemory, MEMORY_SOURCE_LABEL, type UserAgent, type AgentMemoryItem } from "@/lib/agents";

type Mode = "messages" | "bot";

export function FloatingAssistant({
  userId, orgId, userName, onConfigureBot,
}: {
  userId: string;
  orgId: string;
  userName?: string;
  onConfigureBot: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<Mode>("messages");
  const firstName = (userName ?? "").trim().split(/\s+/)[0] || "My";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open messages and Cred-Bot"
        className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full grid place-items-center text-white shadow-lg transition active:scale-95 cairn-lift"
        style={{ background: "var(--accent)" }}
      >
        <MessageSquare size={22} />
        <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full grid place-items-center"
          style={{ background: "var(--inferred-fg)" }}>
          <Bot size={12} color="#fff" />
        </span>
      </button>
    );
  }

  const width = expanded ? "min(720px, calc(100vw - 2.5rem))" : "min(420px, calc(100vw - 2.5rem))";
  const height = expanded ? "min(80vh, 760px)" : "min(560px, calc(100vh - 7rem))";

  return (
    <div
      className="fixed bottom-5 right-5 z-40 rounded-2xl border shadow-2xl flex flex-col overflow-hidden cairn-pop"
      style={{ width, height, background: "var(--surface)", borderColor: "var(--line)" }}
    >
      {/* header: mode toggle + window controls */}
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
        <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: "var(--surface)" }}>
          <button onClick={() => setMode("messages")}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition"
            style={mode === "messages" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--ink-2)" }}>
            <MessageSquare size={13} /> Messages
          </button>
          <button onClick={() => setMode("bot")}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition"
            style={mode === "bot" ? { background: "var(--inferred-fg)", color: "#fff" } : { color: "var(--ink-2)" }}>
            <Bot size={13} /> Cred-Bot
          </button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setExpanded((v) => !v)} title={expanded ? "Shrink" : "Expand"}
            className="w-7 h-7 grid place-items-center rounded-md transition" style={{ color: "var(--ink-3)" }}>
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button onClick={() => setOpen(false)} title="Close"
            className="w-7 h-7 grid place-items-center rounded-md transition" style={{ color: "var(--ink-3)" }}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {mode === "messages" ? (
          <div className="h-full overflow-auto p-2">
            <ChatInterface userId={userId} orgId={orgId} />
          </div>
        ) : (
          <CredBotPanel
            userId={userId}
            firstName={firstName}
            onConfigureBot={() => { setOpen(false); onConfigureBot(); }}
          />
        )}
      </div>
    </div>
  );
}

function CredBotPanel({
  userId, firstName, onConfigureBot,
}: { userId: string; firstName: string; onConfigureBot: () => void }) {
  const [agent, setAgent] = useState<UserAgent | null>(null);
  const [memory, setMemory] = useState<AgentMemoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await fetchMyAgent(userId);
        if (cancelled) return;
        setAgent(a);
        if (a) setMemory(await fetchAgentMemory(userId));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: "var(--inferred-bg)" }}>
          <Bot size={18} style={{ color: "var(--inferred-fg)" }} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-[14px]" style={{ color: "var(--ink)" }}>{firstName}&apos;s Cred-Bot</p>
          <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
            {loading ? "Loading…" : agent ? (agent.enabled ? "Active · learning from verified work" : "Disabled") : "Not set up yet"}
          </p>
        </div>
      </div>

      {!loading && !agent && (
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
          <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
            Set up your Cred-Bot to let it learn from your verified tasks, docs, and saved messages.
          </p>
        </div>
      )}

      {agent && (
        <>
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--verified-fg)", background: "var(--surface)" }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <ShieldCheck size={13} style={{ color: "var(--verified-fg)" }} />
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--verified-fg)" }}>
                Knows {memory.length} verified fact{memory.length === 1 ? "" : "s"}
              </span>
            </div>
            {memory.length === 0 ? (
              <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>Nothing learned yet — train it in Settings.</p>
            ) : (
              <div className="space-y-1.5">
                {memory.slice(0, 3).map((m) => (
                  <div key={m.id} className="rounded-lg border p-2" style={{ borderColor: "var(--line)", background: "var(--verified-bg)" }}>
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--verified-fg)" }}>{MEMORY_SOURCE_LABEL[m.source_type]}</span>
                    <p className="text-[12px] line-clamp-2" style={{ color: "var(--ink-2)" }}>{m.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border p-3" style={{ borderColor: "var(--inferred-fg)", background: "var(--inferred-bg)" }}>
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} style={{ color: "var(--inferred-fg)" }} />
              <span className="text-[11px] font-semibold" style={{ color: "var(--inferred-fg)" }}>AI ESTIMATE</span>
            </div>
            <p className="text-[12px] mt-1" style={{ color: "var(--ink-2)" }}>
              Anything your Cred-Bot drafts or suggests is advisory — you approve before it becomes verified work.
            </p>
          </div>
        </>
      )}

      <button onClick={onConfigureBot}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium text-white transition active:scale-[0.98]"
        style={{ background: "var(--accent)" }}>
        {agent ? <GraduationCap size={14} /> : <SettingsIcon size={14} />} {agent ? "Train & configure in Settings" : "Set up in Settings"}
      </button>
    </div>
  );
}
