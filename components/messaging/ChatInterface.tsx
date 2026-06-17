"use client";
// components/messaging/ChatInterface.tsx
// ─────────────────────────────────────────────────────────────
// Unified messaging — direct (user↔user) and task threads in one panel.
//
// The defining control: a per-message "Save to Agent Memory" vs "Off the
// Record" toggle. When a thread is in "learning" mode (or a message is saved)
// the UI shows a clear sparkle indicator — the user always knows when the
// system is allowed to learn from what they write. Off-the-record messages are
// never eligible for the Digital-Twin.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  MessageSquare, Send, Sparkles, EyeOff, Plus, Hash, Loader2,
} from "lucide-react";
import {
  fetchConversations, fetchMessages, sendMessage, createConversation, setThreadMemoryDefault,
  type Conversation, type Message,
} from "@/lib/messaging";

type Peer = { id: string; name: string };

export function ChatInterface({ userId, orgId }: { userId: string; orgId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [draft, setDraft] = useState("");
  const [saveToMemory, setSaveToMemory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingWith, setStartingWith] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [convs, peopleRes] = await Promise.all([
          fetchConversations(),
          supabase.from("profiles").select("id, full_name, title").eq("org_id", orgId).neq("id", userId),
        ]);
        if (cancelled) return;
        setConversations(convs);
        setPeers((peopleRes.data ?? []).map((p) => ({
          id: p.id as string,
          name: (p.full_name as string)?.trim() || (p.title as string)?.trim() || (p.id as string).slice(0, 8),
        })));
        if (convs.length) setActiveId(convs[0].id);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load conversations.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeId) { setMessages([]); return; }
      setSaveToMemory(active?.agent_memory_default ?? false);
      try {
        const rows = await fetchMessages(activeId);
        if (!cancelled) setMessages(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load messages.");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function send() {
    if (!draft.trim() || !activeId) return;
    setSending(true); setError(null);
    try {
      const msg = await sendMessage(userId, orgId, { conversationId: activeId, body: draft, saveToAgentMemory: saveToMemory });
      setMessages((prev) => [...prev, msg]);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the message.");
    } finally { setSending(false); }
  }

  async function startConversation() {
    if (!startingWith) return;
    setError(null);
    try {
      const peer = peers.find((p) => p.id === startingWith);
      const conv = await createConversation(userId, orgId, {
        kind: "direct", title: peer?.name, participantIds: [startingWith],
      });
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
      setStartingWith("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the conversation.");
    }
  }

  async function toggleThreadLearning() {
    if (!active) return;
    const next = !active.agent_memory_default;
    try {
      await setThreadMemoryDefault(userId, active.id, next);
      setConversations((prev) => prev.map((c) => (c.id === active.id ? { ...c, agent_memory_default: next } : c)));
      setSaveToMemory(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the thread.");
    }
  }

  return (
    <div className="border rounded-2xl overflow-hidden grid" style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "var(--shadow-sm)", gridTemplateColumns: "260px 1fr", minHeight: 460 }}>
      {/* conversation list */}
      <aside className="border-r flex flex-col" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
        <div className="p-3 border-b" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare size={16} style={{ color: "var(--accent)" }} />
            <span className="font-semibold text-[14px]">Messages</span>
          </div>
          <div className="flex items-center gap-1">
            <select value={startingWith} onChange={(e) => setStartingWith(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg border text-[12px] outline-none"
              style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}>
              <option value="">Start chat with…</option>
              {peers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={startConversation} disabled={!startingWith}
              className="w-8 h-8 grid place-items-center rounded-lg transition active:scale-[0.98] disabled:opacity-40"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Plus size={15} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            [0, 1, 2].map((i) => <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "var(--surface)" }} />)
          ) : conversations.length === 0 ? (
            <p className="text-[12px] text-center py-6" style={{ color: "var(--ink-3)" }}>No conversations yet.</p>
          ) : conversations.map((c) => (
            <button key={c.id} onClick={() => setActiveId(c.id)}
              className="w-full text-left px-3 py-2 rounded-lg transition"
              style={{ background: c.id === activeId ? "var(--surface)" : "transparent" }}>
              <div className="flex items-center gap-1.5">
                {c.kind === "task" ? <Hash size={13} style={{ color: "var(--ink-3)" }} /> : <MessageSquare size={13} style={{ color: "var(--ink-3)" }} />}
                <span className="text-[13px] font-medium truncate" style={{ color: "var(--ink)" }}>{c.title ?? (c.kind === "task" ? "Task thread" : "Direct message")}</span>
                {c.agent_memory_default && <Sparkles size={12} className="ml-auto" style={{ color: "var(--inferred-fg)" }} />}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* thread */}
      <section className="flex flex-col min-w-0">
        {active ? (
          <>
            <header className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--line)" }}>
              <span className="font-semibold text-[14px]" style={{ color: "var(--ink)" }}>
                {active.title ?? (active.kind === "task" ? "Task thread" : "Direct message")}
              </span>
              <button onClick={toggleThreadLearning}
                className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition active:scale-[0.98]"
                style={active.agent_memory_default
                  ? { background: "var(--inferred-bg)", color: "var(--inferred-fg)" }
                  : { background: "var(--surface-2)", color: "var(--ink-3)" }}>
                {active.agent_memory_default ? <><Sparkles size={12} /> Learning on</> : <><EyeOff size={12} /> Off the record</>}
              </button>
            </header>

            {active.agent_memory_default && (
              <div className="px-4 py-1.5 text-[11px] flex items-center gap-1.5" style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}>
                <Sparkles size={11} /> This thread is being learned by your Digital Twin. New messages default to saved.
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map((m) => {
                const mine = m.sender_id === userId;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[78%] rounded-2xl px-3 py-2"
                      style={{
                        background: mine ? "var(--accent-soft)" : "var(--surface-2)",
                        color: "var(--ink)",
                        border: m.save_to_agent_memory ? "1px solid var(--inferred-fg)" : "1px solid transparent",
                      }}>
                      <p className="text-[13px] whitespace-pre-wrap">{m.body}</p>
                      <div className="flex items-center gap-1 mt-0.5 justify-end">
                        {m.save_to_agent_memory
                          ? <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--inferred-fg)" }}><Sparkles size={9} /> saved</span>
                          : <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--ink-3)" }}><EyeOff size={9} /> off record</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            {error && <p className="text-[12px] px-4 py-1.5" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}

            <div className="p-3 border-t" style={{ borderColor: "var(--line)" }}>
              {/* the explicit per-message memory toggle */}
              <button onClick={() => setSaveToMemory((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium mb-2 transition active:scale-[0.98]"
                style={saveToMemory
                  ? { background: "var(--inferred-bg)", color: "var(--inferred-fg)" }
                  : { background: "var(--surface-2)", color: "var(--ink-3)" }}>
                {saveToMemory ? <><Sparkles size={12} /> Save to Agent Memory</> : <><EyeOff size={12} /> Off the Record</>}
              </button>
              <div className="flex items-end gap-2">
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Write a message…" rows={1}
                  className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none resize-none"
                  style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }} />
                <button onClick={send} disabled={!draft.trim() || sending}
                  className="w-10 h-10 grid place-items-center rounded-xl text-white transition active:scale-[0.98] disabled:opacity-40"
                  style={{ background: "var(--accent)" }}>
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-center p-6">
            <div>
              <MessageSquare size={28} style={{ color: "var(--ink-3)" }} className="mx-auto mb-2" />
              <p className="font-medium">Select or start a conversation</p>
              <p className="text-[13px] opacity-60 mt-1">Direct messages and task threads live here.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
