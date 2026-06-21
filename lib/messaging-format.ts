// lib/messaging-format.ts
// ─────────────────────────────────────────────────────────────
// Pure presentational helpers for the messaging UI: group consecutive
// messages by sender, insert day dividers, and format relative times.
//
// NO Supabase, NO side effects — pure functions only, so they are trivially
// testable and safe to call during render. This file knows nothing about
// trust/verified/AI semantics; it only shapes message rows for display.
// ─────────────────────────────────────────────────────────────
import type { Message } from "@/lib/messaging";

/** A run of consecutive messages from the same sender on the same day. */
export type MessageGroup = {
  /** Stable key — the id of the first message in the run. */
  key: string;
  senderId: string | null;
  /** ISO timestamp of the first message in the group (for the header time). */
  startedAt: string;
  messages: Message[];
};

/** A day divider marker, e.g. "Today", "Yesterday", or "June 14, 2026". */
export type DayDivider = {
  type: "divider";
  key: string;
  label: string;
};

export type GroupItem = (MessageGroup & { type: "group" }) | DayDivider;

/** Max gap between messages from the same sender that still groups them. */
const GROUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Human day label relative to `now` (defaults to current time). */
export function formatDayDivider(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const today = dayKey(now.toISOString());
  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
  const k = dayKey(iso);
  if (k === today) return "Today";
  if (k === yesterday) return "Yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Short relative time for a group header, e.g. "just now", "12m", "3:42 PM". */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diff = now.getTime() - then;
  if (diff < 45 * 1000) return "just now";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const sameDay = dayKey(iso) === dayKey(now.toISOString());
  if (sameDay) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const hrs = Math.round(diff / 3600000);
  if (hrs < 24) return `${hrs}h`;
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Exact timestamp for a per-message tooltip / title attribute. */
export function formatExactTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Build the ordered render list: day dividers interleaved with sender groups.
 * Messages are assumed pre-sorted ascending by created_at (as fetchMessages
 * returns them). A new group starts on sender change, day change, or when the
 * gap from the previous message exceeds GROUP_WINDOW_MS.
 */
export function buildMessageGroups(messages: Message[]): GroupItem[] {
  const items: GroupItem[] = [];
  let current: (MessageGroup & { type: "group" }) | null = null;
  let lastDay: string | null = null;
  let lastAt = 0;

  for (const m of messages) {
    const thisDay = dayKey(m.created_at);
    const at = new Date(m.created_at).getTime();

    if (thisDay !== lastDay) {
      items.push({
        type: "divider",
        key: `divider-${thisDay}`,
        label: formatDayDivider(m.created_at),
      });
      lastDay = thisDay;
      current = null; // force a fresh group after a divider
    }

    const sameSender = current && current.senderId === m.sender_id;
    const withinWindow = at - lastAt <= GROUP_WINDOW_MS;

    if (current && sameSender && withinWindow) {
      current.messages.push(m);
    } else {
      current = {
        type: "group",
        key: m.id,
        senderId: m.sender_id,
        startedAt: m.created_at,
        messages: [m],
      };
      items.push(current);
    }
    lastAt = at;
  }

  return items;
}
