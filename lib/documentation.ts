// lib/documentation.ts
// ─────────────────────────────────────────────────────────────
// Verified Documentation Repository.
//
// Guides, task outcomes, and conversation summaries. A doc is NEUTRAL while
// `status = 'draft'`. A manager / admin / superadmin verifying it (status →
// 'verified') promotes it into the BLUE verified-facts graph. The transition
// itself is gated in the database by the guard_doc_verification() trigger —
// a non-privileged author cannot self-verify even if they craft the request.
//
// Browser client + RLS (lib/supabase.ts). Visibility ('org' | 'managers' |
// 'private') is what keeps an employee's Digital-Twin from learning
// manager-only knowledge.
// ─────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";

export type DocType = "guide" | "task_outcome" | "conversation_summary" | "reference";
export type DocVisibility = "org" | "managers" | "private";
export type DocStatus = "draft" | "verified" | "archived";

export type DocRow = {
  id: string;
  org_id: string;
  title: string;
  body: string;
  doc_type: DocType;
  author_id: string | null;
  visibility: DocVisibility;
  status: DocStatus;
  verified_by: string | null;
  verified_at: string | null;
  source_task_id: string | null;
  source_conversation_id: string | null;
  created_at: string;
  updated_at: string;
};

const DOC_SELECT =
  "id, org_id, title, body, doc_type, author_id, visibility, status, verified_by, verified_at, source_task_id, source_conversation_id, created_at, updated_at";

/** Whether the current viewer role may move a doc to verified (UI affordance; DB also enforces). */
export function canVerifyDocs(role: string | null | undefined): boolean {
  return ["manager", "executive", "admin", "hr", "superadmin"].includes(role ?? "");
}

export async function fetchDocs(opts: { status?: DocStatus } = {}): Promise<DocRow[]> {
  let q = supabase.from("documentation").select(DOC_SELECT);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q.order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocRow[];
}

export async function createDoc(
  actorId: string,
  orgId: string,
  input: {
    title: string;
    body: string;
    docType?: DocType;
    visibility?: DocVisibility;
    sourceTaskId?: string | null;
    sourceConversationId?: string | null;
  },
): Promise<DocRow> {
  // Always starts as a draft — verification is a separate, privileged action.
  const { data, error } = await supabase
    .from("documentation")
    .insert({
      org_id: orgId,
      title: input.title.trim(),
      body: input.body.trim(),
      doc_type: input.docType ?? "guide",
      author_id: actorId,
      visibility: input.visibility ?? "org",
      status: "draft",
      source_task_id: input.sourceTaskId ?? null,
      source_conversation_id: input.sourceConversationId ?? null,
    })
    .select(DOC_SELECT)
    .single();
  if (error) throw error;

  await writeAuditLog({
    actorId,
    action: "doc_created",
    targetTable: "documentation",
    targetId: data.id,
    changes: { title: data.title, doc_type: data.doc_type, visibility: data.visibility },
  });
  return data as DocRow;
}

/**
 * Verify a draft → it becomes an official (blue) verified fact. The trigger
 * stamps verified_by / verified_at and rejects the call if the caller's role
 * isn't manager+ — so we don't set those columns here.
 */
export async function verifyDoc(actorId: string, docId: string): Promise<DocRow> {
  const { data, error } = await supabase
    .from("documentation")
    .update({ status: "verified", updated_at: new Date().toISOString() })
    .eq("id", docId)
    .select(DOC_SELECT)
    .single();
  if (error) throw error;

  await writeAuditLog({
    actorId,
    action: "doc_verified",
    targetTable: "documentation",
    targetId: docId,
    changes: { title: data.title },
  });
  return data as DocRow;
}

/** Return a verified doc to draft (revokes attestation; trigger clears the stamp). */
export async function unverifyDoc(actorId: string, docId: string): Promise<DocRow> {
  const { data, error } = await supabase
    .from("documentation")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("id", docId)
    .select(DOC_SELECT)
    .single();
  if (error) throw error;

  await writeAuditLog({
    actorId,
    action: "doc_unverified",
    targetTable: "documentation",
    targetId: docId,
  });
  return data as DocRow;
}
