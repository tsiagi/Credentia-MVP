// lib/flow.ts
// ─────────────────────────────────────────────────────────────
// FLOW — Provenance-Native Work Tracking (client data layer).
//
// The trust model is STRUCTURAL, not a label:
//   • flow_transition_events  — append-only ledger. provenance_tier is only
//       ATTESTED | ASSERTED. Current state is a PROJECTION over this ledger
//       (the flow_item_state view), never a stored status column.
//   • flow_inferences         — the quarantine. The ONLY home of INFERRED
//       (AI) data. Read here for the segregated sidebar; NEVER written from
//       the client (service-role server route only). A human PROMOTES a copy
//       into the ledger as ASSERTED via the flow_promote_inference RPC.
//
// Every canonical write goes through a SECURITY DEFINER RPC so evidence-gating
// is enforced server-side in Postgres — the client cannot insert into the
// ledger directly (no INSERT policy exists).
// ─────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";

export type ProvenanceTier = "ATTESTED" | "ASSERTED" | "INFERRED";
export type EventType = "create" | "status" | "scope" | "assignment" | "tier";
export type ArtifactKind = "merged_pr" | "file" | "approval" | "deploy" | "webhook" | "link";
export type InferenceKind = "predicted_slip" | "risk_flag" | "dependency_bottleneck" | "status_suggestion";

export type FlowBoard = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  sprint_start: string | null;
  sprint_end: string | null;
  sprint_points_committed: number | null;
};

export type FlowColumn = {
  id: string;
  board_id: string;
  name: string;
  sort_order: number;
  is_terminal: boolean;
  required_tier: "ASSERTED" | "ATTESTED" | null;
};

export type FlowItem = {
  id: string;
  org_id: string;
  board_id: string;
  title: string;
  description: string | null;
  point_estimate: number;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type FlowItemState = {
  item_id: string;
  current_column_id: string | null;
  current_tier: "ATTESTED" | "ASSERTED" | null;
  current_artifact_id: string | null;
  current_source_inference_id: string | null;
  as_of: string;
};

export type EvidenceArtifact = {
  id: string;
  item_id: string | null;
  kind: ArtifactKind;
  uri: string;
  label: string | null;
  created_at: string;
};

export type TransitionEvent = {
  id: string;
  item_id: string;
  event_type: EventType;
  provenance_tier: "ATTESTED" | "ASSERTED";
  to_column_id: string | null;
  artifact_id: string | null;
  source_inference_id: string | null;
  actor_id: string | null;
  reason: string | null;
  prior_value: unknown;
  new_value: unknown;
  created_at: string;
};

export type Inference = {
  id: string;
  board_id: string | null;
  item_id: string | null;
  kind: InferenceKind;
  summary: string;
  detail: string | null;
  predicted_value: Record<string, unknown>;
  confidence: number | null;
  model: string | null;
  status: "quarantined" | "promoted" | "dismissed";
  promoted_event_id: string | null;
  created_at: string;
};

// ── Reads ────────────────────────────────────────────────────
export async function listBoards(): Promise<FlowBoard[]> {
  const { data, error } = await supabase
    .from("flow_boards")
    .select("id, org_id, name, description, sprint_start, sprint_end, sprint_points_committed")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FlowBoard[];
}

export async function getColumns(boardId: string): Promise<FlowColumn[]> {
  const { data, error } = await supabase
    .from("flow_columns")
    .select("id, board_id, name, sort_order, is_terminal, required_tier")
    .eq("board_id", boardId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FlowColumn[];
}

export async function getItems(boardId: string): Promise<FlowItem[]> {
  const { data, error } = await supabase
    .from("flow_items")
    .select("id, org_id, board_id, title, description, point_estimate, owner_id, created_by, created_at")
    .eq("board_id", boardId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FlowItem[];
}

/** Current state for every item on a board, projected from the ledger. */
export async function getItemStates(boardId: string): Promise<FlowItemState[]> {
  const { data, error } = await supabase
    .from("flow_item_state")
    .select("item_id, current_column_id, current_tier, current_artifact_id, current_source_inference_id, as_of")
    .eq("board_id", boardId);
  if (error) throw error;
  return (data ?? []) as FlowItemState[];
}

export async function getItemLedger(itemId: string): Promise<TransitionEvent[]> {
  const { data, error } = await supabase
    .from("flow_transition_events")
    .select(
      "id, item_id, event_type, provenance_tier, to_column_id, artifact_id, source_inference_id, actor_id, reason, prior_value, new_value, created_at",
    )
    .eq("item_id", itemId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TransitionEvent[];
}

export async function getArtifacts(boardItemIds: string[]): Promise<EvidenceArtifact[]> {
  if (boardItemIds.length === 0) return [];
  const { data, error } = await supabase
    .from("flow_evidence_artifacts")
    .select("id, item_id, kind, uri, label, created_at")
    .in("item_id", boardItemIds);
  if (error) throw error;
  return (data ?? []) as EvidenceArtifact[];
}

/** The quarantine. Read-only here; INFERRED never enters the canonical board. */
export async function getInferences(boardId: string): Promise<Inference[]> {
  const { data, error } = await supabase
    .from("flow_inferences")
    .select("id, board_id, item_id, kind, summary, detail, predicted_value, confidence, model, status, promoted_event_id, created_at")
    .eq("board_id", boardId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Inference[];
}

export type ApprovalStat = { actor_id: string; name: string; role: string; count: number };

/**
 * Org-wide verification counts grouped by approver. An "approval" is any
 * ATTESTED transition in the ledger; the actor's role tells whether it was an
 * executive sign-off, a manager verification, or team evidence-backed work.
 * RLS scopes the ledger to the caller's org.
 */
export async function getAttestationStats(): Promise<ApprovalStat[]> {
  const { data: ev, error } = await supabase
    .from("flow_transition_events")
    .select("actor_id")
    .eq("provenance_tier", "ATTESTED");
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const e of ev ?? []) {
    const id = (e as { actor_id: string | null }).actor_id;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const ids = Array.from(counts.keys());
  if (ids.length === 0) return [];

  const { data: profs } = await supabase.from("profiles").select("id, full_name, role").in("id", ids);
  const meta = new Map(
    (profs ?? []).map((p) => [p.id as string, { name: (p.full_name as string) ?? "—", role: (p.role as string) ?? "" }]),
  );
  return ids
    .map((id) => ({ actor_id: id, name: meta.get(id)?.name ?? "—", role: meta.get(id)?.role ?? "", count: counts.get(id) ?? 0 }))
    .sort((a, b) => b.count - a.count);
}

// ── Writes (all via gated RPCs / RLS-checked inserts) ────────

/** Attach an evidence artifact to an item (prerequisite for an ATTESTED move). */
export async function addArtifact(input: {
  orgId: string;
  itemId: string;
  kind: ArtifactKind;
  uri: string;
  label?: string;
  addedBy: string;
}): Promise<EvidenceArtifact> {
  const { data, error } = await supabase
    .from("flow_evidence_artifacts")
    .insert({
      org_id: input.orgId,
      item_id: input.itemId,
      kind: input.kind,
      uri: input.uri,
      label: input.label ?? null,
      added_by: input.addedBy,
    })
    .select("id, item_id, kind, uri, label, created_at")
    .single();
  if (error) throw error;
  return data as EvidenceArtifact;
}

/**
 * Record a transition through the SECURITY DEFINER RPC. Evidence-gating is
 * enforced server-side: entering an ATTESTED-only column without an artifact
 * is rejected by Postgres, not the UI. Default tier is ASSERTED.
 */
export async function recordTransition(input: {
  itemId: string;
  toColumnId?: string | null;
  tier?: "ATTESTED" | "ASSERTED";
  artifactId?: string | null;
  reason?: string | null;
  eventType?: EventType;
}): Promise<string> {
  const { data, error } = await supabase.rpc("flow_record_transition", {
    p_item_id: input.itemId,
    p_event_type: input.eventType ?? "status",
    p_to_column_id: input.toColumnId ?? null,
    p_provenance_tier: input.tier ?? "ASSERTED",
    p_artifact_id: input.artifactId ?? null,
    p_reason: input.reason ?? null,
    p_new_value: null,
    p_source_inference_id: null,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Promote a quarantined inference into the ledger as ASSERTED. The only path
 * INFERRED data crosses into the canonical record; the new event is traceable
 * back to the source inference id.
 */
export async function promoteInference(inferenceId: string, reason?: string): Promise<string> {
  const { data, error } = await supabase.rpc("flow_promote_inference", {
    p_inference_id: inferenceId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ── Board / item creation ───────────────────────────────────

/** Default provenance column set for a new board: a Backlog → … → two terminal
 *  columns, one ASSERTED-friendly ("Done · Self-reported") and one evidence-gated
 *  ATTESTED-only ("Shipped · Verified"). This is what makes the burndown gap real. */
export const DEFAULT_COLUMNS: { name: string; sort_order: number; is_terminal: boolean; required_tier: "ASSERTED" | "ATTESTED" | null }[] = [
  { name: "Backlog", sort_order: 0, is_terminal: false, required_tier: null },
  { name: "In Progress", sort_order: 1, is_terminal: false, required_tier: null },
  { name: "In Review", sort_order: 2, is_terminal: false, required_tier: "ASSERTED" },
  { name: "Done · Self-reported", sort_order: 3, is_terminal: true, required_tier: null },
  { name: "Shipped · Verified", sort_order: 4, is_terminal: true, required_tier: "ATTESTED" },
];

export async function createBoard(input: {
  orgId: string;
  name: string;
  description?: string | null;
  createdBy: string;
  sprintStart?: string | null;
  sprintEnd?: string | null;
  committed?: number | null;
}): Promise<{ board: FlowBoard; columns: FlowColumn[] }> {
  const { data: board, error } = await supabase
    .from("flow_boards")
    .insert({
      org_id: input.orgId,
      name: input.name,
      description: input.description ?? null,
      created_by: input.createdBy,
      sprint_start: input.sprintStart ?? null,
      sprint_end: input.sprintEnd ?? null,
      sprint_points_committed: input.committed ?? null,
    })
    .select("id, org_id, name, description, sprint_start, sprint_end, sprint_points_committed")
    .single();
  if (error) throw error;

  const { data: cols, error: cErr } = await supabase
    .from("flow_columns")
    .insert(DEFAULT_COLUMNS.map((c) => ({ ...c, board_id: board.id, org_id: input.orgId })))
    .select("id, board_id, name, sort_order, is_terminal, required_tier");
  if (cErr) throw cErr;

  return { board: board as FlowBoard, columns: (cols ?? []) as FlowColumn[] };
}

/** Create a work item and open its ledger with a 'create' event in the backlog
 *  (ASSERTED — no evidence needed to exist). Returns the new item. */
export async function createItem(input: {
  orgId: string;
  boardId: string;
  backlogColumnId: string;
  title: string;
  description?: string | null;
  pointEstimate?: number;
  ownerId: string;
  createdBy: string;
}): Promise<FlowItem> {
  const { data: item, error } = await supabase
    .from("flow_items")
    .insert({
      org_id: input.orgId,
      board_id: input.boardId,
      title: input.title,
      description: input.description ?? null,
      point_estimate: input.pointEstimate ?? 1,
      owner_id: input.ownerId,
      created_by: input.createdBy,
    })
    .select("id, org_id, board_id, title, description, point_estimate, owner_id, created_by, created_at")
    .single();
  if (error) throw error;

  await recordTransition({
    itemId: (item as FlowItem).id,
    toColumnId: input.backlogColumnId,
    tier: "ASSERTED",
    eventType: "create",
    reason: "Created",
  });
  return item as FlowItem;
}

// ── Burndown (server-computed; see app/api/flow/burndown) ────
export type BurndownPoint = { date: string; attested_remaining: number; asserted_remaining: number };
export type Burndown = {
  board_id: string;
  sprint_start: string;
  sprint_end: string;
  committed: number;
  series: BurndownPoint[];
  attested_done: number;
  asserted_done: number;
  gap_points: number;
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getBurndown(boardId: string): Promise<Burndown> {
  const res = await fetch(`/api/flow/burndown?board_id=${encodeURIComponent(boardId)}`, {
    cache: "no-store",
    headers: await authHeader(),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "burndown failed");
  return (await res.json()) as Burndown;
}

/** Ask the server (service-role) to scan the board and write fresh AI inferences
 *  into the quarantine. Returns how many were written. Never touches the ledger. */
export async function generateInferences(boardId: string): Promise<number> {
  const res = await fetch(`/api/flow/inferences/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ boardId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "generate failed");
  return ((await res.json()) as { written: number }).written;
}
