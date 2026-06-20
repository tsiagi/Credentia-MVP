// components/messaging/PeoplePicker.tsx
// ─────────────────────────────────────────────────────────────
// Type-to-filter "Start a chat with…" picker (M7 P1). Replaces the native
// <select> so it scales past dozens of peers and is fully keyboard-driven:
//   • input is auto-focused on open
//   • ↑/↓ move the highlight, Enter selects, Escape closes
//   • presence shown via the neutral PresenceDot (identity, never trust)
//
// Built on the Modal primitive + existing tokens. Presentation only — it picks
// an already-fetched, org_id-scoped peer; it never queries or widens scope.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, MessageSquare, Loader2 } from "lucide-react";
import { Modal, EmptyState, cn } from "@/components/ui";
import { PeerAvatar, type Peer } from "./ProfileCard";
import { PresenceDot } from "./PresenceDot";

export function PeoplePicker({
  open,
  peers,
  onlineIds,
  onSelect,
  onClose,
}: {
  open: boolean;
  peers: Peer[];
  onlineIds: Set<string>;
  /** May return a promise; the picker shows a spinner and stays open until it settles. */
  onSelect: (peerId: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeRaw, setActive] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Select a peer. If onSelect is async, keep the picker open with a spinner on
  // the chosen row until it settles, then close — so a slow create has feedback.
  async function choose(peerId: string) {
    if (busyId) return;
    const result = onSelect(peerId);
    if (result && typeof (result as Promise<void>).then === "function") {
      setBusyId(peerId);
      try {
        await result;
      } finally {
        setBusyId(null);
      }
    }
    onClose();
  }

  // Reset state and focus the input each time the picker opens. The state
  // resets are deferred off the effect body to avoid the cascading-render lint.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setQuery("");
      setActive(0);
      setBusyId(null);
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? peers.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.title ?? "").toLowerCase().includes(q),
        )
      : peers;
    // Online peers first, then alphabetical — a small quality-of-life sort.
    return [...base].sort((a, b) => {
      const ao = onlineIds.has(a.id) ? 0 : 1;
      const bo = onlineIds.has(b.id) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
  }, [peers, query, onlineIds]);

  // Clamp the active index to the current filtered range at render time (no
  // effect/setState needed — the raw index is the source of truth).
  const active = filtered.length === 0 ? 0 : Math.min(activeRaw, filtered.length - 1);

  // Scroll the highlighted row into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (busyId) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const peer = filtered[active];
      if (peer) void choose(peer.id);
    }
    // Escape is handled by the Modal primitive (onClose).
  }

  return (
    <Modal open={open} onClose={onClose} title="Start a conversation" size="sm">
      <div className="pb-2">
        <div
          className="mb-3 flex items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-2"
          style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}
        >
          <Search size={15} style={{ color: "var(--ink-3)" }} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search colleagues…"
            aria-label="Search colleagues"
            aria-controls="people-picker-list"
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--ink)" }}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            className="px-2 py-6"
            icon={<MessageSquare size={18} />}
            title="No colleagues found"
            description={query ? "Try a different name." : "No one else is in this workspace yet."}
          />
        ) : (
          <ul
            ref={listRef}
            id="people-picker-list"
            role="listbox"
            aria-label="Colleagues"
            className="max-h-[280px] space-y-0.5 overflow-y-auto"
          >
            {filtered.map((p, i) => {
              const online = onlineIds.has(p.id);
              const isActive = i === active;
              const busy = busyId === p.id;
              return (
                <li key={p.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-idx={i}
                    disabled={busyId !== null}
                    onMouseEnter={() => !busyId && setActive(i)}
                    onClick={() => void choose(p.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-left",
                      "transition-colors duration-150 disabled:cursor-default",
                    )}
                    style={
                      isActive
                        ? { background: "var(--accent-soft)", boxShadow: "inset 0 0 0 1px var(--accent-line)" }
                        : { background: "transparent" }
                    }
                  >
                    <span className="relative inline-flex shrink-0">
                      <PeerAvatar peer={p} size={30} />
                      <span className="absolute -bottom-0.5 -right-0.5">
                        <PresenceDot online={online} size={9} ring />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                        {p.name}
                      </span>
                      {p.title?.trim() && (
                        <span className="block truncate text-[11px]" style={{ color: "var(--ink-3)" }}>
                          {p.title.trim()}
                        </span>
                      )}
                    </span>
                    {busy ? (
                      <Loader2 size={14} className="shrink-0 animate-spin" style={{ color: "var(--accent)" }} aria-label="Starting conversation" />
                    ) : online ? (
                      <span className="shrink-0 text-[10px] font-medium" style={{ color: "var(--presence-online)" }}>
                        Online
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
