"use client";

import React, {
  useState, useMemo, useEffect, useCallback,
  type CSSProperties, type ReactNode, type FormEvent,
} from "react";
import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";
import { LevelBadge, VerifiedTag, InferredTag, SelfReportedTag } from "@/lib/verification-ui";
import { setPassportPublished } from "@/lib/passport";
import { generateManagerInsights } from "@/lib/ai-client";
import { VerificationHistory } from "@/components/VerificationHistory";
import { PassportLinkCard } from "@/components/VerifiedResumePage";
import { EmployeeDataRightsCard } from "@/components/OrgPeopleView";
import { ShareableLinkCard } from "@/components/ShareableLinkCard";
import { PeopleOrgConsole } from "@/components/PeopleOrgConsole";
import { PlatformConsole } from "@/components/PlatformConsole";
import { ManagerTeamChangePanel } from "@/components/ManagerTeamChangePanel";
import { AdminOrgControls } from "@/components/AdminOrgControls";
import { ManagerAchievementPanel } from "@/components/ManagerAchievementPanel";
import { RemovalRequestPanel, FormerEmployeeDeletePanel } from "@/components/AccountRemovalPanels";
import { FormerTrialBanner, BillingPlanView } from "@/components/FormerEmployeeExperience";
import { AchievementVaultView } from "@/components/AchievementVaultView";
import { ExecutiveDashboard } from "@/components/executive/ExecutiveDashboard";
import { ExecutiveVerificationSection } from "@/components/executive/ExecutiveVerificationSection";
import { ProofDocumentUpload } from "@/components/ProofDocumentView";
import { AnimatedNumber, Reveal as RiseIn } from "@/components/ui/motion";
import { VerificationDeck } from "@/components/manager/VerificationDeck";
import { FlowBoard } from "@/components/flow/FlowBoard";
import { FlowOversight } from "@/components/flow/FlowOversight";
import { FlowErrorBoundary } from "@/components/flow/FlowErrorBoundary";
import { DocRepository } from "@/components/docs/DocRepository";
import { AgentConfiguration } from "@/components/agent/AgentConfiguration";
import { VerificationCandidatesPanel } from "@/components/verification/VerificationCandidatesPanel";
import { PassportInReviewSection } from "@/components/verification/PassportInReviewSection";
import { OverseerOversightPanel } from "@/components/verification/OverseerOversightPanel";
import { FloatingAssistant } from "@/components/assistant/FloatingAssistant";
import { ToastProvider, PageHeader, Button, Badge, Skeleton, cn } from "@/components/ui";
import { usePrefersColorScheme } from "@/lib/use-prefers-color-scheme";
import type { OrgSettings } from "@/lib/org-settings";
import { fetchOrgSettingsForUser, downloadCsv } from "@/lib/org-settings";
import type { AccountStatus } from "@/lib/lifecycle";
import {
  buildEmployeeTimeline, fetchEmployeeOutlook,
  fetchVerifyQueue, fetchTeamHealth,
  fetchCoachingInsights, fetchDirectReports, fetchReviewRows,
  fetchEmployeeValueScore, fetchTeamValueScores, fetchPromotionReadinessRows,
  VALUE_INPUT_LABELS, PROMO_CATEGORY_LABELS,
  type TimelineEvent, type VerifyQueueItem,
  type ValueScoreDetail, type TeamValueScoreRow, type PromotionReadinessRow,
} from "@/lib/workforce";
/* Achievement Vault — load/save via lib/supabase.ts, achievements table */
import {
  fetchAchievements,
  type AchievementRow,
} from "@/lib/achievements";
import {
  ShieldCheck, Sparkles, LayoutDashboard, Users, Award, Settings as SettingsIcon,
  AlertTriangle, BadgeCheck, Eye, EyeOff, ChevronRight, ChevronLeft, ChevronDown, Info, Building2, UserCircle2,
  LineChart, Lock, Zap, Send, ToggleLeft, ToggleRight, Palette,
  SlidersHorizontal, Globe, Menu, X, ArrowRight, ArrowLeft, Check, GitBranch, Workflow, ScanSearch,
  Target, FolderGit2, GraduationCap, TrendingUp, Lightbulb, Crown,
  ClipboardList, Heart, Activity, DollarSign, ArrowUp, ArrowDown, Minus, Plus, CreditCard,
  Handshake, Link2, Camera, Printer, Download, UserMinus, Briefcase,
  Compass, Quote, Play, Clock, Layers, History, Luggage, Inbox, CheckCircle2,
  KanbanSquare, BookOpen, LogOut,
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
type VerificationRequest = { id: string; past_employer_email: string; status: string; created_at: string; item_type?: string; item_label?: string };
type AttestItem = { id: string; type: "role" | "achievement"; label: string; refId?: string };
type SettingsState = { outlook: boolean; kudos: boolean; externalPassport: boolean; aiSummaries: boolean };
type SettingKey = keyof SettingsState;

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

const MOTIVATIONAL_MESSAGES = [
  "Your verified record grows with every achievement you add — keep building proof of impact.",
  "Recognition starts with clarity. Document wins while they're fresh.",
  "Strong careers are built on evidence. You're investing in yours.",
  "Growth is a habit. Small verified steps compound into a trusted passport.",
  "Your contributions matter — make sure they're captured and attested.",
  "Professional momentum comes from visible, verified progress.",
];

function firstName(fullName: string | null | undefined) {
  const n = fullName?.trim().split(/\s+/)[0];
  return n || "there";
}

function pickMotivationalMessage(userId: string) {
  const day = new Date().getDate();
  let h = day;
  for (let i = 0; i < userId.length; i++) h = (h + userId.charCodeAt(i)) % MOTIVATIONAL_MESSAGES.length;
  return MOTIVATIONAL_MESSAGES[h];
}

const ROLE_LABELS: Record<Role, string> = {
  employee: "Employee", manager: "Manager", executive: "Executive",
  admin: "System Admin", hr: "HR / People Ops", superadmin: "Platform Operator",
};

/* Cairn palette — periwinkle default + coral, lavender, olive, ochre accents */
const CAIRN_DEFAULT_ACCENT = "#6B7FC0";
const THEME_SWATCHES = ["#6B7FC0", "#E07C5E", "#8E7CB0", "#6E7A4F", "#C28A2C"];

function ProfileAvatar({ name, url, size = 40 }: { name?: string | null; url?: string | null; size?: number }) {
  const initials = (name?.trim() || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  if (url) {
    return <img src={url} alt="" className="rounded-full object-cover shrink-0 border" style={{ width: size, height: size, borderColor: "var(--line)" }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center font-semibold shrink-0 border"
      style={{ width: size, height: size, background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--line)", fontSize: size * 0.32 }}>
      {initials}
    </div>
  );
}

function ReportIdentity({ name, avatarUrl, size = 32 }: { name: string; avatarUrl?: string | null; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <ProfileAvatar name={name} url={avatarUrl} size={size} />
      <span className="truncate font-medium">{name}</span>
    </span>
  );
}

function DashboardWelcome({ userId, role }: { userId: string; role: Role }) {
  const [fullName, setFullName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const message = useMemo(() => pickMotivationalMessage(userId), [userId]);
  const showPhoto = role !== "admin" && role !== "superadmin";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", userId).single();
      if (!cancelled && data) {
        setFullName(data.full_name);
        setAvatarUrl(data.avatar_url);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <Card className="p-5 sm:p-6 mb-6">
      <div className="flex items-start gap-4">
        {showPhoto && <ProfileAvatar name={fullName} url={avatarUrl} size={52} />}
        <div className="min-w-0">
          <h2 className="serif text-xl sm:text-2xl font-semibold">Welcome, {firstName(fullName)}</h2>
          <p className="text-[14px] sm:text-[15px] opacity-70 mt-1 leading-relaxed max-w-2xl">{message}</p>
        </div>
      </div>
    </Card>
  );
}

// ── theme (Cairn design tokens — colors.css; optional accent override) ──
function useThemeVars(theme: Theme) {
  return useMemo(() => {
    if (theme.accent === CAIRN_DEFAULT_ACCENT) return {};
    return {
      "--accent": theme.accent,
      "--accent-soft": `${theme.accent}1a`,
      "--accent-hover": theme.accent,
      "--accent-press": theme.accent,
      "--accent-text": theme.accent,
    } as Record<string, string>;
  }, [theme.accent]);
}

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
  <div
    className={`border ${className}`}
    style={{
      borderColor: "var(--line)",
      background: "var(--surface)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-sm)",
      ...style,
    }}
  >
    {children}
  </div>
);

function MobileNavToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="lg:hidden shrink-0 p-1.5 rounded-lg hover:opacity-80 transition"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? "Close navigation menu" : "Open navigation menu"}
    >
      {open ? <X size={20} strokeWidth={2} /> : <Menu size={20} strokeWidth={2} />}
    </button>
  );
}

const Stat = ({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: string }) => (
  <Card className="p-6">
    <div className="cairn-eyebrow">{label}</div>
    <div className="mt-1 text-[32px] font-semibold serif tabular" style={{ color: accent || "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.05 }}>{value}</div>
    {sub && <div className="text-[12px] mt-1" style={{ color: "var(--ink-3)" }}>{sub}</div>}
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
    High: { fg: "var(--danger-fg)", bg: "var(--danger-bg)" },
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

function PromotionReadinessPanel({ rows, title, sub, avatarMap }: { rows: PromotionReadinessRow[]; title?: string; sub?: string; avatarMap?: Record<string, string | null> }) {
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
                      {avatarMap ? (
                        <ReportIdentity name={r.who} avatarUrl={avatarMap[r.employeeId]} size={28} />
                      ) : (
                        <span className="font-medium">{r.who}</span>
                      )}
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

const KIND_ICON: Record<string, typeof Target> = {
  kpi: Target, project: FolderGit2, certification: GraduationCap,
  promotion: TrendingUp, award: Award, process_improvement: Lightbulb, leadership: Crown,
};

/* ═══════════════════ PUBLIC MARKETING SITE — multi-page ═══════════════════ */

type MktRoute = "home" | "platform" | "why" | "different" | "employers" | "transparency";
const MKT_ROUTES: MktRoute[] = ["home", "platform", "why", "different", "employers", "transparency"];
const MAX_W = "1120px";

function parseMktHash(): { route: MktRoute; anchor: string | null } {
  const raw = (window.location.hash || "").replace(/^#\/?/, "").trim();
  const idx = raw.indexOf("::");
  const r = idx >= 0 ? raw.slice(0, idx) : raw;
  const a = idx >= 0 ? raw.slice(idx + 2) : "";
  return { route: (MKT_ROUTES.includes(r as MktRoute) ? r : "home") as MktRoute, anchor: a || null };
}

function mktScrollTo(y: number) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { window.scrollTo(0, Math.max(0, y)); return; }
  const startY = window.scrollY;
  const dist = Math.max(0, y) - startY;
  if (Math.abs(dist) < 2) return;
  const dur = Math.min(700, Math.max(280, Math.abs(dist) * 0.5));
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const t0 = Date.now();
  const id = setInterval(() => {
    const p = Math.min(1, (Date.now() - t0) / dur);
    window.scrollTo(0, Math.round(startY + dist * ease(p)));
    if (p >= 1) clearInterval(id);
  }, 16);
}

function mktScrollToAnchor(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  mktScrollTo(el.getBoundingClientRect().top + window.scrollY - 82);
  return true;
}
function mktScrollWhenReady(id: string, tries = 0) {
  if (mktScrollToAnchor(id)) return;
  if (tries < 30) setTimeout(() => mktScrollWhenReady(id, tries + 1), 40);
}

function useReveal(delay = 0, y = 26) {
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = typeof IntersectionObserver !== "undefined";
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (!io || reduce || r.top < vh * 0.85) return;
    el.style.opacity = "0";
    el.style.transform = `translateY(${y}px)`;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          el.style.transition = `opacity .7s var(--ease-out) ${delay}ms, transform .7s var(--ease-out) ${delay}ms`;
          el.style.opacity = "1";
          el.style.transform = "none";
          obs.disconnect();
        }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -7% 0px" });
    obs.observe(el);
  }, [delay, y]);
  return ref;
}

function Reveal({ children, delay = 0, y = 26, style = {}, className = "" }: { children: ReactNode; delay?: number; y?: number; style?: CSSProperties; className?: string }) {
  const ref = useReveal(delay, y);
  return <div ref={ref} style={style} className={className}>{children}</div>;
}

function CountUp({ value, decimals = 0, suffix = "", prefix = "" }: { value: number; decimals?: number; suffix?: string; prefix?: string }) {
  const [n, setN] = useState(value);
  const elRef = useCallback((el: HTMLSpanElement | null) => {
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (r.top < vh * 0.85) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        obs.disconnect();
        let raf: number;
        const dur = 1400;
        let start: number | undefined;
        const tick = (t: number) => {
          if (!start) start = t;
          const p = Math.min(1, (t - start) / dur);
          setN(value * (1 - Math.pow(1 - p, 3)));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
      });
    }, { threshold: 0.4 });
    obs.observe(el);
  }, [value]);
  return <span ref={elRef}>{prefix}{n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
}

const MktCard = ({ children, className = "", style = {}, tone }: { children: ReactNode; className?: string; style?: CSSProperties; tone?: "inferred" }) => (
  <div className={`border ${className}`} style={{
    borderColor: "var(--line)", background: tone === "inferred" ? "var(--inferred-bg)" : "var(--surface)",
    borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", ...style,
  }}>{children}</div>
);

function PassportMock() {
  return (
    <MktCard style={{ padding: 22, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)" }}>
          <Globe size={14} /> /p/verify/8f3a…c2
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", padding: "4px 10px", borderRadius: "var(--radius-pill)", background: "var(--accent-soft)", color: "var(--accent-text)" }}>
          <BadgeCheck size={11} /> Attested
        </span>
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>Tyrell S.</div>
      <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>Senior Equity Program Lead</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 18 }}>
        {[["Tenure", "6.2 yr"], ["Skills", "14"], ["Validations", "9"]].map(([label, val]) => (
          <div key={label}><div className="cairn-eyebrow">{label}</div><div style={{ fontSize: 20, fontWeight: 600, fontFamily: "var(--font-display)", color: "var(--ink)" }}>{val}</div></div>
        ))}
      </div>
    </MktCard>
  );
}
function FeedbackMock() {
  return (
    <MktCard style={{ padding: 22, width: "100%" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 14 }}>This cycle — consensus</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[["Employee", "Led the bands rollout end-to-end."], ["Manager", "Owned it; unblocked two teams."]].map(([who, txt]) => (
          <div key={who} style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)", padding: 12 }}>
            <div className="cairn-eyebrow" style={{ marginBottom: 6 }}>{who}</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45 }}>{txt}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Alignment</span>
        <InferredTag />
      </div>
      <ConfidenceBar value={0.92} />
    </MktCard>
  );
}
function AnalyticsMock() {
  const rows: [string, number, string][] = [["Engineering", 86, "var(--accent)"], ["Sales", 74, "var(--warn-fg)"], ["Customer Success", 68, "var(--danger-fg)"], ["Finance", 88, "var(--accent)"]];
  return (
    <MktCard style={{ padding: 22, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div className="cairn-eyebrow">Company health</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, color: "var(--accent)", lineHeight: 1 }}>83</div>
      </div>
      {rows.map(([name, val, c]) => (
        <div key={name} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
            <span style={{ color: "var(--ink-2)" }}>{name}</span>
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>{val}</span>
          </div>
          <div style={{ height: 7, borderRadius: "var(--radius-pill)", background: "var(--surface-inset)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${val}%`, background: c, borderRadius: "var(--radius-pill)" }} />
          </div>
        </div>
      ))}
    </MktCard>
  );
}
function ValidationMock() {
  return (
    <MktCard style={{ padding: 22, width: "100%" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>Past-experience check</div>
      <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 16 }}>Acme Corp · 2019–2022 · Analyst</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--accent-soft)", borderRadius: "var(--radius-md)" }}>
          <BadgeCheck size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "var(--ink)" }}>Employer attested — one click</span>
        </div>
        <div style={{ padding: "10px 12px", background: "var(--inferred-bg)", borderRadius: "var(--radius-md)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <InferredTag />
            <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Likelihood estimate</span>
          </div>
          <ConfidenceBar value={0.78} />
        </div>
      </div>
    </MktCard>
  );
}
function RecruitMock() {
  const cands: [string, string, number, string][] = [["Tyrell S.", "Equity Program Lead", 5, "9 validations"], ["Mara D.", "Staff Engineer", 5, "12 validations"], ["Priya R.", "Revenue Ops", 4, "7 validations"]];
  return (
    <MktCard style={{ padding: 20, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div className="cairn-eyebrow">Verified shortlist</div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-3)" }}>3 of 28 matched</span>
      </div>
      {cands.map(([name, role, , val]) => (
        <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", background: "var(--surface-2)", borderRadius: "var(--radius-md)", marginBottom: 10 }}>
          <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: "50%", background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>{name[0]}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{name}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{role}</div>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>{val}</span>
        </div>
      ))}
    </MktCard>
  );
}

const MKT_FEATURES = [
  { slug: "passport", Icon: BadgeCheck, t: "Verified talent passport", d: "Every profile resolves to a correctable public URL showing only attested facts — confirmed tenure, titles, and validated skills.", Mock: PassportMock },
  { slug: "feedback", Icon: Workflow, t: "Multi-layer feedback engine", d: "Employee and manager answer tailored prompts; AI processes sentiment, verifies impact, and surfaces an alignment score for coaching.", Mock: FeedbackMock },
  { slug: "analytics", Icon: LineChart, t: "Executive analytics", d: "Morale index, organizational friction, and retention signals — quantified, weighted, and explainable.", Mock: AnalyticsMock },
  { slug: "validation", Icon: ScanSearch, t: "Past-experience validation", d: "Reach past employers for one-click attestation, or get an internal AI likelihood estimate that routes where to look.", Mock: ValidationMock },
] as const;

const MKT_STEPS = [
  { n: "01", Icon: Inbox, t: "Collect", d: "Tailored prompts go to employee and manager each cycle.", long: "Every review cycle, Cairn sends role- and level-aware prompts to the employee and, separately, to their manager. No blank-page reviews — just a few sharp questions tuned to the work that actually happened.", points: ["Adaptive prompts by role, level, and recent projects", "Employee and manager answer independently", "~10 minutes per cycle, with gentle reminders", "Every submission is timestamped to the audit log"] },
  { n: "02", Icon: Sparkles, t: "Synthesize", d: "AI produces a consensus summary, a delta log, and an outlook.", long: "The model reconciles both sides into a consensus summary, flags where the two accounts diverge, and drafts a forward outlook — all of it clearly labeled as inference, never as fact.", points: ["Sentiment + impact analysis across both responses", "A deviation score surfaces coaching moments", "Every output is tagged AI INFERENCE", "Each carries a 'How was this decided?' explainer"] },
  { n: "03", Icon: BadgeCheck, t: "Verify", d: "Facts get attested by real people and locked with an audit trail.", long: "A real person attests each claim, promoting it up the five-level verification ladder. Verified facts are immutable-but-correctable: locked against silent edits, yet always disputable with a full history.", points: ["Attested by a real, accountable person", "Verification levels L1 (self) → L5 (multi-source)", "Immutable but correctable, never silently permanent", "Complete, viewable verification history"] },
  { n: "04", Icon: Luggage, t: "Carry", d: "Employees take a verified passport to their next opportunity.", long: "The employee owns a portable passport at a correctable public URL. It shows attested facts only — self-reported items and internal inferences never leave the org — and the employee can revoke or correct it anytime.", points: ["Public URL shows manager-verified (L2+) facts only", "Self-reported and inferred items stay internal", "Revocable and correctable by the employee", "Portable across every employer on Cairn"] },
];

const MKT_NAV = [
  { label: "Platform", route: "platform" as MktRoute, sections: [{ label: "Verified Talent Passport", anchor: "platform-passport" }, { label: "Multi-Layer Feedback Engine", anchor: "platform-feedback" }, { label: "Executive Analytics", anchor: "platform-analytics" }, { label: "Past-Experience Validation", anchor: "platform-validation" }, { label: "How It Works", anchor: "platform-how" }] },
  { label: "Why Cairn", route: "why" as MktRoute, sections: [{ label: "The Shift", anchor: "why-shift" }, { label: "Our Mission", anchor: "why-mission" }, { label: "Value on Both Sides", anchor: "why-value" }, { label: "What You Get", anchor: "why-benefits" }] },
  { label: "What's Different", route: "different" as MktRoute, sections: [{ label: "What Sets Us Apart", anchor: "different-pillars" }, { label: "How Cairn Compares", anchor: "different-compare" }] },
  { label: "For Employers", route: "employers" as MktRoute, sections: [{ label: "Hire From Proof", anchor: "employers-proof" }, { label: "Testimonials", anchor: "employers-testimonials" }] },
  { label: "Transparency", route: "transparency" as MktRoute, sections: [{ label: "Facts vs. Inferences", anchor: "transparency-types" }, { label: "Verification Ladder", anchor: "transparency-ladder" }] },
];

const INDUSTRIES = ["Healthcare", "Manufacturing", "Financial Services", "Public Sector", "Higher Education", "Technology", "Retail", "Logistics"];

function MktLogo() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <img src="/cairn-logo-mark.svg" alt="" style={{ width: 34, height: 34 }} />
      <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)" }}>Credentia</span>
    </span>
  );
}

function PageHero({ eyebrow, eyebrowIcon, title, lede, children, tone = "default", goBack }: { eyebrow?: string; eyebrowIcon?: ReactNode; title: string; lede?: string; children?: ReactNode; tone?: "default" | "warm"; goBack: () => void }) {
  return (
    <section style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--line)" }}>
      <div aria-hidden style={{ position: "absolute", top: -120, left: "50%", transform: "translateX(-50%)", width: "100vw", height: 560, background: "var(--dusk-gradient)", opacity: tone === "warm" ? 0.5 : 0.4, zIndex: 0, pointerEvents: "none", maskImage: "linear-gradient(to bottom, #000 0%, #000 30%, transparent 92%)", WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 30%, transparent 92%)" }} />
      <div style={{ position: "relative", zIndex: 1, maxWidth: MAX_W, margin: "0 auto", padding: "30px 24px 60px" }}>
        <button type="button" onClick={goBack} style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", marginBottom: 26, padding: "8px 15px 8px 12px", borderRadius: "var(--radius-pill)", border: "1px solid var(--line)", background: "var(--surface)", fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: 600, color: "var(--ink-2)", boxShadow: "var(--shadow-sm)" }}>
          <ArrowLeft size={16} style={{ color: "var(--accent)" }} /> Back
        </button>
        <Reveal style={{ maxWidth: 760 }}>
          {eyebrow && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: "var(--radius-pill)", background: "var(--accent-soft)", color: "var(--accent-text)", marginBottom: 20 }}>
              {eyebrowIcon} {eyebrow}
            </span>
          )}
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 54, fontWeight: 600, lineHeight: 1.06, letterSpacing: "-0.025em", color: "var(--ink)", margin: 0 }}>{title}</h1>
          {lede && <p style={{ fontSize: 19, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 20, maxWidth: 600 }}>{lede}</p>}
          {children}
        </Reveal>
      </div>
    </section>
  );
}

function MktHeader({ route, navigate, onEnter }: { route: MktRoute; navigate: (to: MktRoute, anchor?: string) => void; onEnter: () => void }) {
  const [compressed, setCompressed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  useEffect(() => {
    const onScroll = () => setCompressed(window.scrollY > 56);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const audiences: [string, boolean, MktRoute][] = [["For Talent", false, "why"], ["For Employers", true, "employers"], ["For Career Teams", false, "platform"]];
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 40, background: "color-mix(in srgb, var(--bg) 93%, transparent)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${compressed ? "var(--line)" : "transparent"}`, boxShadow: compressed ? "var(--shadow-sm)" : "none", transition: "box-shadow .3s var(--ease-out), border-color .3s var(--ease-out)" }}>
      {/* audience bar */}
      <div style={{ background: "var(--ink)", color: "var(--on-accent)", overflow: "hidden", maxHeight: compressed ? 0 : 46, opacity: compressed ? 0 : 1, transition: "max-height .35s var(--ease-out), opacity .25s var(--ease-out)" }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "0 24px", height: 46, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "color-mix(in srgb, var(--on-accent) 72%, transparent)" }}>
            <ShieldCheck size={14} style={{ color: "var(--gold)" }} /> Verified facts. Labeled inferences. Built for every industry.
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {audiences.map(([label, hot, target]) => (
              <button key={label} type="button" onClick={() => navigate(target)}
                style={{ fontSize: 12.5, fontWeight: 600, padding: "5px 13px", borderRadius: "var(--radius-pill)", border: 0, cursor: "pointer", color: hot ? "var(--on-accent)" : "color-mix(in srgb, var(--on-accent) 78%, transparent)", background: hot ? "var(--accent)" : "transparent" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* main nav */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", height: compressed ? 60 : 80, transition: "height .3s var(--ease-out)" }}>
        <button type="button" onClick={() => navigate("home")} style={{ justifySelf: "start", background: "none", border: 0, cursor: "pointer", padding: 0, transform: compressed ? "scale(0.92)" : "none", transformOrigin: "left center", transition: "transform .3s var(--ease-out)" }}>
          <MktLogo />
        </button>
        <nav style={{ justifySelf: "center", display: "flex", alignItems: "center", gap: 4, height: "100%" }} className="mkt-desktop-nav">
          {MKT_NAV.map((item, i) => (
            <div key={item.label} style={{ position: "relative", display: "flex", alignItems: "center", height: "100%" }}
              onMouseEnter={() => setOpenMenu(i)} onMouseLeave={() => setOpenMenu((o) => o === i ? null : o)}>
              <button type="button" onClick={() => { setOpenMenu(null); navigate(item.route); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 14.5, fontWeight: 500, color: (route === item.route || openMenu === i) ? "var(--ink)" : "var(--ink-2)", background: "none", border: 0, cursor: "pointer", whiteSpace: "nowrap", padding: "6px 8px" }}>
                {item.label}
                <ChevronDown size={14} style={{ color: "var(--ink-3)", transition: "transform .25s var(--ease-out)", transform: openMenu === i ? "rotate(180deg)" : "none" }} />
              </button>
              {openMenu === i && (
                <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", paddingTop: 12, zIndex: 50 }}>
                  <div style={{ width: 220, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-xl)", padding: 8 }}>
                    {item.sections.map((s) => (
                      <button key={s.anchor} type="button" onClick={() => { navigate(item.route, s.anchor); setOpenMenu(null); }}
                        className="mkt-menu-row"
                        style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", border: 0, background: "transparent", padding: "10px 14px", borderRadius: "var(--radius-md)" }}>
                        <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "var(--terracotta-700)", lineHeight: 1.3 }}>{s.label}</span>
                      </button>
                    ))}
                    <div style={{ borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 6 }}>
                      <button type="button" onClick={() => { navigate(item.route); setOpenMenu(null); }} className="mkt-menu-row"
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", border: 0, background: "transparent", cursor: "pointer", padding: "9px 14px", borderRadius: "var(--radius-md)", fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: 600, color: "var(--accent-text)" }}>
                        View the full {item.label} page <ArrowRight size={14} style={{ color: "var(--accent)" }} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>
        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 14 }}>
          <button type="button" onClick={onEnter} className="mkt-desktop-nav" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-2)", background: "none", border: 0, cursor: "pointer", whiteSpace: "nowrap" }}>Sign in</button>
          <button type="button" onClick={onEnter} className="mkt-desktop-nav" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--on-accent)", fontSize: 14, fontWeight: 600, border: 0, cursor: "pointer" }}>
            Request access
          </button>
          <button type="button" onClick={() => setMobileOpen((m) => !m)} className="mkt-mobile-toggle" style={{ display: "none", background: "none", border: 0, cursor: "pointer", padding: 4 }} aria-label="Menu">
            {mobileOpen ? <X size={24} style={{ color: "var(--ink)" }} /> : <Menu size={24} style={{ color: "var(--ink)" }} />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 45, borderTop: "1px solid var(--line)", background: "var(--surface)", boxShadow: "var(--shadow-lg)", padding: "8px 24px 20px", maxHeight: "78vh", overflowY: "auto" }}>
          {MKT_NAV.map((item) => (
            <div key={item.label} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <button type="button" onClick={() => { navigate(item.route); setMobileOpen(false); }} style={{ display: "block", padding: "8px 0", fontSize: 16, fontWeight: 600, color: route === item.route ? "var(--accent-text)" : "var(--ink)", background: "none", border: 0, cursor: "pointer", textAlign: "left", width: "100%" }}>{item.label}</button>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, paddingLeft: 2, paddingBottom: 6 }}>
                {item.sections.map((s) => (
                  <button key={s.anchor} type="button" onClick={() => { navigate(item.route, s.anchor); setMobileOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", width: "100%", border: 0, background: "transparent", cursor: "pointer", padding: "8px 0", fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--ink-2)" }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => { setMobileOpen(false); onEnter(); }} style={{ display: "block", width: "100%", marginTop: 14, padding: "12px 20px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--on-accent)", fontSize: 15, fontWeight: 600, border: 0, cursor: "pointer" }}>Request access</button>
        </div>
      )}
    </header>
  );
}

function MktFooter({ navigate, onEnter }: { navigate: (to: MktRoute) => void; onEnter: () => void }) {
  const cols: [string, [string, MktRoute][]][] = [
    ["Product", [["Platform", "platform"], ["Transparency", "transparency"]]],
    ["Company", [["Why Cairn", "why"], ["What's different", "different"], ["For employers", "employers"]]],
    ["Audiences", [["For Talent", "why"], ["For Employers", "employers"], ["For Career Teams", "platform"]]],
  ];
  return (
    <footer style={{ borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
      <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "56px 24px 32px", display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 36 }} className="mkt-footer-grid">
        <div>
          <MktLogo />
          <p style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 14, maxWidth: 280, lineHeight: 1.6 }}>The verified record of how good someone actually is. Manage your people today; let them carry proof to tomorrow.</p>
          <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 18, padding: "9px 18px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--on-accent)", fontSize: 14, fontWeight: 600, border: 0, cursor: "pointer" }}>
            Request access <ArrowRight size={15} />
          </button>
        </div>
        {cols.map(([title, items]) => (
          <div key={title}>
            <div className="cairn-eyebrow" style={{ marginBottom: 14 }}>{title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map(([label, to]) => (
                <button key={label} type="button" onClick={() => navigate(to)} style={{ fontSize: 14, color: "var(--ink-2)", background: "none", border: 0, cursor: "pointer", textAlign: "left", padding: 0 }}>{label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid var(--line)", padding: "20px 0" }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontSize: 13, color: "var(--ink-3)" }}>
          <span>© 2026 Credentia. Verified facts. Labeled inferences. Your data, correctable.</span>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════ Home page ═══════════════════ */
function MktHero({ onEnter }: { onEnter: () => void }) {
  return (
    <section style={{ position: "relative", maxWidth: MAX_W, margin: "0 auto", padding: "64px 24px 36px" }}>
      <div aria-hidden style={{ position: "absolute", top: -88, left: "50%", transform: "translateX(-50%)", width: "100vw", height: 620, background: "var(--dusk-gradient)", opacity: 0.42, zIndex: 0, pointerEvents: "none", maskImage: "linear-gradient(to bottom, #000 0%, #000 32%, transparent 92%)", WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 32%, transparent 92%)" }} />
      <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 48, alignItems: "center" }} className="mkt-hero-grid">
        <Reveal>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: "var(--radius-pill)", background: "var(--accent-soft)", color: "var(--accent-text)", marginBottom: 22 }}>
            <Sparkles size={14} /> Performance you can prove
          </span>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 58, fontWeight: 600, lineHeight: 1.05, letterSpacing: "-0.025em", color: "var(--ink)", margin: 0 }}>
            The verified record of how good someone actually is.
          </h1>
          <p style={{ fontSize: 19, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 22, maxWidth: 540 }}>
            Credentia turns ongoing performance feedback into an attested talent passport — so hiring no longer starts from an unverifiable resume.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30 }}>
            <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--on-accent)", fontSize: 16, fontWeight: 600, border: 0, cursor: "pointer" }}>
              Enter the platform <ArrowRight size={18} />
            </button>
            <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)", fontSize: 16, fontWeight: 600, border: "1px solid var(--line)", cursor: "pointer" }}>
              Request access
            </button>
          </div>
        </Reveal>
        <Reveal delay={120} y={34}>
          <div style={{ borderRadius: "var(--radius-xl)", overflow: "hidden", border: "1px solid var(--line)", boxShadow: "var(--shadow-lg)", background: "var(--surface-inset)" }}>
            <PassportMock />
          </div>
        </Reveal>
      </div>
      <Reveal delay={120} style={{ position: "relative", zIndex: 1, marginTop: 64 }}>
        <div className="cairn-eyebrow" style={{ textAlign: "center", marginBottom: 18 }}>Built for accuracy across every industry</div>
        <div style={{ position: "relative", overflow: "hidden", maskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)" }}>
          <div className="mkt-marquee-track">
            {[...INDUSTRIES, ...INDUSTRIES].map((name, i) => (
              <span key={i} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 8, padding: "0 28px", fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                <CheckCircle2 size={16} style={{ color: "var(--accent)" }} /> {name}
              </span>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function MktFeatureShowcase({ navigate }: { navigate: (to: MktRoute) => void }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => setActive((a) => (a + 1) % MKT_FEATURES.length), 4200);
    return () => clearInterval(id);
  }, [paused]);
  const feat = MKT_FEATURES[active];
  const Mock = feat.Mock;
  return (
    <section style={{ maxWidth: MAX_W, margin: "0 auto", padding: "92px 24px" }}>
      <Reveal>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: "var(--radius-pill)", background: "var(--accent-soft)", color: "var(--accent-text)", marginBottom: 16 }}>Platform</span>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>One platform, two jobs</h2>
        <p style={{ fontSize: 18, color: "var(--ink-2)", marginTop: 12, maxWidth: 560 }}>Run rich internal performance management, and produce a portable, verified credential as a by-product. Pick a capability to see it.</p>
      </Reveal>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.05fr", gap: 36, marginTop: 44, alignItems: "center" }} className="mkt-split">
        <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {MKT_FEATURES.map((f, i) => {
            const on = i === active;
            const Icon = f.Icon;
            return (
              <button key={f.t} type="button" onClick={() => setActive(i)} style={{ display: "flex", gap: 14, alignItems: "flex-start", textAlign: "left", cursor: "pointer", padding: "18px 18px", borderRadius: "var(--radius-lg)", border: `1px solid ${on ? "var(--accent-line)" : "var(--line)"}`, background: on ? "var(--surface)" : "transparent", boxShadow: on ? "var(--shadow-md)" : "none", transition: "all .35s var(--ease-out)" }}>
                <span style={{ width: 42, height: 42, flexShrink: 0, borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center", background: on ? "var(--accent)" : "var(--accent-soft)", transition: "background .35s var(--ease-out)" }}>
                  <Icon size={20} style={{ color: on ? "var(--on-accent)" : "var(--accent)" }} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)", lineHeight: 1.25 }}>{f.t}</span>
                  {on && <span style={{ display: "block", fontSize: 14, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.55 }}>{f.d}</span>}
                </span>
              </button>
            );
          })}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, paddingLeft: 4 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {MKT_FEATURES.map((_, i) => (
                <span key={i} onClick={() => setActive(i)} style={{ width: i === active ? 22 : 8, height: 8, borderRadius: "var(--radius-pill)", background: i === active ? "var(--accent)" : "var(--line-strong)", cursor: "pointer", transition: "all .35s var(--ease-out)", display: "inline-block" }} />
              ))}
            </div>
            <button type="button" onClick={() => navigate("platform")} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, color: "var(--accent-text)", background: "none", border: 0, cursor: "pointer" }}>
              Explore the platform <ArrowRight size={15} style={{ color: "var(--accent)" }} />
            </button>
          </div>
        </div>
        <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
          style={{ position: "relative", padding: 28, borderRadius: "var(--radius-2xl)", background: "linear-gradient(150deg, var(--surface-2), var(--accent-soft))", border: "1px solid var(--line)", minHeight: 340, display: "flex", alignItems: "center" }}>
          <div key={active} className="mkt-swap-in" style={{ width: "100%" }}>
            <Mock />
          </div>
        </div>
      </div>
    </section>
  );
}

function MktStatsBand() {
  const stats = [
    { v: 2.4, dec: 1, suffix: "M", label: "Verified facts attested", sub: "across customer orgs" },
    { v: 98, suffix: "%", label: "Attestation completion", sub: "within one cycle" },
    { v: 4.7, dec: 1, suffix: "×", label: "Faster reference checks", sub: "vs. manual outreach" },
    { fixed: "0", label: "Inferences shown externally", sub: "facts only, always" },
  ] as const;
  return (
    <section style={{ background: "var(--ink)", color: "var(--on-accent)" }}>
      <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "72px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 28 }} className="mkt-stat-grid">
          {stats.map((s, i) => (
            <Reveal key={i} delay={i * 90}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 50, fontWeight: 600, letterSpacing: "-0.02em", color: "#F2C9B4" }}>
                {"fixed" in s ? s.fixed : <CountUp value={s.v} decimals={"dec" in s ? s.dec : 0} suffix={s.suffix} />}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8, color: "var(--on-accent)" }}>{s.label}</div>
              <div style={{ fontSize: 13, color: "color-mix(in srgb, var(--on-accent) 62%, transparent)", marginTop: 2 }}>{s.sub}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function MktPillars({ navigate }: { navigate: (to: MktRoute) => void }) {
  const pillars = [
    { to: "why" as MktRoute, Icon: Compass, accent: "var(--accent)", soft: "var(--accent-soft)", eyebrow: "Why Cairn", t: "A record you can trust", d: "The mission, the value, and why a verified record beats an unverifiable resume — for talent and teams alike.", cta: "See why Cairn" },
    { to: "different" as MktRoute, Icon: GitBranch, accent: "var(--coral)", soft: "var(--coral-soft)", eyebrow: "What's different", t: "Not another HR tool", d: "Fact and inference, kept separate by design. The methodology and standout features competitors can't copy.", cta: "What sets us apart" },
    { to: "employers" as MktRoute, Icon: Building2, accent: "var(--gold)", soft: "var(--gold-soft)", eyebrow: "For employers", t: "Hire from proof", d: "A verified talent pool, reference checks in minutes, and partner stories from teams already hiring on Credentia.", cta: "Explore for employers" },
  ];
  return (
    <section style={{ maxWidth: MAX_W, margin: "0 auto", padding: "92px 24px" }}>
      <Reveal style={{ textAlign: "center", maxWidth: 620, margin: "0 auto 44px" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>Where to go next</h2>
        <p style={{ fontSize: 18, color: "var(--ink-2)", marginTop: 12 }}>Three ways into Credentia, depending on what you came to learn.</p>
      </Reveal>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }} className="mkt-stat-grid">
        {pillars.map((p, i) => {
          const Icon = p.Icon;
          return (
            <Reveal key={p.to} delay={i * 100}>
              <button type="button" onClick={() => navigate(p.to)} style={{ textAlign: "left", background: "none", border: 0, cursor: "pointer", display: "block", width: "100%", height: "100%" }}>
                <MktCard style={{ padding: 28, height: "100%", display: "flex", flexDirection: "column", transition: "box-shadow .2s var(--ease-out)" }} className="mkt-interactive-card">
                  <span style={{ width: 50, height: 50, borderRadius: "var(--radius-md)", background: p.soft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={24} style={{ color: p.accent }} />
                  </span>
                  <div className="cairn-eyebrow" style={{ marginTop: 18 }}>{p.eyebrow}</div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--ink)", margin: "6px 0 0", lineHeight: 1.2 }}>{p.t}</h3>
                  <p style={{ fontSize: 14.5, color: "var(--ink-2)", marginTop: 10, lineHeight: 1.6, flex: 1 }}>{p.d}</p>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 18, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                    {p.cta} <ArrowRight size={16} style={{ color: p.accent }} />
                  </span>
                </MktCard>
              </button>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

function MktHomeCta({ onEnter }: { onEnter: () => void }) {
  return (
    <section style={{ maxWidth: MAX_W, margin: "0 auto", padding: "100px 24px", textAlign: "center" }}>
      <Reveal>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 50, fontWeight: 600, color: "var(--ink)", maxWidth: 760, margin: "0 auto", lineHeight: 1.1, letterSpacing: "-0.02em" }}>Stop evaluating resumes. Start trusting records.</h2>
        <div style={{ marginTop: 32, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--on-accent)", fontSize: 16, fontWeight: 600, border: 0, cursor: "pointer" }}>
            Enter the platform <ArrowRight size={20} />
          </button>
          <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)", fontSize: 16, fontWeight: 600, border: "1px solid var(--line)", cursor: "pointer" }}>
            Request access
          </button>
        </div>
      </Reveal>
    </section>
  );
}

/* ═══════════════════ Platform page ═══════════════════ */
function MktPlatformPage({ onEnter, goBack }: { onEnter: () => void; goBack: () => void }) {
  const [openStep, setOpenStep] = useState(0);
  const step = MKT_STEPS[openStep];
  const StepIcon = step.Icon;
  return (
    <>
      <PageHero eyebrow="Platform" eyebrowIcon={<LayoutDashboard size={14} />} title="One platform, two jobs." lede="Run rich internal performance management — and produce a portable, verified credential as a by-product. Every capability earns its place in both." goBack={goBack}>
        <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
          <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--on-accent)", fontSize: 16, fontWeight: 600, border: 0, cursor: "pointer" }}>Enter the platform <ArrowRight size={18} /></button>
        </div>
      </PageHero>
      <section style={{ maxWidth: MAX_W, margin: "0 auto", padding: "84px 24px", display: "flex", flexDirection: "column", gap: 72 }}>
        {MKT_FEATURES.map((f, i) => {
          const flip = i % 2 === 1;
          const Icon = f.Icon;
          const Mock = f.Mock;
          return (
            <Reveal key={f.t}>
              <div id={`platform-${f.slug}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center", scrollMarginTop: 90 }} className="mkt-split">
                <div style={{ order: flip ? 2 : 1 }}>
                  <span style={{ width: 46, height: 46, borderRadius: "var(--radius-md)", background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={22} style={{ color: "var(--accent)" }} />
                  </span>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, color: "var(--ink)", margin: "18px 0 0", letterSpacing: "-0.01em", lineHeight: 1.2 }}>{f.t}</h3>
                  <p style={{ fontSize: 16.5, color: "var(--ink-2)", marginTop: 12, lineHeight: 1.6, maxWidth: 460 }}>{f.d}</p>
                </div>
                <div style={{ order: flip ? 1 : 2, padding: 26, borderRadius: "var(--radius-2xl)", background: "linear-gradient(150deg, var(--surface-2), var(--accent-soft))", border: "1px solid var(--line)" }}>
                  <Mock />
                </div>
              </div>
            </Reveal>
          );
        })}
      </section>
      <section id="platform-how" style={{ background: "var(--surface)", borderTop: "1px solid var(--line)", scrollMarginTop: 70 }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "88px 24px" }}>
          <Reveal>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: "var(--radius-pill)", background: "var(--accent-soft)", color: "var(--accent-text)", marginBottom: 16 }}>How it works</span>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>From a quiet review cycle to a portable record</h2>
            <p style={{ fontSize: 17, color: "var(--ink-2)", marginTop: 12, maxWidth: 560 }}>Four steps, every cycle. Open any step for the detail.</p>
          </Reveal>
          <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 28, marginTop: 40, alignItems: "start" }} className="mkt-split">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {MKT_STEPS.map((s, i) => {
                const on = openStep === i;
                const SIcon = s.Icon;
                return (
                  <button key={s.n} type="button" onClick={() => setOpenStep(i)} style={{ display: "flex", gap: 14, alignItems: "center", textAlign: "left", cursor: "pointer", width: "100%", padding: "16px 18px", borderRadius: "var(--radius-lg)", border: `1px solid ${on ? "var(--accent-line)" : "var(--line)"}`, background: on ? "var(--bg)" : "transparent", boxShadow: on ? "var(--shadow-sm)" : "none", transition: "all .3s var(--ease-out)" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--accent)", opacity: on ? 1 : 0.5, width: 30 }}>{s.n}</span>
                    <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: "var(--radius-md)", background: on ? "var(--accent)" : "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .3s var(--ease-out)" }}>
                      <SIcon size={19} style={{ color: on ? "var(--on-accent)" : "var(--accent)" }} />
                    </span>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>{s.t}</span>
                  </button>
                );
              })}
            </div>
            <MktCard key={openStep} style={{ padding: 30, minHeight: 300 }}>
              <div className="cairn-eyebrow">Step {step.n}</div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, color: "var(--ink)", margin: "6px 0 0", letterSpacing: "-0.01em" }}>{step.t}</h3>
              <p style={{ fontSize: 16, color: "var(--ink-2)", marginTop: 14, lineHeight: 1.65 }}>{step.long}</p>
              <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 11, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
                {step.points.map((pt) => (
                  <div key={pt} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
                    <Check size={17} style={{ color: "var(--accent)", marginTop: 1, flexShrink: 0 }} /> {pt}
                  </div>
                ))}
              </div>
            </MktCard>
          </div>
        </div>
      </section>
      <section style={{ maxWidth: MAX_W, margin: "0 auto", padding: "92px 24px", textAlign: "center" }}>
        <Reveal>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0, maxWidth: 680, marginInline: "auto", lineHeight: 1.12 }}>Two jobs, one source of truth.</h2>
          <p style={{ fontSize: 18, color: "var(--ink-2)", marginTop: 14, maxWidth: 520, marginInline: "auto" }}>The work you do to manage people becomes the proof they carry forward.</p>
          <div style={{ marginTop: 30, display: "flex", justifyContent: "center" }}>
            <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--on-accent)", fontSize: 15, fontWeight: 600, border: 0, cursor: "pointer" }}>Request access <ArrowRight size={18} /></button>
          </div>
        </Reveal>
      </section>
    </>
  );
}

/* ═══════════════════ Why Cairn page ═══════════════════ */
function MktWhyPage({ onEnter, goBack, navigate }: { onEnter: () => void; goBack: () => void; navigate: (to: MktRoute) => void }) {
  const audiences = [
    { Icon: UserCircle2, who: "For talent", t: "Proof you own and carry", pts: ["A passport at a correctable public URL", "Verified facts only — you control what's shown", "Portable across every employer on Credentia", "Revocable and disputable, always"] },
    { Icon: Users, who: "For people teams", t: "Management that compounds", pts: ["~10-minute review cycles people finish", "Consensus summaries, not blank-page reviews", "An audit trail on every attested fact", "Reference checks answered in one click"] },
  ];
  const benefits: [typeof Check, string, string][] = [
    [ScanSearch as typeof Check, "Hire from facts, not claims", "Tenure, titles, and skills confirmed by accountable people — never a self-written resume."],
    [Clock as typeof Check, "Cut weeks to minutes", "One-click employer attestation replaces weeks of back-and-forth reference outreach."],
    [GitBranch as typeof Check, "Separate fact from inference", "AI estimates stay labeled and internal. Only attested facts ever leave the org."],
    [Lock as typeof Check, "Correctable, not permanent", "Records are immutable against silent edits, yet always disputable with full history."],
  ];
  return (
    <>
      <PageHero eyebrow="Why Cairn" eyebrowIcon={<Compass size={14} />} title="Hiring starts from a document no one can verify." lede="Resumes are self-written and rarely checked. Credentia replaces the unverifiable resume with an attested record of real performance — built from the work people already do." goBack={goBack}>
        <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
          <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--on-accent)", fontSize: 16, fontWeight: 600, border: 0, cursor: "pointer" }}>Enter the platform <ArrowRight size={18} /></button>
          <button type="button" onClick={() => navigate("different")} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)", fontSize: 16, fontWeight: 600, border: "1px solid var(--line)", cursor: "pointer" }}>What makes us different</button>
        </div>
      </PageHero>
      <section id="why-shift" style={{ maxWidth: 980, margin: "0 auto", padding: "80px 24px", scrollMarginTop: 70 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 28, alignItems: "center" }} className="mkt-shift">
          <Reveal>
            <MktCard style={{ padding: 26, borderStyle: "dashed" }}>
              <div className="cairn-eyebrow" style={{ color: "var(--danger-fg)" }}>The old way</div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--ink)", margin: "8px 0 12px" }}>The unverifiable resume</h3>
              {["Self-written, rarely checked", "References take weeks", "Skills are claimed, not proven", "Nothing is correctable"].map((t) => (
                <div key={t} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 14.5, color: "var(--ink-2)", marginTop: 8 }}>
                  <X size={16} style={{ color: "var(--danger-fg)", marginTop: 2, flexShrink: 0 }} /> {t}
                </div>
              ))}
            </MktCard>
          </Reveal>
          <Reveal delay={120} style={{ display: "flex", justifyContent: "center" }}>
            <span style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-md)" }}>
              <ArrowRight size={22} style={{ color: "var(--on-accent)" }} />
            </span>
          </Reveal>
          <Reveal delay={200}>
            <MktCard style={{ padding: 26, borderColor: "var(--accent-line)", boxShadow: "var(--shadow-md)" }}>
              <div className="cairn-eyebrow" style={{ color: "var(--accent-text)" }}>The Credentia way</div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--ink)", margin: "8px 0 12px" }}>The verified record</h3>
              {["Attested by accountable people", "References in one click", "Skills validated and leveled", "Correctable, with an audit trail"].map((t) => (
                <div key={t} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 14.5, color: "var(--ink-2)", marginTop: 8 }}>
                  <Check size={16} style={{ color: "var(--accent)", marginTop: 2, flexShrink: 0 }} /> {t}
                </div>
              ))}
            </MktCard>
          </Reveal>
        </div>
      </section>
      <section id="why-mission" style={{ background: "var(--ink)", color: "var(--on-accent)", scrollMarginTop: 70 }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "84px 24px", textAlign: "center" }}>
          <Reveal>
            <div className="cairn-eyebrow" style={{ color: "var(--gold)", justifyContent: "center", display: "flex" }}>Our mission</div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 500, lineHeight: 1.32, letterSpacing: "-0.01em", marginTop: 18, color: "var(--on-accent)" }}>
              Make the truth about someone's work portable — so opportunity follows proven contribution, not the polish of a résumé.
            </p>
          </Reveal>
        </div>
      </section>
      <section id="why-value" style={{ maxWidth: MAX_W, margin: "0 auto", padding: "88px 24px", scrollMarginTop: 70 }}>
        <Reveal style={{ marginBottom: 40 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>Value on both sides of the table</h2>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }} className="mkt-split">
          {audiences.map((a, i) => {
            const AIcon = a.Icon;
            return (
              <Reveal key={a.who} delay={i * 110}>
                <MktCard style={{ padding: 30, height: "100%" }}>
                  <span style={{ width: 48, height: 48, borderRadius: "var(--radius-md)", background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <AIcon size={23} style={{ color: "var(--accent)" }} />
                  </span>
                  <div className="cairn-eyebrow" style={{ marginTop: 16 }}>{a.who}</div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: 23, fontWeight: 600, color: "var(--ink)", margin: "6px 0 16px" }}>{a.t}</h3>
                  {a.pts.map((p) => (
                    <div key={p} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5, marginBottom: 11 }}>
                      <Check size={17} style={{ color: "var(--accent)", marginTop: 1, flexShrink: 0 }} /> {p}
                    </div>
                  ))}
                </MktCard>
              </Reveal>
            );
          })}
        </div>
      </section>
      <section id="why-benefits" style={{ background: "var(--surface)", borderTop: "1px solid var(--line)", scrollMarginTop: 70 }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "88px 24px" }}>
          <Reveal style={{ marginBottom: 40, maxWidth: 560 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>What you get with Credentia</h2>
          </Reveal>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 18 }} className="mkt-split">
            {benefits.map(([BIcon, t, d], i) => (
              <Reveal key={t} delay={i * 80}>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: 22, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)" }}>
                  <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: "var(--radius-md)", background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <BIcon size={21} style={{ color: "var(--accent)" }} />
                  </span>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>{t}</div>
                    <p style={{ fontSize: 14.5, color: "var(--ink-2)", marginTop: 5, lineHeight: 1.55 }}>{d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section style={{ maxWidth: MAX_W, margin: "0 auto", padding: "92px 24px", textAlign: "center" }}>
        <Reveal>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 600, color: "var(--ink)", maxWidth: 680, margin: "0 auto", lineHeight: 1.12, letterSpacing: "-0.02em" }}>Proof should travel with the people who earned it.</h2>
          <div style={{ marginTop: 28, display: "flex", justifyContent: "center" }}>
            <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--on-accent)", fontSize: 15, fontWeight: 600, border: 0, cursor: "pointer" }}>Request access <ArrowRight size={18} /></button>
          </div>
        </Reveal>
      </section>
    </>
  );
}

/* ═══════════════════ What's Different page ═══════════════════ */
function MktDifferentPage({ onEnter, goBack, navigate }: { onEnter: () => void; goBack: () => void; navigate: (to: MktRoute) => void }) {
  const rows = [
    ["Source of truth", "Self-written resume", "Manager memory", "Attested, leveled facts"],
    ["Reference checks", "Weeks of outreach", "Skipped or informal", "One click, logged"],
    ["AI usage", "Hidden scoring", "None", "Labeled, internal, disputable"],
    ["Who owns the record", "The platform", "The employer", "The employee"],
    ["Correctable", "No", "No", "Always, with audit trail"],
  ];
  const pillars = [
    [GitBranch, "Fact and inference, separated by design", "Most tools blur AI scores into the record. We keep them as two labeled types — and only attested facts ever leave the org."],
    [Layers, "A five-level verification ladder", "Every claim climbs from self-reported (L1) to multi-source attested (L5). Public passports show L2 and above, never raw claims."],
    [Luggage, "The employee owns the passport", "Not the platform, not the employer. It's portable, revocable, and correctable — proof that follows the person."],
    [History, "Immutable but correctable", "Records can't be silently edited, yet they're always disputable with a complete, viewable history."],
  ] as const;
  return (
    <>
      <PageHero tone="warm" eyebrow="What makes us different" eyebrowIcon={<GitBranch size={14} />} title="Not another HR tool. A new source of truth." lede="Performance tools score people. Background checks verify the past. Credentia does something neither does — it turns everyday management into a portable, verified record, with fact and inference kept rigorously apart." goBack={goBack}>
        <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
          <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--on-accent)", fontSize: 16, fontWeight: 600, border: 0, cursor: "pointer" }}>Enter the platform <ArrowRight size={18} /></button>
          <button type="button" onClick={() => navigate("transparency")} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)", fontSize: 16, fontWeight: 600, border: "1px solid var(--line)", cursor: "pointer" }}>See the methodology</button>
        </div>
      </PageHero>
      <section id="different-pillars" style={{ maxWidth: MAX_W, margin: "0 auto", padding: "84px 24px", scrollMarginTop: 70 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }} className="mkt-split">
          {pillars.map(([PIcon, t, d], i) => (
            <Reveal key={t} delay={i * 90}>
              <MktCard style={{ padding: 30, height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ width: 48, height: 48, flexShrink: 0, borderRadius: "var(--radius-md)", background: "var(--coral-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <PIcon size={23} style={{ color: "var(--coral)" }} />
                  </span>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: "var(--ink)", margin: 0, lineHeight: 1.25 }}>{t}</h3>
                </div>
                <p style={{ fontSize: 15, color: "var(--ink-2)", marginTop: 14, lineHeight: 1.62 }}>{d}</p>
              </MktCard>
            </Reveal>
          ))}
        </div>
      </section>
      <section id="different-compare" style={{ background: "var(--surface)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", scrollMarginTop: 70 }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "84px 24px" }}>
          <Reveal style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>How Credentia compares</h2>
            <p style={{ fontSize: 17, color: "var(--ink-2)", marginTop: 12 }}>Side by side with the tools teams use today.</p>
          </Reveal>
          <Reveal>
            <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "var(--radius-xl)", background: "var(--bg)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                <thead>
                  <tr>
                    {["Capability", "Resume", "Annual review", "Credentia"].map((h, i) => (
                      <th key={h} style={{ textAlign: "left", padding: "18px 20px", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: i === 3 ? "var(--accent-text)" : "var(--ink-3)", background: i === 3 ? "var(--accent-soft)" : "transparent", borderBottom: "1px solid var(--line)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((cell, ci) => (
                        <td key={ci} style={{ padding: "16px 20px", fontSize: 14.5, lineHeight: 1.4, color: ci === 0 ? "var(--ink)" : ci === 3 ? "var(--ink)" : "var(--ink-3)", fontWeight: ci === 0 || ci === 3 ? 600 : 400, background: ci === 3 ? "var(--accent-soft)" : "transparent", borderBottom: ri < rows.length - 1 ? "1px solid var(--line)" : "none", verticalAlign: "top" }}>
                          {ci === 3 ? (<span style={{ display: "inline-flex", alignItems: "flex-start", gap: 8 }}><Check size={16} style={{ color: "var(--accent)", marginTop: 2, flexShrink: 0 }} /> {cell}</span>) : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>
      <section style={{ maxWidth: MAX_W, margin: "0 auto", padding: "92px 24px", textAlign: "center" }}>
        <Reveal>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 600, color: "var(--ink)", maxWidth: 640, margin: "0 auto", lineHeight: 1.12, letterSpacing: "-0.02em" }}>The difference is what we refuse to blur.</h2>
          <div style={{ marginTop: 28, display: "flex", justifyContent: "center" }}>
            <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--on-accent)", fontSize: 15, fontWeight: 600, border: 0, cursor: "pointer" }}>Request access <ArrowRight size={18} /></button>
          </div>
        </Reveal>
      </section>
    </>
  );
}

/* ═══════════════════ For Employers page ═══════════════════ */
function MktEmployersPage({ onEnter, goBack }: { onEnter: () => void; goBack: () => void }) {
  const points = [
    [BadgeCheck, "Hire from attested facts", "Tenure, titles, and skills confirmed by real people — not a self-written resume."],
    [Zap, "Reference checks in minutes", "One-click employer attestation replaces weeks of back-and-forth outreach."],
    [ScanSearch, "Shortlist on proof", "Filter a verified talent pool by validated skills and level — never inferred claims."],
  ] as const;
  const quotes = [
    { q: "We stopped guessing from resumes. Now we trust the record — our first interview starts from proof, not a PDF.", name: "Dana W.", role: "VP People Ops", co: "Meridian Manufacturing", initial: "D", accent: "var(--accent)" },
    { q: "Reference checks used to take three weeks of chasing. With one-click attestation we close them in an afternoon.", name: "Marcus T.", role: "Head of Talent", co: "Northwind Health", initial: "M", accent: "var(--coral)" },
    { q: "The labeled separation of facts and AI estimates is why our legal team signed off. Nothing inferred ever leaves the org.", name: "Priya N.", role: "Chief People Officer", co: "Atlas Financial", initial: "P", accent: "var(--gold)" },
  ];
  const cases = [
    ["72%", "faster time-to-shortlist", "Meridian Manufacturing"],
    ["3 wks → 1 day", "reference-check turnaround", "Northwind Health"],
    ["0", "inferred claims shown to candidates", "every Credentia employer"],
  ];
  return (
    <>
      <PageHero eyebrow="For employers" eyebrowIcon={<Building2 size={14} />} title="Recruit from a record, not a resume." lede="Credentia gives hiring teams a verified talent pool where every claim traces back to an accountable person — so your first interview starts from proof." goBack={goBack}>
        <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
          <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--on-accent)", fontSize: 16, fontWeight: 600, border: 0, cursor: "pointer" }}>Hire on Credentia <ArrowRight size={18} /></button>
          <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)", fontSize: 16, fontWeight: 600, border: "1px solid var(--line)", cursor: "pointer" }}>Talk to sales</button>
        </div>
      </PageHero>
      <section id="employers-proof" style={{ maxWidth: MAX_W, margin: "0 auto", padding: "84px 24px", scrollMarginTop: 70 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 52, alignItems: "center" }} className="mkt-split">
          <Reveal>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.12 }}>Your first interview starts from proof</h2>
            <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 16 }}>
              {points.map(([PIcon, t, d]) => (
                <div key={t} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: "var(--radius-md)", background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <PIcon size={19} style={{ color: "var(--accent)" }} />
                  </span>
                  <div>
                    <div style={{ fontSize: 16.5, fontWeight: 600, color: "var(--ink)" }}>{t}</div>
                    <div style={{ fontSize: 14.5, color: "var(--ink-2)", marginTop: 3, lineHeight: 1.5 }}>{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={130} y={34}>
            <div style={{ position: "relative", padding: 26, borderRadius: "var(--radius-2xl)", background: "linear-gradient(150deg, var(--surface-2), var(--accent-soft))", border: "1px solid var(--line)" }}>
              <RecruitMock />
            </div>
          </Reveal>
        </div>
      </section>
      <section id="employers-testimonials" style={{ background: "var(--surface)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", scrollMarginTop: 70 }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "88px 24px" }}>
          <Reveal style={{ maxWidth: 600, marginBottom: 44 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: "var(--radius-pill)", background: "var(--gold-soft)", color: "var(--gold)", marginBottom: 16 }}>
              <Quote size={14} /> Testimonials
            </span>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>Trusted by the teams who hire on proof</h2>
            <p style={{ fontSize: 17, color: "var(--ink-2)", marginTop: 12 }}>Success stories from employer partners already recruiting from a verified talent pool.</p>
          </Reveal>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }} className="mkt-stat-grid">
            {quotes.map((t, i) => (
              <Reveal key={t.name} delay={i * 100}>
                <MktCard style={{ padding: 28, height: "100%", display: "flex", flexDirection: "column" }}>
                  <Quote size={24} style={{ color: t.accent }} />
                  <p style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500, color: "var(--ink)", marginTop: 14, lineHeight: 1.5, flex: 1 }}>"{t.q}"</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
                    <span style={{ width: 42, height: 42, flexShrink: 0, borderRadius: "50%", background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600, color: t.accent }}>{t.initial}</span>
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>{t.name}</div>
                      <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{t.role} · {t.co}</div>
                    </div>
                  </div>
                </MktCard>
              </Reveal>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginTop: 24 }} className="mkt-stat-grid">
            {cases.map(([big, label, co], i) => (
              <Reveal key={i} delay={i * 90}>
                <div style={{ padding: 26, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius-xl)" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, color: "var(--accent)", letterSpacing: "-0.02em", lineHeight: 1.15 }}>{big}</div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", marginTop: 12 }}>{label}</div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-3)", marginTop: 6 }}>
                    <Building2 size={13} style={{ color: "var(--ink-3)" }} /> {co}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section style={{ maxWidth: MAX_W, margin: "0 auto", padding: "92px 24px", textAlign: "center" }}>
        <Reveal>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 600, color: "var(--ink)", maxWidth: 660, margin: "0 auto", lineHeight: 1.12, letterSpacing: "-0.02em" }}>Build your shortlist from a verified talent pool.</h2>
          <div style={{ marginTop: 28, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--on-accent)", fontSize: 15, fontWeight: 600, border: 0, cursor: "pointer" }}>Hire on Credentia <ArrowRight size={18} /></button>
            <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)", fontSize: 15, fontWeight: 600, border: "1px solid var(--line)", cursor: "pointer" }}>Talk to sales</button>
          </div>
        </Reveal>
      </section>
    </>
  );
}

/* ═══════════════════ Transparency page ═══════════════════ */
function MktTransparencyPage({ onEnter, goBack }: { onEnter: () => void; goBack: () => void }) {
  const points = [
    "Every AI output carries a \"How was this decided?\" explainer",
    "Likelihood scores route attention — they never confirm a past role",
    "Records are correctable and revocable, not silently permanent",
    "Nothing inferred is ever shown to an outside party",
  ];
  const levels: [string, string, string, string][] = [
    ["L1", "Self-reported", "Internal only", "var(--ink-3)"],
    ["L2", "Manager-verified", "Eligible for passport", "var(--accent)"],
    ["L3", "Peer-corroborated", "Strengthens the record", "var(--accent)"],
    ["L4", "Cross-checked", "Multiple sources agree", "var(--accent)"],
    ["L5", "Multi-source attested", "Highest confidence", "var(--accent)"],
  ];
  return (
    <>
      <PageHero eyebrow="Transparency" eyebrowIcon={<ShieldCheck size={14} />} title="How decisions are made." lede="We separate two things on purpose — verified facts and AI inferences — and we say so everywhere they appear." goBack={goBack} />
      <section id="transparency-types" style={{ maxWidth: 980, margin: "0 auto", padding: "72px 24px", scrollMarginTop: 70 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }} className="mkt-split">
          <Reveal>
            <MktCard style={{ padding: 28, height: "100%" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", padding: "4px 10px", borderRadius: "var(--radius-pill)", background: "var(--accent-soft)", color: "var(--accent-text)" }}>
                <BadgeCheck size={11} /> Verified fact
              </span>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 600, color: "var(--ink)", marginTop: 12 }}>Verified facts</h3>
              <p style={{ fontSize: 15, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.6 }}>Confirmed by a real attesting person. These can appear on a public passport. They stay correctable, with a full audit trail.</p>
            </MktCard>
          </Reveal>
          <Reveal delay={120}>
            <MktCard tone="inferred" style={{ padding: 28, height: "100%" }}>
              <InferredTag />
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 600, color: "var(--ink)", marginTop: 12 }}>AI inferences</h3>
              <p style={{ fontSize: 15, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.6 }}>Model estimates — outlooks, likelihood vectors, retention signals. Labeled as such, kept internal, never treated as proof, always disputable.</p>
            </MktCard>
          </Reveal>
        </div>
        <Reveal style={{ marginTop: 22 }}>
          {points.map((t) => (
            <div key={t} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 15.5, color: "var(--ink-2)", marginBottom: 12 }}>
              <Check size={18} style={{ color: "var(--accent)", marginTop: 2, flexShrink: 0 }} /> {t}
            </div>
          ))}
        </Reveal>
      </section>
      <section id="transparency-ladder" style={{ background: "var(--surface)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", scrollMarginTop: 70 }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "80px 24px" }}>
          <Reveal>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>The five-level verification ladder</h2>
            <p style={{ fontSize: 17, color: "var(--ink-2)", marginTop: 12, maxWidth: 560 }}>Every claim climbs from self-reported to multi-source attested. Only L2 and above can ever leave the org.</p>
          </Reveal>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 36 }}>
            {levels.map(([lv, t, note, c], i) => (
              <Reveal key={lv} delay={i * 70}>
                <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 20px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: c, width: 34 }}>{lv}</span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--ink)", flex: 1 }}>{t}</span>
                  <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>{note}</span>
                  <div style={{ width: `${(i + 1) * 18 + 10}%`, maxWidth: 160, height: 6, borderRadius: "var(--radius-pill)", background: c, opacity: 0.9 }} />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section style={{ maxWidth: MAX_W, margin: "0 auto", padding: "92px 24px", textAlign: "center" }}>
        <Reveal>
          <div style={{ width: 54, height: 54, borderRadius: "var(--radius-md)", background: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <ShieldCheck size={27} style={{ color: "var(--on-accent)" }} />
          </div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 600, color: "var(--ink)", margin: "18px auto 0", maxWidth: 620, lineHeight: 1.14, letterSpacing: "-0.02em" }}>Trust is the product. Everything else is built on it.</h2>
          <div style={{ marginTop: 28, display: "flex", justifyContent: "center" }}>
            <button type="button" onClick={onEnter} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--on-accent)", fontSize: 15, fontWeight: 600, border: 0, cursor: "pointer" }}>Request access <ArrowRight size={18} /></button>
          </div>
        </Reveal>
      </section>
    </>
  );
}

/* ═══════════════════ Video lightbox ═══════════════════ */
function VideoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(28,30,41,0.78)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "min(960px, 100%)" }}>
        <button type="button" onClick={onClose} aria-label="Close" style={{ position: "absolute", top: -42, right: 0, background: "none", border: 0, color: "var(--on-accent)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 14 }}>
          <X size={18} style={{ color: "var(--on-accent)" }} /> Close
        </button>
        <div style={{ width: "100%", borderRadius: "var(--radius-xl)", background: "var(--surface-inset)", boxShadow: "var(--shadow-xl)", aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: "var(--ink-3)" }}>
            <Play size={48} style={{ opacity: 0.4 }} />
            <p style={{ fontSize: 14, marginTop: 12 }}>Tour video coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PublicSite({ onEnter }: { onEnter: () => void }) {
  const [route, setRoute] = useState<MktRoute>(() => {
    if (typeof window === "undefined") return "home";
    return parseMktHash().route;
  });
  useEffect(() => {
    const onHash = () => {
      const { route: r, anchor } = parseMktHash();
      setRoute(r);
      window.scrollTo(0, 0);
      if (anchor) mktScrollWhenReady(anchor);
    };
    window.addEventListener("hashchange", onHash);
    const { anchor } = parseMktHash();
    if (anchor) mktScrollWhenReady(anchor);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((to: MktRoute, anchor?: string) => {
    const hash = anchor ? `#/${to}::${anchor}` : `#/${to}`;
    window.history.pushState(null, "", hash);
    setRoute(to);
    window.scrollTo(0, 0);
    if (anchor) mktScrollWhenReady(anchor);
  }, []);

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate("home");
    }
  }, [navigate]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <MktHeader route={route} navigate={navigate} onEnter={onEnter} />
      <main style={{ flex: 1 }}>
        {route === "home" && (
          <>
            <MktHero onEnter={onEnter} />
            <MktFeatureShowcase navigate={navigate} />
            <MktStatsBand />
            <MktPillars navigate={navigate} />
            <MktHomeCta onEnter={onEnter} />
          </>
        )}
        {route === "platform" && <MktPlatformPage onEnter={onEnter} goBack={goBack} />}
        {route === "why" && <MktWhyPage onEnter={onEnter} goBack={goBack} navigate={navigate} />}
        {route === "different" && <MktDifferentPage onEnter={onEnter} goBack={goBack} navigate={navigate} />}
        {route === "employers" && <MktEmployersPage onEnter={onEnter} goBack={goBack} />}
        {route === "transparency" && <MktTransparencyPage onEnter={onEnter} goBack={goBack} />}
      </main>
      <MktFooter navigate={navigate} onEnter={onEnter} />
    </div>
  );
}

/* ═══════════════════ AUTH SCREEN - sign-in only (no public signup) ═══════════════════ */

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
        <button type="button" onClick={onBack} className="text-[13px] opacity-60 mb-5 inline-flex items-center gap-1.5 hover:opacity-100">
          <ArrowLeft size={16} aria-hidden /> Back to site
        </button>
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
          {saved && <span className="text-[13px]" style={{ color: "var(--verified-fg)" }}>Saved</span>}
        </div>
      </form>
    </Card>
  );
}

function EmployeeView({ userId, showOutlook, accountStatus, trialEndsAt }: {
  userId: string; showOutlook: boolean; accountStatus?: AccountStatus; trialEndsAt?: string | null;
}) {
  const [external, setExternal] = useState(false);
  const [vault, setVault] = useState<AchievementRow[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [outlook, setOutlook] = useState<{ text: string; evidence: string } | null>(null);
  const [valueScore, setValueScore] = useState<ValueScoreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [ach, events, ol, vs] = await Promise.all([
        fetchAchievements(userId),
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
  const maxLevel = vault.reduce((m, a) => Math.max(m, a.verification_level), timeline.reduce((m, e) => Math.max(m, e.level), 0));

  if (loading) return <div className="opacity-60 text-sm">Loading career record…</div>;

  return (
    <div className="space-y-6">
      {accountStatus === "former_trial" && (
        <FormerTrialBanner accountStatus={accountStatus} trialEndsAt={trialEndsAt ?? null} />
      )}
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
        <Stat label="Highest level" value={maxLevel ? `L${maxLevel}` : "—"} sub={maxLevel >= 4 ? "company verified" : "on your record"} accent="var(--accent)" />
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

      {/* VP-7: amber "In review" candidates — in-app self-view ONLY. Gated by
          !external so the in-app public-passport preview (and, by construction,
          the public slug) stays candidate-blind. Sourced from a SEPARATE read
          (listCandidatesForSubject) — never merged into vault/timeline, so it
          can't touch maxLevel/verified counts above. Renders nothing if empty. */}
      {!external && <PassportInReviewSection subjectId={userId} />}

      {!external && (
        <FeedbackCycleCard userId={userId} field="employee_responses" title="This cycle — your responses"
          subtitle="Your responses are saved each cycle. Your manager adds their side separately." />
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

function ManagerView({ userId, orgSettings }: { userId: string; orgSettings?: OrgSettings | null }) {
  const aiCoaching = orgSettings?.ai_coaching_enabled ?? true;
  const promoEngine = orgSettings?.promotion_engine_enabled ?? true;
  const [verifyItems, setVerifyItems] = useState<VerifyQueueItem[]>([]);
  const [coaching, setCoaching] = useState<{ who: string; label: string; evidence: string }[]>([]);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof fetchReviewRows>>>([]);
  const [teamScores, setTeamScores] = useState<TeamValueScoreRow[]>([]);
  const [promoRows, setPromoRows] = useState<PromotionReadinessRow[]>([]);
  const [avatarMap, setAvatarMap] = useState<Record<string, string | null>>({});
  const [health, setHealth] = useState({ morale: null as number | null, workload: null as number | null, productivity: null as number | null, reportCount: 0 });
  const [loading, setLoading] = useState(true);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // presentation-only: coaching carousel index
  const [coachIdx, setCoachIdx] = useState(0);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const reports = await fetchDirectReports(userId);
      setAvatarMap(Object.fromEntries(reports.map((r) => [r.id, r.avatar_url ?? null])));
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
      {/* Shareable verified profile moved to Settings; Add achievements moved to Achievement Vault. */}
      {error && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}
      {aiNotice && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{aiNotice}</p>}

      {aiCoaching && (
      <RiseIn delay={40}>
      <Card className="p-6 cairn-lift" style={{ background: "var(--inferred-bg)" }}>
        <SectionHeader icon={Sparkles} title="Generate AI insights" tag={<InferredTag />}
          sub="Calls Anthropic server-side using verified team data, then saves to promotion_readiness, compensation_recommendations, and employee_value_scores. You decide every outcome." />
        <p className="text-[13px] opacity-80 mb-4">
          Requires service role and Anthropic API keys configured on the server.
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
      </RiseIn>
      )}

      <RiseIn delay={60}>
      <Card className="p-6 cairn-lift">
        <SectionHeader icon={Activity} title="Team Health Overview" sub={`${health.reportCount} direct reports — from pulse_surveys and employee_value_scores.`} />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Morale" value={health.morale != null ? <AnimatedNumber value={health.morale} decimals={2} /> : "—"} sub="pulse avg" accent="var(--accent)" />
          <Stat label="Productivity" value={health.productivity != null ? <AnimatedNumber value={health.productivity} decimals={2} /> : "—"} sub="value score index" accent="var(--verified-fg)" />
          <Stat label="Workload balance" value={health.workload != null ? <AnimatedNumber value={health.workload} decimals={2} /> : "—"} sub="pulse balance" />
          <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--inferred-bg)" }}>
            <div className="flex items-center gap-1 mb-1"><InferredTag /></div>
            <div className="text-[12px] uppercase tracking-widest opacity-60">Burnout risk</div>
            <div className="mt-1 text-2xl font-semibold serif" style={{ color: burnoutRisk === "Low" ? "var(--verified-fg)" : "var(--warn)" }}>{burnoutRisk}</div>
            <div className="text-[12px] mt-1 opacity-60">inferred from pulse</div>
          </div>
          <Stat label="Pending verifications" value={<AnimatedNumber value={verifyItems.length} />} sub="awaiting you" />
        </div>
      </Card>
      </RiseIn>

      {/* Employee Verification Center moved to the Verifications tab as an interactive card deck. */}

      <RiseIn delay={180}>
      <Card className="p-6 cairn-lift">
        <SectionHeader icon={ClipboardList} title="Performance Review Center" sub="Cycle reviews from feedback_cycles — you sign off; AI never completes a review." />
        {reviews.length === 0 ? (
          <p className="text-sm opacity-60">No direct reports found. Ask your admin to assign team members to you.</p>
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
                    <td className="py-3 pr-4"><ReportIdentity name={r.who} avatarUrl={avatarMap[r.profileId]} /></td>
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
      </RiseIn>

      <RiseIn delay={220}>
      <Card className="p-6 cairn-lift" style={{ background: "var(--surface-2)" }}>
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
                        <td className="py-3 pr-4"><ReportIdentity name={t.who} avatarUrl={avatarMap[t.profileId]} /></td>
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
      </RiseIn>

      {promoEngine && (
      <RiseIn delay={260}>
      <PromotionReadinessPanel rows={promoRows} title="Promotion Readiness — your team" avatarMap={avatarMap} />
      </RiseIn>
      )}

      {aiCoaching && (
      <RiseIn delay={300}>
      <Card className="p-6 cairn-pulse" style={{ background: "var(--inferred-bg)" }}>
        <SectionHeader icon={Sparkles} title="AI Coaching Insights" tag={<InferredTag />}
          sub="From promotion_readiness — evidence-based guidance only." />
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <InferredTag />
          <span className="text-[13px] font-medium opacity-80">AI never makes the final call on promotions, ratings, or terminations.</span>
        </div>
        {coaching.length === 0 ? (
          <p className="text-sm opacity-70">No coaching insights yet. Rows in promotion_readiness for your reports appear here.</p>
        ) : (() => {
          const safeIdx = Math.min(coachIdx, coaching.length - 1);
          const go = (n: number) => setCoachIdx((coaching.length + safeIdx + n) % coaching.length);
          return (
          <div>
            {/* swipeable carousel — one advisory insight at a time */}
            <div className="relative overflow-hidden rounded-xl">
              <div className="flex transition-transform duration-400 ease-out" style={{ transform: `translateX(-${safeIdx * 100}%)` }}>
                {coaching.map((c, i) => (
                  <div key={i} className="w-full shrink-0">
                    <div className="p-4 rounded-xl" style={{ background: "var(--surface)" }}>
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
                  </div>
                ))}
              </div>
            </div>
            {coaching.length > 1 && (
              <div className="flex items-center gap-3 mt-4">
                <button onClick={() => go(-1)} aria-label="Previous insight" className="p-1.5 rounded-lg border transition active:scale-[0.95]" style={{ borderColor: "var(--line)", color: "var(--ink-2)", background: "var(--surface)" }}>
                  <ChevronLeft size={16} />
                </button>
                <div className="flex gap-1.5">
                  {coaching.map((_, k) => (
                    <button key={k} onClick={() => setCoachIdx(k)} aria-label={`Insight ${k + 1}`} className="h-2 rounded-full transition-all duration-300" style={{ width: k === safeIdx ? 22 : 8, background: k === safeIdx ? "var(--inferred-fg)" : "var(--line-strong)" }} />
                  ))}
                </div>
                <button onClick={() => go(1)} aria-label="Next insight" className="p-1.5 rounded-lg border transition active:scale-[0.95]" style={{ borderColor: "var(--line)", color: "var(--ink-2)", background: "var(--surface)" }}>
                  <ChevronRight size={16} />
                </button>
                <span className="ml-auto text-[12px] opacity-60 tabular">{safeIdx + 1} / {coaching.length}</span>
              </div>
            )}
          </div>
          );
        })()}
      </Card>
      </RiseIn>
      )}
    </div>
  );
}


function AdminView({ userId }: { userId: string }) {
  return <AdminOrgControls userId={userId} />;
}

function AttestationOutreachPanel({ userId, requireProof = true }: { userId: string; requireProof?: boolean }) {
  const [step, setStep] = useState<"type" | "item" | "contact">("type");
  const [itemType, setItemType] = useState<"role" | "achievement" | null>(null);
  const [attestItems, setAttestItems] = useState<AttestItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<AttestItem | null>(null);
  const [email, setEmail] = useState("");
  const [evidence, setEvidence] = useState("");
  const [proofDoc, setProofDoc] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: reqs }, { data: profile }, { data: facts }, { data: achievements }] = await Promise.all([
        supabase.from("verification_requests").select("id, past_employer_email, status, created_at, item_type, item_label")
          .eq("profile_id", userId).order("created_at", { ascending: false }),
        supabase.from("profiles").select("title").eq("id", userId).single(),
        supabase.from("verified_facts").select("id, label, kind, verification_level").eq("profile_id", userId),
        supabase.from("achievements").select("id, description, kind, verification_level").eq("profile_id", userId),
      ]);
      if (cancelled) return;
      setRequests(reqs ?? []);
      const items: AttestItem[] = [];
      if (profile?.title) items.push({ id: "current-title", type: "role", label: profile.title });
      for (const f of facts ?? []) {
        if (f.kind === "employment" || f.kind === "title") {
          items.push({ id: f.id, type: "role", label: f.label, refId: f.id });
        }
      }
      for (const a of achievements ?? []) {
        items.push({ id: a.id, type: "achievement", label: a.description, refId: a.id });
      }
      setAttestItems(items);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  function resetFlow() {
    setStep("type");
    setItemType(null);
    setSelectedItem(null);
    setEmail("");
    setEvidence("");
    setProofDoc(null);
    setError(null);
  }

  async function sendAttestation() {
    if (!email.trim() || !selectedItem) return;
    const hasProof = Boolean(proofDoc || evidence.trim());
    if (requireProof && !hasProof) {
      setError("Your organization requires proof — attach a document or add a supporting link.");
      return;
    }
    setSending(true);
    setError(null);
    const payload = {
      profile_id: userId,
      past_employer_email: email.trim(),
      item_type: selectedItem.type,
      item_label: selectedItem.label,
      item_ref_id: selectedItem.refId ?? null,
      status: "pending",
    };
    const { data, error: insertError } = await supabase.from("verification_requests").insert(payload)
      .select("id, past_employer_email, status, created_at, item_type, item_label").single();
    setSending(false);
    if (insertError) setError(insertError.message);
    else if (data) {
      await writeAuditLog({
        actorId: userId,
        action: "verification_request",
        targetTable: "verification_requests",
        targetId: data.id,
        changes: { past_employer_email: email.trim(), item_type: selectedItem.type, item_label: selectedItem.label, evidence: (proofDoc ?? evidence.trim()) || null },
      });
      setRequests((prev) => [data, ...prev]);
      resetFlow();
    }
  }

  const filteredItems = itemType ? attestItems.filter((i) => i.type === itemType) : [];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1"><Send size={18} style={{ color: "var(--verified-fg)" }} /><h3 className="font-semibold">Route A — Active outreach</h3><VerifiedFactTag /></div>
        <p className="text-[13px] opacity-70 mb-4 max-w-2xl">
          Choose what to verify, then send a secure attestation link to a past employer contact. Only a confirmed human response creates a verified record.
        </p>

        {step === "type" && (
          <div className="space-y-3">
            <div className="text-[12px] uppercase tracking-widest opacity-60">Step 1 — What do you want verified?</div>
            <div className="grid sm:grid-cols-2 gap-3">
              {(["role", "achievement"] as const).map((t) => (
                <button key={t} type="button" onClick={() => { setItemType(t); setStep("item"); }}
                  className="text-left p-4 rounded-xl border transition hover:shadow-sm"
                  style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                  <div className="font-semibold capitalize">{t === "role" ? "A role / title" : "An achievement"}</div>
                  <p className="text-[13px] opacity-60 mt-1">{t === "role" ? "Past job title or employment record" : "A specific accomplishment from your vault"}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "item" && itemType && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[12px] uppercase tracking-widest opacity-60">Step 2 — Select the specific item</div>
              <button type="button" onClick={() => setStep("type")} className="text-[13px] opacity-60 hover:opacity-100">← Back</button>
            </div>
            {filteredItems.length === 0 ? (
              <p className="text-sm opacity-60">No {itemType === "role" ? "roles" : "achievements"} on your record yet. Add items to your career vault first.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredItems.map((item) => (
                  <button key={item.id} type="button" onClick={() => { setSelectedItem(item); setStep("contact"); }}
                    className="w-full text-left p-3 rounded-xl border text-[13px] hover:border-[var(--accent)] transition"
                    style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "contact" && selectedItem && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[12px] uppercase tracking-widest opacity-60">Step 3 — Past employer contact</div>
              <button type="button" onClick={() => setStep("item")} className="text-[13px] opacity-60 hover:opacity-100">← Back</button>
            </div>
            <div className="p-3 rounded-xl text-[13px]" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>
              Verifying: <strong>{selectedItem.label}</strong> ({selectedItem.type})
            </div>
            <div className="space-y-3">
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="past-manager@company.com"
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }} />
              <ProofDocumentUpload
                requireProof={requireProof}
                documentDataUrl={proofDoc}
                onDocumentChange={(url) => setProofDoc(url)}
              />
              <input value={evidence} onChange={(e) => setEvidence(e.target.value)}
                placeholder="Or paste a supporting link"
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }} />
              <button type="button" onClick={sendAttestation}
                disabled={sending || !email.trim() || (requireProof && !proofDoc && !evidence.trim())}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white inline-flex items-center gap-2 disabled:opacity-60"
                style={{ background: "var(--verified-fg)" }}>
                <Send size={15} /> {sending ? "Sending…" : "Send attestation"}
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-[13px]" style={{ color: "var(--warn)" }}>{error}</p>}
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-3">Past attestation requests</h3>
        {loading ? (
          <p className="text-sm opacity-60">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm opacity-60">No requests yet — start a new attestation above.</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="p-3 rounded-xl border text-[13px]" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.item_label ?? "—"}</div>
                    <div className="opacity-60 text-[12px] mt-0.5 capitalize">{r.item_type ?? "role"} · {r.past_employer_email}</div>
                  </div>
                  <span className="capitalize px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
                    style={{ background: r.status === "confirmed" ? "var(--verified-bg)" : "var(--warn-bg)", color: r.status === "confirmed" ? "var(--verified-fg)" : "var(--warn)" }}>
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function CompetencyMappingPanel() {
  return (
      <Card className="p-6" style={{ background: "var(--inferred-bg)" }}>
        <div className="flex items-center gap-2 mb-1"><Sparkles size={18} style={{ color: "var(--inferred-fg)" }} /><h3 className="font-semibold">Route B — Competency mapping</h3><InferredTag /></div>
        <p className="text-[13px] mb-3 max-w-2xl">When an employer can&apos;t be reached, the model produces an <strong>internal-only</strong> Likelihood Vector to help HR prioritize outreach. A hint, not a credential.</p>
        <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: "var(--surface)" }}>
          <div className="text-2xl font-semibold serif" style={{ color: "var(--inferred-fg)" }}>Lᵥ 0.74</div>
          <div className="text-[13px] opacity-70">&quot;Plausible — recommend outreach to confirm&quot;</div>
        </div>
        <TransparencyNote>A statistical estimate, never shown on the public passport or to outside parties as verification. Career-changers and fast upskillers may score lower despite truthful histories — which is exactly why it only routes attention rather than deciding anything.</TransparencyNote>
      </Card>
  );
}

function SettingsView({ userId, role, onOutlookChange, onThemeChange, accountStatus, onSignOut }: {
  userId: string;
  role: Role;
  onOutlookChange?: (show: boolean) => void;
  onThemeChange?: (accent: string) => void;
  accountStatus?: AccountStatus;
  onSignOut?: () => void;
}) {
  const [t, setT] = useState<SettingsState>({ outlook: true, kudos: true, externalPassport: false, aiSummaries: true });
  const [profileRole, setProfileRole] = useState<Role>("employee");
  const [hireDate, setHireDate] = useState<string | null>(null);
  const [themeColor, setThemeColor] = useState(CAIRN_DEFAULT_ACCENT);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<SettingKey | null>(null);
  const showPhoto = role !== "admin" && role !== "superadmin";
  const isFormer = accountStatus?.startsWith("former_") ?? false;
  const isActiveEmployee = !isFormer && role !== "admin" && role !== "superadmin";
  const isManager = role === "manager";

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
      const [{ data: settings }, { data: profile }] = await Promise.all([
        supabase.from("user_settings").select("*").eq("profile_id", userId).single(),
        supabase.from("profiles").select("role, hire_date, theme_color, avatar_url").eq("id", userId).single(),
      ]);
      if (cancelled) return;
      if (settings) {
        setT({
          outlook: settings.show_outlook ?? true,
          kudos: settings.kudos_notifications ?? true,
          externalPassport: settings.passport_published ?? false,
          aiSummaries: settings.ai_summaries ?? true,
        });
      }
      if (profile) {
        setProfileRole(profile.role as Role);
        setHireDate(profile.hire_date ?? null);
        setThemeColor(profile.theme_color ?? CAIRN_DEFAULT_ACCENT);
        setAvatarUrl(profile.avatar_url ?? null);
        if (profile.theme_color) onThemeChange?.(profile.theme_color);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, onThemeChange]);

  async function toggleSetting(key: SettingKey, dbKey: string) {
    const next = !t[key];
    setT({ ...t, [key]: next });
    setSavingKey(key);
    const { error } = await supabase.from("user_settings").update({ [dbKey]: next }).eq("profile_id", userId);
    if (!error && dbKey === "passport_published") {
      try { await setPassportPublished(userId, next); } catch { setT({ ...t, [key]: !next }); }
    }
    if (!error && dbKey === "show_outlook") onOutlookChange?.(next);
    setSavingKey(null);
    if (error) setT({ ...t, [key]: !next });
  }

  async function saveThemeColor(color: string) {
    setThemeColor(color);
    onThemeChange?.(color);
    await supabase.from("profiles").update({ theme_color: color }).eq("id", userId);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setAvatarUrl(dataUrl);
      const { error } = await supabase.from("profiles").update({ avatar_url: dataUrl }).eq("id", userId);
              setPhotoNotice(error ? error.message : "Photo updated.");
      setTimeout(() => setPhotoNotice(null), 4000);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4"><UserCircle2 size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Account</h3></div>
        {loading ? (
          <p className="text-sm opacity-60">Loading…</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-[12px] uppercase tracking-widest opacity-60 mb-1">Role</div>
              <div className="text-[15px] font-medium px-3 py-2 rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                {ROLE_LABELS[profileRole] ?? profileRole}
              </div>
              <p className="text-[12px] opacity-50 mt-1">Set by your organization — not editable here.</p>
            </div>
            <div>
              <div className="text-[12px] uppercase tracking-widest opacity-60 mb-1">Hire date</div>
              <div className="text-[15px] font-medium px-3 py-2 rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                {hireDate ? new Date(hireDate + "T12:00:00").toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—"}
              </div>
              <p className="text-[12px] opacity-50 mt-1">From HR / IdP — read-only.</p>
            </div>
          </div>
        )}
      </Card>

      {showPhoto && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4"><Camera size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Profile photo</h3></div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <ProfileAvatar name="You" url={avatarUrl} size={72} />
            <div>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white cursor-pointer"
                style={{ background: "var(--accent)" }}>
                <Camera size={16} /> Change photo
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </label>
              <p className="text-[12px] opacity-60 mt-2 max-w-sm">Preview upload until secure file storage is enabled.</p>
              {photoNotice && <p className="text-[12px] mt-1" style={{ color: "var(--verified-fg)" }}>{photoNotice}</p>}
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4"><Palette size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Your theme</h3></div>
        <p className="text-[13px] opacity-60 mb-2">Personal accent color — applies to buttons and highlights in your app experience.</p>
        <p className="text-[13px] opacity-60 mb-3 p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
          <strong>Light or dark appearance</strong> follows your device setting automatically (via <code className="text-[12px]">prefers-color-scheme</code>).
          Change it in your OS: Windows Settings → Personalization → Colors, or macOS System Settings → Appearance.
        </p>
        <div className="flex gap-2 flex-wrap">
          {THEME_SWATCHES.map((c) => (
            <button key={c} type="button" onClick={() => saveThemeColor(c)}
              className="w-9 h-9 rounded-full border-2 transition"
              style={{ background: c, borderColor: themeColor === c ? "var(--ink)" : "transparent" }} aria-label={`Theme ${c}`} />
          ))}
        </div>
      </Card>

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

      {isManager && <ManagerTeamChangePanel userId={userId} />}

      {isActiveEmployee && <RemovalRequestPanel userId={userId} />}

      {isFormer && <FormerEmployeeDeletePanel userId={userId} onDeleted={onSignOut} />}

      <Card className="p-6" style={{ background: "var(--surface-2)" }}>
        <div className="flex items-center gap-2 mb-2"><Lock size={16} style={{ color: "var(--verified-fg)" }} /><h3 className="font-semibold text-[15px]">Your data rights</h3></div>
        <p className="text-[13px] opacity-70 mb-3">Records are correctable and revocable. Dispute an AI inference or request a correction from your dashboard or admin.</p>
      </Card>
    </div>
  );
}

/** Shown on the workspace tabs when the signed-in profile has no org_id yet. */
function NoOrgNotice() {
  return (
    <Card className="p-8 text-center">
      <Building2 size={28} className="mx-auto mb-2" style={{ color: "var(--ink-3)" }} />
      <h3 className="font-semibold">No organization assigned</h3>
      <p className="text-[13px] opacity-65 mt-1 max-w-md mx-auto">
        These workspace features are scoped to your company. Ask an admin to set your org membership, then refresh.
      </p>
    </Card>
  );
}

/* ═══════════════════ AUTHENTICATED APP SHELL ═══════════════════ */
function AppShell({ role, theme, setTheme, onSignOut }: { role: Role; theme: Theme; setTheme: (theme: Theme) => void; onSignOut: () => void }) {
  const [tab, setTab] = useState("dashboard");
  const [sidebar, setSidebar] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const [showOutlook, setShowOutlook] = useState(true);
  const [publicSlug, setPublicSlug] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("active_sso");
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getUserId();
        if (cancelled) return;
        setUserId(id);
        await ensureUserSettings(id);
        const [{ data: profile }, { data: settings }, org] = await Promise.all([
          supabase.from("profiles").select("public_slug, account_status, trial_ends_at, theme_color, org_id, full_name").eq("id", id).single(),
          supabase.from("user_settings").select("show_outlook").eq("profile_id", id).single(),
          fetchOrgSettingsForUser(id).catch(() => null),
        ]);
        if (!cancelled) {
          setPublicSlug(profile?.public_slug ?? null);
          setOrgId(profile?.org_id ?? null);
          setUserName(profile?.full_name ?? null);
          setShowOutlook(settings?.show_outlook ?? true);
          if (profile?.account_status) setAccountStatus(profile.account_status as AccountStatus);
          setTrialEndsAt(profile?.trial_ends_at ?? null);
          if (profile?.theme_color) setTheme({ accent: profile.theme_color, mode: theme.mode });
          if (org) {
            setOrgSettings(org);
            setOrgLogoUrl(org.logo_url);
          }
        }
      } catch {
        /* session may have expired */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isFormer = accountStatus.startsWith("former_");
  const roleLabel = ROLE_LABELS[role];
  // Workforce roles get the task/knowledge/messaging/twin layer; individuals
  // (employee/manager) get a work board, leaders (executive/hr) get oversight.
  const isIndividualContributor = role === "employee" || role === "manager";
  const isLeader = role === "executive" || role === "hr";
  const isWorkforce = isIndividualContributor || isLeader;
  // "In Review" (candidate queue + Overseer oversight) — managers and leaders
  // review/pause; admins also reach it (they hold Overseer Enable authority).
  const canReviewQueue = role === "manager" || isLeader || role === "admin";
  const nav = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    ...(role !== "admin" && role !== "superadmin" && role !== "executive" && role !== "hr" ? [{ id: "vault", label: "Verifications", icon: Award }] : []),
    ...(isIndividualContributor ? [{ id: "work", label: role === "manager" ? "Team Work" : "My Work", icon: KanbanSquare }] : []),
    ...(isLeader ? [{ id: "oversight", label: "Work Oversight", icon: Layers }] : []),
    ...(isWorkforce ? [{ id: "knowledge", label: "Knowledge", icon: BookOpen }] : []),
    // VP-1: read-only "in review" candidate queue for reviewers (manager + leaders).
    ...(canReviewQueue ? [{ id: "review-queue", label: "In Review", icon: Inbox }] : []),
    ...(isFormer ? [{ id: "plan", label: "Plan & billing", icon: CreditCard }] : []),
    ...(role === "executive" || role === "hr" ? [{ id: "verification-oversight", label: "Verification Oversight", icon: ShieldCheck }] : []),
    ...(role === "admin" ? [{ id: "people-org", label: "People & Org", icon: Users }] : []),
    ...(role === "superadmin" ? [{ id: "platform", label: "Platform Console", icon: Building2 }] : []),
    ...(role === "admin" ? [{ id: "admin", label: "Org Controls", icon: SlidersHorizontal }] : []),
  ];
  const requireProof = orgSettings?.require_proof ?? true;

  // First-paint placeholder while the session/profile resolves (userId === null).
  // Skeleton shell, never a blank screen or spinner (presentation-only).
  const dashboardSkeleton = (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-3">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-[var(--radius-md)] border p-5 space-y-3" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  );

  const dashboard = userId ? {
    employee: <EmployeeView userId={userId} showOutlook={showOutlook} accountStatus={accountStatus} trialEndsAt={trialEndsAt} />,
    manager: <ManagerView userId={userId} orgSettings={orgSettings} />,
    executive: <ExecutiveDashboard />,
    admin: <AdminView userId={userId} />,
    hr: <ExecutiveDashboard />,
    superadmin: (
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-1">Platform operator</h3>
        <p className="text-[14px] opacity-70 leading-relaxed">
          Use <strong>Platform Console</strong> in the sidebar to provision tenants, integrate workforce data, and review import batches.
          All actions are administrative — not AI inference.
        </p>
      </Card>
    ),
  }[role] : dashboardSkeleton;

  const passportLabel = publicSlug ? `/p/verify/${publicSlug.slice(0, 4)}…` : "/p/verify/… (not published yet)";

  const isCommandCenter = (role === "executive" || role === "hr") && tab === "dashboard";

  const goToTab = (id: string) => { setTab(id); setSidebar(false); };

  const NavButton = ({ n, horizontal = false }: { n: (typeof nav)[0]; horizontal?: boolean }) => {
    const Icon = n.icon;
    const active = tab === n.id;
    return (
      <button
        type="button"
        onClick={() => goToTab(n.id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "inline-flex items-center font-medium transition-colors duration-150",
          horizontal
            ? "px-3 py-2 rounded-lg text-[13px] gap-1.5 whitespace-nowrap shrink-0"
            : "w-full text-left px-3 py-2.5 rounded-xl text-sm gap-2 border-l-2",
          // resting hover for inactive items (token-driven, both layouts)
          !active && "cairn-nav-item",
          // vertical drawer keeps a 2px left rail; transparent when inactive
          !horizontal && !active && "border-transparent",
        )}
        style={
          horizontal
            ? {
                // horizontal top-nav: soft-fill active idiom (AA-legible;
                // matches the drawer so "active" reads the same everywhere).
                background: active ? "var(--accent-soft)" : "transparent",
                color: active ? "var(--accent-text)" : "var(--ink-2)",
              }
            : {
                // vertical drawer: left-accent bar + soft fill active idiom
                background: active ? "var(--accent-soft)" : "transparent",
                color: active ? "var(--accent-text)" : "var(--ink-2)",
                ...(active ? { borderColor: "var(--accent)" } : {}),
              }
        }
      >
        <Icon size={horizontal ? 15 : 16} /> {n.label}
      </button>
    );
  };

  const NavList = ({ horizontal = false }: { horizontal?: boolean }) => (
    <>
      {nav.map((n) => <NavButton key={n.id} n={n} horizontal={horizontal} />)}
      {!horizontal && (
        <div className="mt-4 p-3 rounded-xl text-[12px] leading-relaxed" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
          <div className="flex items-center gap-1.5 font-semibold mb-1" style={{ color: "var(--ink)" }}><Globe size={13} /> Public passport</div>
          {passportLabel} — attested facts only.
        </div>
      )}
    </>
  );

  return (
    <div style={{ background: "var(--bg)", color: "var(--ink)" }} className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b backdrop-blur" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--bg) 92%, transparent)" }}>
        <div className={`${isCommandCenter ? "w-full" : "max-w-7xl"} mx-auto px-6`}>
          <div className="h-14 sm:h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <MobileNavToggle open={sidebar} onToggle={() => setSidebar(!sidebar)} />
              {orgLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={orgLogoUrl} alt="Company logo" className="h-7 sm:h-8 w-auto max-w-[100px] object-contain shrink-0" />
              ) : (
                <img src="/cairn-logo-mark.svg" alt="" className="h-8 w-8 shrink-0" />
              )}
              <span className="serif text-lg sm:text-xl font-semibold truncate hidden sm:inline">Credentia</span>
            </div>
            <nav className="hidden lg:flex items-center gap-0.5 flex-1 justify-center overflow-x-auto px-2 min-w-0">
              <NavList horizontal />
            </nav>
            <div className="relative shrink-0">
              <button onClick={() => setUserMenu((v) => !v)}
                className="inline-flex items-center gap-2 px-2 py-1.5 rounded-lg transition"
                style={{ background: userMenu ? "var(--surface-2)" : "transparent", color: "var(--ink-2)" }}>
                <UserCircle2 size={20} />
                <span className="text-[13px] font-medium hidden sm:inline max-w-[140px] truncate">{userName ?? roleLabel}</span>
                <ChevronDown size={14} style={{ transform: userMenu ? "rotate(180deg)" : "none", transition: "transform var(--duration-base)" }} />
              </button>
              {userMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setUserMenu(false)} />
                  <div className="absolute right-0 mt-1 w-52 rounded-xl border shadow-xl z-40 overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
                    <div className="px-3 py-2.5 border-b" style={{ borderColor: "var(--line)" }}>
                      <p className="text-[13px] font-semibold truncate mb-1.5" style={{ color: "var(--ink)" }}>{userName ?? "Account"}</p>
                      {/* Role is identity — neutral badge, never a trust (verified/AI) signal. */}
                      <Badge tone="neutral">{roleLabel}</Badge>
                    </div>
                    <div className="p-1">
                      <Button variant="ghost" size="sm" fullWidth className="justify-start"
                        leadingIcon={<SettingsIcon size={15} />}
                        onClick={() => { setUserMenu(false); goToTab("settings"); }}>
                        Settings
                      </Button>
                      <Button variant="ghost" size="sm" fullWidth className="justify-start"
                        leadingIcon={<LogOut size={15} />}
                        onClick={() => { setUserMenu(false); onSignOut(); }}>
                        Sign out
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {sidebar && (
        <div className="lg:hidden fixed inset-0 z-20" onClick={() => setSidebar(false)}>
          <div className="absolute top-14 sm:top-16 left-0 bottom-0 w-72 p-4 space-y-1 border-r shadow-xl" style={{ background: "var(--surface)", borderColor: "var(--line)" }} onClick={(e) => e.stopPropagation()}>
            <NavList />
          </div>
        </div>
      )}

      <div className={`flex-1 flex flex-col min-h-0 ${isCommandCenter ? "w-full" : "max-w-7xl mx-auto px-6 py-8 w-full"}`}>
        {/* Key on `tab` so each tab switch re-triggers the entrance (reduced-motion gated in CSS). */}
        <main key={tab} className={cn("min-w-0 flex-1 flex flex-col cairn-reveal", isCommandCenter && "min-h-0")}>
          {tab !== "dashboard" && !isCommandCenter && (
            <PageHeader
              className="mb-6"
              title={nav.find((n) => n.id === tab)?.label ?? (tab === "settings" ? "Settings" : "")}
              actions={
                <Button variant="ghost" size="sm" leadingIcon={<ArrowLeft size={15} />} onClick={() => setTab("dashboard")}>
                  Back to Dashboard
                </Button>
              }
            />
          )}
          {tab === "dashboard" && (
            <>
              {!isCommandCenter && (
                <>
                  <Card className="p-6 mb-6" style={{ background: "linear-gradient(135deg, var(--surface), var(--inferred-bg))" }}>
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-xl" style={{ background: "var(--accent)" }}><ShieldCheck size={20} color="#fff" /></div>
                      <div>
                        <h2 className="font-semibold text-lg">How decisions are made here</h2>
                        <p className="text-[14px] opacity-75 leading-relaxed mt-1 max-w-3xl">Verified facts are confirmed by a real person and can appear on your public passport. AI inferences — outlooks, likelihood scores — are labeled estimates, kept internal, never proof. Every AI output has a &quot;How was this decided?&quot; explainer you can open.</p>
                      </div>
                    </div>
                  </Card>
                  {userId && <DashboardWelcome userId={userId} role={role} />}
                </>
              )}
              {dashboard}
            </>
          )}
          {tab === "vault" && userId && role !== "admin" && role !== "superadmin" && role !== "executive" && role !== "hr" && (
            <div className="space-y-6">
              {role === "manager" && <RiseIn delay={0}><VerificationDeck userId={userId} /></RiseIn>}
              {role === "manager" ? (
                <RiseIn delay={60}><ManagerAchievementPanel userId={userId} /></RiseIn>
              ) : (
                <RiseIn delay={0}><AchievementVaultView userId={userId} requireProof={requireProof} /></RiseIn>
              )}
              <RiseIn delay={120}><AttestationOutreachPanel userId={userId} requireProof={requireProof} /></RiseIn>
              <RiseIn delay={180}><CompetencyMappingPanel /></RiseIn>
            </div>
          )}
          {/* ── Task / Knowledge / Messaging / Digital-Twin layer ── */}
          {tab === "work" && isIndividualContributor && userId && (
            orgId
              ? <FlowErrorBoundary label="Your work board"><FlowBoard userId={userId} orgId={orgId} variant={role === "manager" ? "team" : "personal"} /></FlowErrorBoundary>
              : <NoOrgNotice />
          )}
          {tab === "oversight" && isLeader && (
            orgId && userId
              ? <FlowErrorBoundary label="Work oversight"><FlowOversight userId={userId} orgId={orgId} role={role} /></FlowErrorBoundary>
              : <NoOrgNotice />
          )}
          {tab === "knowledge" && isWorkforce && userId && (
            orgId ? <DocRepository userId={userId} orgId={orgId} role={role} /> : <NoOrgNotice />
          )}
          {tab === "verification-oversight" && (role === "executive" || role === "hr") && <ExecutiveVerificationSection />}
          {/* VP-1 — read-only amber review queue (manager + leaders). RLS scopes rows. */}
          {tab === "review-queue" && canReviewQueue && userId && (
            <div className="space-y-6">
              <VerificationCandidatesPanel userId={userId} scope={{ mode: "reviewer" }} />
              {/* VP-6: Overseer automation oversight. Read for manager+/leader;
                  Enable/Pause gated to exec/admin inside the panel + server-side. */}
              <OverseerOversightPanel role={role} />
            </div>
          )}
          {tab === "people-org" && role === "admin" && userId && <PeopleOrgConsole userId={userId} />}
          {tab === "platform" && role === "superadmin" && <PlatformConsole />}
          {tab === "plan" && userId && isFormer && (
            <BillingPlanView
              userId={userId}
              accountStatus={accountStatus}
              trialEndsAt={trialEndsAt}
              onStatusChange={setAccountStatus}
            />
          )}
          {tab === "admin" && userId && <AdminView userId={userId} />}
          {tab === "settings" && userId && (
            <div className="space-y-6">
              {role === "manager" && <RiseIn delay={0}><ShareableLinkCard userId={userId} /></RiseIn>}
              {/* Cred-Bot setup lives in Settings; the bubble is for day-to-day use. */}
              {isWorkforce && orgId && (
                <RiseIn delay={0}>
                  <AgentConfiguration userId={userId} orgId={orgId} userName={userName ?? undefined} />
                </RiseIn>
              )}
              <SettingsView
                userId={userId}
                role={role}
                accountStatus={accountStatus}
                onOutlookChange={setShowOutlook}
                onThemeChange={(accent) => setTheme({ ...theme, accent })}
                onSignOut={onSignOut}
              />
            </div>
          )}
        </main>
      </div>

      {/* Floating Messages / Cred-Bot bubble — workforce roles only */}
      {isWorkforce && userId && orgId && (
        <FloatingAssistant
          userId={userId}
          orgId={orgId}
          userName={userName ?? undefined}
          onConfigureBot={() => goToTab("settings")}
        />
      )}
    </div>
  );
}

/* ═══════════════════ ROOT ROUTER ═══════════════════ */
export default function CredentiaSite() {
  const [screen, setScreen] = useState<"public" | "auth" | "app">("public");
  const [role, setRole] = useState<Role>("employee");
  const [authReady, setAuthReady] = useState(false);
  const colorScheme = usePrefersColorScheme();
  const [accent, setAccent] = useState(CAIRN_DEFAULT_ACCENT);
  const theme = useMemo(() => ({ accent, mode: colorScheme }), [accent, colorScheme]);
  const setTheme = useCallback((t: Theme) => {
    if (t.accent) setAccent(t.accent);
  }, []);
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
      <div data-theme={theme.mode} style={{ ...vars, background: "var(--bg)", color: "var(--ink)", minHeight: "100vh" }}>
        <div className="min-h-screen flex items-center justify-center opacity-60 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div data-theme={theme.mode} style={{ ...vars, background: "var(--bg)", color: "var(--ink)", minHeight: "100vh" }}>
      {screen === "public" && <PublicSite onEnter={() => setScreen("auth")} />}
      {screen === "auth" && <AuthScreen onBack={() => setScreen("public")} onLogin={enterApp} />}
      {screen === "app" && (
        <ToastProvider>
          <AppShell role={role} theme={theme} setTheme={setTheme} onSignOut={handleSignOut} />
        </ToastProvider>
      )}
    </div>
  );
}
