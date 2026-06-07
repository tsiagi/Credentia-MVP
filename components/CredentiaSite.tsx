"use client";

import React, {
  useState, useMemo, useEffect, useCallback,
  type CSSProperties, type ReactNode, type FormEvent,
} from "react";
import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";
import { LevelBadge, VerifiedTag, InferredTag, SelfReportedTag } from "@/lib/verification-ui";
import { setPassportPublished } from "@/lib/passport";
import { generateManagerInsights, generateOrgInsights } from "@/lib/ai-client";
import { VerificationHistory } from "@/components/VerificationHistory";
import { PassportLinkCard } from "@/components/VerifiedResumePage";
import { EmployeeDataRightsCard } from "@/components/OrgPeopleView";
import { PeopleOrgConsole } from "@/components/PeopleOrgConsole";
import { PlatformConsole } from "@/components/PlatformConsole";
import { ManagerTeamChangePanel } from "@/components/ManagerTeamChangePanel";
import { FormerTrialBanner, BillingPlanView } from "@/components/FormerEmployeeExperience";
import type { AccountStatus } from "@/lib/lifecycle";
import {
  buildEmployeeTimeline, fetchEmployeeOutlook,
  fetchProfileOrgId, fetchVerifyQueue, verifyQueueAction, fetchTeamHealth,
  fetchCoachingInsights, fetchDirectReports, fetchReviewRows, fetchExecutiveDashboard,
  fetchEmployeeValueScore, fetchTeamValueScores, fetchPromotionReadinessRows,
  fetchOrgPromotionReadiness, fetchCompensationIntelligence,
  VALUE_INPUT_LABELS, PROMO_CATEGORY_LABELS,
  type TimelineEvent, type VerifyQueueItem,
  type ValueScoreDetail, type TeamValueScoreRow, type PromotionReadinessRow, type CompRecommendation,
} from "@/lib/workforce";
/** Achievement Vault — load/save via lib/supabase.ts → achievements table */
import {
  fetchAchievements,
  saveAchievement,
  achievementTitle,
  type AchievementRow,
} from "@/lib/achievements";
import {
  ShieldCheck, Sparkles, LayoutDashboard, Users, Award, Settings as SettingsIcon,
  AlertTriangle, BadgeCheck, Eye, EyeOff, ChevronRight, Info, Building2, UserCircle2,
  LineChart, Lock, Zap, Send, FileBadge, ToggleLeft, ToggleRight, Palette,
  SlidersHorizontal, Globe, Menu, X, ArrowRight, Check, GitBranch, Workflow, ScanSearch,
  Target, FolderGit2, GraduationCap, TrendingUp, Lightbulb, Crown, MessageSquareWarning,
  ClipboardList, Heart, Activity, DollarSign, ArrowUp, ArrowDown, Minus, Plus, CreditCard,
  Handshake, Link2,
} from "lucide-react";

/* ════════════════════════════════════════════════════════════════
   CREDENTIA — full responsive site
   Public marketing site  +  authenticated multi-tier app
   Verified facts vs AI inferences kept as separate, labeled types.
   ════════════════════════════════════════════════════════════════ */

type Theme = { accent: string; mode: "light" | "dark" };
type Role = "employee" | "manager" | "executive" | "admin" | "hr" | "superadmin";
type FeedbackField = "employee_responses" | "manager_responses";
type FeedbackResponses = Record<string, string>;
type Milestone = { id: string; y: string; t: string; v: boolean };
type MilestoneInput = { y: string; t: string };
type VerifiedFactRow = { id: string; label: string; attested_at: string | null };
type VerificationRequest = { id: string; past_employer_email: string; status: string; created_at: string };
type SettingsState = { outlook: boolean; kudos: boolean; externalPassport: boolean; aiSummaries: boolean };
type SettingKey = keyof SettingsState;

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

// ── theme ──────────────────────────────────────────────────────
function useThemeVars(theme: Theme) {
  return useMemo(() => {
    const dark = theme.mode === "dark";
    return {
      "--accent": theme.accent,
      "--accent-soft": theme.accent + "1a",
      "--ink": dark ? "#e8eaed" : "#16181d",
      "--ink-2": dark ? "#b6bac2" : "#4a4f59",
      "--surface": dark ? "#1c1f26" : "#ffffff",
      "--surface-2": dark ? "#23272f" : "#f5f6f8",
      "--bg": dark ? "#14161b" : "#eef0f3",
      "--line": dark ? "#31353e" : "#e3e6ea",
      "--verified-fg": "#0f6e5c",
      "--verified-bg": dark ? "#0f3d34" : "#dcf3ed",
      "--inferred-fg": "#7c3aed",
      "--inferred-bg": dark ? "#241a3d" : "#efe9fb",
      "--warn": "#b45309",
      "--warn-bg": dark ? "#3a2a12" : "#fdf0dc",
    };
  }, [theme]);
}

const FONTS = (
  <>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>{`
      *{font-family:'IBM Plex Sans',system-ui,sans-serif;box-sizing:border-box}
      h1,h2,h3,h4,.serif{font-family:'Fraunces','Georgia',serif!important}
      @keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
      .rise{animation:rise .6s cubic-bezier(.2,.7,.2,1) both}
      html{scroll-behavior:smooth}
      ::selection{background:var(--accent);color:#fff}
    `}</style>
  </>
);

// ── shared primitives ──────────────────────────────────────────
const VerifiedFactTag = () => (
  <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full"
    style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>
    <BadgeCheck size={12} /> VERIFIED FACT
  </span>
);

const SupportingMetricTag = () => (
  <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full"
    style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
    <Activity size={12} /> SUPPORTING METRIC
  </span>
);

function TransparencyNote({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-[12px] font-medium opacity-70 hover:opacity-100 transition"
        style={{ color: "var(--accent)" }}>
        <Info size={13} /> How was this decided?
      </button>
      {open && (
        <div className="mt-2 text-[13px] leading-relaxed rounded-lg p-3 border"
          style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink-2)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

const Card = ({ children, className = "", style = {} }: { children: ReactNode; className?: string; style?: CSSProperties }) => (
  <div className={`rounded-2xl border ${className}`}
    style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "0 1px 2px rgba(0,0,0,.04)", ...style }}>
    {children}
  </div>
);

const Stat = ({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) => (
  <Card className="p-5">
    <div className="text-[12px] uppercase tracking-widest opacity-60">{label}</div>
    <div className="mt-1 text-3xl font-semibold serif" style={{ color: accent || "var(--ink)" }}>{value}</div>
    {sub && <div className="text-[12px] mt-1 opacity-60">{sub}</div>}
  </Card>
);

function Spark({ data, color }: { data: number[]; color: string }) {
  const w = 240, h = 56, max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / (max - min || 1)) * (h - 8) - 4}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14"><polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function TrendArrow({ dir }: { dir: "up" | "down" | "flat" }) {
  if (dir === "up") return <ArrowUp size={14} style={{ color: "var(--verified-fg)" }} />;
  if (dir === "down") return <ArrowDown size={14} style={{ color: "var(--warn)" }} />;
  return <Minus size={14} className="opacity-50" />;
}

function RiskPill({ risk }: { risk: "Low" | "Moderate" | "High" }) {
  const colors = {
    Low: { fg: "var(--verified-fg)", bg: "var(--verified-bg)" },
    Moderate: { fg: "var(--warn)", bg: "var(--warn-bg)" },
    High: { fg: "#be123c", bg: "#be123c1a" },
  };
  const c = colors[risk];
  return (
    <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.fg }}>
      {risk}
    </span>
  );
}

function SectionHeader({ icon: Icon, title, tag, sub }: { icon: typeof ShieldCheck; title: string; tag?: ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Icon size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">{title}</h3>
        {tag}
      </div>
      {sub && <p className="text-[13px] opacity-60 mt-1">{sub}</p>}
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--inferred-fg)" }} />
      </div>
      <span className="text-[12px] font-medium tabular-nums opacity-70">{pct}% confidence</span>
    </div>
  );
}

function ValueScoreBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
    </div>
  );
}

function EmployeeValueScoreCard({ detail, compact }: { detail: ValueScoreDetail | null; compact?: boolean }) {
  if (!detail) {
    return (
      <Card className="p-6" style={{ background: "var(--surface-2)" }}>
        <SectionHeader icon={Activity} title="Employee Value Score" tag={<SupportingMetricTag />}
          sub="Composite 0–1000 index from verified inputs. Internal only — never on your passport." />
        <p className="text-sm opacity-60">No value score computed yet. When employee_value_scores rows exist for your profile, the breakdown appears here.</p>
      </Card>
    );
  }

  const benchRows = [
    { label: "Your team", value: detail.benchmarks.team },
    { label: "Department", value: detail.benchmarks.department },
    { label: "Company", value: detail.benchmarks.company },
  ];

  return (
    <Card className="p-6" style={{ background: "var(--surface-2)" }}>
      <SectionHeader icon={Activity} title="Employee Value Score" tag={<SupportingMetricTag />}
        sub="Composite supporting metric (0–1000). Never the sole basis for pay, promotion, or termination." />
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-5">
        <div>
          <div className="text-[12px] uppercase tracking-widest opacity-60">Current index</div>
          <div className="text-4xl font-semibold serif mt-1" style={{ color: "var(--accent)" }}>{detail.score}</div>
          {detail.computedAt && <div className="text-[11px] opacity-50 mt-1">Updated {new Date(detail.computedAt).toLocaleDateString()}</div>}
        </div>
        {!compact && (
          <div className="flex gap-4 flex-wrap flex-1 sm:justify-end">
            {benchRows.map((b) => (
              <div key={b.label} className="text-center min-w-[72px]">
                <div className="text-[11px] opacity-60">{b.label}</div>
                <div className="text-lg font-semibold serif">{b.value ?? "—"}</div>
                <div className="text-[10px] opacity-50">avg</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {!compact && (
        <div className="grid sm:grid-cols-2 gap-3">
          {VALUE_INPUT_LABELS.map(({ key, label }) => (
            <div key={key}>
              <div className="flex justify-between text-[12px] mb-1">
                <span className="opacity-70">{label}</span>
                <span className="font-medium tabular-nums">{Math.round(detail.inputs[key] * 100)}%</span>
              </div>
              <ValueScoreBar value={detail.inputs[key]} />
            </div>
          ))}
        </div>
      )}
      <TransparencyNote>
        Derived from verified KPIs, reviews, projects, certifications, and pulse signals stored in employee_value_scores.inputs.
        You can dispute this metric with HR — it is advisory context, not a verified fact, and is never published externally.
      </TransparencyNote>
    </Card>
  );
}

const PROMO_CATEGORIES: PromotionReadinessRow["category"][] = ["ready_now", "6mo", "12mo", "dev_needed"];

function PromotionReadinessPanel({ rows, title, sub }: { rows: PromotionReadinessRow[]; title?: string; sub?: string }) {
  const grouped = Object.fromEntries(PROMO_CATEGORIES.map((c) => [c, rows.filter((r) => r.category === c)]));

  return (
    <Card className="p-6" style={{ background: "var(--inferred-bg)" }}>
      <SectionHeader icon={TrendingUp} title={title ?? "Promotion Readiness"} tag={<InferredTag />}
        sub={sub ?? "AI timing guidance from verified evidence — managers and execs decide; employees may dispute."} />
      <p className="text-[13px] mb-4 opacity-80 flex items-start gap-2">
        <Info size={14} className="mt-0.5 shrink-0" style={{ color: "var(--inferred-fg)" }} />
        Categories are recommendations only. No automatic promotions, ratings, or comp changes are triggered.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm opacity-70">No promotion readiness assessments yet. Rows in promotion_readiness appear here when the inference engine runs.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {PROMO_CATEGORIES.map((cat) => (
            <div key={cat} className="p-4 rounded-xl" style={{ background: "var(--surface)" }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-semibold text-[14px]">{PROMO_CATEGORY_LABELS[cat]}</span>
                <span className="text-[12px] px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}>
                  {grouped[cat].length}
                </span>
              </div>
              {grouped[cat].length === 0 ? (
                <p className="text-[12px] opacity-50">None in this bucket</p>
              ) : (
                <ul className="space-y-2">
                  {grouped[cat].map((r) => (
                    <li key={r.employeeId} className="text-[13px]">
                      <span className="font-medium">{r.who}</span>
                      <p className="opacity-70 mt-0.5 text-[12px] leading-relaxed">{r.evidence}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      <TransparencyNote>
        From promotion_readiness (AI INFERENCE). Combines verified KPIs, project outcomes, certifications, and review alignment.
        Internal only — never shown on the verified resume or external passport.
      </TransparencyNote>
    </Card>
  );
}

function CompensationIntelligenceView({ userId }: { userId: string }) {
  const [recs, setRecs] = useState<CompRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const rows = await fetchCompensationIntelligence(userId);
    setRecs(rows);
    return rows;
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await reload();
      } catch (e) {
        if (!cancelled) setError(errorMessage(e, "Could not load recommendations."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reload]);

  async function runOrgGeneration() {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in again to generate recommendations.");
      const result = await generateOrgInsights(session.access_token);
      setNotice(
        result.processed
          ? `Generated AI insights for ${result.processed} of ${result.total} people. Recommendations below are live from compensation_recommendations.`
          : `No recommendations saved.${result.failed.length ? ` ${result.failed[0].error}` : ""}`,
      );
      await reload();
    } catch (e) {
      setError(errorMessage(e, "AI generation failed."));
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <div className="opacity-60 text-sm">Loading compensation intelligence…</div>;

  const raises = recs.filter((r) => r.type === "raise");
  const bonuses = recs.filter((r) => r.type === "bonus");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="serif text-2xl font-semibold">Compensation Intelligence</h2>
        <p className="text-[14px] opacity-60 mt-1 max-w-3xl">
          Inference engine for comp review cycles. The system recommends ranges — humans decide every raise and bonus.
        </p>
      </div>

      <Card className="p-5 border-2" style={{ borderColor: "var(--inferred-fg)", background: "var(--inferred-bg)" }}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" style={{ color: "var(--inferred-fg)" }} />
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold">Decision support only</span>
              <InferredTag />
            </div>
            <p className="text-[14px] leading-relaxed opacity-85">
              Every item below is an <strong>AI INFERENCE</strong> from compensation_recommendations — internal to your org,
              never on an employee&apos;s verified resume or external passport. Comp committee and managers approve or ignore
              each recommendation; nothing is applied automatically.
            </p>
          </div>
        </div>
      </Card>

      {error && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}
      {notice && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{notice}</p>}

      <Card className="p-6" style={{ background: "var(--inferred-bg)" }}>
        <SectionHeader icon={Sparkles} title="Generate org-wide AI recommendations" tag={<InferredTag />}
          sub="Runs Anthropic for every employee and manager in your org, then writes to compensation_recommendations, promotion_readiness, and employee_value_scores." />
        <p className="text-[13px] opacity-80 mb-4">
          Requires <code className="text-[12px]">SUPABASE_SERVICE_ROLE_KEY</code> and <code className="text-[12px]">ANTHROPIC_API_KEY</code> in .env.local.
          Executive-only; comp committee still decides every outcome.
        </p>
        <button
          type="button"
          disabled={generating}
          onClick={runOrgGeneration}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-white inline-flex items-center gap-2 disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          <Sparkles size={16} />
          {generating ? "Generating… (may take several minutes)" : "Generate for entire organization"}
        </button>
      </Card>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="Raise recommendations" value={String(raises.length)} sub="pending review" accent="var(--accent)" />
        <Stat label="Bonus recommendations" value={String(bonuses.length)} sub="pending review" />
        <Stat label="High-confidence alerts" value={String(recs.filter((r) => r.confidence >= 0.7 && r.status === "pending").length)} sub="confidence ≥ 70%" accent="var(--warn)" />
      </div>

      <Card className="p-6">
        <SectionHeader icon={DollarSign} title="Recommended ranges" tag={<InferredTag />}
          sub="Each card shows a suggested range, evidence bullets, signal factors, and model confidence." />
        {recs.length === 0 ? (
          <p className="text-sm opacity-60">
            No recommendations yet. Click <strong>Generate for entire organization</strong> above to populate compensation_recommendations from verified team data.
          </p>
        ) : (
        <div className="space-y-4">
          {recs.map((rec) => (
            <div key={rec.id} className="p-5 rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-lg">{rec.who}</span>
                    <span className="text-[11px] uppercase tracking-widest px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: rec.type === "raise" ? "var(--accent-soft)" : "var(--verified-bg)", color: rec.type === "raise" ? "var(--accent)" : "var(--verified-fg)" }}>
                      {rec.type}
                    </span>
                    <InferredTag />
                    {rec.status !== "pending" && <span className="text-[11px] opacity-60 capitalize">{rec.status}</span>}
                  </div>
                  <div className="text-xl font-semibold serif mt-2" style={{ color: "var(--inferred-fg)" }}>{rec.rangeLabel}</div>
                </div>
                <div className="sm:w-48 shrink-0">
                  <ConfidenceBar value={rec.confidence} />
                </div>
              </div>
              <div className="mb-3">
                <div className="text-[11px] uppercase tracking-widest opacity-60 mb-1.5">Signal factors</div>
                <div className="flex flex-wrap gap-1.5">
                  {rec.factors.map((f) => (
                    <span key={f} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}>{f}</span>
                  ))}
                </div>
              </div>
              <div className="text-[11px] uppercase tracking-widest opacity-60 mb-1.5">Supporting evidence</div>
              <ul className="space-y-1.5">
                {rec.reasoningBullets.map((b, i) => (
                  <li key={i} className="text-[13px] opacity-80 flex items-start gap-2">
                    <Check size={14} className="shrink-0 mt-0.5" style={{ color: "var(--verified-fg)" }} />
                    {b}
                  </li>
                ))}
              </ul>
              <TransparencyNote>
                Model output from compensation_recommendations. Weighs KPI achievement, project impact, certifications,
                market benchmarks, and internal equity signals. Your comp committee makes the final call — this is routing and rationale, not approval.
              </TransparencyNote>
            </div>
          ))}
        </div>
        )}
      </Card>
    </div>
  );
}

const KIND_ICON: Record<string, typeof Target> = {
  kpi: Target, project: FolderGit2, certification: GraduationCap,
  promotion: TrendingUp, award: Award, process_improvement: Lightbulb, leadership: Crown,
};

/* ═══════════════════ PUBLIC MARKETING SITE ═══════════════════ */
function PublicSite({ onEnter, theme, setTheme }: { onEnter: () => void; theme: Theme; setTheme: (theme: Theme) => void }) {
  const [menu, setMenu] = useState(false);
  const [accessForm, setAccessForm] = useState({ company: "", size: "", email: "" });
  const [accessSubmitted, setAccessSubmitted] = useState(false);
  const features = [
    { icon: BadgeCheck, t: "Verified talent passport", d: "Every profile resolves to an immutable-but-correctable public URL showing only attested facts — confirmed tenure, titles, and validated skills." },
    { icon: Workflow, t: "Multi-layer feedback engine", d: "Employee and manager answer tailored prompts; AI processes sentiment, verifies impact, and surfaces a deviation score for coaching." },
    { icon: LineChart, t: "Executive analytics", d: "Morale index, organizational friction, and retention signals — quantified, weighted, and explainable." },
    { icon: ScanSearch, t: "Past-experience validation", d: "Reach past employers for one-click attestation, or get an internal AI likelihood estimate that routes where to look." },
  ];
  const steps = [
    { n: "01", t: "Collect", d: "Tailored prompts go to employee and manager each cycle." },
    { n: "02", t: "Synthesize", d: "AI produces a consensus summary, a delta log, and an outlook." },
    { n: "03", t: "Verify", d: "Facts get attested by real people and locked with an audit trail." },
    { n: "04", t: "Carry", d: "Employees take a verified passport to their next opportunity." },
  ];
  const onboardingSteps = [
    { n: "1", icon: Handshake, t: "Request access", d: "Tell us about your company — we'll schedule a demo and scope your rollout." },
    { n: "2", icon: Building2, t: "We provision your workspace", d: "Our team creates your tenant, assigns a company admin, and configures your plan." },
    { n: "3", icon: Link2, t: "Connect SSO or import people", d: "Connect Okta/Azure AD via SCIM, or bulk-import your roster via CSV." },
    { n: "4", icon: Zap, t: "Go live", d: "Employees sign in through your IdP. Verified records start accumulating from day one." },
  ];

  function handleAccessRequest(e: FormEvent) {
    e.preventDefault();
    if (!accessForm.company.trim() || !accessForm.email.trim()) return;
    setAccessSubmitted(true);
  }
  return (
    <div>
      {/* nav */}
      <header className="sticky top-0 z-30 border-b backdrop-blur"
        style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--bg) 85%, transparent)" }}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg" style={{ background: "var(--accent)" }}><ShieldCheck size={18} color="#fff" /></div>
            <span className="serif text-xl font-semibold">Credentia</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-[14px]" style={{ color: "var(--ink-2)" }}>
            <a href="#how" className="hover:opacity-70">How it works</a>
            <a href="#features" className="hover:opacity-70">Platform</a>
            <a href="#companies" className="hover:opacity-70">For companies</a>
            <a href="#trust" className="hover:opacity-70">Transparency</a>
            <button onClick={() => setTheme({ ...theme, mode: theme.mode === "dark" ? "light" : "dark" })}
              className="opacity-70 hover:opacity-100">{theme.mode === "dark" ? "Light" : "Dark"}</button>
            <button onClick={onEnter} className="px-4 py-2 rounded-xl font-medium text-white" style={{ background: "var(--accent)" }}>
              Sign in
            </button>
          </nav>
          <button className="md:hidden" onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button>
        </div>
        {menu && (
          <div className="md:hidden border-t px-5 py-4 space-y-3" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
            {["how", "features", "companies", "trust"].map((h) => (
              <a key={h} href={`#${h}`} onClick={() => setMenu(false)} className="block text-[15px] capitalize">{h === "how" ? "How it works" : h === "features" ? "Platform" : h === "companies" ? "For companies" : "Transparency"}</a>
            ))}
            <button onClick={onEnter} className="w-full px-4 py-2.5 rounded-xl font-medium text-white" style={{ background: "var(--accent)" }}>Sign in</button>
          </div>
        )}
      </header>

      {/* hero */}
      <section className="max-w-6xl mx-auto px-5 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="max-w-3xl rise">
          <span className="inline-flex items-center gap-2 text-[13px] font-medium px-3 py-1 rounded-full mb-6"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            <Sparkles size={14} /> Performance you can prove
          </span>
          <h1 className="serif text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            The verified record of how good someone actually is.
          </h1>
          <p className="text-lg md:text-xl mt-6 leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Credentia turns ongoing performance feedback into an attested talent passport — so hiring no longer
            starts from an unverifiable resume. Manage your people today; let them carry proof to tomorrow.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <button onClick={onEnter} className="px-6 py-3.5 rounded-xl font-medium text-white inline-flex items-center gap-2"
              style={{ background: "var(--accent)" }}>
              Enter the platform <ArrowRight size={18} />
            </button>
            <a href="#trust" className="px-6 py-3.5 rounded-xl font-medium border inline-flex items-center gap-2"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}>
              How decisions are made
            </a>
            <a href="#companies" className="px-6 py-3.5 rounded-xl font-medium border inline-flex items-center gap-2"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}>
              For companies <Building2 size={18} />
            </a>
          </div>
        </div>

        {/* floating passport preview */}
        <div className="mt-16 grid md:grid-cols-3 gap-4 rise" style={{ animationDelay: ".15s" }}>
          <Card className="p-5 md:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[13px] opacity-60"><Globe size={14} /> /p/verify/8f3a…c2</div>
              <VerifiedFactTag />
            </div>
            <div className="serif text-2xl font-semibold">Tyrell S. — Senior Equity Program Lead</div>
            <div className="grid grid-cols-3 gap-4 mt-5">
              <div><div className="text-[11px] uppercase tracking-widest opacity-50">Tenure</div><div className="text-xl font-semibold serif">6.2 yr</div></div>
              <div><div className="text-[11px] uppercase tracking-widest opacity-50">Attested skills</div><div className="text-xl font-semibold serif">14</div></div>
              <div><div className="text-[11px] uppercase tracking-widest opacity-50">Validations</div><div className="text-xl font-semibold serif">9</div></div>
            </div>
          </Card>
          <Card className="p-5" style={{ background: "var(--inferred-bg)" }}>
            <InferredTag />
            <div className="serif text-lg font-semibold mt-3">Internal only</div>
            <p className="text-[13px] mt-1 opacity-75">Outlooks and likelihood scores live inside the company — never on the public passport.</p>
          </Card>
        </div>
      </section>

      {/* how */}
      <section id="how" className="py-20" style={{ background: "var(--surface)" }}>
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="serif text-3xl md:text-4xl font-semibold">How it works</h2>
          <div className="grid md:grid-cols-4 gap-5 mt-10">
            {steps.map((s) => (
              <div key={s.n}>
                <div className="serif text-3xl font-semibold opacity-30">{s.n}</div>
                <div className="font-semibold text-lg mt-2">{s.t}</div>
                <p className="text-[14px] opacity-70 mt-1 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* features */}
      <section id="features" className="max-w-6xl mx-auto px-5 py-20">
        <h2 className="serif text-3xl md:text-4xl font-semibold">One platform, two jobs</h2>
        <p className="text-lg mt-3 opacity-70 max-w-2xl">Run rich internal performance management, and produce a portable, verified credential as a by-product.</p>
        <div className="grid md:grid-cols-2 gap-5 mt-10">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.t} className="p-6">
                <div className="p-2.5 rounded-xl w-max" style={{ background: "var(--accent-soft)" }}><Icon size={22} style={{ color: "var(--accent)" }} /></div>
                <h3 className="font-semibold text-xl mt-4">{f.t}</h3>
                <p className="opacity-70 mt-2 leading-relaxed text-[15px]">{f.d}</p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* For companies / onboarding */}
      <section id="companies" className="py-20" style={{ background: "var(--surface)" }}>
        <div className="max-w-6xl mx-auto px-5">
          <span className="inline-flex items-center gap-2 text-[13px] font-medium px-3 py-1 rounded-full mb-4"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            <Building2 size={14} /> For companies
          </span>
          <h2 className="serif text-3xl md:text-4xl font-semibold">Get started with Credentia</h2>
          <p className="text-lg mt-3 opacity-70 max-w-2xl">
            Access is provisioned — there is no public self-signup. Here is how your organization comes aboard.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
            {onboardingSteps.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.n} className="relative">
                  <Card className="p-5 h-full">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="serif text-2xl font-semibold opacity-30">{s.n}</span>
                      <div className="p-2 rounded-xl" style={{ background: "var(--accent-soft)" }}>
                        <Icon size={18} style={{ color: "var(--accent)" }} />
                      </div>
                    </div>
                    <div className="font-semibold text-lg">{s.t}</div>
                    <p className="text-[14px] opacity-70 mt-2 leading-relaxed">{s.d}</p>
                  </Card>
                </div>
              );
            })}
          </div>

          <div className="mt-12 grid lg:grid-cols-2 gap-8 items-start">
            <div>
              <h3 className="font-semibold text-xl mb-2">Request access</h3>
              <p className="text-[15px] opacity-70 leading-relaxed">
                Tell us about your company and we will reach out to schedule a demo and begin provisioning your workspace.
                No backend send yet — confirmation only.
              </p>
            </div>
            <Card className="p-6">
              {accessSubmitted ? (
                <div className="text-center py-4">
                  <div className="inline-flex p-3 rounded-full mb-4" style={{ background: "var(--verified-bg)" }}>
                    <Check size={28} style={{ color: "var(--verified-fg)" }} />
                  </div>
                  <h4 className="font-semibold text-lg">Request received</h4>
                  <p className="text-[14px] opacity-70 mt-2 leading-relaxed">
                    Thanks, {accessForm.company}! We will contact {accessForm.email} within one business day to schedule your demo and provisioning kickoff.
                  </p>
                  <button type="button" onClick={() => { setAccessSubmitted(false); setAccessForm({ company: "", size: "", email: "" }); }}
                    className="mt-4 text-[13px] font-medium" style={{ color: "var(--accent)" }}>
                    Submit another request
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAccessRequest} className="space-y-4">
                  <label className="block text-[13px]">
                    <span className="opacity-70">Company name</span>
                    <input required value={accessForm.company} onChange={(e) => setAccessForm({ ...accessForm, company: e.target.value })}
                      placeholder="Acme Industries" className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />
                  </label>
                  <label className="block text-[13px]">
                    <span className="opacity-70">Company size</span>
                    <select required value={accessForm.size} onChange={(e) => setAccessForm({ ...accessForm, size: e.target.value })}
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                      <option value="">Select…</option>
                      {["1–50", "51–200", "201–1,000", "1,000+"].map((s) => <option key={s} value={s}>{s} employees</option>)}
                    </select>
                  </label>
                  <label className="block text-[13px]">
                    <span className="opacity-70">Contact email</span>
                    <input required type="email" value={accessForm.email} onChange={(e) => setAccessForm({ ...accessForm, email: e.target.value })}
                      placeholder="you@company.com" className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />
                  </label>
                  <button type="submit" className="w-full px-4 py-3 rounded-xl font-medium text-white inline-flex items-center justify-center gap-2"
                    style={{ background: "var(--accent)" }}>
                    Request access <Send size={16} />
                  </button>
                </form>
              )}
            </Card>
          </div>
        </div>
      </section>

      {/* trust */}
      <section id="trust" className="py-20" style={{ background: "var(--surface)" }}>
        <div className="max-w-4xl mx-auto px-5">
          <div className="p-2.5 rounded-xl w-max" style={{ background: "var(--accent)" }}><ShieldCheck size={24} color="#fff" /></div>
          <h2 className="serif text-3xl md:text-4xl font-semibold mt-4">How decisions are made</h2>
          <p className="text-lg mt-4 leading-relaxed opacity-80">
            We separate two things on purpose, and we say so everywhere they appear.
          </p>
          <div className="grid md:grid-cols-2 gap-5 mt-8">
            <Card className="p-6">
              <VerifiedFactTag />
              <h3 className="font-semibold text-xl mt-3">Verified facts</h3>
              <p className="opacity-70 mt-2 text-[15px] leading-relaxed">Confirmed by a real attesting person. These can appear on a public passport. They stay correctable, with an audit trail.</p>
            </Card>
            <Card className="p-6" style={{ background: "var(--inferred-bg)" }}>
              <InferredTag />
              <h3 className="font-semibold text-xl mt-3">AI inferences</h3>
              <p className="opacity-80 mt-2 text-[15px] leading-relaxed">Model estimates — outlooks, likelihood vectors, retention signals. Labeled as such, kept internal, never treated as proof, always disputable.</p>
            </Card>
          </div>
          <div className="mt-6 space-y-2">
            {["Every AI output carries a \"How was this decided?\" explainer",
              "Likelihood scores route attention — they never confirm a past role",
              "Records are correctable and revocable, not silently permanent",
              "Nothing inferred is ever shown to an outside party"].map((t) => (
              <div key={t} className="flex items-start gap-2 text-[15px]">
                <Check size={18} style={{ color: "var(--verified-fg)" }} className="mt-0.5 shrink-0" /> <span className="opacity-80">{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="max-w-6xl mx-auto px-5 py-24 text-center">
        <h2 className="serif text-3xl md:text-5xl font-semibold max-w-3xl mx-auto leading-tight">Stop evaluating resumes. Start trusting records.</h2>
        <button onClick={onEnter} className="mt-8 px-7 py-4 rounded-xl font-medium text-white inline-flex items-center gap-2 text-lg"
          style={{ background: "var(--accent)" }}>Enter the platform <ArrowRight size={20} /></button>
      </section>

      <footer className="border-t py-8" style={{ borderColor: "var(--line)" }}>
        <div className="max-w-6xl mx-auto px-5 flex items-center justify-between flex-wrap gap-3 text-[13px] opacity-60">
          <div className="flex items-center gap-2"><ShieldCheck size={16} /> Credentia — prototype</div>
          <div>Verified facts. Labeled inferences. Your data, correctable.</div>
        </div>
      </footer>
    </div>
  );
}

/* ═══════════════════ AUTH SCREEN — sign-in only (no public signup) ═══════════════════ */

function AuthScreen({ onLogin, onBack }: { onLogin: (role: Role) => void; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        if (signInError.message.toLowerCase().includes("invalid login")) {
          throw new Error("Invalid email or password.");
        }
        throw signInError;
      }
      if (!data.user) throw new Error("Sign in did not return a user.");

      try {
        const storedRole = await fetchProfileRole(data.user.id);
        onLogin(storedRole);
      } catch {
        await supabase.auth.signOut();
        setError("Access is provided by your company — contact your administrator.");
      }
    } catch (err: unknown) {
      setError(errorMessage(err, "Something went wrong. Try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5" style={{ background: "var(--bg)" }}>
      <Card className="w-full max-w-md p-7">
        <button type="button" onClick={onBack} className="text-[13px] opacity-60 mb-5 inline-flex items-center gap-1">‹ Back to site</button>
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 rounded-lg" style={{ background: "var(--accent)" }}><ShieldCheck size={18} color="#fff" /></div>
          <span className="serif text-xl font-semibold">Credentia</span>
        </div>
        <h1 className="serif text-2xl font-semibold mt-4">Sign in</h1>
        <p className="text-[13px] opacity-60 mb-5">
          Use the email and password your company administrator provided. Accounts are not created on this public site.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="work email"
            className="w-full px-3 py-2.5 rounded-xl border text-sm mb-2 outline-none"
            style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }}
          />
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            className="w-full px-3 py-2.5 rounded-xl border text-sm mb-3 outline-none"
            style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }}
          />

          {error && (
            <p className="text-[13px] mb-3 px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>
          )}

          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl font-medium text-white disabled:opacity-60"
            style={{ background: "var(--accent)" }}>
            {loading ? "Please wait…" : "Sign in"}
          </button>
        </form>

        <p className="text-[13px] text-center mt-5 opacity-70 leading-relaxed">
          No account? Access is provided by your company — contact your administrator.
        </p>
      </Card>
    </div>
  );
}

const DEFAULT_SETTINGS = {
  show_outlook: true,
  ai_summaries: true,
  passport_published: false,
  kudos_notifications: true,
};

const FEEDBACK_PROMPTS = [
  { key: "strengths", label: "What went well this cycle?" },
  { key: "growth", label: "Where should you grow next?" },
  { key: "impact", label: "Biggest impact you delivered" },
];

async function getUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Not signed in");
  return user.id;
}

async function ensureUserSettings(profileId: string) {
  const { data } = await supabase.from("user_settings").select("profile_id").eq("profile_id", profileId).maybeSingle();
  if (!data) {
    const { error } = await supabase.from("user_settings").insert({ profile_id: profileId, ...DEFAULT_SETTINGS });
    if (error) throw error;
  }
}

async function fetchProfileRole(userId: string): Promise<Role> {
  const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (error) throw error;
  return data.role as Role;
}

function factToMilestone(f: VerifiedFactRow): Milestone {
  const parts = (f.label || "").split(" — ");
  const y = parts.length > 1 ? parts[0] : "????";
  const t = parts.length > 1 ? parts.slice(1).join(" — ") : f.label;
  return { id: f.id, y, t, v: !!f.attested_at };
}

function milestoneLabel(m: MilestoneInput) {
  return `${m.y} — ${m.t}`;
}

/* ═══════════════════ APP VIEWS (role dashboards) ═══════════════════ */
function ProfileEditor({ userId, onSaved }: { userId: string; onSaved?: (profile: { fullName: string; title: string }) => void }) {
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("profiles").select("full_name, title").eq("id", userId).single();
      if (cancelled) return;
      if (!error && data) {
        setFullName(data.full_name ?? "");
        setTitle(data.title ?? "");
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const patch = { full_name: fullName.trim() || null, title: title.trim() || null };
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    setSaving(false);
    if (error) setMessage(error.message);
    else {
      await writeAuditLog({
        actorId: userId,
        action: "profile_edit",
        targetTable: "profiles",
        targetId: userId,
        changes: patch,
      });
      setMessage("Profile saved.");
      onSaved?.({ fullName: fullName.trim(), title: title.trim() });
    }
  }

  if (loading) return <Card className="p-6 opacity-60 text-sm">Loading profile…</Card>;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4"><UserCircle2 size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Your profile</h3></div>
      <form onSubmit={handleSave} className="space-y-3">
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name"
          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
          style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title"
          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
          style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }} />
        {message && <p className="text-[13px]" style={{ color: message.includes("saved") ? "var(--verified-fg)" : "var(--warn)" }}>{message}</p>}
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </form>
    </Card>
  );
}

function FeedbackCycleCard({ userId, field, title, subtitle }: { userId: string; field: FeedbackField; title: string; subtitle: string }) {
  const [responses, setResponses] = useState<FeedbackResponses>({});
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("feedback_cycles").select("id, employee_responses, manager_responses")
        .eq("profile_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (cancelled) return;
      if (data) {
        setCycleId(data.id);
        setResponses((data[field] as FeedbackResponses) ?? {});
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, field]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const payload = { [field]: responses, profile_id: userId };
    let error;
    let recordId = cycleId;
    if (cycleId) {
      ({ error } = await supabase.from("feedback_cycles").update(payload).eq("id", cycleId));
    } else {
      const { data, error: insertError } = await supabase.from("feedback_cycles").insert(payload).select("id").single();
      error = insertError;
      if (data) {
        setCycleId(data.id);
        recordId = data.id;
      }
    }
    setSaving(false);
    if (!error) {
      await writeAuditLog({
        actorId: userId,
        action: "feedback_edit",
        targetTable: "feedback_cycles",
        targetId: recordId,
        changes: { field },
      });
      setSaved(true);
    }
  }

  if (loading) return <Card className="p-6 opacity-60 text-sm">Loading feedback…</Card>;

  return (
    <Card className="p-6">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-[13px] opacity-60 mb-4">{subtitle}</p>
      <form onSubmit={handleSave} className="space-y-3">
        {FEEDBACK_PROMPTS.map((p) => (
          <div key={p.key}>
            <label className="text-[13px] font-medium opacity-80">{p.label}</label>
            <textarea value={responses[p.key] ?? ""} onChange={(e) => setResponses({ ...responses, [p.key]: e.target.value })}
              rows={2} className="w-full mt-1 px-3 py-2 rounded-xl border text-sm outline-none resize-y"
              style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }} />
          </div>
        ))}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
            {saving ? "Saving…" : "Save responses"}
          </button>
          {saved && <span className="text-[13px]" style={{ color: "var(--verified-fg)" }}>Saved to Supabase</span>}
        </div>
      </form>
    </Card>
  );
}

function EmployeeView({ userId, showOutlook, accountStatus, trialEndsAt }: { userId: string; showOutlook: boolean; accountStatus?: AccountStatus; trialEndsAt?: string | null }) {
  const [external, setExternal] = useState(false);
  const [vault, setVault] = useState<AchievementRow[]>([]);
  const [vaultSaved, setVaultSaved] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [outlook, setOutlook] = useState<{ text: string; evidence: string } | null>(null);
  const [valueScore, setValueScore] = useState<ValueScoreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", desc: "", date: "", evidence: "", kind: "achievement" });

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [ach, events, ol, vs] = await Promise.all([
        fetchAchievements(userId), // ← Supabase achievements table on mount
        buildEmployeeTimeline(userId),
        showOutlook ? fetchEmployeeOutlook(userId) : Promise.resolve(null),
        fetchEmployeeValueScore(userId),
      ]);
      setVault(ach);
      setTimeline(events);
      setOutlook(ol);
      setValueScore(vs);
    } catch (e) {
      setError(errorMessage(e, "Could not load career record."));
    } finally {
      setLoading(false);
    }
  }, [userId, showOutlook]);

  useEffect(() => {
    reload();
  }, [reload]);

  const visibleTimeline = external ? timeline.filter((e) => e.level >= 2) : timeline;
  const visibleVault = external ? vault.filter((a) => a.verification_level >= 2) : vault;
  const maxLevel = vault.reduce((m, a) => Math.max(m, a.verification_level), timeline.reduce((m, e) => Math.max(m, e.level), 0));

  async function addAchievement(e: FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setSubmitting(true);
    setError(null);
    setVaultSaved(false);
    try {
      const orgId = await fetchProfileOrgId(userId);
      const row = await saveAchievement(userId, orgId, draft); // ← insert into achievements
      setVault((prev) => [row, ...prev]);
      setTimeline(await buildEmployeeTimeline(userId));
      setDraft({ title: "", desc: "", date: "", evidence: "", kind: "achievement" });
      setVaultSaved(true);
    } catch (err) {
      setError(errorMessage(err, "Could not save achievement."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="opacity-60 text-sm">Loading career record…</div>;

  return (
    <div className="space-y-6">
      {accountStatus === "former_trial" && (
        <FormerTrialBanner accountStatus={accountStatus} trialEndsAt={trialEndsAt ?? null} />
      )}
      <ProfileEditor userId={userId} />
      <PassportLinkCard userId={userId} />
      <EmployeeDataRightsCard userId={userId} />
      {error && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}
      <Card className="p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-[12px] uppercase tracking-widest opacity-60">Living career record</div>
          <h2 className="text-xl font-semibold mt-1 serif">{external ? "External Passport Preview" : "Internal Career View"}</h2>
          <p className="text-[13px] opacity-60 mt-1 max-w-lg">
            {external
              ? "Shareable view only — verified records (L2+). Self-reported items are hidden. Not downloadable."
              : "Full timeline, achievement vault, feedback, and private AI guidance."}
          </p>
        </div>
        <button onClick={() => setExternal(!external)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white" style={{ background: "var(--accent)" }}>
          {external ? <EyeOff size={16} /> : <Eye size={16} />}
          {external ? "Show internal view" : "Preview public passport"}
        </button>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Vault items" value={String(vault.length)} sub={`${vault.filter((a) => a.verification_level >= 2).length} verified`} />
        <Stat label="Timeline events" value={String(visibleTimeline.length)} sub={external ? "public-safe" : "full history"} />
        <Stat label="Highest level" value={maxLevel ? `L${maxLevel}` : "—"} sub={maxLevel >= 4 ? "company verified" : "from Supabase"} accent="var(--accent)" />
        <Stat label="Verified facts" value={String(timeline.filter((e) => e.level >= 2).length)} sub="L2+ entries" accent="var(--verified-fg)" />
      </div>

      <Card className="p-6">
        <SectionHeader icon={GitBranch} title="Career Timeline" sub="Chronological record from verified_facts, achievements, projects, and approved KPIs." />
        {visibleTimeline.length === 0 ? (
          <p className="text-sm opacity-60">No timeline events yet. Submit achievements or add verified facts.</p>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-[7px] top-1 bottom-1 w-px" style={{ background: "var(--line)" }} />
            {visibleTimeline.map((ev) => {
              const Icon = KIND_ICON[ev.kind] ?? Award;
              return (
                <div key={ev.id} className="relative mb-5 last:mb-0">
                  <div className="absolute -left-[22px] top-1 w-3.5 h-3.5 rounded-full border-2"
                    style={{ borderColor: ev.level >= 2 ? "var(--verified-fg)" : "var(--line)", background: ev.level >= 2 ? "var(--verified-fg)" : "var(--surface)" }} />
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-mono opacity-50 w-12 shrink-0">{ev.year}</span>
                    <Icon size={16} className="opacity-50 hidden sm:block" />
                    <span className="font-medium text-[15px] flex-1">{ev.label}</span>
                    {ev.level >= 2 ? <LevelBadge level={ev.level} /> : <SelfReportedTag />}
                  </div>
                  {(() => {
                    const m = ev.id.match(/^(fact|ach|proj|kpi)-(.+)$/);
                    if (!m) return null;
                    const tables: Record<string, string> = {
                      fact: "verified_facts", ach: "achievements", proj: "projects", kpi: "kpis",
                    };
                    const table = tables[m[1]];
                    if (!table) return null;
                    return <VerificationHistory targetTable={table} targetId={m[2]} compact />;
                  })()}
                </div>
              );
            })}
          </div>
        )}
        {external && (
          <p className="text-[12px] mt-4 pt-3 border-t opacity-60" style={{ borderColor: "var(--line)" }}>
            External view: only manager-verified or higher (L2+). Self-reported entries are never shown outside the org.
          </p>
        )}
      </Card>

      <Card className="p-6">
        <SectionHeader
          icon={Award}
          title="Verified Achievement Vault"
          sub="Connected to Supabase achievements — loads on mount, saves on submit. New items start at L1 (Self-Reported); your manager can verify to L2+."
        />
        {!external && (
          <form onSubmit={addAchievement} className="p-4 rounded-xl border mb-5 space-y-2" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
            <div className="grid sm:grid-cols-2 gap-2">
              <select value={draft.kind ?? "achievement"} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
                className="px-3 py-2 rounded-lg border text-sm outline-none sm:col-span-2"
                style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}>
                <option value="achievement">Kind: Achievement</option>
                <option value="kpi">Kind: KPI</option>
                <option value="certification">Kind: Certification</option>
                <option value="promotion">Kind: Promotion</option>
                <option value="award">Kind: Award</option>
              </select>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Achievement title" required
                className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }} />
              <input value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} placeholder="Date (YYYY-MM)"
                className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }} />
            </div>
            <textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="Description" rows={2}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-y" style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }} />
            <input value={draft.evidence} onChange={(e) => setDraft({ ...draft, evidence: e.target.value })} placeholder="Evidence URL or note"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }} />
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium text-white inline-flex items-center gap-1 disabled:opacity-60" style={{ background: "var(--accent)" }}>
              <Plus size={14} /> {submitting ? "Saving to Supabase…" : "Save to vault (L1 Self-Reported)"}
            </button>
            {vaultSaved && (
              <span className="text-[13px] ml-2" style={{ color: "var(--verified-fg)" }}>Saved — verification level L1 until manager approves.</span>
            )}
          </form>
        )}
        {visibleVault.length === 0 ? (
          <p className="text-sm opacity-60">No achievements in the vault yet.</p>
        ) : (
          <div className="space-y-3">
            {visibleVault.map((a) => {
              const Icon = KIND_ICON[a.kind] ?? Award;
              return (
                <div key={a.id} className="p-4 rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg shrink-0" style={{ background: "var(--accent-soft)" }}><Icon size={18} style={{ color: "var(--accent)" }} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{achievementTitle(a.description)}</span>
                        <LevelBadge level={a.verification_level} />
                      </div>
                      <div className="text-[12px] opacity-50 mt-0.5">{a.achievement_date ?? a.created_at.slice(0, 10)}</div>
                      <p className="text-[13px] opacity-70 mt-1">{a.description}</p>
                      {a.evidence_url && <p className="text-[12px] opacity-50 mt-1">Evidence: {a.evidence_url}</p>}
                      <VerificationHistory targetTable="achievements" targetId={a.id} compact />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {!external && (
        <FeedbackCycleCard userId={userId} field="employee_responses" title="This cycle — your responses"
          subtitle="Saved to feedback_cycles in Supabase. Your manager adds their side separately." />
      )}
      {!external && <EmployeeValueScoreCard detail={valueScore} />}
      {!external && showOutlook && (
        <Card className="p-6" style={{ background: "var(--inferred-bg)" }}>
          <div className="flex items-center gap-2 mb-2"><Sparkles size={18} style={{ color: "var(--inferred-fg)" }} /><h3 className="font-semibold">Professional Outlook</h3><InferredTag /></div>
          {outlook ? (
            <>
              <p className="text-[14px] leading-relaxed">{outlook.text}</p>
              <TransparencyNote>{outlook.evidence} — model-generated prediction from promotion_readiness, not a fact. Visible only to you, never on your external passport.</TransparencyNote>
            </>
          ) : (
            <p className="text-[14px] opacity-70">No AI outlook yet for your profile. When promotion_readiness rows exist, they appear here as guidance only.</p>
          )}
        </Card>
      )}
    </div>
  );
}

function ManagerView({ userId }: { userId: string }) {
  const [verifyItems, setVerifyItems] = useState<VerifyQueueItem[]>([]);
  const [coaching, setCoaching] = useState<{ who: string; label: string; evidence: string }[]>([]);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof fetchReviewRows>>>([]);
  const [teamScores, setTeamScores] = useState<TeamValueScoreRow[]>([]);
  const [promoRows, setPromoRows] = useState<PromotionReadinessRow[]>([]);
  const [health, setHealth] = useState({ morale: null as number | null, workload: null as number | null, productivity: null as number | null, reportCount: 0 });
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const reports = await fetchDirectReports(userId);
      const ids = reports.map((r) => r.id);
      const [queue, insights, reviewRows, teamHealth, scores, promo] = await Promise.all([
        fetchVerifyQueue(userId),
        fetchCoachingInsights(ids),
        fetchReviewRows(userId),
        fetchTeamHealth(ids),
        fetchTeamValueScores(userId),
        fetchPromotionReadinessRows(ids),
      ]);
      setVerifyItems(queue);
      setCoaching(insights);
      setReviews(reviewRows);
      setHealth(teamHealth);
      setTeamScores(scores);
      setPromoRows(promo);
    } catch (e) {
      setError(errorMessage(e, "Could not load manager dashboard."));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  async function verifyAct(item: VerifyQueueItem, action: "approve" | "reject" | "clarify") {
    setActing(item.id);
    setError(null);
    try {
      await verifyQueueAction(userId, item, action);
      await reload();
    } catch (e) {
      setError(errorMessage(e, "Verification action failed."));
    } finally {
      setActing(null);
    }
  }

  async function runTeamAiGeneration() {
    setGeneratingAi(true);
    setError(null);
    setAiNotice(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in again to generate insights.");
      const result = await generateManagerInsights(session.access_token);
      setAiNotice(
        result.processed
          ? `Generated AI insights for ${result.processed} of ${result.total} direct report(s). Refresh panels below — all labeled AI INFERENCE.`
          : `No insights saved.${result.failed.length ? ` ${result.failed[0].error}` : ""}`,
      );
      await reload();
    } catch (e) {
      setError(errorMessage(e, "AI generation failed."));
    } finally {
      setGeneratingAi(false);
    }
  }

  const burnoutRisk = health.workload != null && health.workload < 0.55 ? "High" : health.workload != null && health.workload < 0.7 ? "Moderate" : "Low";

  if (loading) return <div className="opacity-60 text-sm">Loading manager dashboard…</div>;

  return (
    <div className="space-y-6">
      <ProfileEditor userId={userId} />
      <ManagerTeamChangePanel userId={userId} />
      {error && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}
      {aiNotice && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{aiNotice}</p>}

      <Card className="p-6" style={{ background: "var(--inferred-bg)" }}>
        <SectionHeader icon={Sparkles} title="Generate AI insights" tag={<InferredTag />}
          sub="Calls Anthropic server-side using verified team data, then saves to promotion_readiness, compensation_recommendations, and employee_value_scores. You decide every outcome." />
        <p className="text-[13px] opacity-80 mb-4">
          Requires <code className="text-[12px]">SUPABASE_SERVICE_ROLE_KEY</code> and <code className="text-[12px]">ANTHROPIC_API_KEY</code> in .env.local.
          Generates for all direct reports ({health.reportCount}).
        </p>
        <button
          type="button"
          disabled={generatingAi || health.reportCount === 0}
          onClick={runTeamAiGeneration}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-white inline-flex items-center gap-2 disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          <Sparkles size={16} />
          {generatingAi ? "Generating… (may take a minute)" : "Generate insights for my team"}
        </button>
      </Card>

      <Card className="p-6">
        <SectionHeader icon={Activity} title="Team Health Overview" sub={`${health.reportCount} direct reports — from pulse_surveys and employee_value_scores.`} />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Morale" value={health.morale != null ? health.morale.toFixed(2) : "—"} sub="pulse avg" accent="var(--accent)" />
          <Stat label="Productivity" value={health.productivity != null ? health.productivity.toFixed(2) : "—"} sub="value score index" accent="var(--verified-fg)" />
          <Stat label="Workload balance" value={health.workload != null ? health.workload.toFixed(2) : "—"} sub="pulse balance" />
          <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--inferred-bg)" }}>
            <div className="flex items-center gap-1 mb-1"><InferredTag /></div>
            <div className="text-[12px] uppercase tracking-widest opacity-60">Burnout risk</div>
            <div className="mt-1 text-2xl font-semibold serif" style={{ color: burnoutRisk === "Low" ? "var(--verified-fg)" : "var(--warn)" }}>{burnoutRisk}</div>
            <div className="text-[12px] mt-1 opacity-60">inferred from pulse</div>
          </div>
          <Stat label="Pending verifications" value={String(verifyItems.length)} sub="awaiting you" />
        </div>
      </Card>

      <Card className="p-6">
        <SectionHeader icon={ShieldCheck} title="Employee Verification Center"
          sub="Approve KPIs, projects, certifications, promotions, and awards. Each action creates a permanent audit record and sets verification level L2 (Manager Verified)." />
        {verifyItems.length === 0 ? (
          <p className="text-sm opacity-60">No pending items. Assign direct reports via profiles.manager_id, then they can submit achievements and KPIs.</p>
        ) : (
          <div className="space-y-3">
            {verifyItems.map((it) => {
              const Icon = KIND_ICON[it.kind] ?? Target;
              const pending = it.status === "pending" || it.status === "clarify";
              return (
                <div key={`${it.sourceTable}-${it.id}`} className="p-4 rounded-xl border" style={{ borderColor: "var(--line)", background: it.status === "rejected" ? "var(--warn-bg)" : "var(--surface-2)" }}>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg shrink-0" style={{ background: "var(--accent-soft)" }}><Icon size={18} style={{ color: "var(--accent)" }} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{it.title}</span>
                        <LevelBadge level={it.level} />
                        <span className="text-[11px] opacity-50">{it.sourceTable}</span>
                        {!pending && <span className="text-[11px] capitalize opacity-60">{it.status}</span>}
                      </div>
                      <div className="text-[13px] opacity-70 mt-0.5">{it.who}</div>
                      <p className="text-[13px] opacity-60 mt-1">{it.desc}</p>
                      <VerificationHistory targetTable={it.sourceTable} targetId={it.id} compact />
                      {pending && (
                        <>
                          <p className="text-[12px] mt-2 px-2 py-1.5 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>
                            Approving writes to audit_log and sets L2 Manager Verified where applicable.
                          </p>
                          <div className="flex gap-2 mt-3 flex-wrap">
                            <button disabled={acting === it.id} onClick={() => verifyAct(it, "approve")} className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-white inline-flex items-center gap-1 disabled:opacity-60" style={{ background: "var(--verified-fg)" }}>
                              <Check size={14} /> Approve
                            </button>
                            <button disabled={acting === it.id} onClick={() => verifyAct(it, "clarify")} className="px-3 py-1.5 rounded-lg text-[13px] font-medium border inline-flex items-center gap-1 disabled:opacity-60" style={{ borderColor: "var(--line)" }}>
                              <MessageSquareWarning size={14} /> Clarify
                            </button>
                            <button disabled={acting === it.id} onClick={() => verifyAct(it, "reject")} className="px-3 py-1.5 rounded-lg text-[13px] font-medium border inline-flex items-center gap-1 disabled:opacity-60" style={{ borderColor: "var(--line)", color: "var(--warn)" }}>
                              <X size={14} /> Reject
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <SectionHeader icon={ClipboardList} title="Performance Review Center" sub="Cycle reviews from feedback_cycles — you sign off; AI never completes a review." />
        {reviews.length === 0 ? (
          <p className="text-sm opacity-60">No direct reports found. Set profiles.manager_id on your team in Supabase.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] min-w-[480px]">
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-widest opacity-60 border-b" style={{ borderColor: "var(--line)" }}>
                  <th className="pb-2 pr-4">Employee</th><th className="pb-2 pr-4">Cycle</th><th className="pb-2 pr-4">Updated</th><th className="pb-2 pr-4">Status</th><th className="pb-2">Rating</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.profileId} className="border-b" style={{ borderColor: "var(--line)" }}>
                    <td className="py-3 pr-4 font-medium">{r.who}</td>
                    <td className="py-3 pr-4 opacity-70">{r.cycle}</td>
                    <td className="py-3 pr-4 opacity-70">{r.due}</td>
                    <td className="py-3 pr-4"><span className="text-[12px] px-2 py-0.5 rounded-full" style={{ background: "var(--surface-2)" }}>{r.status}</span></td>
                    <td className="py-3">{r.rating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-6" style={{ background: "var(--surface-2)" }}>
        <SectionHeader icon={Activity} title="Team Value Scores" tag={<SupportingMetricTag />}
          sub="0–1000 supporting index per direct report — compare against team average. Not used alone for decisions." />
        {teamScores.length === 0 ? (
          <p className="text-sm opacity-60">No direct reports with value scores. Assign manager_id and seed employee_value_scores.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] min-w-[520px]">
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-widest opacity-60 border-b" style={{ borderColor: "var(--line)" }}>
                  <th className="pb-2 pr-4">Employee</th>
                  <th className="pb-2 pr-4">Score</th>
                  <th className="pb-2 pr-4">Top inputs</th>
                  <th className="pb-2">vs team avg</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const withScores = teamScores.filter((t) => t.score != null);
                  const teamAvg = withScores.length
                    ? Math.round(withScores.reduce((a, t) => a + (t.score ?? 0), 0) / withScores.length)
                    : null;
                  return teamScores.map((t) => {
                    const topInputs = t.inputs
                      ? VALUE_INPUT_LABELS
                          .map(({ key, label }) => ({ label, v: t.inputs![key] }))
                          .sort((a, b) => b.v - a.v)
                          .slice(0, 2)
                          .map((x) => x.label)
                          .join(", ")
                      : "—";
                    const delta = t.score != null && teamAvg != null ? t.score - teamAvg : null;
                    return (
                      <tr key={t.profileId} className="border-b" style={{ borderColor: "var(--line)" }}>
                        <td className="py-3 pr-4 font-medium">{t.who}</td>
                        <td className="py-3 pr-4 font-semibold serif">{t.score ?? "—"}</td>
                        <td className="py-3 pr-4 opacity-70 text-[13px]">{topInputs}</td>
                        <td className="py-3">
                          {delta != null ? (
                            <span style={{ color: delta >= 0 ? "var(--verified-fg)" : "var(--warn)" }}>
                              {delta >= 0 ? "+" : ""}{delta}
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}
        <TransparencyNote>
          From employee_value_scores. Breakdown includes KPIs, reviews, verified projects, certs, leadership, innovation, skills, and recognition.
          Disputable supporting context — never a verified fact or passport item.
        </TransparencyNote>
      </Card>

      <PromotionReadinessPanel rows={promoRows} title="Promotion Readiness — your team" />

      <Card className="p-6" style={{ background: "var(--inferred-bg)" }}>
        <SectionHeader icon={Sparkles} title="AI Coaching Insights" tag={<InferredTag />}
          sub="From promotion_readiness — evidence-based guidance only." />
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <InferredTag />
          <span className="text-[13px] font-medium opacity-80">AI never makes the final call on promotions, ratings, or terminations.</span>
        </div>
        {coaching.length === 0 ? (
          <p className="text-sm opacity-70">No coaching insights yet. Rows in promotion_readiness for your reports appear here.</p>
        ) : (
          <div className="space-y-3">
            {coaching.map((c, i) => (
              <div key={i} className="p-4 rounded-xl" style={{ background: "var(--surface)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{c.who}</span>
                  <span className="text-[12px] px-2 py-0.5 rounded-full" style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}>{c.label}</span>
                </div>
                <div className="text-[13px] opacity-70 mt-1.5 flex items-start gap-1.5">
                  <Info size={14} className="mt-0.5 shrink-0" style={{ color: "var(--inferred-fg)" }} />
                  <span>{c.evidence}</span>
                </div>
                <TransparencyNote>From promotion_readiness table. Advisory signal — not a decision.</TransparencyNote>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ExecutiveView({ userId }: { userId: string }) {
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof fetchExecutiveDashboard>>["metrics"]>(null);
  const [departments, setDepartments] = useState<Awaited<ReturnType<typeof fetchExecutiveDashboard>>["departments"]>([]);
  const [promoRows, setPromoRows] = useState<PromotionReadinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const [data, promo] = await Promise.all([
      fetchExecutiveDashboard(userId),
      fetchOrgPromotionReadiness(userId),
    ]);
    setMetrics(data.metrics);
    setDepartments(data.departments);
    setPromoRows(promo);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await reload();
      } catch (e) {
        if (!cancelled) setError(errorMessage(e, "Could not load executive dashboard."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reload]);

  async function runOrgAiGeneration() {
    setGeneratingAi(true);
    setError(null);
    setAiNotice(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in again to generate insights.");
      const result = await generateOrgInsights(session.access_token);
      setAiNotice(
        result.processed
          ? `Generated AI insights for ${result.processed} of ${result.total} people org-wide. Dashboard and promotion panels refreshed — all labeled AI INFERENCE.`
          : `No insights saved.${result.failed.length ? ` ${result.failed[0].error}` : ""}`,
      );
      await reload();
    } catch (e) {
      setError(errorMessage(e, "AI generation failed."));
    } finally {
      setGeneratingAi(false);
    }
  }

  if (loading) return <div className="opacity-60 text-sm">Loading executive dashboard…</div>;

  if (!metrics) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="serif text-2xl font-semibold">Workforce Verify — Executive Dashboard</h2>
          <p className="text-[14px] opacity-60 mt-1">Org-wide intelligence from Supabase.</p>
        </div>
        {error && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}
        <p className="text-sm opacity-60">Set profiles.org_id on your profile to see org metrics. Add departments, pulse_surveys, and compensation_recommendations for richer data.</p>
      </div>
    );
  }

  const m = metrics;

  return (
    <div className="space-y-6">
      {error && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}
      {aiNotice && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{aiNotice}</p>}

      <Card className="p-6" style={{ background: "var(--inferred-bg)" }}>
        <SectionHeader icon={Sparkles} title="Generate org-wide AI insights" tag={<InferredTag />}
          sub="Calls Anthropic for every employee and manager in your org, then saves to promotion_readiness, compensation_recommendations, and employee_value_scores." />
        <p className="text-[13px] opacity-80 mb-4">
          Requires <code className="text-[12px]">SUPABASE_SERVICE_ROLE_KEY</code> and <code className="text-[12px]">ANTHROPIC_API_KEY</code> in .env.local.
          Covers {m.orgHeadcount > 1 ? `${m.orgHeadcount - 1} employees/managers` : "your org"} — you decide every comp and promotion outcome.
        </p>
        <button
          type="button"
          disabled={generatingAi}
          onClick={runOrgAiGeneration}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-white inline-flex items-center gap-2 disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          <Sparkles size={16} />
          {generatingAi ? "Generating… (may take several minutes)" : "Generate insights for entire organization"}
        </button>
      </Card>

      <div>
        <h2 className="serif text-2xl font-semibold">Workforce Verify — Executive Dashboard</h2>
        <p className="text-[14px] opacity-60 mt-1">Org-wide intelligence ({m.orgHeadcount} profiles). Predictive metrics are labeled AI inference — never treated as decisions.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label="Workforce Health Score" value={String(m.workforceHealth)} sub="org composite /100" accent="var(--verified-fg)" />
        <Stat label="Productivity Index" value={m.productivity.toFixed(2)} sub="employee_value_scores" accent="var(--accent)" />
        <Stat label="Employee Morale Index" value={m.morale.toFixed(2)} sub="pulse_surveys avg" accent="var(--accent)" />
        <Card className="p-5" style={{ background: "var(--inferred-bg)" }}>
          <div className="mb-2"><InferredTag /></div>
          <div className="text-[12px] uppercase tracking-widest opacity-60">Retention Risk Index</div>
          <div className="mt-1 flex items-center gap-2"><RiskPill risk={m.retentionRisk} /><span className="text-[12px] opacity-60">from morale signals</span></div>
          <TransparencyNote>Aggregated flight-risk model from morale, tenure, and comp equity signals. Routes attention — not individual decisions.</TransparencyNote>
        </Card>
        <Stat label="Skills Growth Index" value={m.skillsGrowth.toFixed(2)} sub="pulse growth" />
        <Stat label="Innovation Index" value={m.innovation.toFixed(2)} sub="process improvements + achievements" />
        <Card className="p-5 sm:col-span-2" style={{ background: "var(--inferred-bg)" }}>
          <div className="flex items-center gap-2 mb-2"><DollarSign size={16} style={{ color: "var(--inferred-fg)" }} /><span className="text-[12px] uppercase tracking-widest opacity-60">Compensation Intelligence</span><InferredTag /></div>
          <div className="grid grid-cols-3 gap-3 mt-2">
            <div><div className="text-2xl font-semibold serif">{m.pendingRaises}</div><div className="text-[12px] opacity-60">Pending raises</div></div>
            <div><div className="text-2xl font-semibold serif">{m.pendingBonuses}</div><div className="text-[12px] opacity-60">Bonus recs</div></div>
            <div><div className="text-2xl font-semibold serif" style={{ color: m.underpaidAlerts ? "var(--warn)" : undefined }}>{m.underpaidAlerts}</div><div className="text-[12px] opacity-60">Underpaid alerts</div></div>
          </div>
          <div className="text-[13px] mt-3 opacity-70">Equity score: <strong>{m.equityScore.toFixed(2)}</strong> — open <strong>Comp Intelligence</strong> in the sidebar for full recommendations.</div>
        </Card>
        <Card className="p-5 sm:col-span-2" style={{ background: "var(--inferred-bg)" }}>
          <div className="flex items-center gap-2 mb-2"><TrendingUp size={16} style={{ color: "var(--inferred-fg)" }} /><span className="text-[12px] uppercase tracking-widest opacity-60">Promotion Pipeline</span><InferredTag /></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-center">
            {[{ l: "Ready now", v: m.promoReadyNow }, { l: "6 mo", v: m.promo6mo }, { l: "12 mo", v: m.promo12mo }, { l: "Succession gaps", v: m.successionGaps }].map((x) => (
              <div key={x.l} className="p-2 rounded-xl" style={{ background: "var(--surface)" }}>
                <div className="text-xl font-semibold serif">{x.v}</div>
                <div className="text-[11px] opacity-60">{x.l}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <SectionHeader icon={Building2} title="Departments" sub={departments.length ? "From departments table — per-dept metrics are estimated until profiles.department_id exists." : "Add rows to departments for your org."} />
        {departments.length === 0 ? (
          <p className="text-sm opacity-60">No departments configured for this org.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {departments.map((d) => (
              <button key={d.id} type="button" onClick={() => setSelectedDept(d.id === selectedDept ? null : d.id)}
                className="text-left rounded-2xl border p-5 transition hover:shadow-md"
                style={{ borderColor: selectedDept === d.id ? "var(--accent)" : "var(--line)", background: selectedDept === d.id ? "var(--accent-soft)" : "var(--surface)" }}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h4 className="font-semibold">{d.name}</h4>
                  <span className="text-[13px] opacity-60">{d.headcount} people</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                  <div className="flex justify-between"><span className="opacity-60">Productivity</span><span className="font-medium inline-flex items-center gap-1">{d.productivity.toFixed(2)} <TrendArrow dir={d.trends.prod} /></span></div>
                  <div className="flex justify-between"><span className="opacity-60">Morale</span><span className="font-medium inline-flex items-center gap-1">{d.morale.toFixed(2)} <TrendArrow dir={d.trends.morale} /></span></div>
                  <div className="flex justify-between items-center"><span className="opacity-60">Retention</span><span className="inline-flex items-center gap-1"><RiskPill risk={d.retention} /> <TrendArrow dir={d.trends.retention} /></span></div>
                  <div className="flex justify-between"><span className="opacity-60">Innovation</span><span className="font-medium">{d.innovation.toFixed(2)}</span></div>
                  <div className="flex justify-between col-span-2"><span className="opacity-60">Comp health</span><span className="font-medium">{d.compHealth.toFixed(2)}</span></div>
                </div>
                {selectedDept === d.id && (
                  <p className="text-[12px] mt-3 pt-3 border-t opacity-70" style={{ borderColor: "var(--line)" }}>
                    Drill-down view coming soon — headcount trends, verification backlog, and pulse aggregates.
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <PromotionReadinessPanel
        rows={promoRows}
        title="Promotion Readiness — organization"
        sub="Org-wide AI timing guidance by category. Exec and managers decide; never auto-promotes."
      />

      <Card className="p-6">
        <SectionHeader icon={LineChart} title="Morale trend (verified aggregate)" sub="De-identified pulse composite — not individual responses." />
        <Spark data={m.moraleTrend.length ? m.moraleTrend : [m.morale]} color="var(--accent)" />
      </Card>
    </div>
  );
}

function AdminView({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) {
  const [model, setModel] = useState("A");
  const swatches = ["#0f6e5c", "#1f4ed8", "#7c3aed", "#b45309", "#be123c"];
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4"><Palette size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Brand engine</h3></div>
        <div className="text-[12px] uppercase tracking-widest opacity-60 mb-2">Accent color</div>
        <div className="flex gap-2 mb-5">
          {swatches.map((c) => (
            <button key={c} onClick={() => setTheme({ ...theme, accent: c })} className="w-9 h-9 rounded-full border-2 transition" style={{ background: c, borderColor: theme.accent === c ? "var(--ink)" : "transparent" }} />
          ))}
        </div>
        <div className="text-[12px] uppercase tracking-widest opacity-60 mb-2">Appearance</div>
        <div className="flex gap-2">
          {["light", "dark"].map((m) => (
            <button key={m} onClick={() => setTheme({ ...theme, mode: m as Theme["mode"] })} className="px-4 py-2 rounded-xl text-sm font-medium border capitalize"
              style={{ borderColor: "var(--line)", background: theme.mode === m ? "var(--accent)" : "var(--surface-2)", color: theme.mode === m ? "#fff" : "var(--ink)" }}>{m}</button>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1"><SlidersHorizontal size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Evaluation model</h3></div>
        <p className="text-[13px] opacity-60 mb-4">Swap the operational review architecture org-wide.</p>
        {[
          { id: "A", t: "Employee-driven peer selection", d: "Employees nominate evaluators; AI checks shared project history for relevance." },
          { id: "B", t: "Constant kudos ecosystem", d: "Continuous micro-validations accumulate into quarterly aggregates." },
        ].map((m) => (
          <button key={m.id} onClick={() => setModel(m.id)} className="w-full text-left p-4 rounded-xl border mb-2 flex items-start gap-3 transition"
            style={{ borderColor: model === m.id ? "var(--accent)" : "var(--line)", background: model === m.id ? "var(--inferred-bg)" : "var(--surface-2)" }}>
            {model === m.id ? <ToggleRight size={22} style={{ color: "var(--accent)" }} /> : <ToggleLeft size={22} className="opacity-40" />}
            <div><div className="font-medium">{m.t}</div><div className="text-[13px] opacity-60">{m.d}</div></div>
          </button>
        ))}
      </Card>
    </div>
  );
}

function VerificationView({ userId }: { userId: string }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("verification_requests").select("id, past_employer_email, status, created_at")
        .eq("profile_id", userId).order("created_at", { ascending: false });
      if (!cancelled) {
        setRequests(data ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  async function sendAttestation() {
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    const { data, error: insertError } = await supabase.from("verification_requests").insert({
      profile_id: userId,
      past_employer_email: email.trim(),
      status: "pending",
    }).select("id, past_employer_email, status, created_at").single();
    setSending(false);
    if (insertError) setError(insertError.message);
    else if (data) {
      await writeAuditLog({
        actorId: userId,
        action: "verification_request",
        targetTable: "verification_requests",
        targetId: data.id,
        changes: { past_employer_email: email.trim() },
      });
      setRequests((prev) => [data, ...prev]);
      setEmail("");
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1"><Send size={18} style={{ color: "var(--verified-fg)" }} /><h3 className="font-semibold">Route A — Active outreach</h3><VerifiedFactTag /></div>
        <p className="text-[13px] opacity-70 mb-4 max-w-2xl">A secure attestation link goes to a named contact at a past employer. Only a confirmed human response creates a verified record — and it stays correctable with an audit trail.</p>
        <div className="flex gap-2 flex-wrap">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="past-manager@company.com" className="flex-1 min-w-[220px] px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }} />
          <button type="button" onClick={sendAttestation} disabled={sending || !email.trim()} className="px-4 py-2.5 rounded-xl text-sm font-medium text-white inline-flex items-center gap-2 disabled:opacity-60" style={{ background: "var(--verified-fg)" }}><Send size={15} /> {sending ? "Sending…" : "Send attestation"}</button>
        </div>
        {error && <p className="mt-3 text-[13px]" style={{ color: "var(--warn)" }}>{error}</p>}
      </Card>
      <Card className="p-6">
        <h3 className="font-semibold mb-3">Your attestation requests</h3>
        {loading ? (
          <p className="text-sm opacity-60">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm opacity-60">No requests yet.</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border text-[13px]" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                <span>{r.past_employer_email}</span>
                <span className="capitalize px-2 py-0.5 rounded-full text-[11px] font-medium"
                  style={{ background: r.status === "confirmed" ? "var(--verified-bg)" : "var(--warn-bg)", color: r.status === "confirmed" ? "var(--verified-fg)" : "var(--warn)" }}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card className="p-6" style={{ background: "var(--inferred-bg)" }}>
        <div className="flex items-center gap-2 mb-1"><Sparkles size={18} style={{ color: "var(--inferred-fg)" }} /><h3 className="font-semibold">Route B — Competency mapping</h3><InferredTag /></div>
        <p className="text-[13px] mb-3 max-w-2xl">When an employer can't be reached, the model produces an <strong>internal-only</strong> Likelihood Vector to help HR prioritize outreach. A hint, not a credential.</p>
        <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: "var(--surface)" }}>
          <div className="text-2xl font-semibold serif" style={{ color: "var(--inferred-fg)" }}>Lᵥ 0.74</div>
          <div className="text-[13px] opacity-70">"Plausible — recommend outreach to confirm"</div>
        </div>
        <TransparencyNote>A statistical estimate, never shown on the public passport or to outside parties as verification. Career-changers and fast upskillers may score lower despite truthful histories — which is exactly why it only routes attention rather than deciding anything.</TransparencyNote>
      </Card>
    </div>
  );
}

function SettingsView({ userId, onOutlookChange }: { userId: string; onOutlookChange?: (show: boolean) => void }) {
  const [t, setT] = useState<SettingsState>({ outlook: true, kudos: true, externalPassport: false, aiSummaries: true });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<SettingKey | null>(null);

  const rows: { k: SettingKey; db: string; t: string; d: string }[] = [
    { k: "outlook", db: "show_outlook", t: "Show my AI Professional Outlook", d: "Internal-only prediction on your dashboard." },
    { k: "aiSummaries", db: "ai_summaries", t: "AI-summarized milestones", d: "Let the model condense achievements into passport summaries." },
    { k: "externalPassport", db: "passport_published", t: "Publish public passport", d: "Make /p/verify/… reachable. Only attested facts ever appear." },
    { k: "kudos", db: "kudos_notifications", t: "Kudos notifications", d: "Get notified when peers send recognition." },
  ];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureUserSettings(userId);
      const { data } = await supabase.from("user_settings").select("*").eq("profile_id", userId).single();
      if (cancelled) return;
      if (data) {
        setT({
          outlook: data.show_outlook ?? true,
          kudos: data.kudos_notifications ?? true,
          externalPassport: data.passport_published ?? false,
          aiSummaries: data.ai_summaries ?? true,
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  async function toggleSetting(key: SettingKey, dbKey: string) {
    const next = !t[key];
    setT({ ...t, [key]: next });
    setSavingKey(key);
    const { error } = await supabase.from("user_settings").update({ [dbKey]: next }).eq("profile_id", userId);
    if (!error && dbKey === "passport_published") {
      try {
        await setPassportPublished(userId, next);
      } catch {
        setT({ ...t, [key]: !next });
      }
    }
    if (!error && dbKey === "show_outlook") onOutlookChange?.(next);
    setSavingKey(null);
    if (error) setT({ ...t, [key]: !next });
  }

  return (
    <div className="space-y-6">
      <ProfileEditor userId={userId} />
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4"><SettingsIcon size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Privacy & AI controls</h3></div>
        {loading ? (
          <p className="text-sm opacity-60">Loading settings…</p>
        ) : (
          <div className="space-y-1">
            {rows.map((r) => (
              <div key={r.k} className="flex items-center justify-between gap-4 py-3 border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                <div><div className="font-medium text-[15px]">{r.t}</div><div className="text-[13px] opacity-60">{r.d}</div></div>
                <button type="button" onClick={() => toggleSetting(r.k, r.db)} disabled={savingKey === r.k} className="shrink-0 disabled:opacity-50">
                  {t[r.k] ? <ToggleRight size={30} style={{ color: "var(--accent)" }} /> : <ToggleLeft size={30} className="opacity-30" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card className="p-6" style={{ background: "var(--surface-2)" }}>
        <div className="flex items-center gap-2 mb-2"><Lock size={16} style={{ color: "var(--verified-fg)" }} /><h3 className="font-semibold text-[15px]">Your data rights</h3></div>
        <p className="text-[13px] opacity-70 mb-3">Records are correctable and revocable. Request a fix, dispute an inference, or export everything.</p>
        <div className="flex gap-2 flex-wrap">
          {["Dispute an AI inference", "Correct a verified record", "Export my data", "Delete my account"].map((b) => (
            <button key={b} className="px-3 py-2 rounded-lg text-[13px] font-medium border" style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}>{b}</button>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ═══════════════════ AUTHENTICATED APP SHELL ═══════════════════ */
function AppShell({ role, theme, setTheme, onSignOut }: { role: Role; theme: Theme; setTheme: (theme: Theme) => void; onSignOut: () => void }) {
  const [tab, setTab] = useState("dashboard");
  const [sidebar, setSidebar] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showOutlook, setShowOutlook] = useState(true);
  const [publicSlug, setPublicSlug] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("active_sso");
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getUserId();
        if (cancelled) return;
        setUserId(id);
        await ensureUserSettings(id);
        const [{ data: profile }, { data: settings }] = await Promise.all([
          supabase.from("profiles").select("public_slug, account_status, trial_ends_at").eq("id", id).single(),
          supabase.from("user_settings").select("show_outlook").eq("profile_id", id).single(),
        ]);
        if (!cancelled) {
          setPublicSlug(profile?.public_slug ?? null);
          setShowOutlook(settings?.show_outlook ?? true);
          if (profile?.account_status) setAccountStatus(profile.account_status as AccountStatus);
          setTrialEndsAt(profile?.trial_ends_at ?? null);
        }
      } catch {
        /* session may have expired */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isFormer = accountStatus.startsWith("former_");
  const roleLabel: Record<Role, string> = {
    employee: "Employee", manager: "Manager", executive: "Executive",
    admin: "System Admin", hr: "HR / People Ops", superadmin: "Platform Operator",
  };
  const nav = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "verify", label: "Verification", icon: FileBadge },
    ...(isFormer ? [{ id: "plan", label: "Plan & billing", icon: CreditCard }] : []),
    ...(role === "executive" ? [{ id: "comp", label: "Comp Intelligence", icon: DollarSign }] : []),
    ...(role === "admin" ? [{ id: "people-org", label: "People & Org", icon: Users }] : []),
    ...(role === "superadmin" ? [{ id: "platform", label: "Platform Console", icon: Building2 }] : []),
    ...(role === "admin" ? [{ id: "admin", label: "Brand & Models", icon: SlidersHorizontal }] : []),
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];
  const dashboard = userId ? {
    employee: <EmployeeView userId={userId} showOutlook={showOutlook} accountStatus={accountStatus} trialEndsAt={trialEndsAt} />,
    manager: <ManagerView userId={userId} />,
    executive: <ExecutiveView userId={userId} />,
    admin: <AdminView theme={theme} setTheme={setTheme} />,
    hr: <ExecutiveView userId={userId} />,
    superadmin: (
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-1">Platform operator</h3>
        <p className="text-[14px] opacity-70 leading-relaxed">
          Use <strong>Platform Console</strong> in the sidebar to provision tenants, integrate workforce data, and review import batches.
          All actions are administrative — not AI inference.
        </p>
      </Card>
    ),
  }[role] : <div className="opacity-60 text-sm">Loading…</div>;

  const passportLabel = publicSlug ? `/p/verify/${publicSlug.slice(0, 4)}…` : "/p/verify/… (not published yet)";

  const NavList = () => (
    <>
      {nav.map((n) => {
        const Icon = n.icon; const active = tab === n.id;
        return (
          <button key={n.id} onClick={() => { setTab(n.id); setSidebar(false); }} className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition"
            style={{ background: active ? "var(--accent)" : "transparent", color: active ? "#fff" : "var(--ink-2)" }}><Icon size={16} /> {n.label}</button>
        );
      })}
      <div className="mt-4 p-3 rounded-xl text-[12px] leading-relaxed" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
        <div className="flex items-center gap-1.5 font-semibold mb-1" style={{ color: "var(--ink)" }}><Globe size={13} /> Public passport</div>
        {passportLabel} — attested facts only.
      </div>
    </>
  );

  return (
    <div style={{ background: "var(--bg)", color: "var(--ink)" }} className="min-h-screen">
      <header className="sticky top-0 z-30 border-b backdrop-blur" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--bg) 85%, transparent)" }}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button className="md:hidden" onClick={() => setSidebar(!sidebar)}>{sidebar ? <X size={20} /> : <Menu size={20} />}</button>
            <div className="p-1.5 rounded-lg" style={{ background: "var(--accent)" }}><ShieldCheck size={18} color="#fff" /></div>
            <span className="serif text-xl font-semibold">Credentia</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] px-3 py-1 rounded-full hidden sm:inline" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>{roleLabel[role]}</span>
            <button onClick={onSignOut} className="text-[13px] font-medium" style={{ color: "var(--accent)" }}>Sign out</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 py-6 grid md:grid-cols-[200px_1fr] gap-6">
        <nav className="hidden md:block space-y-1 md:sticky md:top-20 h-max"><NavList /></nav>
        {sidebar && (
          <div className="md:hidden fixed inset-0 z-20" onClick={() => setSidebar(false)}>
            <div className="absolute top-16 left-0 bottom-0 w-64 p-4 space-y-1 border-r" style={{ background: "var(--surface)", borderColor: "var(--line)" }} onClick={(e) => e.stopPropagation()}><NavList /></div>
          </div>
        )}
        <main className="min-w-0">
          {tab === "dashboard" && (
            <>
              <Card className="p-6 mb-6" style={{ background: "linear-gradient(135deg, var(--surface), var(--inferred-bg))" }}>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl" style={{ background: "var(--accent)" }}><ShieldCheck size={20} color="#fff" /></div>
                  <div>
                    <h2 className="font-semibold text-lg">How decisions are made here</h2>
                    <p className="text-[14px] opacity-75 leading-relaxed mt-1 max-w-3xl">Verified facts are confirmed by a real person and can appear on your public passport. AI inferences — outlooks, likelihood scores — are labeled estimates, kept internal, never proof. Every AI output has a "How was this decided?" explainer you can open.</p>
                  </div>
                </div>
              </Card>
              {dashboard}
            </>
          )}
          {tab === "verify" && userId && <VerificationView userId={userId} />}
          {tab === "comp" && role === "executive" && userId && <CompensationIntelligenceView userId={userId} />}
          {tab === "people-org" && role === "admin" && <PeopleOrgConsole />}
          {tab === "platform" && role === "superadmin" && <PlatformConsole />}
          {tab === "plan" && userId && isFormer && (
            <BillingPlanView
              userId={userId}
              accountStatus={accountStatus}
              trialEndsAt={trialEndsAt}
              onStatusChange={setAccountStatus}
            />
          )}
          {tab === "admin" && <AdminView theme={theme} setTheme={setTheme} />}
          {tab === "settings" && userId && (
            <SettingsView userId={userId} onOutlookChange={setShowOutlook} />
          )}
        </main>
      </div>
    </div>
  );
}

/* ═══════════════════ ROOT ROUTER ═══════════════════ */
export default function CredentiaSite() {
  const [screen, setScreen] = useState<"public" | "auth" | "app">("public");
  const [role, setRole] = useState<Role>("employee");
  const [authReady, setAuthReady] = useState(false);
  const [theme, setTheme] = useState<Theme>({ accent: "#0f6e5c", mode: "light" });
  const vars = useThemeVars(theme);

  const enterApp = useCallback((r: Role) => {
    setRole(r);
    setScreen("app");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.user) {
        try {
          const storedRole = await fetchProfileRole(session.user.id);
          enterApp(storedRole);
        } catch {
          setScreen("auth");
        }
      }
      setAuthReady(true);
    }

    restoreSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setScreen("public");
        return;
      }
      if (session?.user && event === "SIGNED_IN") {
        try {
          const storedRole = await fetchProfileRole(session.user.id);
          enterApp(storedRole);
        } catch {
          setScreen("auth");
        }
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [enterApp]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setScreen("public");
  }

  if (!authReady && screen === "public") {
    return (
      <div style={{ ...vars, background: "var(--bg)", color: "var(--ink)", minHeight: "100vh" }}>
        {FONTS}
        <div className="min-h-screen flex items-center justify-center opacity-60 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ ...vars, background: "var(--bg)", color: "var(--ink)", minHeight: "100vh" }}>
      {FONTS}
      {screen === "public" && <PublicSite onEnter={() => setScreen("auth")} theme={theme} setTheme={setTheme} />}
      {screen === "auth" && <AuthScreen onBack={() => setScreen("public")} onLogin={enterApp} />}
      {screen === "app" && <AppShell role={role} theme={theme} setTheme={setTheme} onSignOut={handleSignOut} />}
    </div>
  );
}
