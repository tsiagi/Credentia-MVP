// lib/agents.ts
// ─────────────────────────────────────────────────────────────
// Personalized Scout Agent.
//
// One agent per user. Its TRAINING DATA (agent_memory) is composed ONLY of
// VERIFIED facts (blue): completed verified_tasks, verified documentation the
// user is allowed to see, and messages the user explicitly saved to memory.
// The agent's OUTPUTS — suggestions, drafts, automated actions — are AI
// INFERENCE (amber) and are never written into agent_memory.
//
// This module (browser client + RLS) handles the agent CONFIG and READING
// memory. Memory INGESTION is server-side only (app/api/ai/agent/ingest) using
// the service role, because it must re-check role/visibility before learning —
// an employee's agent must never absorb manager-only documentation.
// ─────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";

export type UserAgent = {
  id: string;
  owner_id: string;
  org_id: string;
  name: string;
  persona: string | null;
  enabled: boolean;
  learn_from_tasks: boolean;
  learn_from_docs: boolean;
  learn_from_messages: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AgentMemorySource = "verified_task" | "documentation" | "message";

export type AgentMemoryItem = {
  id: string;
  agent_id: string;
  owner_id: string;
  org_id: string;
  source_type: AgentMemorySource;
  source_id: string | null;
  content: string;
  created_at: string;
};

const AGENT_SELECT =
  "id, owner_id, org_id, name, persona, enabled, learn_from_tasks, learn_from_docs, learn_from_messages, config, created_at, updated_at";
const MEMORY_SELECT = "id, agent_id, owner_id, org_id, source_type, source_id, content, created_at";

/** The caller's agent, or null if they haven't provisioned one yet. */
export async function fetchMyAgent(ownerId: string): Promise<UserAgent | null> {
  const { data, error } = await supabase
    .from("user_agents")
    .select(AGENT_SELECT)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return (data as UserAgent) ?? null;
}

/** Provision a Scout for the user (idempotent on owner_id). */
export async function provisionAgent(
  ownerId: string,
  orgId: string,
  input: { name?: string; persona?: string } = {},
): Promise<UserAgent> {
  const { data, error } = await supabase
    .from("user_agents")
    .upsert(
      {
        owner_id: ownerId,
        org_id: orgId,
        name: input.name?.trim() || "My Scout",
        persona: input.persona?.trim() || null,
      },
      { onConflict: "owner_id" },
    )
    .select(AGENT_SELECT)
    .single();
  if (error) throw error;

  await writeAuditLog({
    actorId: ownerId,
    action: "agent_provisioned",
    targetTable: "user_agents",
    targetId: data.id,
    changes: { name: data.name },
  });
  return data as UserAgent;
}

export async function updateAgentConfig(
  ownerId: string,
  agentId: string,
  patch: Partial<
    Pick<UserAgent, "name" | "persona" | "enabled" | "learn_from_tasks" | "learn_from_docs" | "learn_from_messages">
  >,
): Promise<UserAgent> {
  const { data, error } = await supabase
    .from("user_agents")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", agentId)
    .select(AGENT_SELECT)
    .single();
  if (error) throw error;

  await writeAuditLog({
    actorId: ownerId,
    action: "agent_config_updated",
    targetTable: "user_agents",
    targetId: agentId,
    changes: patch as Record<string, unknown>,
  });
  return data as UserAgent;
}

/** The verified facts the agent has learned (owner-only under RLS). */
export async function fetchAgentMemory(ownerId: string): Promise<AgentMemoryItem[]> {
  const { data, error } = await supabase
    .from("agent_memory")
    .select(MEMORY_SELECT)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AgentMemoryItem[];
}

/** "Forget" a learned fact. (Insert/update are server-side only by design.) */
export async function forgetMemory(ownerId: string, memoryId: string): Promise<void> {
  const { error } = await supabase.from("agent_memory").delete().eq("id", memoryId);
  if (error) throw error;

  await writeAuditLog({
    actorId: ownerId,
    action: "agent_memory_forgotten",
    targetTable: "agent_memory",
    targetId: memoryId,
  });
}

export const MEMORY_SOURCE_LABEL: Record<AgentMemorySource, string> = {
  verified_task: "Completed task",
  documentation: "Verified doc",
  message: "Saved message",
};
