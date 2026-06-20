"use client";
// components/verification/VerificationCandidatesPanel.tsx
// ─────────────────────────────────────────────────────────────
// VP-1 — READ-ONLY review surface: "Verification candidates (in review)".
//
// Reachable by manager+ (reviewer scope) and by a subject (own scope). RLS
// (verification-pipeline.sql) does the real scoping; this component only reads
// and offers the single allowed client mutation: REJECT. There is NO attest
// control in VP-1 (attestation is promote_candidate(), VP-5).
//
// TRUST DISCIPLINE (non-negotiable): this surface is AMBER-ONLY. Candidates are
// AI inference / in-staging — Sparkles + --inferred-fg/-bg throughout. NOTHING
// here renders blue (verified) and NOTHING here renders a numeric probability:
// confidence is shown ONLY as a Low/Med/High band (Q6).
//
// Built entirely on Batch 1 primitives (Card, Badge, StatusPill, DataTable,
// Skeleton, EmptyState, Button, Modal) + Cairn tokens. Light + dark.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  FileText,
  MessageSquare,
  CheckSquare,
  BarChart3,
  FolderGit2,
  Inbox,
  AlertTriangle,
  EyeOff,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Button,
  Skeleton,
  EmptyState,
  Modal,
  useToast,
} from "@/components/ui";
import {
  listCandidatesForReviewer,
  listCandidatesForSubject,
  getCandidateEvidence,
  rejectCandidate,
  targetKindLabel,
  sourceTypeLabel,
  type CandidateRow,
  type ConfidenceBand,
  type EvidenceRow,
} from "@/lib/verification/staging";
import { attestCandidate } from "@/lib/verification/promote";
import type { IngestionSourceType } from "@/lib/verification/ingest";

type Scope = { mode: "reviewer" } | { mode: "subject"; subjectId: string };

export interface VerificationCandidatesPanelProps {
  userId: string;
  /** "reviewer" = manager/leader scope (their reports); "subject" = own candidates. */
  scope?: Scope;
}

// Amber band chip. Coarse only — never a numeric probability (Q6).
function BandChip({ band }: { band: ConfidenceBand | null }) {
  if (!band) return <span style={{ color: "var(--ink-3)" }}>—</span>;
  return (
    <Badge tone="inferred" icon={<Sparkles size={11} />}>
      {band} confidence
    </Badge>
  );
}

const SOURCE_ICON: Record<IngestionSourceType, React.ReactNode> = {
  documentation: <FileText size={14} />,
  message: <MessageSquare size={14} />,
  verified_task: <CheckSquare size={14} />,
  kpi: <BarChart3 size={14} />,
  project: <FolderGit2 size={14} />,
};

// Keyed on candidateId by the parent, so a different candidate remounts this
// with fresh initial state — no synchronous reset inside the effect.
function EvidenceList({ candidateId }: { candidateId: string }) {
  const [rows, setRows] = useState<EvidenceRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCandidateEvidence(candidateId)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  if (error) {
    return (
      <p className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--danger-fg)" }}>
        <AlertTriangle size={13} /> Couldn&apos;t load evidence.
      </p>
    );
  }
  if (rows === null) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
        No linked evidence recorded.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((e) => (
        <li
          key={`${e.candidate_id}:${e.ingestion_id}`}
          className="flex items-center gap-2 text-[12px]"
          style={{ color: "var(--ink-2)" }}
        >
          <span className="inline-flex shrink-0" style={{ color: "var(--inferred-fg)" }} aria-hidden>
            {SOURCE_ICON[e.source_type] ?? <FileText size={14} />}
          </span>
          <span className="font-medium">{sourceTypeLabel(e.source_type)}</span>
          {e.redacted ? (
            <span
              className="inline-flex items-center gap-1 text-[11px]"
              style={{ color: "var(--ink-3)" }}
              title="Content suppressed by the subject — metadata only"
            >
              <EyeOff size={11} /> content suppressed
            </span>
          ) : (
            <span className="font-mono text-[11px]" style={{ color: "var(--ink-3)" }}>
              {e.source_id ? `#${e.source_id.slice(0, 8)}` : ""}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function CandidateCard({
  row,
  onReject,
  onAttest,
  canAttest,
}: {
  row: CandidateRow;
  onReject: (row: CandidateRow) => void;
  onAttest: (row: CandidateRow) => void;
  /** Manager+ reviewer scope — the only context the amber→blue mint is offered. */
  canAttest: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card
      padding="none"
      style={{
        // Amber-tinted surface so the in-review status reads at a glance.
        background: "color-mix(in srgb, var(--inferred-bg) 45%, var(--surface))",
        borderColor: "color-mix(in srgb, var(--inferred-fg) 24%, var(--line))",
      }}
    >
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="inferred" icon={<Sparkles size={11} />}>
              In review
            </Badge>
            <Badge tone="neutral">{targetKindLabel(row.target_kind)}</Badge>
            <BandChip band={row.band} />
          </div>
          <p className="text-[14px] font-medium leading-snug" style={{ color: "var(--ink)" }}>
            {row.claim}
          </p>
          <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
            Staged {new Date(row.created_at).toLocaleDateString()} · not yet verified
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {canAttest && (
            // Produces a VERIFIED record — blue/shield framing is correct on the
            // OUTCOME. The candidate itself stays amber until this completes.
            <Button
              variant="primary"
              size="sm"
              onClick={() => onAttest(row)}
              leadingIcon={<ShieldCheck size={14} />}
              // The amber→blue mint: color this with the VERIFIED token, not the
              // generic accent, so the action reads as "turns this verified".
              style={{ background: "var(--verified-fg)", color: "#FFFFFF" }}
            >
              Attest
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onReject(row)}>
            Reject
          </Button>
        </div>
      </div>
      <div className="border-t px-5 py-2" style={{ borderColor: "color-mix(in srgb, var(--inferred-fg) 18%, var(--line))" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-[12px] font-medium transition-colors"
          style={{ color: "var(--inferred-fg)" }}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Provenance &amp; evidence
        </button>
        {open && (
          <div className="mt-2 pl-5">
            <EvidenceList key={row.id} candidateId={row.id} />
          </div>
        )}
      </div>
    </Card>
  );
}

export function VerificationCandidatesPanel({
  userId,
  scope = { mode: "reviewer" },
}: VerificationCandidatesPanelProps) {
  const toast = useToast();
  const [rows, setRows] = useState<CandidateRow[] | null>(null);
  const [error, setError] = useState(false);
  // Bumping this re-runs the load effect (retry / refresh) without a
  // synchronous setState in the effect body.
  const [reloadKey, setReloadKey] = useState(0);

  // Reject modal state.
  const [rejectTarget, setRejectTarget] = useState<CandidateRow | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Attest (amber→blue mint) modal state.
  const [attestTarget, setAttestTarget] = useState<CandidateRow | null>(null);
  const [attesting, setAttesting] = useState(false);

  // The mint is offered ONLY in reviewer (manager+/leader) scope; never on a
  // subject's own self-view. The RPC re-enforces authority server-side
  // regardless (auth.uid() must be manager/leader/admin/hr of the subject).
  const canAttest = scope.mode === "reviewer";

  useEffect(() => {
    let cancelled = false;
    // State updates happen only after an await, inside the async flow — never
    // synchronously in the effect body.
    (async () => {
      try {
        const data =
          scope.mode === "subject"
            ? await listCandidatesForSubject(scope.subjectId)
            : await listCandidatesForReviewer();
        if (!cancelled) {
          setRows(data);
          setError(false);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Depend on the scope's primitive fields (not the object identity) so an
    // inline `scope` prop doesn't re-trigger the fetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.mode, scope.mode === "subject" ? scope.subjectId : null, reloadKey]);

  const reload = useCallback(() => {
    setRows(null);
    setError(false);
    setReloadKey((k) => k + 1);
  }, []);

  const confirmReject = async () => {
    if (!rejectTarget) return;
    setSubmitting(true);
    try {
      await rejectCandidate(rejectTarget.id, reason.trim() || "No reason given", userId);
      toast.success("Candidate rejected.");
      setRows((prev) => (prev ? prev.filter((r) => r.id !== rejectTarget.id) : prev));
      setRejectTarget(null);
      setReason("");
    } catch {
      toast.error("Couldn't reject this candidate.");
    } finally {
      setSubmitting(false);
    }
  };

  // The one place amber → blue happens: promote_candidate() mints a verified
  // record. Optimistically drop the row on success (mirrors reject).
  const confirmAttest = async () => {
    if (!attestTarget) return;
    setAttesting(true);
    try {
      await attestCandidate(attestTarget.id);
      toast.success("Verified record created.");
      setRows((prev) => (prev ? prev.filter((r) => r.id !== attestTarget.id) : prev));
      setAttestTarget(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(
        msg && /not authorized/i.test(msg)
          ? "You're not authorized to attest for this person."
          : "Couldn't create the verified record.",
      );
    } finally {
      setAttesting(false);
    }
  };

  return (
    <Card padding="none">
      <CardHeader>
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: "var(--inferred-fg)" }} aria-hidden />
            <CardTitle>Verification candidates</CardTitle>
          </div>
          <CardDescription>In review — not yet verified.</CardDescription>
        </div>
      </CardHeader>

      <div className="p-5">
        {rows === null ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading candidates">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[var(--radius-lg)] border p-4 space-y-3"
                style={{ borderColor: "var(--line)", background: "var(--surface)" }}
              >
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={<AlertTriangle size={22} />}
            title="Couldn't load candidates"
            description="Something went wrong reading the review queue. Try again."
            action={
              <Button variant="secondary" size="sm" onClick={reload}>
                Retry
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Inbox size={22} />}
            title="No candidates in review"
            description="When evidence is staged into a candidate, it'll appear here for review. Nothing is verified until a person attests it."
          />
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <CandidateCard
                key={row.id}
                row={row}
                onReject={setRejectTarget}
                onAttest={setAttestTarget}
                canAttest={canAttest}
              />
            ))}
          </div>
        )}
      </div>

      <Modal
        open={rejectTarget !== null}
        onClose={() => { if (!submitting) { setRejectTarget(null); setReason(""); } }}
        title="Reject candidate"
        description="This dismisses the staged candidate. It is not a verified record either way."
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setRejectTarget(null); setReason(""); }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button variant="destructive" size="sm" loading={submitting} onClick={confirmReject}>
              Reject candidate
            </Button>
          </>
        }
      >
        {rejectTarget && (
          <div className="space-y-3">
            <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
              {rejectTarget.claim}
            </p>
            <label className="block text-[12px] font-medium" style={{ color: "var(--ink-2)" }}>
              Reason (optional)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Why is this not accurate?"
                className="mt-1 w-full rounded-[var(--radius-md)] border px-3 py-2 text-[13px] outline-none focus:ring-2"
                style={{
                  borderColor: "var(--line)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                }}
              />
            </label>
          </div>
        )}
      </Modal>

      {/* Attest = the single amber→blue mint. Shield/verified framing is correct
          HERE because the OUTCOME is a verified record. The copy must make the
          gravity unmistakable. */}
      <Modal
        open={attestTarget !== null}
        onClose={() => { if (!attesting) setAttestTarget(null); }}
        title="Create a verified record"
        description="This promotes the staged candidate into a verified, attested record. This action is the boundary between estimate and verified fact."
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAttestTarget(null)}
              disabled={attesting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={attesting}
              leadingIcon={<ShieldCheck size={15} />}
              onClick={confirmAttest}
              // Verified token (not the generic accent) — this is the amber→blue mint.
              style={{ background: "var(--verified-fg)", color: "#FFFFFF" }}
            >
              Attest &amp; verify
            </Button>
          </>
        }
      >
        {attestTarget && (
          <div className="space-y-3">
            <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
              {attestTarget.claim}
            </p>
            <div
              className="flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2.5"
              style={{
                background: "var(--verified-bg)",
                borderColor: "color-mix(in srgb, var(--verified-fg) 28%, var(--line))",
              }}
            >
              <ShieldCheck
                size={16}
                className="mt-0.5 shrink-0"
                style={{ color: "var(--verified-fg)" }}
                aria-hidden
              />
              <p className="text-[12px]" style={{ color: "var(--ink-2)" }}>
                You are attesting this as a fact. It will be stored as a verified
                record under your name and cannot be undone here.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
