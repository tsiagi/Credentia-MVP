// lib/messaging.ts
// ─────────────────────────────────────────────────────────────
// Seamless Conversation & Messaging.
//
// Conversations are 'direct' (user↔user) or 'task' threads (pinned to a
// verified_task). Every message carries an explicit "Save to Agent Memory"
// flag — the opposite is "Off the Record". Only messages a user marks
// save_to_agent_memory = true are eligible to become THAT user's Digital-Twin
// memory (see lib/agents.ts ingestion). Off-the-record messages are never
// learned.
//
// Browser client + RLS (lib/supabase.ts). Reads/writes are participant-scoped
// by the is_conversation_participant() policy.
// ─────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";

export type ConversationKind = "direct" | "task";

export type Conversation = {
  id: string;
  org_id: string;
  kind: ConversationKind;
  title: string | null;
  task_id: string | null;
  created_by: string | null;
  agent_memory_default: boolean;
  created_at: string;
  updated_at: string;
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
  "id, org_id, kind, title, task_id, created_by, agent_memory_default, created_at, updated_at";
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
 * true → eligible for the sender's Digital-Twin; false → Off the Record.
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
