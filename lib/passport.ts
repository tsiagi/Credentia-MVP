import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";
import { canPublishPassport, PASSPORT_PAYWALL_MESSAGE, type AccountStatus } from "@/lib/lifecycle";

export type PassportRecord = {
  id: string;
  kind: string;
  label: string;
  detail?: string | null;
  level: number;
  date?: string | null;
};

export type PublicPassport = {
  fullName: string | null;
  title: string | null;
  orgName: string | null;
  titleLevel: number;
  verified: PassportRecord[];
  selfReported: PassportRecord[];
};

function newSlug() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  }
  return `p${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
}

export async function ensurePassportSlug(userId: string): Promise<string> {
  const { data, error } = await supabase.from("profiles").select("public_slug").eq("id", userId).single();
  if (error) throw error;
  if (data?.public_slug) return data.public_slug;

  const slug = newSlug();
  const { error: updateErr } = await supabase.from("profiles").update({ public_slug: slug }).eq("id", userId);
  if (updateErr) throw updateErr;

  await writeAuditLog({
    actorId: userId,
    action: "passport_slug_created",
    targetTable: "profiles",
    targetId: userId,
    changes: { public_slug: slug },
  });

  return slug;
}

export async function setPassportPublished(userId: string, published: boolean) {
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("id", userId)
    .single();
  if (profErr) throw profErr;

  if (published && !canPublishPassport(profile.account_status as AccountStatus)) {
    throw new Error(PASSPORT_PAYWALL_MESSAGE);
  }

  if (published) await ensurePassportSlug(userId);

  const { error } = await supabase.from("profiles").update({ passport_published: published }).eq("id", userId);
  if (error) throw error;

  await writeAuditLog({
    actorId: userId,
    action: published ? "passport_publish" : "passport_unpublish",
    targetTable: "profiles",
    targetId: userId,
    changes: { passport_published: published },
  });
}

export async function fetchPublicPassport(token: string): Promise<PublicPassport | null> {
  const { data, error } = await supabase.rpc("get_public_passport", { p_slug: token });
  if (error) throw error;
  if (!data) return null;
  return data as PublicPassport;
}

export function passportPath(slug: string) {
  return `/p/verify/${slug}`;
}

export function passportUrl(slug: string, origin?: string) {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}${passportPath(slug)}`;
}
