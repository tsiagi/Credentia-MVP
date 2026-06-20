// components/messaging/PresenceDot.tsx
// ─────────────────────────────────────────────────────────────
// Tiny online/offline indicator (M3). Presence is IDENTITY — neither a
// verified fact nor an AI inference — so this uses NEUTRAL/STATUS tokens only:
//   online  → green (--presence-online, theme-aware success green)
//   offline → --presence-offline (muted gray)
// NEVER --verified-*/--inferred-*, NEVER shield/sparkle iconography.
// Presentation only.
// ─────────────────────────────────────────────────────────────
import React from "react";
import { cn } from "@/components/ui";

export function PresenceDot({
  online,
  size = 8,
  className,
  ring = false,
}: {
  online: boolean;
  /** Diameter in px. */
  size?: number;
  className?: string;
  /** Surface-colored ring, e.g. when overlapping an avatar. */
  ring?: boolean;
}) {
  return (
    <span
      role="img"
      aria-label={online ? "Online" : "Offline"}
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: online ? "var(--presence-online)" : "var(--presence-offline)",
        boxShadow: ring ? "0 0 0 2px var(--surface)" : undefined,
      }}
    />
  );
}
