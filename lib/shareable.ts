import { supabase } from "@/lib/supabase";

export type ShareableProfile = {
  name: string;
  title: string;
  achievements: { label: string; kind: string; date: string | null }[];
};

export function shareablePath(token: string) {
  return `/p/share/${token}`;
}

export function shareableUrl(token: string, origin?: string) {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}${shareablePath(token)}`;
}

export async function ensureShareableLink(profileId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("shareable_links")
    .select("token")
    .eq("profile_id", profileId)
    .eq("revoked", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.token) return existing.token;

  const { data, error } = await supabase
    .from("shareable_links")
    .insert({ profile_id: profileId })
    .select("token")
    .single();

  if (error) throw error;
  return data.token;
}

export async function revokeShareableLinks(profileId: string) {
  const { error } = await supabase
    .from("shareable_links")
    .update({ revoked: true })
    .eq("profile_id", profileId)
    .eq("revoked", false);
  if (error) throw error;
}

export async function fetchShareableProfile(token: string): Promise<ShareableProfile | null> {
  const { data, error } = await supabase.rpc("get_shareable_profile", { p_token: token });
  if (error || !data) return null;
  return data as ShareableProfile;
}
