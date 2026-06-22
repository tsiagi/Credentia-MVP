"use client";
// components/messaging/ChatInterface.tsx
// ─────────────────────────────────────────────────────────────
// Unified messaging — direct (user↔user) and task threads in one panel.
//
// The defining control: a per-message "Save to Agent Memory" vs "Off the
// Record" toggle. When a thread is in "learning" mode (or a message is saved)
// the UI shows a clear sparkle indicator — the user always knows when the
// system is allowed to learn from what they write. Off-the-record messages are
// never eligible for the Scout.
//
// Batches wired here:
//   M1 — primitives + sender grouping + day dividers + skeleton/empty/toast.
//   M2 — live delivery via per-org-per-conversation Postgres-changes channel.
//   M3 — ephemeral presence dots (per-org presence channel).
//   M5 — online profile cards on peer names.
//   M6 — typing indicators (broadcast on the same conversation channel).
//
// Isolation: every Realtime channel is namespaced per org; every read stays
// org_id-scoped exactly as before. Presence/identity uses neutral tokens —
// never the verified/inferred trust language.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MessageSquare, Sparkles, EyeOff, Plus, ArrowDown, ShieldOff } from "lucide-react";
import {
  fetchConversationsWithMeta, fetchMessages, sendMessage, createConversation, setThreadMemoryDefault,
  subscribeToMessages, subscribeToTyping, subscribeToOrgMessages, markConversationRead,
  type ConversationWithMeta, type Message,
} from "@/lib/messaging";
import { setConversationEvidenceSuppressed } from "@/lib/verification/evidence";
import { joinOrgPresence } from "@/lib/presence";
import {
  Button, Skeleton, EmptyState, StatusPill, useToast, cn, prefersReducedMotion,
} from "@/components/ui";
import { buildMessageGroups } from "@/lib/messaging-format";
import { ConversationListItem } from "./ConversationListItem";
import { MessageGroup } from "./MessageGroup";
import { MessageComposer } from "./MessageComposer";
import { PeoplePicker } from "./PeoplePicker";
import { type Peer } from "./ProfileCard";

export function ChatInterface({ userId, orgId }: { userId: string; orgId: string }) {
  const toast = useToast();
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [draft, setDraft] = useState("");
  const [saveToMemory, setSaveToMemory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [typingPeers, setTypingPeers] = useState<Set<string>>(new Set());
  const [liveDown, setLiveDown] = useState(false);
  // Shows the "New messages" affordance when a message lands while the user is
  // scrolled away from the bottom (M7).
  const [showJump, setShowJump] = useState(false);
  // Bumped on a daily tick so open threads relabel "Today"/"Yesterday" dividers
  // correctly when they cross midnight (P2 — midnight-stale fix).
  const [dayTick, setDayTick] = useState(0);

  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typingApi = useRef<{ sendTyping: (t: boolean) => void; unsubscribe: () => void } | null>(null);
  // Debounce timer for the at-most-one reconnect toast after sustained failure.
  const liveDownToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror activeId into a ref so the org-wide messages subscription (bound once
  // per org) can tell whether an incoming message is for the open thread without
  // re-subscribing on every conversation switch.
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  // Stamp the viewer's read marker and optimistically zero the local unread.
  // Non-blocking: a failure surfaces a toast at most and never blocks the UI.
  const markRead = React.useCallback(
    (conversationId: string) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unread_count: 0, last_read_at: new Date().toISOString() } : c)),
      );
      markConversationRead(userId, conversationId).catch(() => {
        toast.info("Couldn't sync read status — it'll retry next time.");
      });
    },
    [userId, toast],
  );
  const peerById = useMemo(() => new Map(peers.map((p) => [p.id, p])), [peers]);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
    setShowJump(false);
  }, []);

  // ── Daily tick: relabel day dividers when an open thread crosses midnight ──
  // Schedule a single timeout to the next local midnight; on fire, bump dayTick
  // (which re-runs buildMessageGroups → fresh Today/Yesterday labels) and the
  // effect re-runs to schedule the following midnight.
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const t = setTimeout(() => setDayTick((n) => n + 1), nextMidnight.getTime() - now.getTime());
    return () => clearTimeout(t);
  }, [dayTick]);

  // ── Initial load: conversations + org-scoped peer directory ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [convs, peopleRes] = await Promise.all([
          fetchConversationsWithMeta(userId),
          // M5: extend the existing org_id-scoped peer select with avatar_url
          // (exists on profiles). NOTE: there is no `department` column on
          // profiles — department lives in the separate `departments` table,
          // reachable only via a join. Surfacing it would require either a
          // schema change or a new (wider) query path, both out of scope for
          // these no-migration batches. TODO(M5b): if product wants department
          // on the profile card, add a profiles.department column (migration)
          // or a security-definer view — route through enterprise-planner first.
          supabase
            .from("profiles")
            .select("id, full_name, title, avatar_url")
            .eq("org_id", orgId)
            .neq("id", userId),
        ]);
        if (cancelled) return;
        setConversations(convs);
        setPeers(
          (peopleRes.data ?? []).map((p) => ({
            id: p.id as string,
            name:
              (p.full_name as string)?.trim() ||
              (p.title as string)?.trim() ||
              (p.id as string).slice(0, 8),
            title: (p.title as string) ?? null,
            department: null, // not on profiles; see select note above
            avatarUrl: (p.avatar_url as string) ?? null,
          })),
        );
        if (convs.length) setActiveId(convs[0].id);
      } catch (e) {
        if (!cancelled) {
          const m = e instanceof Error ? e.message : "Could not load conversations.";
          setError(m);
          toast.error(m);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, userId, toast]);

  // ── M3: join the per-org presence channel (ephemeral) ──
  useEffect(() => {
    if (!orgId || !userId) return;
    const leave = joinOrgPresence(orgId, userId, (ids) => setOnlineIds(ids));
    return () => leave();
  }, [orgId, userId]);

  // ── M4: org-wide message INSERTs → keep list-level unread badges live ──
  // Bound once per org (RLS scopes delivery to the viewer's threads). For a
  // message in a NON-active conversation from someone else, bump that thread's
  // unread badge and float it to the top; messages in the ACTIVE thread (or
  // from the viewer) never accumulate unread — that's handled by the open-thread
  // subscription / send path above.
  useEffect(() => {
    if (!orgId || !userId) return;
    const unsub = subscribeToOrgMessages(orgId, (incoming) => {
      if (incoming.sender_id === userId) return;
      const isActive = incoming.conversation_id === activeIdRef.current;
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === incoming.conversation_id);
        if (idx === -1) return prev; // not in the viewer's list (RLS) — ignore
        const next = [...prev];
        const conv = next[idx];
        next[idx] = {
          ...conv,
          unread_count: isActive ? 0 : conv.unread_count + 1,
          updated_at: incoming.created_at,
        };
        // Re-sort so the freshly-active thread floats to the top, matching
        // fetchConversationsWithMeta's updated_at desc ordering.
        next.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));
        return next;
      });
    });
    return () => unsub();
  }, [orgId, userId]);

  // ── Active conversation: fetch history + M2 live subscription + M6 typing ──
  useEffect(() => {
    let cancelled = false;

    if (!activeId) {
      // Async-deferred so we don't setState synchronously in the effect body.
      queueMicrotask(() => { if (!cancelled) setMessages([]); });
      return () => { cancelled = true; };
    }

    // Opening a conversation marks it read (M4): zero its unread badge and
    // advance the viewer's read marker. Non-blocking by design. Deferred off the
    // effect body (like the messages reset above) to avoid cascading renders.
    queueMicrotask(() => { if (!cancelled) markRead(activeId); });

    (async () => {
      setSaveToMemory(active?.agent_memory_default ?? false);
      setMsgLoading(true);
      try {
        const rows = await fetchMessages(activeId);
        if (!cancelled) setMessages(rows);
      } catch (e) {
        if (!cancelled) {
          const m = e instanceof Error ? e.message : "Could not load messages.";
          setError(m);
          toast.error(m);
        }
      } finally {
        if (!cancelled) setMsgLoading(false);
      }
    })();

    // M2 — live message delivery (dedupe optimistic echo by id).
    const unsubMessages = subscribeToMessages(
      activeId,
      orgId,
      (incoming) => {
        setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
        // If the user is scrolled away from the bottom when someone else's
        // message lands, surface the "New messages" jump affordance (M7).
        if (incoming.sender_id !== userId && !isNearBottom()) setShowJump(true);
        // A message arriving in the OPEN thread is read immediately — keep its
        // badge at zero and advance the read marker (only for others' messages).
        if (incoming.sender_id && incoming.sender_id !== userId) markRead(activeId);
      },
      (status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // The persistent "Reconnecting" pill is the signal. Avoid stacking a
          // toast on every bounce — fire at most ONE, and only after sustained
          // failure (>8s), debounced so rapid bounces don't queue several.
          setLiveDown(true);
          if (!liveDownToastTimer.current) {
            liveDownToastTimer.current = setTimeout(() => {
              toast.info("Still reconnecting — live updates are paused.");
            }, 8000);
          }
        } else if (status === "SUBSCRIBED") {
          setLiveDown(false);
          if (liveDownToastTimer.current) {
            clearTimeout(liveDownToastTimer.current);
            liveDownToastTimer.current = null;
          }
        }
      },
    );

    // M6 — typing broadcast on the same conversation channel.
    const typing = subscribeToTyping(activeId, orgId, userId, ({ profile_id, typing: isTyping }) => {
      setTypingPeers((prev) => {
        const next = new Set(prev);
        if (isTyping) next.add(profile_id);
        else next.delete(profile_id);
        return next;
      });
    });
    typingApi.current = typing;

    return () => {
      cancelled = true;
      unsubMessages();
      typing.unsubscribe();
      typingApi.current = null;
      // Clear the pending reconnect toast so it can't fire for a thread the
      // user already left (and so it doesn't leak across switches).
      if (liveDownToastTimer.current) {
        clearTimeout(liveDownToastTimer.current);
        liveDownToastTimer.current = null;
      }
      // Clear ephemeral per-conversation UI state on switch/unmount. Running
      // these in cleanup (not the effect body) avoids cascading-render lint.
      setTypingPeers(new Set());
      setLiveDown(false);
      setShowJump(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, orgId, userId]);

  // ── Auto-scroll only when the user is near the bottom ──
  useEffect(() => {
    if (isNearBottom()) {
      endRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
      // Defer the state clear off the effect body (matches the deferred-setState
      // pattern used elsewhere here) to avoid the cascading-render lint.
      queueMicrotask(() => setShowJump(false));
    }
  }, [messages.length, isNearBottom]);

  // Hide the jump affordance once the user scrolls back near the bottom.
  function onThreadScroll() {
    if (showJump && isNearBottom()) setShowJump(false);
  }

  // Arrow-key navigation between conversation rows (M7). Moves focus among the
  // row <button>s; Enter/Space on a focused row selects it natively.
  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-conv-row]") ?? [],
    );
    if (rows.length === 0) return;
    e.preventDefault();
    const idx = rows.findIndex((r) => r === document.activeElement);
    const next =
      e.key === "ArrowDown"
        ? Math.min((idx < 0 ? -1 : idx) + 1, rows.length - 1)
        : Math.max((idx < 0 ? rows.length : idx) - 1, 0);
    rows[next]?.focus();
  }

  // dayTick is read so the divider labels recompute at midnight (P2): touching
  // it inside the body keeps it a genuine dependency (no unnecessary-dep lint).
  const groups = useMemo(() => {
    void dayTick;
    return buildMessageGroups(messages);
  }, [messages, dayTick]);

  async function send() {
    if (!draft.trim() || !activeId) return;
    setSending(true);
    setError(null);
    try {
      const msg = await sendMessage(userId, orgId, {
        conversationId: activeId,
        body: draft,
        saveToAgentMemory: saveToMemory,
      });
      // Optimistic append; the realtime echo is deduped by id.
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setDraft("");
    } catch (e) {
      const m = e instanceof Error ? e.message : "Could not send the message.";
      setError(m);
      toast.error(m);
    } finally {
      setSending(false);
    }
  }

  async function startConversation(withId: string) {
    if (!withId) return;
    setError(null);
    const peer = peerById.get(withId);
    try {
      const conv = await createConversation(userId, orgId, {
        kind: "direct",
        title: peer?.name,
        participantIds: [withId],
      });
      // New thread starts read with no unread (the creator just opened it).
      // Seed participant_ids with the peer so its presence dot resolves BY ID
      // immediately, matching fetchConversationsWithMeta's shape.
      setConversations((prev) => [
        { ...conv, last_read_at: new Date().toISOString(), unread_count: 0, participant_ids: [withId] },
        ...prev,
      ]);
      setActiveId(conv.id);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Could not start the conversation.";
      setError(m);
      toast.error(m);
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
      const m = e instanceof Error ? e.message : "Could not update the thread.";
      setError(m);
      toast.error(m);
    }
  }

  // VP-3 — flip the per-conversation "Exclude from verification evidence"
  // control. This is the VERIFICATION-EVIDENCE pipeline and is DELIBERATELY
  // SEPARATE from the memory ("Learning" / "Off the record") toggle above — the
  // two are never merged. Neutral privacy control: no trust (blue/amber) tokens.
  async function toggleEvidenceSuppressed() {
    if (!active) return;
    const next = !active.evidence_suppressed;
    try {
      await setConversationEvidenceSuppressed(active.id, next);
      setConversations((prev) => prev.map((c) => (c.id === active.id ? { ...c, evidence_suppressed: next } : c)));
    } catch (e) {
      const m = e instanceof Error ? e.message : "Could not update evidence settings.";
      setError(m);
      toast.error(m);
    }
  }

  // Resolve a sender id to a display name for group headers. A sender not in
  // the org directory is most likely someone who has left the workspace — show
  // a human fallback rather than a raw id fragment (P3).
  function senderName(id: string | null): string {
    if (!id) return "System";
    if (id === userId) return "You";
    return peerById.get(id)?.name ?? "Former colleague";
  }

  // Polite announcement for the most recent incoming (non-self) message, read
  // by screen readers via the live region below. Self-sent messages aren't
  // announced (the sender already knows). Typing is deliberately NOT announced.
  const lastIncoming = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.sender_id && m.sender_id !== userId) {
        return `${senderName(m.sender_id)}: ${m.body}`;
      }
      if (m.sender_id === userId) return null; // newest is self → nothing new to read
    }
    return null;
    // senderName is stable enough for this read; peers/messages drive it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, userId, peerById]);

  // Active direct peer (single counterparty) for presence-aware header card.
  const typingLabel = useMemo(() => {
    const names = [...typingPeers].map((id) => peerById.get(id)?.name ?? "Someone");
    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return "Several people are typing…";
  }, [typingPeers, peerById]);

  return (
    <div
      className="grid overflow-hidden rounded-2xl border animate-in fade-in duration-200"
      style={{
        borderColor: "var(--line)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
        gridTemplateColumns: "260px 1fr",
        minHeight: 460,
      }}
    >
      {/* ── conversation list ── */}
      <aside className="flex flex-col border-r" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
        <div className="border-b p-3" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center gap-2">
            <MessageSquare size={16} style={{ color: "var(--accent)" }} />
            <span className="text-[14px] font-semibold">Messages</span>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={peers.length === 0}
              aria-label="Start a conversation"
              title="Start a conversation"
              className="ml-auto grid size-8 place-items-center rounded-lg transition active:scale-[0.98] disabled:opacity-40"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <Plus size={15} />
            </button>
          </div>
        </div>

        <div
          ref={listRef}
          role="listbox"
          aria-label="Conversations"
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className="flex-1 space-y-1 overflow-y-auto p-2"
        >
          {loading ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-[var(--radius-md)]" />)
          ) : conversations.length === 0 ? (
            <EmptyState
              className="px-3 py-8"
              icon={<MessageSquare size={20} />}
              title="No conversations yet"
              description="Start a direct message with a colleague to begin."
              action={
                peers.length > 0 ? (
                  <Button variant="primary" size="sm" leadingIcon={<Plus size={14} />} onClick={() => setPickerOpen(true)}>
                    Start a conversation
                  </Button>
                ) : undefined
              }
            />
          ) : (
            conversations.map((c) => {
              // Presence BY ID (P1): a direct thread's single counterparty is its
              // one other participant id. We resolve the dot from onlineIds via
              // that id — never by matching the (mutable, possibly duplicate)
              // display title. Task threads have no single-peer dot.
              const peerId = c.kind === "direct" ? c.participant_ids[0] ?? null : null;
              const peerOnline = peerId ? onlineIds.has(peerId) : null;
              return (
                <ConversationListItem
                  key={c.id}
                  conversation={c}
                  active={c.id === activeId}
                  peerOnline={peerOnline}
                  onSelect={() => setActiveId(c.id)}
                />
              );
            })
          )}
        </div>
      </aside>

      {/* ── thread ── */}
      <section className="flex min-w-0 flex-col">
        {active ? (
          <>
            <header className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--line)" }}>
              <span className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                {active.title ?? (active.kind === "task" ? "Task thread" : "Direct message")}
              </span>
              {liveDown && <StatusPill status="pending" label="Reconnecting" />}
              <button
                type="button"
                onClick={toggleThreadLearning}
                aria-pressed={active.agent_memory_default}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition active:scale-[0.98]"
                style={
                  active.agent_memory_default
                    ? { background: "var(--inferred-bg)", color: "var(--inferred-fg)" }
                    : { background: "var(--surface-2)", color: "var(--ink-3)" }
                }
              >
                {active.agent_memory_default ? (
                  <><Sparkles size={12} /> Learning on</>
                ) : (
                  <><EyeOff size={12} /> Off the record</>
                )}
              </button>

              {/* VP-3 — per-conversation evidence suppression. SEPARATE control
                  from the memory toggle above (never merged). Neutral styling
                  (privacy, not a trust signal — no blue/amber, no shield/sparkle
                  trust icon). The label is deliberately distinct from
                  "Learning"/"Off the record" so the two aren't confused. */}
              <button
                type="button"
                onClick={toggleEvidenceSuppressed}
                aria-pressed={active.evidence_suppressed}
                title={
                  active.evidence_suppressed
                    ? "This thread is excluded from verification evidence. Click to include it."
                    : "Exclude this thread from verification evidence."
                }
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition active:scale-[0.98]"
                style={
                  active.evidence_suppressed
                    ? { background: "var(--ink)", color: "var(--surface)" }
                    : { background: "var(--surface-2)", color: "var(--ink-3)" }
                }
              >
                <ShieldOff size={12} />
                {active.evidence_suppressed ? "Excluded from evidence" : "Exclude from evidence"}
              </button>
            </header>

            {active.agent_memory_default && (
              <div
                className="flex items-center gap-1.5 px-4 py-1.5 text-[11px]"
                style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}
              >
                <Sparkles size={11} /> This thread is being learned by your Scout. New messages default to saved.
              </div>
            )}

            <div className="relative flex min-h-0 flex-1 flex-col">
            <div ref={scrollRef} onScroll={onThreadScroll} className="flex-1 space-y-3 overflow-y-auto p-4">
              {msgLoading ? (
                [0, 1, 2].map((i) => (
                  <div key={i} className={cn("flex flex-col gap-1", i % 2 ? "items-end" : "items-start")}>
                    <Skeleton className="h-2.5 w-20" />
                    <Skeleton className="h-9 w-1/2 rounded-2xl" />
                  </div>
                ))
              ) : messages.length === 0 ? (
                <EmptyState
                  icon={<MessageSquare size={20} />}
                  title="No messages yet"
                  description="Say hello to start the conversation."
                />
              ) : (
                groups.map((item) =>
                  item.type === "divider" ? (
                    <div key={item.key} className="flex items-center gap-3 py-1">
                      <span className="h-px flex-1" style={{ background: "var(--line)" }} />
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
                        {item.label}
                      </span>
                      <span className="h-px flex-1" style={{ background: "var(--line)" }} />
                    </div>
                  ) : (
                    <MessageGroup
                      key={item.key}
                      group={item}
                      selfId={userId}
                      senderName={senderName(item.senderId)}
                      peer={item.senderId && item.senderId !== userId ? peerById.get(item.senderId) ?? null : null}
                      peerOnline={item.senderId ? onlineIds.has(item.senderId) : false}
                      onMessage={(p) => void startConversation(p.id)}
                    />
                  ),
                )
              )}
              <div ref={endRef} />
            </div>

            {/* Polite live region: announces the newest incoming message only.
                Visually hidden — the visible messages are the canonical UI. */}
            <p
              aria-live="polite"
              aria-atomic="true"
              className="sr-only"
            >
              {lastIncoming ?? ""}
            </p>

            {/* "New messages" affordance — appears when scrolled up and a message
                lands; clicking jumps to the latest. */}
            {showJump && (
              <button
                type="button"
                onClick={scrollToBottom}
                aria-label="Jump to latest messages"
                className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium shadow-md transition active:scale-[0.98]"
                style={{ background: "var(--accent)", color: "var(--on-accent)" }}
              >
                <ArrowDown size={13} aria-hidden /> New messages
              </button>
            )}
            </div>

            {/* M6 — typing indicator. aria-live OFF: typing is ephemeral and
                would be chatty for screen readers; the polite region above only
                announces actual incoming messages. */}
            {typingLabel && (
              <div
                className="flex items-center gap-1.5 px-4 py-1 text-[11px]"
                aria-live="off"
                aria-hidden="true"
                style={{ color: "var(--ink-3)" }}
              >
                {!prefersReducedMotion() && (
                  <span className="inline-flex gap-0.5" aria-hidden>
                    <span className="core-roborate-typing-dot" />
                    <span className="core-roborate-typing-dot" />
                    <span className="core-roborate-typing-dot" />
                  </span>
                )}
                {typingLabel}
              </div>
            )}

            {error && (
              <p className="px-4 py-1.5 text-[12px]" style={{ background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
                {error}
              </p>
            )}

            <MessageComposer
              draft={draft}
              saveToMemory={saveToMemory}
              sending={sending}
              onDraftChange={setDraft}
              onToggleMemory={() => setSaveToMemory((v) => !v)}
              onSend={send}
              onTyping={(t) => typingApi.current?.sendTyping(t)}
            />
          </>
        ) : (
          <EmptyState
            className="flex-1"
            icon={<MessageSquare size={24} />}
            title="Select or start a conversation"
            description="Direct messages and task threads live here."
            action={
              peers.length > 0 ? (
                <Button
                  variant="primary"
                  size="sm"
                  leadingIcon={<Plus size={14} />}
                  onClick={() => setPickerOpen(true)}
                >
                  Start a conversation
                </Button>
              ) : undefined
            }
          />
        )}
      </section>

      <PeoplePicker
        open={pickerOpen}
        peers={peers}
        onlineIds={onlineIds}
        onSelect={(id) => startConversation(id)}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
