"use client";

import React, {
  useState, useMemo, useEffect, useCallback,
  type CSSProperties, type ReactNode, type FormEvent,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  ShieldCheck, Sparkles, LayoutDashboard, Users, Award, Settings as SettingsIcon,
  AlertTriangle, BadgeCheck, Eye, EyeOff, ChevronRight, Info, Building2, UserCircle2,
  LineChart, Lock, Zap, Send, FileBadge, ToggleLeft, ToggleRight, Palette,
  SlidersHorizontal, Globe, Menu, X, ArrowRight, Check, GitBranch, Workflow, ScanSearch
} from "lucide-react";

/* ════════════════════════════════════════════════════════════════
   CREDENTIA — full responsive site
   Public marketing site  +  authenticated multi-tier app
   Verified facts vs AI inferences kept as separate, labeled types.
   ════════════════════════════════════════════════════════════════ */

type Theme = { accent: string; mode: "light" | "dark" };
type Role = "employee" | "manager" | "executive" | "admin";
type AuthMode = "signin" | "signup";
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
const VerifiedTag = () => (
  <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full"
    style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>
    <BadgeCheck size={12} /> VERIFIED FACT
  </span>
);
const InferredTag = () => (
  <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full"
    style={{ background: "var(--inferred-bg)", color: "var(--inferred-fg)" }}>
    <Sparkles size={12} /> AI INFERENCE
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

/* ═══════════════════ PUBLIC MARKETING SITE ═══════════════════ */
function PublicSite({ onEnter, theme, setTheme }: { onEnter: () => void; theme: Theme; setTheme: (theme: Theme) => void }) {
  const [menu, setMenu] = useState(false);
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
            {["how", "features", "trust"].map((h) => (
              <a key={h} href={`#${h}`} onClick={() => setMenu(false)} className="block text-[15px] capitalize">{h === "how" ? "How it works" : h === "features" ? "Platform" : "Transparency"}</a>
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
          </div>
        </div>

        {/* floating passport preview */}
        <div className="mt-16 grid md:grid-cols-3 gap-4 rise" style={{ animationDelay: ".15s" }}>
          <Card className="p-5 md:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[13px] opacity-60"><Globe size={14} /> /p/verify/8f3a…c2</div>
              <VerifiedTag />
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
              <VerifiedTag />
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

/* ═══════════════════ AUTH SCREEN ═══════════════════ */
const AUTH_ROLES = [
  { id: "employee", label: "Employee", icon: UserCircle2 },
  { id: "manager", label: "Manager", icon: Users },
  { id: "executive", label: "Executive", icon: Building2 },
  { id: "admin", label: "System Admin", icon: SettingsIcon },
];

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

async function saveProfileRole(userId: string, role: Role) {
  const { error } = await supabase.from("profiles").upsert({ id: userId, role });
  if (error) throw error;
  await ensureUserSettings(userId);
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

function AuthScreen({ onLogin, onBack }: { onLogin: (role: Role) => void; onBack: () => void }) {
  const [role, setRole] = useState<Role>("employee");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
        if (!data.user) throw new Error("Sign up did not return a user.");

        if (!data.session) {
          setMessage("Check your email to confirm your account, then sign in.");
          setMode("signin");
          return;
        }

        await saveProfileRole(data.user.id, role);
        onLogin(role);
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;

        let storedRole: Role;
        try {
          storedRole = await fetchProfileRole(data.user.id);
        } catch {
          await saveProfileRole(data.user.id, role);
          storedRole = role;
        }
        onLogin(storedRole);
      }
    } catch (err: unknown) {
      setError(errorMessage(err, "Something went wrong. Try again."));
    } finally {
      setLoading(false);
    }
  }

  const roleLabel = AUTH_ROLES.find((r) => r.id === role)?.label ?? "User";

  return (
    <div className="min-h-screen flex items-center justify-center px-5" style={{ background: "var(--bg)" }}>
      <Card className="w-full max-w-md p-7">
        <button type="button" onClick={onBack} className="text-[13px] opacity-60 mb-5 inline-flex items-center gap-1">‹ Back to site</button>
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 rounded-lg" style={{ background: "var(--accent)" }}><ShieldCheck size={18} color="#fff" /></div>
          <span className="serif text-xl font-semibold">Credentia</span>
        </div>
        <h1 className="serif text-2xl font-semibold mt-4">{mode === "signup" ? "Create account" : "Sign in"}</h1>
        <p className="text-[13px] opacity-60 mb-5">
          {mode === "signup"
            ? "Pick your role — we save it on your profile in Supabase."
            : "Sign in with the email and password you used at sign-up."}
        </p>

        {mode === "signup" && (
          <div className="grid grid-cols-2 gap-2 mb-5">
            {AUTH_ROLES.map((r) => {
              const Icon = r.icon; const active = role === r.id;
              return (
                <button key={r.id} type="button" onClick={() => setRole(r.id as Role)}
                  className="p-3 rounded-xl border text-left transition"
                  style={{ borderColor: active ? "var(--accent)" : "var(--line)", background: active ? "var(--accent-soft)" : "var(--surface-2)" }}>
                  <Icon size={18} style={{ color: active ? "var(--accent)" : "var(--ink-2)" }} />
                  <div className="text-[13px] font-medium mt-1.5">{r.label}</div>
                </button>
              );
            })}
          </div>
        )}

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
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password (6+ characters)"
            className="w-full px-3 py-2.5 rounded-xl border text-sm mb-3 outline-none"
            style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }}
          />

          {error && (
            <p className="text-[13px] mb-3 px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>
          )}
          {message && (
            <p className="text-[13px] mb-3 px-3 py-2 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{message}</p>
          )}

          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl font-medium text-white disabled:opacity-60"
            style={{ background: "var(--accent)" }}>
            {loading ? "Please wait…" : mode === "signup" ? `Sign up as ${roleLabel}` : "Sign in"}
          </button>
        </form>

        <p className="text-[13px] text-center mt-4 opacity-70">
          {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
          <button
            type="button"
            className="font-medium underline"
            style={{ color: "var(--accent)" }}
            onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); setMessage(null); }}
          >
            {mode === "signup" ? "Sign in" : "Create account"}
          </button>
        </p>
      </Card>
    </div>
  );
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
    const { error } = await supabase.from("profiles").update({ full_name: fullName.trim() || null, title: title.trim() || null }).eq("id", userId);
    setSaving(false);
    if (error) setMessage(error.message);
    else {
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
    const payload = { [field]: responses, profile_id: userId, status: "open" };
    let error;
    if (cycleId) {
      ({ error } = await supabase.from("feedback_cycles").update(payload).eq("id", cycleId));
    } else {
      const { data, error: insertError } = await supabase.from("feedback_cycles").insert(payload).select("id").single();
      error = insertError;
      if (data) setCycleId(data.id);
    }
    setSaving(false);
    if (!error) setSaved(true);
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

function EmployeeView({ userId, showOutlook }: { userId: string; showOutlook: boolean }) {
  const [external, setExternal] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loadingMilestones, setLoadingMilestones] = useState(true);
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()));
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("verified_facts").select("id, label, attested_at")
        .eq("profile_id", userId).eq("kind", "milestone").order("created_at", { ascending: false });
      if (cancelled) return;
      setMilestones((data ?? []).map(factToMilestone));
      setLoadingMilestones(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  async function addMilestone(e: FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;
    setAdding(true);
    const { data, error } = await supabase.from("verified_facts").insert({
      profile_id: userId,
      kind: "milestone",
      label: milestoneLabel({ y: newYear, t: newText.trim() }),
    }).select("id, label, attested_at").single();
    setAdding(false);
    if (!error && data) {
      setMilestones((prev) => [factToMilestone(data), ...prev]);
      setNewText("");
    }
  }

  return (
    <div className="space-y-6">
      <ProfileEditor userId={userId} />
      <Card className="p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-[12px] uppercase tracking-widest opacity-60">Modality</div>
          <h2 className="text-xl font-semibold mt-1 serif">{external ? "External Passport Preview" : "Internal Career View"}</h2>
          <p className="text-[13px] opacity-60 mt-1 max-w-md">
            {external ? "Exactly what an outside company sees — attested facts and your own validated achievements only." : "Your full view, including private coaching feedback and AI guidance."}
          </p>
        </div>
        <button onClick={() => setExternal(!external)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white" style={{ background: "var(--accent)" }}>
          {external ? <EyeOff size={16} /> : <Eye size={16} />}{external ? "Show internal view" : "Preview public passport"}
        </button>
      </Card>
      <div className="grid sm:grid-cols-3 gap-4">
        <Stat label="Skill Velocity (90d)" value="+7" sub="validated skills" accent="var(--accent)" />
        <Stat label="Kudos received" value="34" sub="this quarter" />
        <Stat label="Verified tenure" value="6.2 yr" sub="3 employers attested" accent="var(--verified-fg)" />
      </div>
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4"><Award size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Journey Roadmap</h3></div>
        {loadingMilestones ? (
          <p className="text-sm opacity-60">Loading milestones…</p>
        ) : milestones.length === 0 ? (
          <p className="text-sm opacity-60 mb-4">No milestones yet — add your first one below.</p>
        ) : (
          <div className="relative pl-6 mb-6">
            <div className="absolute left-[7px] top-1 bottom-1 w-px" style={{ background: "var(--line)" }} />
            {milestones.map((m) => (
              <div key={m.id} className="relative mb-5 last:mb-0">
                <div className="absolute -left-[22px] top-1 w-3.5 h-3.5 rounded-full border-2" style={{ borderColor: m.v ? "var(--verified-fg)" : "var(--line)", background: m.v ? "var(--verified-fg)" : "var(--surface)" }} />
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[12px] font-mono opacity-50">{m.y}</span>
                  <span className="font-medium text-[15px]">{m.t}</span>
                  {m.v ? <VerifiedTag /> : <span className="text-[11px] opacity-50">self-reported</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={addMilestone} className="flex flex-wrap gap-2 pt-2 border-t" style={{ borderColor: "var(--line)" }}>
          <input value={newYear} onChange={(e) => setNewYear(e.target.value)} placeholder="Year" className="w-20 px-3 py-2 rounded-xl border text-sm outline-none"
            style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }} />
          <input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Achievement or milestone" required
            className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border text-sm outline-none"
            style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }} />
          <button type="submit" disabled={adding} className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
            {adding ? "Adding…" : "Add milestone"}
          </button>
        </form>
      </Card>
      <FeedbackCycleCard userId={userId} field="employee_responses" title="This cycle — your responses"
        subtitle="Saved to feedback_cycles in Supabase. Your manager adds their side separately." />
      {!external && showOutlook && (
        <Card className="p-6" style={{ background: "var(--inferred-bg)" }}>
          <div className="flex items-center gap-2 mb-2"><Sparkles size={18} style={{ color: "var(--inferred-fg)" }} /><h3 className="font-semibold">Professional Outlook</h3><InferredTag /></div>
          <p className="text-[14px] leading-relaxed">Trajectory suggests promotion-readiness within 2–3 quarters, anchored by consistent cross-functional delivery and rising skill velocity.</p>
          <TransparencyNote>A model-generated prediction, not a fact. It blends your validated skill rate, kudos trend, and feedback alignment. Visible only to you, never on your external passport. You can dispute or hide it in Settings.</TransparencyNote>
        </Card>
      )}
    </div>
  );
}

function ManagerView({ userId }: { userId: string }) {
  const reports = [
    { n: "A. Rivera", role: "Equity Analyst II", morale: 0.82, dev: 0.12, flag: false },
    { n: "J. Okafor", role: "Equity Analyst I", morale: 0.61, dev: 0.74, flag: true },
    { n: "M. Chen", role: "Sr. Analyst", morale: 0.9, dev: 0.08, flag: false },
  ];
  return (
    <div className="space-y-6">
      <ProfileEditor userId={userId} />
      <div className="grid sm:grid-cols-3 gap-4">
        <Stat label="Team morale index" value="0.78" sub="↑ 0.04 vs last cycle" accent="var(--accent)" />
        <Stat label="Open evaluations" value="2" sub="due in 5 days" />
        <Stat label="Deviation flags" value="1" sub="needs coaching" accent="var(--warn)" />
      </div>
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Direct reports</h3>
        <div className="space-y-3">
          {reports.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-4 p-3 rounded-xl border flex-wrap" style={{ borderColor: "var(--line)", background: r.flag ? "var(--warn-bg)" : "var(--surface-2)" }}>
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2">{r.n}{r.flag && <AlertTriangle size={14} style={{ color: "var(--warn)" }} />}</div>
                <div className="text-[12px] opacity-60">{r.role}</div>
              </div>
              <div className="flex items-center gap-5 text-[13px]">
                <div className="text-right"><div className="opacity-50 text-[11px] uppercase">Morale</div><div className="font-semibold">{r.morale.toFixed(2)}</div></div>
                <div className="text-right"><div className="opacity-50 text-[11px] uppercase">Δ Dev</div><div className="font-semibold" style={{ color: r.dev > 0.5 ? "var(--warn)" : "var(--ink)" }}>{r.dev.toFixed(2)}</div></div>
                <button className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-white inline-flex items-center gap-1" style={{ background: "var(--accent)" }}>Draft outlook <ChevronRight size={14} /></button>
              </div>
            </div>
          ))}
        </div>
        <TransparencyNote>Deviation (Δ) is the gap between an employee's self-rating and yours on the same competency. High isn't bad — it surfaces a blind spot worth a conversation. Coaching signal only; never published.</TransparencyNote>
      </Card>
      <FeedbackCycleCard userId={userId} field="manager_responses" title="Manager feedback — your responses"
        subtitle="Prototype: saved on your feedback_cycles row. In production, managers would write on each report's cycle." />
    </div>
  );
}

function ExecutiveView() {
  const morale = [0.71, 0.69, 0.73, 0.76, 0.74, 0.78];
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Org morale index" value="0.78" sub="6-mo high" accent="var(--accent)" />
        <Stat label="Friction coefficient" value="0.21" sub="↓ healthy" accent="var(--verified-fg)" />
        <Stat label="Retention vector" value="Stable" sub="2 watch items" />
        <Stat label="Reviews to sign off" value="5" sub="this week" accent="var(--warn)" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-2"><LineChart size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Morale index trend</h3></div>
          <Spark data={morale} color="var(--accent)" />
          <div className="text-[12px] opacity-60 mt-1">MI = w₁·S + w₂·Kᵥ − w₃·Vd · (0.5 / 0.3 / 0.2)</div>
        </Card>
        <Card className="p-6" style={{ background: "var(--inferred-bg)" }}>
          <div className="flex items-center gap-2 mb-2"><Sparkles size={18} style={{ color: "var(--inferred-fg)" }} /><h3 className="font-semibold">Retention prediction</h3><InferredTag /></div>
          <p className="text-[14px] leading-relaxed">Two teams show early morale decline correlated with elevated friction. Model estimates raised flight risk over the next two quarters.</p>
          <TransparencyNote>A predictive output, not a fact about any individual. Built from aggregated, de-identified trends. It guides where to look — never the sole basis for a personnel decision, and excluded from every external profile.</TransparencyNote>
        </Card>
      </div>
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1"><Zap size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Special Circumstance sandbox</h3></div>
        <p className="text-[13px] opacity-60 mb-3">Initiate a 360° blind review of your own leadership performance.</p>
        <button className="px-4 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: "var(--accent)" }}>Start self-evaluation</button>
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
      setRequests((prev) => [data, ...prev]);
      setEmail("");
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1"><Send size={18} style={{ color: "var(--verified-fg)" }} /><h3 className="font-semibold">Route A — Active outreach</h3><VerifiedTag /></div>
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
      await supabase.from("profiles").update({ passport_published: next }).eq("id", userId);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getUserId();
        if (cancelled) return;
        setUserId(id);
        await ensureUserSettings(id);
        const [{ data: profile }, { data: settings }] = await Promise.all([
          supabase.from("profiles").select("public_slug").eq("id", id).single(),
          supabase.from("user_settings").select("show_outlook").eq("profile_id", id).single(),
        ]);
        if (!cancelled) {
          setPublicSlug(profile?.public_slug ?? null);
          setShowOutlook(settings?.show_outlook ?? true);
        }
      } catch {
        /* session may have expired */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const roleLabel: Record<Role, string> = { employee: "Employee", manager: "Manager", executive: "Executive", admin: "System Admin" };
  const nav = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "verify", label: "Verification", icon: FileBadge },
    ...(role === "admin" ? [{ id: "admin", label: "Brand & Models", icon: SlidersHorizontal }] : []),
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];
  const dashboard = userId ? {
    employee: <EmployeeView userId={userId} showOutlook={showOutlook} />,
    manager: <ManagerView userId={userId} />,
    executive: <ExecutiveView />,
    admin: <AdminView theme={theme} setTheme={setTheme} />,
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
