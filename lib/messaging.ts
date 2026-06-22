// lib/messaging.ts
// ─────────────────────────────────────────────────────────────
// Seamless Conversation & Messaging.
//
// Conversations are 'direct' (user↔user) or 'task' threads (pinned to a
// verified_task). Every message carries an explicit "Save to Agent Memory"
// flag — the opposite is "Off the Record". Only messages a user marks
// save_to_agent_memory = true are eligible to become THAT user's Scout
// memory (see lib/agents.ts ingestion). Off-the-record messages are never
// learned.
//
// Browser client + RLS (lib/supabase.ts). Reads/writes are participant-scoped
// by the is_conversation_participant() policy.
// ─────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ConversationKind = "direct" | "task";

export type Conversation = {
  id: string;
  org_id: string;
  kind: ConversationKind;
  title: string | null;
  task_id: string | null;
  created_by: string | null;
  agent_memory_default: boolean;
  // VP-3 — per-conversation "Exclude from verification evidence". DISTINCT from
  // agent_memory_default (Scout learning): this governs the verification
  // EVIDENCE pipeline, not memory. Flipped via
  // lib/verification/evidence.ts → setConversationEvidenceSuppressed.
  evidence_suppressed: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * A conversation enriched with the current viewer's read-state (M4).
 * `last_read_at` is the viewer's own participant timestamp (null = never read);
 * `unread_count` is messages from OTHERS newer than that timestamp. Unread is an
 * identity/activity signal — never a trust signal — so it carries no
 * verified/inferred semantics.
 */
export type ConversationWithMeta = Conversation & {
  last_read_at: string | null;
  unread_count: number;
  /**
   * Profile ids of the OTHER participants in this conversation (the viewer is
   * excluded). For a `direct` thread this is normally a single peer id, used to
   * resolve presence BY ID (never by display name). Participant/org-scoped via
   * the `cpart: participant read` RLS policy — no schema change, no widening.
   */
  participant_ids: string[];
};

export type Message = {
  id: string;
  conversation_id: string;
  org_id: string;
  sender_id: string | null;
  body: string;
  save_to_agent_memory: boolean;
  created_at: string;
};

const CONV_SELECT =
  "id, org_id, kind, title, task_id, created_by, agent_memory_default, evidence_suppressed, created_at, updated_at";
const MSG_SELECT =
  "id, conversation_id, org_id, sender_id, body, save_to_agent_memory, created_at";

/** Conversations the current user participates in (RLS scopes the result). */
export async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select(CONV_SELECT)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

/**
 * Conversations + the viewer's read-state and per-conversation unread counts (M4).
 *
 * Scope: every query below is participant/org-scoped exactly as today —
 *   1. `conversations` is filtered by the is_conversation_participant() RLS
 *      policy, so we only ever see threads the viewer belongs to.
 *   2. The viewer's own `conversation_participants` rows are read with an
 *      explicit `profile_id = profileId` filter (and RLS only exposes the
 *      caller's participant rows anyway), giving each thread's `last_read_at`.
 *   3. Unread = messages whose `created_at > last_read_at` and `sender_id <> me`.
 *      We fetch only the *other senders'* unread message rows for the viewer's
 *      conversations in a SINGLE query (sender_id <> me, conversation_id in […]),
 *      then tally client-side — no per-conversation N+1, no cross-org aggregation
 *      (messages RLS keeps rows within the viewer's participant + org scope).
 *
 * `profileId` is passed in explicitly (mirroring actorId/userId elsewhere) — we
 * never read identity from a global.
 */
export async function fetchConversationsWithMeta(
  profileId: string,
): Promise<ConversationWithMeta[]> {
  const convs = await fetchConversations();
  if (convs.length === 0) return [];

  const convIds = convs.map((c) => c.id);

  // (2) ALL participant rows for the viewer's conversations in one query. RLS
  // (`cpart: participant read`) exposes every participant row of a conversation
  // the caller belongs to, so this stays participant/org-scoped — no widening.
  // We derive two things from it:
  //   • the viewer's own `last_read_at` per conversation (profile_id = me), and
  //   • `participant_ids` (the OTHER members), used to resolve presence BY ID.
  const { data: partRows, error: partErr } = await supabase
    .from("conversation_participants")
    .select("conversation_id, profile_id, last_read_at")
    .in("conversation_id", convIds);
  if (partErr) throw partErr;

  const lastReadByConv = new Map<string, string | null>();
  const peerIdsByConv = new Map<string, string[]>();
  for (const r of partRows ?? []) {
    const convId = r.conversation_id as string;
    const memberId = r.profile_id as string;
    if (memberId === profileId) {
      lastReadByConv.set(convId, (r.last_read_at as string) ?? null);
    } else {
      const list = peerIdsByConv.get(convId);
      if (list) list.push(memberId);
      else peerIdsByConv.set(convId, [memberId]);
    }
  }

  // (3) Single query for unread candidates: other people's messages in the
  // viewer's conversations. RLS keeps this participant/org-scoped. We compare
  // against each thread's last_read_at client-side (null ⇒ every other message
  // counts). Cheap: messages(conversation_id, created_at) is indexed.
  const { data: msgRows, error: msgErr } = await supabase
    .from("messages")
    .select("conversation_id, created_at, sender_id")
    .in("conversation_id", convIds)
    .neq("sender_id", profileId);
  if (msgErr) throw msgErr;

  const unreadByConv = new Map<string, number>();
  for (const m of msgRows ?? []) {
    const convId = m.conversation_id as string;
    const lastRead = lastReadByConv.get(convId) ?? null;
    if (lastRead == null || (m.created_at as string) > lastRead) {
      unreadByConv.set(convId, (unreadByConv.get(convId) ?? 0) + 1);
    }
  }

  return convs.map((c) => ({
    ...c,
    last_read_at: lastReadByConv.get(c.id) ?? null,
    unread_count: unreadByConv.get(c.id) ?? 0,
    participant_ids: peerIdsByConv.get(c.id) ?? [],
  }));
}

/**
 * Mark a conversation read for the caller (M4): stamp the viewer's OWN
 * participant row `last_read_at = now()`. The "cpart: self mark read" RLS
 * UPDATE policy restricts this to `profile_id = auth.uid()`, so a user can only
 * advance their own read marker.
 *
 * Deliberately NO audit log: read-state is a high-frequency UI signal, not an
 * auditable security event (per plan). Auditing every thread open would flood
 * the trail with noise and bury the actions that matter. `profileId` is passed
 * in explicitly, never read from a global.
 */
export async function markConversationRead(
  profileId: string,
  conversationId: string,
): Promise<void> {
  const { error } = await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("profile_id", profileId);
  if (error) throw error;
}

/**
 * Start a conversation and add participants. The creator is always a
 * participant; pass the other member ids in `participantIds`.
 */
export async function createConversation(
  actorId: string,
  orgId: string,
  input: {
    kind?: ConversationKind;
    title?: string;
    taskId?: string | null;
    participantIds: string[];
    agentMemoryDefault?: boolean;
  },
): Promise<Conversation> {
  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({
      org_id: orgId,
      kind: input.kind ?? (input.taskId ? "task" : "direct"),
      title: input.title?.trim() || null,
      task_id: input.taskId ?? null,
      created_by: actorId,
      agent_memory_default: input.agentMemoryDefault ?? false,
    })
    .select(CONV_SELECT)
    .single();
  if (error) throw error;

  const members = [...new Set([actorId, ...input.participantIds])].map((profile_id) => ({
    conversation_id: conv.id,
    profile_id,
  }));
  const { error: partErr } = await supabase.from("conversation_participants").insert(members);
  if (partErr) throw partErr;

  await writeAuditLog({
    actorId,
    action: "conversation_created",
    targetTable: "conversations",
    targetId: conv.id,
    changes: { kind: conv.kind, participants: members.length, task_id: conv.task_id },
  });
  return conv as Conversation;
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(MSG_SELECT)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}

/**
 * Send a message. `saveToAgentMemory` is the explicit per-message toggle:
 * true → eligible for the sender's Scout; false → Off the Record.
 */
export async function sendMessage(
  actorId: string,
  orgId: string,
  input: { conversationId: string; body: string; saveToAgentMemory: boolean },
): Promise<Message> {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      org_id: orgId,
      sender_id: actorId,
      body: input.body.trim(),
      save_to_agent_memory: input.saveToAgentMemory,
    })
    .select(MSG_SELECT)
    .single();
  if (error) throw error;

  // touch the conversation so it sorts to the top
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.conversationId);

  return data as Message;
}

// ─────────────────────────────────────────────────────────────
// Realtime (M2 + M6) — browser-client channels under existing RLS.
//
// SETUP FOLLOW-UP: postgres_changes on `messages` only fire if the table is
// added to the `supabase_realtime` publication on the remote project
// (Dashboard → Database → Replication → enable `messages`). RLS still scopes
// the payloads to conversation participants — we do not change remote config
// here. Typing/presence ride broadcast/presence which need no publication.
//
// Channel names are ALWAYS namespaced per org (and per conversation) so one
// org can never observe another's traffic — never use a global channel name.
// ─────────────────────────────────────────────────────────────

/** Per-org, per-conversation channel name. Single source of truth. */
export function conversationChannelName(orgId: string, conversationId: string): string {
  return `org:${orgId}:conversation:${conversationId}`;
}

/**
 * Subscribe to INSERTs on `messages` for one conversation. Returns an
 * unsubscribe fn — call it on conversation switch / unmount to avoid leaked
 * channels. The Postgres-changes filter narrows by conversation_id; RLS on
 * `messages` still enforces participant + org scope on the delivered row.
 */
export function subscribeToMessages(
  conversationId: string,
  orgId: string,
  onInsert: (message: Message) => void,
  onStatus?: (status: string) => void,
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(conversationChannelName(orgId, conversationId))
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        onInsert(payload.new as Message);
      },
    )
    .subscribe((status) => onStatus?.(status));

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Per-org messages channel name (all of the viewer's threads). */
export function orgMessagesChannelName(orgId: string): string {
  return `org:${orgId}:messages`;
}

/**
 * Subscribe to INSERTs on `messages` across the WHOLE org (M4) so unread badges
 * on NON-active conversations stay live. The Postgres-changes filter narrows by
 * `org_id`; RLS on `messages` still enforces participant scope, so the viewer
 * only ever receives rows for conversations they belong to — no cross-org
 * delivery, no widening. Returns an unsubscribe fn; call on org change/unmount.
 *
 * This is intentionally separate from the per-conversation `subscribeToMessages`
 * (which drives the open thread): this one only updates list-level unread
 * counts and never touches the active message list.
 */
export function subscribeToOrgMessages(
  orgId: string,
  onInsert: (message: Message) => void,
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(orgMessagesChannelName(orgId))
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `org_id=eq.${orgId}` },
      (payload) => {
        onInsert(payload.new as Message);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Payload broadcast over the conversation channel for typing indicators (M6). */
export type TypingPayload = { profile_id: string; typing: boolean };

/**
 * Bind typing-indicator broadcast onto the conversation channel (M6). Reuses
 * the SAME per-org-per-conversation channel as message delivery — no global
 * channel, no message content, only { profile_id, typing }. Returns helpers to
 * emit typing and to unsubscribe.
 */
export function subscribeToTyping(
  conversationId: string,
  orgId: string,
  selfId: string,
  onTyping: (payload: TypingPayload) => void,
): { sendTyping: (typing: boolean) => void; unsubscribe: () => void } {
  const channel: RealtimeChannel = supabase
    .channel(`${conversationChannelName(orgId, conversationId)}:typing`, {
      config: { broadcast: { self: false } },
    })
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      const p = payload as TypingPayload;
      if (p && p.profile_id !== selfId) onTyping(p);
    })
    .subscribe();

  return {
    sendTyping: (typing: boolean) => {
      // Fire-and-forget; broadcast failure silently no-ops (ephemeral signal).
      void channel.send({ type: "broadcast", event: "typing", payload: { profile_id: selfId, typing } });
    },
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}

/** Flip the thread-level "learning" default (new messages inherit this). */
export async function setThreadMemoryDefault(
  actorId: string,
  conversationId: string,
  on: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ agent_memory_default: on, updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) throw error;

  await writeAuditLog({
    actorId,
    action: "conversation_memory_toggled",
    targetTable: "conversations",
    targetId: conversationId,
    changes: { agent_memory_default: on },
  });
}
