/**
 * Achievement Vault ↔ Supabase `achievements` table
 *
 * Flow (beginner-friendly):
 *  1. Employee opens dashboard → fetchAchievements() loads rows on mount
 *  2. Employee submits form → saveAchievement() inserts a new row (L1 self-reported)
 *  3. Manager approves in Verification Center → verification_level becomes L2+
 *
 * All reads/writes go through lib/supabase.ts (browser client + RLS).
 */

import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";

/** One row from the achievements table (see supabase/schema.sql). */
export type ContributionType = "individual" | "team";

export type AchievementRow = {
  id: string;
  profile_id?: string;
  kind: string;
  description: string;
  evidence_url: string | null;
  achievement_date: string | null;
  verification_level: number;
  contribution_type?: ContributionType;
  pending_executive?: boolean;
  submitted_by?: string | null;
  created_at: string;
};

export type AchievementDraft = {
  title: string;
  desc: string;
  date: string;
  evidence: string;
  kind?: string;
  contribution_type?: ContributionType;
};

const ACH_SELECT =
  "id, profile_id, kind, description, evidence_url, achievement_date, verification_level, contribution_type, pending_executive, submitted_by, created_at";

/** Load this employee's vault from Supabase (newest first). */
export async function fetchAchievements(profileId: string): Promise<AchievementRow[]> {
  const { data, error } = await supabase
    .from("achievements")
    .select(ACH_SELECT)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Insert a new self-reported achievement (always starts at verification_level 1). */
export async function saveAchievement(
  profileId: string,
  orgId: string | null,
  draft: AchievementDraft,
): Promise<AchievementRow> {
  let achievementDate: string | null = null;
  if (draft.date) {
    achievementDate = draft.date.length === 7 ? `${draft.date}-01` : draft.date;
  }

  const { data, error } = await supabase
    .from("achievements")
    .insert({
      profile_id: profileId,
      org_id: orgId,
      kind: draft.kind ?? "achievement",
      description: draft.desc ? `${draft.title}: ${draft.desc}` : draft.title,
      evidence_url: draft.evidence || null,
      achievement_date: achievementDate,
      verification_level: 1,
    })
    .select(ACH_SELECT)
    .single();

  if (error) throw error;

  await writeAuditLog({
    actorId: profileId,
    action: "achievement_created",
    targetTable: "achievements",
    targetId: data.id,
    changes: { kind: draft.kind ?? "achievement", verification_level: 1 },
  });

  return data as AchievementRow;
}

/** Manager submits for self or team — awaits executive approval. */
export async function saveManagerAchievement(
  submittedBy: string,
  profileId: string,
  orgId: string | null,
  draft: AchievementDraft,
  contributionType: ContributionType = "individual",
): Promise<AchievementRow> {
  let achievementDate: string | null = null;
  if (draft.date) {
    achievementDate = draft.date.length === 7 ? `${draft.date}-01` : draft.date;
  }

  const { data, error } = await supabase
    .from("achievements")
    .insert({
      profile_id: profileId,
      org_id: orgId,
      kind: draft.kind ?? "achievement",
      description: draft.desc ? `${draft.title}: ${draft.desc}` : draft.title,
      evidence_url: draft.evidence || null,
      achievement_date: achievementDate,
      verification_level: 1,
      contribution_type: contributionType,
      submitted_by: submittedBy,
      pending_executive: true,
    })
    .select(ACH_SELECT)
    .single();

  if (error) throw error;

  await writeAuditLog({
    actorId: submittedBy,
    action: "achievement_manager_submitted",
    targetTable: "achievements",
    targetId: data.id,
    changes: { profile_id: profileId, contribution_type: contributionType, pending_executive: true },
  });

  return data as AchievementRow;
}

export async function fetchPendingExecutiveAchievements(orgId: string): Promise<AchievementRow[]> {
  const { data, error } = await supabase
    .from("achievements")
    .select(ACH_SELECT)
    .eq("org_id", orgId)
    .eq("pending_executive", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as AchievementRow[];
}

export async function approveExecutiveAchievement(achievementId: string, executiveId: string): Promise<void> {
  const { error } = await supabase
    .from("achievements")
    .update({ pending_executive: false, verification_level: 2 })
    .eq("id", achievementId);

  if (error) throw error;

  await writeAuditLog({
    actorId: executiveId,
    action: "achievement_executive_approved",
    targetTable: "achievements",
    targetId: achievementId,
    changes: { pending_executive: false, verification_level: 2 },
  });
}

export async function rejectExecutiveAchievement(achievementId: string, executiveId: string): Promise<void> {
  const { error } = await supabase.from("achievements").delete().eq("id", achievementId);
  if (error) throw error;

  await writeAuditLog({
    actorId: executiveId,
    action: "achievement_executive_rejected",
    targetTable: "achievements",
    targetId: achievementId,
    changes: { deleted: true },
  });
}

export function achievementTitle(description: string) {
  const idx = description.indexOf(":");
  return idx > 0 ? description.slice(0, idx) : description.slice(0, 80);
}
