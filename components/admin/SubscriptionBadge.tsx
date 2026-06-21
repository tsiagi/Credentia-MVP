// components/admin/SubscriptionBadge.tsx
// Subscription status pill shared by the superadmin company grid and the
// company-admin Company view. Neutral commercial state — not a trust signal,
// so it never uses the verified (blue) / inferred (amber) trust tones.
"use client";

import React from "react";
import { Badge } from "@/components/ui";

const MAP: Record<string, { tone: React.ComponentProps<typeof Badge>["tone"]; label: string }> = {
  trial: { tone: "accent", label: "Trial" },
  active: { tone: "success", label: "Active" },
  past_due: { tone: "warn", label: "Past due" },
  canceled: { tone: "neutral", label: "Canceled" },
};

export function SubscriptionBadge({ status, plan }: { status: string; plan?: string | null }) {
  const s = MAP[status] ?? MAP.trial;
  return (
    <Badge tone={s.tone}>
      {plan ? `${plan} · ${s.label}` : s.label}
    </Badge>
  );
}
