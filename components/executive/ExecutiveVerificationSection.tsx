"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Play,
  RotateCw,
  Building2,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpDown,
  Loader2,
  XCircle,
  Search,
  ChevronRight,
  History,
  Gauge,
  Crown,
  FileCheck,
  Eye,
  BadgeCheck,
  Undo2,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * Mock data
 * ------------------------------------------------------------------ *
 * Manager verification activity. These are OPERATIONAL/VERIFIED facts —
 * real attestations recorded by real people — not AI inferences. The
 * "integrity" score is a deterministic audit metric (proof-attach rate,
 * dispute rate, timing anomalies), never a model estimate.
 * ------------------------------------------------------------------ */

type ManagerVerificationStat = {
  id: string;
  name: string;
  role: string;
  department: string;
  /** Total verifications completed by this manager (lifetime) */
  totalVerifications: number;
  /** Level of Integrity, 0–100 — audit-derived, deterministic */
  integrityScore: number;
  /** Open disputes against this manager's attestations */
  disputes: number;
  /** Median turnaround from request → attestation, in hours */
  avgTurnaroundHrs: number;
  /** Integrity delta vs. previous 30-day window */
  trend: number;
  lastActive: string;
};

const MANAGER_STATS: ManagerVerificationStat[] = [
  { id: "mgr-infra", name: "Ava Morris", role: "Engineering Manager, Platform", department: "Engineering", totalVerifications: 312, integrityScore: 97, disputes: 0, avgTurnaroundHrs: 5, trend: 2, lastActive: "2h ago" },
  { id: "mgr-cs", name: "Emma Liu", role: "Customer Success Manager", department: "Customer Success", totalVerifications: 268, integrityScore: 93, disputes: 1, avgTurnaroundHrs: 9, trend: 4, lastActive: "5h ago" },
  { id: "mgr-acct", name: "Priya Nair", role: "Accounting Manager", department: "Finance", totalVerifications: 154, integrityScore: 91, disputes: 0, avgTurnaroundHrs: 7, trend: 1, lastActive: "1d ago" },
  { id: "mgr-recruiting", name: "Riley Santos", role: "Recruiting Manager", department: "Human Resources", totalVerifications: 142, integrityScore: 84, disputes: 2, avgTurnaroundHrs: 14, trend: -3, lastActive: "3h ago" },
  { id: "mgr-content", name: "Casey Wu", role: "Content Manager", department: "Marketing", totalVerifications: 98, integrityScore: 78, disputes: 1, avgTurnaroundHrs: 22, trend: 0, lastActive: "6h ago" },
  { id: "mgr-west", name: "Noah Bell", role: "Operations Manager, Central", department: "Operations", totalVerifications: 121, integrityScore: 71, disputes: 3, avgTurnaroundHrs: 31, trend: -2, lastActive: "1d ago" },
  { id: "mgr-east", name: "Chris Park", role: "Operations Manager, East", department: "Operations", totalVerifications: 187, integrityScore: 58, disputes: 6, avgTurnaroundHrs: 47, trend: -9, lastActive: "4h ago" },
];

/* ------------------------------------------------------------------ *
 * Integrity classification (deterministic thresholds)
 * ------------------------------------------------------------------ */

type IntegrityTier = "exemplary" | "solid" | "watch" | "at_risk";

const TIER_CONFIG: Record<
  IntegrityTier,
  { label: string; bg: string; fg: string; bar: string }
> = {
  exemplary: { label: "Exemplary", bg: "var(--verified-bg)", fg: "var(--verified-fg)", bar: "var(--olive-500)" },
  solid: { label: "Solid", bg: "var(--accent-soft)", fg: "var(--accent-text)", bar: "var(--accent)" },
  watch: { label: "Watch", bg: "var(--warn-bg)", fg: "var(--warn-fg)", bar: "var(--ochre-500)" },
  at_risk: { label: "At risk", bg: "var(--danger-bg)", fg: "var(--danger-fg)", bar: "var(--brick-500)" },
};

function tierOf(score: number): IntegrityTier {
  if (score >= 90) return "exemplary";
  if (score >= 80) return "solid";
  if (score >= 65) return "watch";
  return "at_risk";
}

/* ------------------------------------------------------------------ *
 * L4 company verification check — status machine
 * ------------------------------------------------------------------ */

type L4Status = "idle" | "running" | "completed" | "failed";

type L4Result = {
  finishedAt: string;
  managersAudited: number;
  recordsCrossChecked: number;
  anomaliesFound: number;
  passed: boolean;
};

type L4Run = L4Result & { id: number };

const L4_STEPS = [
  "Locking attestation ledger",
  "Cross-checking proof artifacts",
  "Recomputing integrity scores",
  "Flagging timing & dispute anomalies",
  "Sealing audit hash-chain",
];

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/* ------------------------------------------------------------------ *
 * Manager L4 submissions — what each manager has filed for review.
 * The executive triages these and escalates ("Submit to CEO") the
 * ones that warrant final, L5/CEO sign-off.
 * ------------------------------------------------------------------ */

type SubmissionStatus =
  | "submitted"
  | "under_review"
  | "escalated_to_ceo"
  | "ceo_approved"
  | "returned";

type L4Submission = {
  id: string;
  managerId: string;
  managerName: string;
  department: string;
  /** What the manager attested at L4 */
  subject: string;
  /** Records covered by the submission */
  recordCount: number;
  /** Audit integrity of the submitting manager at filing time */
  integrityScore: number;
  submittedAt: string;
  status: SubmissionStatus;
  /** Set when escalated to / signed off by the CEO */
  ceoActionAt?: string;
};

const INITIAL_SUBMISSIONS: L4Submission[] = [
  { id: "sub-1", managerId: "mgr-infra", managerName: "Ava Morris", department: "Engineering", subject: "Platform Eng cohort — role & tenure", recordCount: 12, integrityScore: 97, submittedAt: "Jun 11", status: "submitted" },
  { id: "sub-2", managerId: "mgr-cs", managerName: "Emma Liu", department: "Customer Success", subject: "CS promotions — L4 credential pack", recordCount: 9, integrityScore: 93, submittedAt: "Jun 11", status: "under_review" },
  { id: "sub-3", managerId: "mgr-acct", managerName: "Priya Nair", department: "Finance", subject: "Q2 close — accounting certifications", recordCount: 6, integrityScore: 91, submittedAt: "Jun 10", status: "escalated_to_ceo", ceoActionAt: "Jun 10" },
  { id: "sub-4", managerId: "mgr-recruiting", managerName: "Riley Santos", department: "Human Resources", subject: "New-hire backgrounds — batch 14", recordCount: 7, integrityScore: 84, submittedAt: "Jun 10", status: "submitted" },
  { id: "sub-5", managerId: "mgr-content", managerName: "Casey Wu", department: "Marketing", subject: "Contractor portfolio attestations", recordCount: 4, integrityScore: 78, submittedAt: "Jun 09", status: "returned" },
  { id: "sub-6", managerId: "mgr-east", managerName: "Chris Park", department: "Operations", subject: "East region tenure verification", recordCount: 18, integrityScore: 58, submittedAt: "Jun 09", status: "under_review" },
  { id: "sub-7", managerId: "mgr-infra", managerName: "Ava Morris", department: "Engineering", subject: "Staff promotion — multi-source check", recordCount: 3, integrityScore: 96, submittedAt: "Jun 08", status: "ceo_approved", ceoActionAt: "Jun 08" },
];

const SUBMISSION_STATUS_META: Record<
  SubmissionStatus,
  { label: string; bg: string; fg: string; Icon: typeof FileCheck }
> = {
  submitted: { label: "Submitted", bg: "var(--surface-2)", fg: "var(--ink-2)", Icon: FileCheck },
  under_review: { label: "Under review", bg: "var(--warn-bg)", fg: "var(--warn-fg)", Icon: Eye },
  escalated_to_ceo: { label: "Escalated to CEO", bg: "var(--inferred-bg)", fg: "var(--inferred-fg)", Icon: Crown },
  ceo_approved: { label: "CEO approved", bg: "var(--verified-bg)", fg: "var(--verified-fg)", Icon: BadgeCheck },
  returned: { label: "Returned", bg: "var(--danger-bg)", fg: "var(--danger-fg)", Icon: Undo2 },
};

/** Only freshly-filed submissions can be escalated to the CEO. */
function isEscalatable(s: L4Submission) {
  return s.status === "submitted" || s.status === "under_review";
}

/* ------------------------------------------------------------------ *
 * Section
 * ------------------------------------------------------------------ */

type SortKey = "integrityScore" | "totalVerifications" | "name";
type SubView = "integrity" | "history";

export function ExecutiveVerificationSection() {
  const [view, setView] = useState<SubView>("integrity");

  const [sortKey, setSortKey] = useState<SortKey>("integrityScore");
  const [query, setQuery] = useState("");

  const [l4Status, setL4Status] = useState<L4Status>("idle");
  const [l4Step, setL4Step] = useState(0);
  const [l4Result, setL4Result] = useState<L4Result | null>(null);
  const [l4Runs, setL4Runs] = useState<L4Run[]>([]);

  const [submissions, setSubmissions] = useState<L4Submission[]>(INITIAL_SUBMISSIONS);
  const submitToCeo = useCallback((ids: string[]) => {
    const stamp = nowLabel();
    setSubmissions((prev) =>
      prev.map((s) =>
        ids.includes(s.id) && isEscalatable(s)
          ? { ...s, status: "escalated_to_ceo", ceoActionAt: stamp }
          : s,
      ),
    );
  }, []);

  const rows = useMemo(() => {
    const filtered = MANAGER_STATS.filter((m) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.department.toLowerCase().includes(q);
    });
    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      return (b[sortKey] as number) - (a[sortKey] as number);
    });
  }, [sortKey, query]);

  const summary = useMemo(() => {
    const total = MANAGER_STATS.reduce((s, m) => s + m.totalVerifications, 0);
    const avgIntegrity = Math.round(
      MANAGER_STATS.reduce((s, m) => s + m.integrityScore, 0) / MANAGER_STATS.length,
    );
    const flagged = MANAGER_STATS.filter((m) => tierOf(m.integrityScore) === "at_risk").length;
    return { total, avgIntegrity, flagged, managers: MANAGER_STATS.length };
  }, []);

  function runL4Check() {
    if (l4Status === "running") return;
    setL4Status("running");
    setL4Result(null);
    setL4Step(0);

    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      if (step < L4_STEPS.length) {
        setL4Step(step);
        return;
      }
      clearInterval(timer);
      const anomalies = MANAGER_STATS.filter((m) => tierOf(m.integrityScore) === "at_risk").length;
      const disputes = MANAGER_STATS.reduce((s, m) => s + m.disputes, 0);
      const passed = anomalies === 0;
      const result: L4Result = {
        finishedAt: nowLabel(),
        managersAudited: MANAGER_STATS.length,
        recordsCrossChecked: MANAGER_STATS.reduce((s, m) => s + m.totalVerifications, 0),
        anomaliesFound: anomalies + disputes,
        passed,
      };
      setL4Result(result);
      setL4Status(passed ? "completed" : "failed");
      setL4Runs((prev) => [{ ...result, id: prev.length + 1 }, ...prev]);
    }, 650);
  }

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <div className="core-roborate-eyebrow flex items-center gap-1.5">
          <ShieldCheck size={13} /> Verification oversight
        </div>
        <h1 className="serif text-2xl sm:text-3xl font-semibold mt-1">Manager Verification & Integrity</h1>
        <p className="text-[14px] opacity-60 mt-1 max-w-2xl">
          Track every attestation your managers record and run a company-wide L4 audit of the verified ledger.
          Counts and integrity scores are deterministic audit facts — not AI inferences.
        </p>
      </div>

      {/* Sub-tab nav */}
      <SubTabs
        view={view}
        onChange={setView}
        l4Status={l4Status}
        flagged={summary.flagged}
      />

      {view === "integrity" ? (
        <IntegrityView
          rows={rows}
          summary={summary}
          sortKey={sortKey}
          setSortKey={setSortKey}
          query={query}
          setQuery={setQuery}
          l4Status={l4Status}
          l4Result={l4Result}
          onOpenL4={() => setView("history")}
        />
      ) : (
        <HistoryView
          status={l4Status}
          step={l4Step}
          result={l4Result}
          runs={l4Runs}
          onRun={runL4Check}
          submissions={submissions}
          onSubmitToCeo={submitToCeo}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Sub-tab navigation
 * ------------------------------------------------------------------ */

function SubTabs({
  view,
  onChange,
  l4Status,
  flagged,
}: {
  view: SubView;
  onChange: (v: SubView) => void;
  l4Status: L4Status;
  flagged: number;
}) {
  const tabs: { id: SubView; label: string; icon: typeof Gauge; badge?: ReactNode }[] = [
    {
      id: "integrity",
      label: "Manager Integrity",
      icon: Gauge,
      badge: flagged > 0 ? <CountBadge tone="danger">{flagged}</CountBadge> : null,
    },
    {
      id: "history",
      label: "Verification History",
      icon: History,
      badge: l4Status === "running" ? <Loader2 size={12} className="animate-spin" /> : null,
    },
  ];
  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-xl border"
      style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = view === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold transition"
            style={{
              background: active ? "var(--surface)" : "transparent",
              color: active ? "var(--ink)" : "var(--ink-2)",
              boxShadow: active ? "var(--card-shadow, 0 1px 2px rgba(0,0,0,0.06))" : "none",
            }}
          >
            <Icon size={15} style={{ color: active ? "var(--accent)" : "var(--ink-3)" }} />
            {t.label}
            {t.badge}
          </button>
        );
      })}
    </div>
  );
}

function CountBadge({ children, tone }: { children: ReactNode; tone: "danger" }) {
  const c = tone === "danger" ? { bg: "var(--danger-bg)", fg: "var(--danger-fg)" } : { bg: "var(--surface-2)", fg: "var(--ink-2)" };
  return (
    <span
      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold tabular-nums"
      style={{ background: c.bg, color: c.fg }}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Tab 1 — Manager Integrity
 * ------------------------------------------------------------------ */

function IntegrityView({
  rows,
  summary,
  sortKey,
  setSortKey,
  query,
  setQuery,
  l4Status,
  l4Result,
  onOpenL4,
}: {
  rows: ManagerVerificationStat[];
  summary: { total: number; avgIntegrity: number; flagged: number; managers: number };
  sortKey: SortKey;
  setSortKey: (k: SortKey) => void;
  query: string;
  setQuery: (q: string) => void;
  l4Status: L4Status;
  l4Result: L4Result | null;
  onOpenL4: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryStat icon={ShieldCheck} label="Verifications recorded" value={summary.total.toLocaleString()} />
        <SummaryStat icon={Building2} label="Managers tracked" value={summary.managers} />
        <SummaryStat
          icon={summary.avgIntegrity >= 80 ? CheckCircle2 : AlertTriangle}
          label="Avg. integrity"
          value={`${summary.avgIntegrity}`}
          tone={summary.avgIntegrity >= 80 ? "good" : "warn"}
        />
        <SummaryStat
          icon={ShieldAlert}
          label="At-risk managers"
          value={summary.flagged}
          tone={summary.flagged > 0 ? "danger" : "good"}
        />
      </div>

      {/* L4 status summary → links into history tab for detail */}
      <L4StatusBanner status={l4Status} result={l4Result} onOpenL4={onOpenL4} />

      {/* Manager integrity table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}>
          <div>
            <h2 className="serif text-lg font-semibold">Manager scorecard</h2>
            <p className="text-[12px] opacity-55">Verifications completed and audited integrity, per manager.</p>
          </div>
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[13px]"
            style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}
          >
            <Search size={14} className="opacity-50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter managers…"
              className="bg-transparent outline-none w-32 sm:w-44 placeholder:opacity-50"
            />
          </div>
        </div>

        {/* Header row */}
        <div
          className="hidden md:grid grid-cols-[1.6fr_1fr_1.6fr_0.9fr_0.9fr] gap-3 px-5 py-2.5 text-[11px] uppercase tracking-wider opacity-50 border-b"
          style={{ borderColor: "var(--line)" }}
        >
          <SortHeader label="Manager" active={sortKey === "name"} onClick={() => setSortKey("name")} />
          <SortHeader label="Verifications" active={sortKey === "totalVerifications"} onClick={() => setSortKey("totalVerifications")} />
          <SortHeader label="Level of integrity" active={sortKey === "integrityScore"} onClick={() => setSortKey("integrityScore")} />
          <span>Disputes</span>
          <span>Turnaround</span>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Search size={28} className="mx-auto opacity-30" />
            <p className="text-[14px] opacity-60 mt-2">No managers match “{query}”.</p>
          </div>
        ) : (
          <ul>
            {rows.map((m) => (
              <ManagerRow key={m.id} stat={m} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tab 2 — Verification History (L4 detail + attestation history slot)
 * ------------------------------------------------------------------ */

function HistoryView({
  status,
  step,
  result,
  runs,
  onRun,
  submissions,
  onSubmitToCeo,
}: {
  status: L4Status;
  step: number;
  result: L4Result | null;
  runs: L4Run[];
  onRun: () => void;
  submissions: L4Submission[];
  onSubmitToCeo: (ids: string[]) => void;
}) {
  return (
    <div className="space-y-6">
      <L4ControlPanel status={status} step={step} result={result} onRun={onRun} />

      {/* Manager L4 submissions — review & escalate to CEO */}
      <ManagerL4Submissions submissions={submissions} onSubmitToCeo={onSubmitToCeo} />

      {/* Per-manager breakdown of the latest L4 audit */}
      {result && status !== "running" && <L4Breakdown />}

      {/* L4 run history */}
      <L4RunHistory runs={runs} />
    </div>
  );
}

function L4Breakdown() {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <div className="px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}>
        <h2 className="serif text-lg font-semibold">L4 audit breakdown</h2>
        <p className="text-[12px] opacity-55">Per-manager result from the latest company verification check.</p>
      </div>
      <ul>
        {MANAGER_STATS.map((m) => {
          const flagged = tierOf(m.integrityScore) === "at_risk" || m.disputes > 0;
          return (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 px-5 py-3 border-b last:border-b-0"
              style={{ borderColor: "var(--line)" }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {flagged ? (
                  <AlertTriangle size={16} style={{ color: "var(--danger-fg)" }} className="shrink-0" />
                ) : (
                  <CheckCircle2 size={16} style={{ color: "var(--verified-fg)" }} className="shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-[13px] truncate" style={{ color: "var(--ink)" }}>{m.name}</div>
                  <div className="text-[11px] opacity-55 truncate">{m.role}</div>
                </div>
              </div>
              <div className="text-[12px] tabular-nums text-right shrink-0" style={{ color: flagged ? "var(--danger-fg)" : "var(--ink-2)" }}>
                {flagged
                  ? `${m.disputes > 0 ? `${m.disputes} dispute${m.disputes > 1 ? "s" : ""}` : "integrity below threshold"}`
                  : "Clean"}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function L4RunHistory({ runs }: { runs: L4Run[] }) {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <div className="px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}>
        <h2 className="serif text-lg font-semibold">L4 check history</h2>
        <p className="text-[12px] opacity-55">Every company verification check is sealed into the audit trail.</p>
      </div>
      {runs.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <History size={26} className="mx-auto opacity-30" />
          <p className="text-[13px] opacity-60 mt-2">No L4 checks run yet this session. Run one above to record it here.</p>
        </div>
      ) : (
        <ul>
          {runs.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 px-5 py-3 border-b last:border-b-0"
              style={{ borderColor: "var(--line)" }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {r.passed ? (
                  <CheckCircle2 size={16} style={{ color: "var(--verified-fg)" }} />
                ) : (
                  <XCircle size={16} style={{ color: "var(--danger-fg)" }} />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-[13px]" style={{ color: "var(--ink)" }}>
                    L4 company check #{r.id}
                  </div>
                  <div className="text-[11px] opacity-55">
                    {r.managersAudited} managers · {r.recordsCrossChecked.toLocaleString()} records · {r.finishedAt}
                  </div>
                </div>
              </div>
              <span
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: r.passed ? "var(--verified-bg)" : "var(--danger-bg)",
                  color: r.passed ? "var(--verified-fg)" : "var(--danger-fg)",
                }}
              >
                {r.passed ? "Passed" : `${r.anomaliesFound} flagged`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Manager L4 submissions panel
 * ------------------------------------------------------------------ */

type SubmissionFilter = "all" | "pending" | "escalated" | "approved";

function ManagerL4Submissions({
  submissions,
  onSubmitToCeo,
}: {
  submissions: L4Submission[];
  onSubmitToCeo: (ids: string[]) => void;
}) {
  const [filter, setFilter] = useState<SubmissionFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);

  const counts = useMemo(() => {
    return {
      all: submissions.length,
      pending: submissions.filter(isEscalatable).length,
      escalated: submissions.filter((s) => s.status === "escalated_to_ceo").length,
      approved: submissions.filter((s) => s.status === "ceo_approved").length,
    };
  }, [submissions]);

  const rows = useMemo(() => {
    return submissions.filter((s) => {
      if (filter === "all") return true;
      if (filter === "pending") return isEscalatable(s);
      if (filter === "escalated") return s.status === "escalated_to_ceo";
      return s.status === "ceo_approved";
    });
  }, [submissions, filter]);

  const selectableIds = useMemo(
    () => rows.filter(isEscalatable).map((s) => s.id),
    [rows],
  );
  const selectedList = useMemo(
    () => submissions.filter((s) => selected.has(s.id) && isEscalatable(s)),
    [submissions, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      const allSelected = selectableIds.length > 0 && selectableIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(selectableIds);
    });
  }

  function confirmSubmit() {
    if (confirmIds) {
      onSubmitToCeo(confirmIds);
      setSelected((prev) => {
        const next = new Set(prev);
        confirmIds.forEach((id) => next.delete(id));
        return next;
      });
    }
    setConfirmIds(null);
  }

  const filters: { id: SubmissionFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "pending", label: "Pending review", count: counts.pending },
    { id: "escalated", label: "Escalated to CEO", count: counts.escalated },
    { id: "approved", label: "CEO approved", count: counts.approved },
  ];

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}>
        <div>
          <h2 className="serif text-lg font-semibold">Manager L4 Submissions</h2>
          <p className="text-[12px] opacity-55">
            L4 verifications filed by your managers. Review and escalate the ones that need CEO sign-off.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
            <Eye size={12} /> {counts.pending} to review
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}>
            <Crown size={12} /> {counts.escalated} with CEO
          </span>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1.5 px-5 py-3 border-b overflow-x-auto" style={{ borderColor: "var(--line)" }}>
        {filters.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium whitespace-nowrap transition"
              style={{
                background: active ? "var(--accent)" : "var(--surface-2)",
                color: active ? "var(--on-accent)" : "var(--ink-2)",
              }}
            >
              {f.label}
              <span className="tabular-nums opacity-80">{f.count}</span>
            </button>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {selectedList.length > 0 && (
        <div
          className="flex items-center justify-between gap-3 px-5 py-2.5 border-b"
          style={{ borderColor: "var(--line)", background: "var(--accent-soft)" }}
        >
          <span className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
            {selectedList.length} submission{selectedList.length > 1 ? "s" : ""} selected
          </span>
          <button
            type="button"
            onClick={() => setConfirmIds(selectedList.map((s) => s.id))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition active:scale-[0.98]"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          >
            <Crown size={14} /> Submit to CEO
          </button>
        </div>
      )}

      {/* Column header */}
      <div
        className="hidden md:grid grid-cols-[auto_2fr_1fr_0.9fr_1.1fr_auto] gap-3 items-center px-5 py-2.5 text-[11px] uppercase tracking-wider opacity-50 border-b"
        style={{ borderColor: "var(--line)" }}
      >
        <input
          type="checkbox"
          aria-label="Select all eligible"
          checked={selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))}
          onChange={toggleAll}
          disabled={selectableIds.length === 0}
          className="accent-[var(--accent)] disabled:opacity-30"
        />
        <span>Submission</span>
        <span>Records / integrity</span>
        <span>Filed</span>
        <span>Status</span>
        <span className="text-right">Action</span>
      </div>

      {/* Rows */}
      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <FileCheck size={26} className="mx-auto opacity-30" />
          <p className="text-[13px] opacity-60 mt-2">No submissions in this view.</p>
        </div>
      ) : (
        <ul>
          {rows.map((s) => {
            const meta = SUBMISSION_STATUS_META[s.status];
            const StatusIcon = meta.Icon;
            const escalatable = isEscalatable(s);
            const tier = TIER_CONFIG[tierOf(s.integrityScore)];
            return (
              <li
                key={s.id}
                className="grid grid-cols-1 md:grid-cols-[auto_2fr_1fr_0.9fr_1.1fr_auto] gap-2 md:gap-3 md:items-center px-5 py-3.5 border-b last:border-b-0 transition-colors hover:bg-[var(--surface-2)]"
                style={{ borderColor: "var(--line)" }}
              >
                {/* Select */}
                <input
                  type="checkbox"
                  aria-label={`Select ${s.subject}`}
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                  disabled={!escalatable}
                  className="accent-[var(--accent)] disabled:opacity-25 mt-1 md:mt-0"
                />

                {/* Submission */}
                <div className="min-w-0">
                  <div className="font-semibold text-[14px] truncate" style={{ color: "var(--ink)" }}>{s.subject}</div>
                  <div className="text-[12px] opacity-55 truncate">
                    {s.managerName} · {s.department}
                  </div>
                </div>

                {/* Records / integrity */}
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="tabular-nums font-semibold" style={{ color: "var(--ink)" }}>{s.recordCount}</span>
                  <span className="opacity-45 text-[12px]">records</span>
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ml-auto md:ml-0"
                    style={{ background: tier.bg, color: tier.fg }}
                    title="Submitting manager's audit integrity"
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: tier.bar }} aria-hidden />
                    {s.integrityScore}
                  </span>
                </div>

                {/* Filed */}
                <div className="text-[13px] tabular-nums opacity-70">
                  <span className="md:hidden text-[11px] opacity-50 mr-1">Filed:</span>{s.submittedAt}
                </div>

                {/* Status */}
                <div>
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: meta.bg, color: meta.fg }}
                  >
                    <StatusIcon size={12} />
                    {meta.label}
                    {s.ceoActionAt && <span className="opacity-70">· {s.ceoActionAt}</span>}
                  </span>
                </div>

                {/* Action */}
                <div className="md:text-right">
                  {escalatable ? (
                    <button
                      type="button"
                      onClick={() => setConfirmIds([s.id])}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border transition active:scale-[0.98]"
                      style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "transparent" }}
                    >
                      <Crown size={13} /> Submit to CEO
                    </button>
                  ) : (
                    <span className="text-[12px] opacity-45">—</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {confirmIds && (
        <SubmitToCeoModal
          submissions={submissions.filter((s) => confirmIds.includes(s.id))}
          onConfirm={confirmSubmit}
          onCancel={() => setConfirmIds(null)}
        />
      )}
    </div>
  );
}

function SubmitToCeoModal({
  submissions,
  onConfirm,
  onCancel,
}: {
  submissions: L4Submission[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const totalRecords = submissions.reduce((s, x) => s + x.recordCount, 0);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, var(--ink) 45%, transparent)", backdropFilter: "blur(2px)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border shadow-xl"
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl" style={{ background: "var(--accent)" }}>
              <Crown size={18} color="var(--on-accent)" />
            </div>
            <div>
              <h3 className="serif text-lg font-semibold leading-tight">Submit to CEO</h3>
              <p className="text-[12px] opacity-55">Escalate for final L5 sign-off.</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="p-1 rounded-lg opacity-50 hover:opacity-100 transition" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-[13px] opacity-70 leading-relaxed mb-3">
            You&apos;re escalating <strong>{submissions.length}</strong> L4 submission{submissions.length > 1 ? "s" : ""}{" "}
            ({totalRecords} record{totalRecords > 1 ? "s" : ""}) to the CEO. This is logged to the audit trail and
            notifies the CEO for sign-off.
          </p>
          <ul className="space-y-1.5 max-h-44 overflow-y-auto">
            {submissions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 text-[13px] px-3 py-2 rounded-lg"
                style={{ background: "var(--surface-2)" }}
              >
                <span className="truncate" style={{ color: "var(--ink)" }}>{s.subject}</span>
                <span className="opacity-55 shrink-0 text-[12px]">{s.managerName}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: "var(--line)" }}>
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border transition"
            style={{ borderColor: "var(--line)", color: "var(--ink-2)", background: "var(--surface)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold transition active:scale-[0.98]"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          >
            <Crown size={14} /> Confirm & submit
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Shared sub-components
 * ------------------------------------------------------------------ */

function SummaryStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string | number;
  tone?: "good" | "warn" | "danger";
}) {
  const color =
    tone === "good" ? "var(--verified-fg)" : tone === "warn" ? "var(--warn-fg)" : tone === "danger" ? "var(--danger-fg)" : "var(--accent)";
  return (
    <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <Icon size={16} style={{ color }} />
      <div className="text-[22px] font-semibold serif tabular-nums mt-1.5" style={{ color: "var(--ink)" }}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wider opacity-50 mt-0.5">{label}</div>
    </div>
  );
}

function SortHeader({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-left hover:opacity-100 transition-opacity"
      style={{ opacity: active ? 1 : undefined, color: active ? "var(--accent)" : undefined }}
    >
      {label}
      <ArrowUpDown size={11} />
    </button>
  );
}

function TrendChip({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] opacity-50">
        <Minus size={11} /> 0
      </span>
    );
  }
  const up = value > 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums"
      style={{ color: up ? "var(--verified-fg)" : "var(--danger-fg)" }}
    >
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? "+" : ""}
      {value}
    </span>
  );
}

function IntegrityMeter({ score }: { score: number }) {
  const tier = tierOf(score);
  const c = TIER_CONFIG[tier];
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="flex-1 min-w-[64px]">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-inset)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: c.bar }} />
        </div>
      </div>
      <span className="tabular-nums font-semibold text-[13px] w-7 text-right" style={{ color: c.fg }}>
        {score}
      </span>
      <span
        className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
        style={{ background: c.bg, color: c.fg }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.bar }} aria-hidden />
        {c.label}
      </span>
    </div>
  );
}

function ManagerRow({ stat }: { stat: ManagerVerificationStat }) {
  return (
    <li
      className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1.6fr_0.9fr_0.9fr] gap-2 md:gap-3 md:items-center px-5 py-3.5 border-b last:border-b-0 transition-colors hover:bg-[var(--surface-2)]"
      style={{ borderColor: "var(--line)" }}
    >
      {/* Manager */}
      <div className="min-w-0">
        <div className="font-semibold text-[14px] truncate" style={{ color: "var(--ink)" }}>
          {stat.name}
        </div>
        <div className="text-[12px] opacity-55 truncate">{stat.role}</div>
      </div>

      {/* Verifications */}
      <div className="flex items-center gap-2">
        <span className="serif text-xl font-semibold tabular-nums" style={{ color: "var(--ink)" }}>
          {stat.totalVerifications}
        </span>
        <TrendChip value={stat.trend} />
        <span className="md:hidden text-[11px] opacity-50">verifications</span>
      </div>

      {/* Integrity */}
      <div>
        <div className="md:hidden text-[10px] uppercase tracking-wider opacity-50 mb-1">Level of integrity</div>
        <IntegrityMeter score={stat.integrityScore} />
      </div>

      {/* Disputes */}
      <div className="text-[13px] tabular-nums">
        <span className="md:hidden text-[11px] opacity-50 mr-1">Disputes:</span>
        {stat.disputes > 0 ? (
          <span className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--danger-fg)" }}>
            <AlertTriangle size={12} /> {stat.disputes}
          </span>
        ) : (
          <span className="opacity-50">0</span>
        )}
      </div>

      {/* Turnaround */}
      <div className="text-[13px] tabular-nums opacity-70 inline-flex items-center gap-1">
        <Clock size={12} className="opacity-50" />
        {stat.avgTurnaroundHrs}h
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * L4 status banner (Integrity tab → links to detail)
 * ------------------------------------------------------------------ */

function L4StatusBanner({
  status,
  result,
  onOpenL4,
}: {
  status: L4Status;
  result: L4Result | null;
  onOpenL4: () => void;
}) {
  const meta = L4_STATUS_META[status];
  const StatusIcon = meta.Icon;
  const running = status === "running";
  return (
    <button
      type="button"
      onClick={onOpenL4}
      className="w-full text-left rounded-2xl border p-4 sm:p-5 flex items-center justify-between gap-4 transition hover:shadow-md group"
      style={{
        borderColor: "var(--line)",
        background: "linear-gradient(135deg, var(--surface), var(--accent-soft))",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2.5 rounded-xl shrink-0" style={{ background: "var(--accent)" }}>
          <ShieldCheck size={18} color="var(--on-accent)" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[15px]" style={{ color: "var(--ink)" }}>L4 Company Verification Check</span>
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: meta.bg, color: meta.fg }}
            >
              <StatusIcon size={12} className={running ? "animate-spin" : ""} />
              {meta.label}
            </span>
          </div>
          <p className="text-[12px] opacity-60 mt-0.5 truncate">
            {result
              ? `Last run ${result.finishedAt} · ${result.anomaliesFound} anomal${result.anomaliesFound === 1 ? "y" : "ies"} flagged`
              : "Run a deep company-wide audit and review full detail in Verification History."}
          </p>
        </div>
      </div>
      <span
        className="shrink-0 inline-flex items-center gap-1 text-[13px] font-semibold px-2.5 py-1.5 rounded-lg transition group-hover:translate-x-0.5"
        style={{ color: "var(--accent)" }}
      >
        View detail <ChevronRight size={16} />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * L4 control panel (full detail — History tab)
 * ------------------------------------------------------------------ */

const L4_STATUS_META: Record<
  L4Status,
  { label: string; bg: string; fg: string; Icon: typeof CheckCircle2 }
> = {
  idle: { label: "Ready", bg: "var(--surface-2)", fg: "var(--ink-2)", Icon: ShieldCheck },
  running: { label: "In progress", bg: "var(--inferred-bg)", fg: "var(--inferred-fg)", Icon: Loader2 },
  completed: { label: "Passed", bg: "var(--verified-bg)", fg: "var(--verified-fg)", Icon: CheckCircle2 },
  failed: { label: "Anomalies found", bg: "var(--danger-bg)", fg: "var(--danger-fg)", Icon: XCircle },
};

function L4ControlPanel({
  status,
  step,
  result,
  onRun,
}: {
  status: L4Status;
  step: number;
  result: L4Result | null;
  onRun: () => void;
}) {
  const meta = L4_STATUS_META[status];
  const StatusIcon = meta.Icon;
  const running = status === "running";
  const progress = running ? Math.round(((step + 1) / L4_STEPS.length) * 100) : status === "idle" ? 0 : 100;

  return (
    <div
      className="rounded-2xl border p-5 sm:p-6"
      style={{
        borderColor: "var(--line)",
        background: "linear-gradient(135deg, var(--surface), var(--accent-soft))",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2.5 rounded-xl shrink-0" style={{ background: "var(--accent)" }}>
            <ShieldCheck size={20} color="var(--on-accent)" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="serif text-lg font-semibold">L4 Company Verification Check</h2>
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: meta.bg, color: meta.fg }}
              >
                <StatusIcon size={12} className={running ? "animate-spin" : ""} />
                {meta.label}
              </span>
            </div>
            <p className="text-[13px] opacity-65 mt-1 max-w-xl leading-relaxed">
              The deepest tier of audit: locks the attestation ledger, cross-checks every proof artifact,
              recomputes integrity, and seals the result into the tamper-evident hash-chain.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-semibold transition active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          {running ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Running…
            </>
          ) : status === "idle" ? (
            <>
              <Play size={16} /> Perform L4 Check
            </>
          ) : (
            <>
              <RotateCw size={16} /> Re-run check
            </>
          )}
        </button>
      </div>

      {/* Progress / steps while running */}
      {running && (
        <div className="mt-5">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-inset)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: "var(--accent)" }}
            />
          </div>
          <div className="text-[13px] mt-2.5 inline-flex items-center gap-2" style={{ color: "var(--ink-2)" }}>
            <Loader2 size={13} className="animate-spin" />
            Step {step + 1} of {L4_STEPS.length} · {L4_STEPS[step]}
          </div>
        </div>
      )}

      {/* Result summary */}
      {result && !running && (
        <div
          className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 border-t"
          style={{ borderColor: "var(--line)" }}
        >
          <L4Metric label="Managers audited" value={result.managersAudited} />
          <L4Metric label="Records cross-checked" value={result.recordsCrossChecked.toLocaleString()} />
          <L4Metric
            label="Anomalies flagged"
            value={result.anomaliesFound}
            tone={result.anomaliesFound > 0 ? "danger" : "good"}
          />
          <L4Metric label="Completed" value={result.finishedAt} />
        </div>
      )}
    </div>
  );
}

function L4Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "good" | "danger";
}) {
  const color = tone === "good" ? "var(--verified-fg)" : tone === "danger" ? "var(--danger-fg)" : "var(--ink)";
  return (
    <div>
      <div className="serif text-xl font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wider opacity-50 mt-0.5">{label}</div>
    </div>
  );
}
