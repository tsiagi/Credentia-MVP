"use client";
// components/verification/PassportInReviewSection.tsx
// ─────────────────────────────────────────────────────────────
// VP-7 — In-app Passport "In review — not yet verified" section.
//
// A READ-ONLY amber section for the AUTHENTICATED in-app Passport view. It
// surfaces the viewer's in-staging verification candidates (subject scope)
// sourced from listCandidatesForSubject() — the SAME RLS-scoped read used by
// the review queue. There is NO write here: this is a passive "what's pending"
// display, not a review surface (reject/attest live in
// VerificationCandidatesPanel under reviewer scope).
//
// TRUST WALL (non-negotiable):
//   • These rows are AI inference / staging — AMBER ONLY. Sparkles +
//     --inferred-fg/-bg throughout. NOTHING here renders blue/ShieldCheck/
//     --verified-* — that language is reserved for real verified_* records.
//   • Candidates are NOT counted toward titleLevel, the verified count, score,
//     or any verified metric. They come from a SEPARATE source and are never
//     merged into the verified vault/timeline arrays.
//   • Confidence is shown ONLY as a coarse Low/Med/High band (Q6) — never a
//     numeric probability.
//   • PUBLIC passport stays candidate-blind: this component renders ONLY in the
//     authenticated in-app view. The caller must NOT mount it on the public
//     slug or the in-app "public preview" toggle.
//
// Empty / loading: renders NOTHING when there's nothing in review (never a
// blank gap, never implies something is pending when it isn't). While loading
// it renders nothing too — the section simply appears once candidates resolve.
//
// Built on Batch 1 primitives (Card, Badge) + Core-Roborate tokens. Light + dark.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { Sparkles, Clock } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import {
  listCandidatesForSubject,
  targetKindLabel,
  type CandidateRow,
  type ConfidenceBand,
} from "@/lib/verification/staging";

export interface PassportInReviewSectionProps {
  /** The Passport subject whose in-review candidates to surface (own self-view). */
  subjectId: string;
}

// Amber band chip. Coarse only — never a numeric probability (Q6).
function BandChip({ band }: { band: ConfidenceBand | null }) {
  if (!band) return null;
  return (
    <Badge tone="inferred" icon={<Sparkles size={11} />}>
      AI confidence: {band}
    </Badge>
  );
}

function ReviewRow({ row }: { row: CandidateRow }) {
  return (
    <li
      className="rounded-[var(--radius-md)] border px-4 py-3"
      style={{
        // Amber-tinted surface so the in-review status reads at a glance.
        background: "color-mix(in srgb, var(--inferred-bg) 45%, var(--surface))",
        borderColor: "color-mix(in srgb, var(--inferred-fg) 24%, var(--line))",
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="inferred" icon={<Sparkles size={11} />}>
          In review
        </Badge>
        <Badge tone="neutral">{targetKindLabel(row.target_kind)}</Badge>
        <BandChip band={row.band} />
      </div>
      <p className="mt-2 text-[14px] font-medium leading-snug" style={{ color: "var(--ink)" }}>
        {row.claim}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--ink-3)" }}>
        <Clock size={11} aria-hidden />
        In review — not yet verified
      </p>
    </li>
  );
}

/**
 * Amber "In review" section for the in-app Passport. Renders nothing until
 * candidates resolve, and nothing at all if there are none.
 */
export function PassportInReviewSection({ subjectId }: PassportInReviewSectionProps) {
  const [rows, setRows] = useState<CandidateRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listCandidatesForSubject(subjectId, {
          states: ["pending", "shadow_approved"],
        });
        if (!cancelled) setRows(data);
      } catch {
        // Quiet failure: this is a supplementary, non-blocking surface. Never
        // imply something is pending when we couldn't load it.
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  // Nothing in review (or still loading / errored) → render nothing. No blank
  // gap, no false "pending" impression.
  if (!rows || rows.length === 0) return null;

  return (
    <Card padding="none">
      <div className="px-6 py-4 border-b" style={{ borderColor: "var(--line)" }}>
        <div className="flex items-center gap-2">
          <Sparkles size={16} style={{ color: "var(--inferred-fg)" }} aria-hidden />
          <h3 className="text-[15px] font-semibold leading-tight" style={{ color: "var(--ink)" }}>
            In review — not yet verified
          </h3>
          <Badge tone="inferred">AI-suggested</Badge>
        </div>
        <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
          AI-suggested candidates awaiting a person&apos;s attestation. These are estimates, not
          achievements — they count toward nothing on your record until a manager verifies them, and
          they never appear on your shareable public passport.
        </p>
      </div>
      <ul className="space-y-2 p-5">
        {rows.map((row) => (
          <ReviewRow key={row.id} row={row} />
        ))}
      </ul>
    </Card>
  );
}
