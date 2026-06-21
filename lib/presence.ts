// lib/presence.ts
// ─────────────────────────────────────────────────────────────
// Ephemeral online presence via Supabase Realtime Presence (M3).
//
// No DB writes, no schema — presence lives in the channel's in-memory state
// and clears automatically when a client disconnects. The channel is ALWAYS
// per-org (`org:${orgId}:presence`) so one org can never see another org's
// online users.
//
// Presence is IDENTITY, not a verified fact nor an AI inference — callers must
// render it with neutral/status tokens (green online / gray offline), never
// the trust (verified/inferred) language.
// ─────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

type PresenceMeta = { profile_id: string; online_at: string };

/** Per-org presence channel name. Single source of truth. */
export function presenceChannelName(orgId: string): string {
  return `org:${orgId}:presence`;
}

/**
 * Join the org presence channel as `profileId` and receive the live set of
 * online profile ids. Returns an unsubscribe fn — call on unmount to leave the
 * channel (which also drops this client from everyone else's online set).
 */
export function joinOrgPresence(
  orgId: string,
  profileId: string,
  onChange: (onlineIds: Set<string>) => void,
): () => void {
  const channel: RealtimeChannel = supabase.channel(presenceChannelName(orgId), {
    config: { presence: { key: profileId } },
  });

  const emit = () => {
    const state = channel.presenceState<PresenceMeta>();
    const ids = new Set<string>();
    for (const key of Object.keys(state)) {
      // The presence key is the profile id; metas confirm it.
      ids.add(key);
    }
    onChange(ids);
  };

  channel
    .on("presence", { event: "sync" }, emit)
    .on("presence", { event: "join" }, emit)
    .on("presence", { event: "leave" }, emit)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track({ profile_id: profileId, online_at: new Date().toISOString() });
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}
