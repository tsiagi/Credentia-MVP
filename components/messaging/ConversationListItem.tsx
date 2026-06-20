// components/messaging/ConversationListItem.tsx
// ─────────────────────────────────────────────────────────────
// One row in the conversation list (M1). Presentational — receives an
// already-fetched, org_id-scoped Conversation and renders it.
//
// Trust boundary: the `agent_memory_default` sparkle (amber + Sparkles) is the
// ONLY trust affordance here and stays on --inferred-fg. Presence (M3) is
// identity, rendered via the neutral PresenceDot — never trust tokens. The M4
// unread Badge is an activity signal, rendered NEUTRAL — never trust tokens,
// never shield/sparkle.
// ─────────────────────────────────────────────────────────────
import React from "react";
import { MessageSquare, Hash, Sparkles } from "lucide-react";
import { Badge, cn } from "@/components/ui";
import type { ConversationWithMeta } from "@/lib/messaging";
import { PresenceDot } from "./PresenceDot";

export function ConversationListItem({
  conversation,
  active,
  /** Presence of the direct-message peer, when known. null = not applicable. */
  peerOnline,
  onSelect,
}: {
  conversation: ConversationWithMeta;
  active: boolean;
  peerOnline?: boolean | null;
  onSelect: () => void;
}) {
  const c = conversation;
  const isTask = c.kind === "task";
  const label = c.title ?? (isTask ? "Task thread" : "Direct message");
  const unread = c.unread_count > 0;

  return (
    <button
      type="button"
      data-conv-row
      role="option"
      aria-selected={active}
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "w-full text-left px-3 py-2 rounded-[var(--radius-md)]",
        "transition-colors duration-150",
      )}
      style={{ background: active ? "var(--surface)" : "transparent" }}
    >
      <div className="flex items-center gap-1.5">
        <span className="relative inline-flex shrink-0 items-center">
          {isTask ? (
            <Hash size={13} style={{ color: "var(--ink-3)" }} />
          ) : (
            <MessageSquare size={13} style={{ color: "var(--ink-3)" }} />
          )}
          {peerOnline != null && (
            <span className="absolute -bottom-1 -right-1">
              <PresenceDot online={peerOnline} size={7} ring />
            </span>
          )}
        </span>
        <span
          className={cn("truncate text-[13px]", unread ? "font-semibold" : "font-medium")}
          style={{ color: "var(--ink)" }}
        >
          {label}
        </span>
        {isTask && (
          <Badge tone="neutral" className="ml-1 px-1.5 py-0 text-[10px]">
            Task
          </Badge>
        )}
        {c.agent_memory_default && (
          <Sparkles
            size={12}
            className={cn("shrink-0", unread ? "" : "ml-auto")}
            style={{ color: "var(--inferred-fg)" }}
            aria-label="Learning on"
          />
        )}
        {unread && (
          // Activity signal only — NEUTRAL tone, no trust language.
          <Badge
            tone="neutral"
            className="ml-auto min-w-[18px] justify-center px-1.5 py-0 text-[10px]"
            aria-label={`${c.unread_count} unread`}
          >
            {c.unread_count > 99 ? "99+" : c.unread_count}
          </Badge>
        )}
      </div>
    </button>
  );
}
