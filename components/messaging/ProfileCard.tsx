// components/messaging/ProfileCard.tsx
// ─────────────────────────────────────────────────────────────
// Lightweight identity card (M5) shown on hover/click of a peer's name or
// avatar: full name, title, department, presence dot, and a "Message" action.
//
// This surfaces IDENTITY only — it MUST NOT render VerifiedBadge / AIEstimateBadge
// or any trust (verified/inferred) tokens. Presence uses the neutral PresenceDot.
// All peer data is read from the already-fetched, org_id-scoped `profiles`
// select — no new query path, no widened scope.
// Presentation only.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useId, useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { Button, Card, CardBody, Modal, Skeleton } from "@/components/ui";
import { PresenceDot } from "./PresenceDot";

/** Breakpoint below which the hovercard renders as a centered Modal (P2). */
const SMALL_VIEWPORT = 480;

function useIsSmallViewport(): boolean {
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${SMALL_VIEWPORT - 1}px)`);
    const apply = () => setSmall(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return small;
}

export type Peer = {
  id: string;
  name: string;
  title?: string | null;
  department?: string | null;
  avatarUrl?: string | null;
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function PeerAvatar({
  peer,
  size = 32,
}: {
  peer: Pick<Peer, "name" | "avatarUrl">;
  size?: number;
}) {
  if (peer.avatarUrl) {
    return (
      // Avatars are mock data URLs / arbitrary external links (see
      // profiles.avatar_url comment) — next/image needs configured hosts, so a
      // plain <img> is correct for this presentation-only surface.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={peer.avatarUrl}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: "var(--accent-soft)",
        color: "var(--accent-text)",
      }}
    >
      {initials(peer.name) || "?"}
    </span>
  );
}

export function ProfileCard({
  peer,
  online,
  loading = false,
  onMessage,
  onClose,
}: {
  peer: Peer | null;
  online: boolean;
  loading?: boolean;
  onMessage?: (peer: Peer) => void;
  /** When provided, renders a top-right close affordance (icon-only, labeled). */
  onClose?: () => void;
}) {
  return (
    <Card className="relative w-[248px]" style={{ boxShadow: "var(--shadow-lg)" }}>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close profile card"
          className="absolute right-1.5 top-1.5 z-10 grid size-6 place-items-center rounded-full transition-colors hover:bg-[var(--surface-2)]"
          style={{ color: "var(--ink-3)" }}
        >
          <X size={13} />
        </button>
      )}
      <CardBody className="p-4">
        {loading || !peer ? (
          <div className="flex items-center gap-3">
            <Skeleton circle className="size-10" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="relative">
                <PeerAvatar peer={peer} size={40} />
                <span className="absolute -bottom-0.5 -right-0.5">
                  <PresenceDot online={online} size={11} ring />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                  {peer.name}
                </p>
                <p className="truncate text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {peer.title?.trim() || "—"}
                </p>
                {peer.department?.trim() && (
                  <p className="truncate text-[11px]" style={{ color: "var(--ink-3)" }}>
                    {peer.department.trim()}
                  </p>
                )}
                <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
                  {online ? "Online now" : "Offline"}
                </p>
              </div>
            </div>
            {onMessage && (
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                className="mt-3"
                leadingIcon={<MessageSquare size={14} />}
                onClick={() => onMessage(peer)}
              >
                Message
              </Button>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** Grace period so the cursor can travel from the trigger into the card (P2). */
const CLOSE_DELAY_MS = 150;

/**
 * Hover/focus popover that surfaces a ProfileCard for `peer`. The trigger is
 * the supplied children (a name or avatar). Opens on hover and keyboard focus,
 * closes on blur / Escape. A short close delay (with a hover bridge over both
 * the trigger and the card) lets the cursor reach the "Message" button without
 * the card snapping shut. On small viewports the card renders in the Modal
 * primitive instead of an absolute popover that could overflow the edge.
 */
export function PeerPopover({
  peer,
  online,
  onMessage,
  children,
  align = "left",
}: {
  peer: Peer | null;
  online: boolean;
  onMessage?: (peer: Peer) => void;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const small = useIsSmallViewport();

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  useEffect(() => cancelClose, []);

  if (!peer) return <>{children}</>;

  const trigger = (
    <button
      type="button"
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-describedby={open && !small ? id : undefined}
      className="cursor-pointer rounded-sm px-0.5 outline-none focus-visible:ring-2"
      onClick={() => setOpen((v) => !v)}
    >
      {children}
    </button>
  );

  // Small viewport: a centered Modal avoids an absolute popover overflowing.
  if (small) {
    return (
      <>
        {trigger}
        <Modal open={open} onClose={() => setOpen(false)} size="sm" hideClose>
          <div className="py-1">
            <ProfileCard
              peer={peer}
              online={online}
              onMessage={onMessage}
              onClose={() => setOpen(false)}
            />
          </div>
        </Modal>
      </>
    );
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      onFocus={() => {
        cancelClose();
        setOpen(true);
      }}
      onBlur={scheduleClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          cancelClose();
          setOpen(false);
        }
      }}
    >
      {trigger}
      {open && (
        <span
          id={id}
          role="dialog"
          aria-label={`${peer.name} profile`}
          className="absolute bottom-full z-50 pb-1.5"
          style={align === "right" ? { right: 0 } : { left: 0 }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <ProfileCard
            peer={peer}
            online={online}
            onMessage={onMessage}
            onClose={() => setOpen(false)}
          />
        </span>
      )}
    </span>
  );
}
