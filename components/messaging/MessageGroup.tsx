// components/messaging/MessageGroup.tsx
// ─────────────────────────────────────────────────────────────
// Renders one sender group (M1): a header with sender name + relative time,
// then the run of bubbles. Grouping is purely visual — every message keeps its
// OWN per-message memory indicator (saved → Sparkles/amber, off-record →
// EyeOff/muted) so the trust border is never collapsed by grouping.
//
// Trust boundary: the per-message `save_to_agent_memory` border + saved/off-record
// footer stay on --inferred-* + Sparkles/EyeOff, byte-for-byte in behavior.
// Presence/identity (peer name) carries NO trust tokens.
// ─────────────────────────────────────────────────────────────
import React from "react";
import { Sparkles, EyeOff } from "lucide-react";
import type { MessageGroup as Group } from "@/lib/messaging-format";
import { formatRelativeTime, formatExactTime } from "@/lib/messaging-format";
import { PeerPopover, type Peer } from "./ProfileCard";

export function MessageGroup({
  group,
  selfId,
  senderName,
  peer,
  peerOnline = false,
  onMessage,
}: {
  group: Group;
  selfId: string;
  /** Resolved display name for the group's sender. */
  senderName: string;
  /** Directory entry for the sender (M5 profile card). null when self/unknown. */
  peer?: Peer | null;
  peerOnline?: boolean;
  onMessage?: (peer: Peer) => void;
}) {
  const mine = group.senderId === selfId;

  const nameEl = (
    <span className="text-[11px] font-semibold" style={{ color: "var(--ink-2)" }}>
      {mine ? "You" : senderName}
    </span>
  );

  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div className="mb-0.5 flex items-baseline gap-2 px-1">
        {!mine && peer ? (
          <PeerPopover peer={peer} online={peerOnline} onMessage={onMessage}>
            {nameEl}
          </PeerPopover>
        ) : (
          nameEl
        )}
        <time
          className="text-[10px]"
          style={{ color: "var(--ink-3)" }}
          dateTime={group.startedAt}
          title={formatExactTime(group.startedAt)}
        >
          {formatRelativeTime(group.startedAt)}
        </time>
      </div>

      <div className={`flex w-full flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
        {group.messages.map((m) => (
          <div
            key={m.id}
            className="max-w-[78%] rounded-2xl px-3 py-2"
            style={{
              background: mine ? "var(--accent-soft)" : "var(--surface-2)",
              color: "var(--ink)",
              border: m.save_to_agent_memory ? "1px solid var(--inferred-fg)" : "1px solid transparent",
            }}
          >
            <p className="whitespace-pre-wrap text-[13px]">{m.body}</p>
            <div className="mt-0.5 flex items-center justify-end gap-1">
              {m.save_to_agent_memory ? (
                <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--inferred-fg)" }}>
                  <Sparkles size={9} /> Saved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--ink-3)" }}>
                  <EyeOff size={9} /> Off the record
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
