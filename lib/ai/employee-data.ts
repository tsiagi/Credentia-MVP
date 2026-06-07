import type { VerifiedEmployeePayload } from "@/lib/ai-client";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/** Load verified + self-reported records for AI input (server-side). */
export async function loadEmployeePayload(profileId: string): Promise<VerifiedEmployeePayload | null> {
  const admin = getSupabaseAdmin();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, title")
    .eq("id", profileId)
    .single();

  if (!profile) return null;

  const [ach, proj, facts, kpis] = await Promise.all([
    admin.from("achievements").select("kind, description, verification_level").eq("profile_id", profileId),
    admin.from("projects").select("description, verification_level").eq("profile_id", profileId),
    admin.from("verified_facts").select("kind, label, verification_level").eq("profile_id", profileId),
    admin.from("kpis").select("title, status").eq("employee_id", profileId),
  ]);

  return {
    profileId: profile.id,
    fullName: profile.full_name,
    title: profile.title,
    achievements: (ach.data ?? []).map((a) => ({
      kind: a.kind,
      description: a.description,
      verification_level: a.verification_level,
    })),
    projects: (proj.data ?? []).map((p) => ({
      description: p.description,
      verification_level: p.verification_level,
    })),
    verifiedFacts: (facts.data ?? []).map((f) => ({
      kind: f.kind,
      label: f.label,
      verification_level: f.verification_level,
    })),
    kpis: (kpis.data ?? []).map((k) => ({ title: k.title, status: k.status })),
  };
}
