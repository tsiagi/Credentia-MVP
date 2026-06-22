"use client";
// components/verification/OverseerOversightPanel.tsx
// ─────────────────────────────────────────────────────────────
// VP-6 — Overseer oversight surface (manager+/leader read; exec/admin act).
//
// Lists overseer rules with lifecycle + shadow agreement metrics + recent shadow
// decisions (proof-of-context expandable). Exec/admin get Enable (only when the
// Q4 gate is met — disabled + explained otherwise) and a prominent Pause
// (kill-switch).
//
// TRUST FRAMING:
//   • Rules / shadow decisions are AI MACHINERY → amber + Sparkles where they
//     are inference. A verified OUTCOME (an enacted auto-attest) is the only
//     blue thing, and even then the candidate machinery stays amber.
//   • Enabling automation is framed as a WEIGHTY, explicit HUMAN act — never
//     "the AI decides." The copy always says a human enables.
//   • This is the OPERATOR console, so a numeric agreement % is allowed here
//     (Q6's "never a numeric probability" is the EMPLOYEE trust UI). We never
//     imply the AI decides.
//
// Built on Batch 1 primitives + Core-Roborate tokens. Reads via lib/overseer/reads (RLS);
// enable/pause POST to /api/overseer/rule (service-role + Q4 gate server-side).
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  PauseCircle,
  PlayCircle,
  AlertTriangle,
  Inbox,
  Lock,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Button,
  StatusPill,
  Skeleton,
  EmptyState,
  Modal,
  useToast,
  type Status,
} from "@/components/ui";
import {
  listRules,
  listShadowDecisions,
  type RuleWithMetrics,
} from "@/lib/overseer/reads";
import type { ShadowDecisionRow } from "@/lib/overseer/types";
import { Q4_GATE } from "@/lib/overseer/types";
import { supabase } from "@/lib/supabase";

export interface OverseerOversightPanelProps {
  /** The viewer's role — gates whether Enable/Pause render. */
  role: string;
}

const LIFECYCLE_STATUS: Record<string, Status> = {
  draft: "inactive",
  shadow: "pending",
  active: "active",
  paused: "flagged",
  retired: "inactive",
};

function lifecycleLabel(l: string): string {
  switch (l) {
    case "shadow": return "Shadow (observing)";
    case "active": return "Active (auto-attesting)";
    case "paused": return "Paused (kill-switch)";
    case "draft": return "Draft";
    case "retired": return "Retired";
    default: return l;
  }
}

async function postRuleAction(body: {
  ruleId: string;
  action: "enable" | "pause";
  versionId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "Not signed in." };
  const res = await fetch("/api/overseer/rule", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.error ?? "Action failed." };
  return { ok: true };
}

// Days since the oldest human-decided shadow decision (plain helper, not a
// component, so the Date.now() read isn't a render-purity violation).
function ageInDays(firstDecidedAt: string | null | undefined): number | null {
  if (firstDecidedAt == null) return null;
  return Math.floor((Date.now() - new Date(firstDecidedAt).getTime()) / 86_400_000);
}

function AgreementSummary({ item }: { item: RuleWithMetrics }) {
  const m = item.agreement;
  const rate = m?.agreement_rate ?? null;
  const pct = rate == null ? null : Math.round(rate * 100);
  const ageDays = ageInDays(m?.first_decided_at);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]" style={{ color: "var(--ink-2)" }}>
      <span>
        Agreement:{" "}
        <span className="font-mono font-semibold" style={{ color: "var(--ink)" }}>
          {pct == null ? "—" : `${pct}%`}
        </span>
      </span>
      <span>
        Decided:{" "}
        <span className="font-mono">{m?.decided_sample_size ?? 0}/{Q4_GATE.minDecidedSamples}</span>
      </span>
      <span>
        Attestors:{" "}
        <span className="font-mono">{m?.distinct_attestors ?? 0}/{Q4_GATE.minDistinctAttestors}</span>
      </span>
      <span>
        Age:{" "}
        <span className="font-mono">{ageDays == null ? 0 : ageDays}/{Q4_GATE.minAgeDays}d</span>
      </span>
    </div>
  );
}

// Whether the Q4 gate is met for the rule's target version (client-side mirror;
// the server re-enforces in enableRule()).
function gateMet(item: RuleWithMetrics): { met: boolean; unmet: string[] } {
  const m = item.agreement;
  const unmet: string[] = [];
  const rate = m?.agreement_rate ?? null;
  if (rate == null || rate < Q4_GATE.minAgreementRate) {
    unmet.push(`agreement ≥ ${(Q4_GATE.minAgreementRate * 100).toFixed(0)}%`);
  }
  if ((m?.decided_sample_size ?? 0) < Q4_GATE.minDecidedSamples) {
    unmet.push(`≥ ${Q4_GATE.minDecidedSamples} decided decisions`);
  }
  if ((m?.distinct_attestors ?? 0) < Q4_GATE.minDistinctAttestors) {
    unmet.push(`≥ ${Q4_GATE.minDistinctAttestors} distinct attestors`);
  }
  const ageDays =
    m?.first_decided_at != null
      ? Math.floor((Date.now() - new Date(m.first_decided_at).getTime()) / 86_400_000)
      : null;
  if (ageDays == null || ageDays < Q4_GATE.minAgeDays) {
    unmet.push(`≥ ${Q4_GATE.minAgeDays} days of history`);
  }
  return { met: unmet.length === 0, unmet };
}

function ProofRow({ d }: { d: ShadowDecisionRow }) {
  const [open, setOpen] = useState(false);
  const proof = d.proof_of_context;
  const outcomeTone: "success" | "danger" | "neutral" =
    d.agreed === true ? "success" : d.agreed === false ? "danger" : "neutral";
  return (
    <li className="rounded-[var(--radius-md)] border" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-[12px]">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Badge tone="inferred" icon={<Sparkles size={11} />}>
            proposed: {d.proposed_action}
          </Badge>
          {d.was_enacted && (
            <Badge tone="verified" icon={<ShieldCheck size={11} />}>
              auto-attested
            </Badge>
          )}
        </span>
        <span className="flex items-center gap-2">
          {d.human_action && d.human_action !== "pending" ? (
            <Badge tone={outcomeTone}>
              human: {d.human_action} · {d.agreed ? "agreed" : "differed"}
            </Badge>
          ) : (
            <Badge tone="neutral">awaiting human</Badge>
          )}
        </span>
      </button>
      {open && (
        <div className="border-t px-3 py-2 text-[12px]" style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}>
          <p className="mb-2 italic">{proof?.reasoning}</p>
          <ul className="space-y-1">
            {(proof?.matched_predicates ?? []).map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className="mt-0.5 font-mono text-[11px]"
                  style={{ color: p.passed ? "var(--olive-600)" : "var(--danger-fg)" }}
                  role="img"
                  aria-label={p.passed ? "passed" : "failed"}
                >
                  {p.passed ? "✓" : "✕"}
                </span>
                <span>
                  <span className="font-medium">{p.predicate}</span>
                  <span style={{ color: "var(--ink-3)" }}> — {p.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function ShadowDecisions({ ruleId }: { ruleId: string }) {
  const [rows, setRows] = useState<ShadowDecisionRow[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    listShadowDecisions(ruleId)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setError(true));
    return () => { cancelled = true; };
  }, [ruleId]);

  if (error) {
    return <p className="text-[12px]" style={{ color: "var(--danger-fg)" }}>Couldn&apos;t load shadow decisions.</p>;
  }
  if (rows === null) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>No shadow decisions recorded yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((d) => <ProofRow key={d.id} d={d} />)}
    </ul>
  );
}

function RuleCard({
  item,
  canEnable,
  canPause,
  onChanged,
}: {
  item: RuleWithMetrics;
  canEnable: boolean;
  canPause: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [enableTarget, setEnableTarget] = useState(false);
  const [busy, setBusy] = useState(false);
  const { rule } = item;
  const gate = gateMet(item);

  const doEnable = async () => {
    if (!item.activeVersion && !item.latestVersionId) return;
    setBusy(true);
    const res = await postRuleAction({
      ruleId: rule.id,
      action: "enable",
      versionId: item.latestVersionId ?? undefined,
    });
    setBusy(false);
    setEnableTarget(false);
    if (res.ok) { toast.success("Automation enabled by you."); onChanged(); }
    else toast.error(res.error ?? "Couldn't enable.");
  };

  const doPause = async () => {
    setBusy(true);
    const res = await postRuleAction({ ruleId: rule.id, action: "pause" });
    setBusy(false);
    if (res.ok) { toast.success("Rule paused — auto-attestation stopped. You can re-enable it once it re-meets the gate."); onChanged(); }
    else toast.error(res.error ?? "Couldn't pause.");
  };

  const isActive = rule.lifecycle === "active";

  return (
    <Card
      padding="none"
      style={{
        background: "color-mix(in srgb, var(--inferred-bg) 35%, var(--surface))",
        borderColor: "color-mix(in srgb, var(--inferred-fg) 22%, var(--line))",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles size={15} style={{ color: "var(--inferred-fg)" }} aria-hidden />
            <span className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
              {rule.name}
            </span>
            <StatusPill
              status={LIFECYCLE_STATUS[rule.lifecycle] ?? "inactive"}
              label={lifecycleLabel(rule.lifecycle)}
            />
            <Badge tone="neutral">{rule.target_kind}</Badge>
          </div>
          <AgreementSummary item={item} />
        </div>

        {isActive && canPause && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            {/* Kill-switch — the safety control. Shown to anyone who may pause:
                exec/admin (org-wide) and managers (own scope, server-enforced). */}
            <Button
              variant="destructive"
              size="sm"
              loading={busy}
              leadingIcon={<PauseCircle size={15} />}
              onClick={doPause}
            >
              Pause (kill-switch)
            </Button>
            <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
              {canEnable ? "Pauses org-wide" : "Pauses your scope"} · stops instantly
            </span>
          </div>
        )}
        {!isActive && canEnable && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            {/* Enable is exec/admin only. Stays neutral accent until the human
                confirms — the metric crossing the gate alone never reads as "go". */}
            <Button
              variant="primary"
              size="sm"
              disabled={!gate.met || busy}
              leadingIcon={gate.met ? <PlayCircle size={15} /> : <Lock size={14} />}
              onClick={() => setEnableTarget(true)}
            >
              Enable automation
            </Button>
            {!gate.met && (
              <span className="max-w-[220px] text-right text-[11px]" style={{ color: "var(--ink-3)" }}>
                Gate not met: {gate.unmet.join(", ")}
              </span>
            )}
          </div>
        )}
        {!canEnable && !canPause && (
          // hr (or any viewer who can see but not act): make the read-only posture explicit.
          <span className="shrink-0 self-center text-[11px]" style={{ color: "var(--ink-3)" }}>
            View only — enabling and pausing are restricted.
          </span>
        )}
      </div>

      <div className="border-t px-5 py-2" style={{ borderColor: "color-mix(in srgb, var(--inferred-fg) 16%, var(--line))" }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 text-[12px] font-medium"
          style={{ color: "var(--inferred-fg)" }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Shadow decisions &amp; proof-of-context
        </button>
        {expanded && (
          <div className="mt-2">
            <ShadowDecisions ruleId={rule.id} />
          </div>
        )}
      </div>

      {/* Enable = weighty, explicit human act. Verified framing on the OUTCOME. */}
      <Modal
        open={enableTarget}
        onClose={() => { if (!busy) setEnableTarget(false); }}
        title="Enable automated attestation"
        description="You are turning on automated, human-equivalent attestation for this rule. The system never enables itself — this is your explicit decision."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEnableTarget(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              leadingIcon={<ShieldCheck size={15} />}
              onClick={doEnable}
              style={{ background: "var(--verified-fg)", color: "#FFFFFF" }}
            >
              Enable — I take responsibility
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div
            className="flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2.5"
            style={{
              background: "var(--verified-bg)",
              borderColor: "color-mix(in srgb, var(--verified-fg) 28%, var(--line))",
            }}
          >
            <ShieldCheck size={16} className="mt-0.5 shrink-0" style={{ color: "var(--verified-fg)" }} aria-hidden />
            <p className="text-[12px]" style={{ color: "var(--ink-2)" }}>
              Once active, this rule may auto-attest low-stakes candidates (tasks &amp;
              achievements, level ≤ 2 only) it has proven agreement on. You can pause it
              instantly at any time. Comp, promotion, rating, and title remain human-only.
            </p>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

export function OverseerOversightPanel({ role }: OverseerOversightPanelProps) {
  const [items, setItems] = useState<RuleWithMetrics[] | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Authority mirrors the live RLS (Q3):
  //   • ENABLE shadow→active = executive / admin only.
  //   • PAUSE (kill-switch)   = executive / admin (org-wide) OR manager (own
  //     scope, enforced server-side). The manager MUST see the kill-switch on a
  //     live rule — it is the safety control they hold.
  //   • hr can view this surface but acts on neither (no enable, no pause).
  const canEnable = role === "executive" || role === "admin";
  const canPause = canEnable || role === "manager";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listRules();
        if (!cancelled) { setItems(data); setError(false); }
      } catch {
        if (!cancelled) { setItems([]); setError(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = useCallback(() => { setItems(null); setError(false); setReloadKey((k) => k + 1); }, []);

  return (
    <Card padding="none">
      <CardHeader>
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: "var(--inferred-fg)" }} aria-hidden />
            <CardTitle>Overseer automation</CardTitle>
          </div>
          <CardDescription>
            AI machinery that learns from human attestations. Rules observe in shadow;
            a human enables automation only after a proven agreement gate. Nothing
            auto-attests until you turn it on — and you can pause instantly.
          </CardDescription>
        </div>
      </CardHeader>

      <div className="p-5">
        {items === null ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="rounded-[var(--radius-lg)] border p-4 space-y-3"
                style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={<AlertTriangle size={22} />}
            title="Couldn't load rules"
            description="Something went wrong reading the oversight surface. Try again."
            action={<Button variant="secondary" size="sm" onClick={reload}>Retry</Button>}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Inbox size={22} />}
            title="No automation rules yet"
            description="When the Overseer proposes a rule, it appears here in shadow mode — observing human attestations without acting. A human enables automation only after the agreement gate is met."
          />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <RuleCard key={item.rule.id} item={item} canEnable={canEnable} canPause={canPause} onChanged={reload} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
