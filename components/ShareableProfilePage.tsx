"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BadgeCheck, Lock, ShieldCheck, Target, FolderGit2, GraduationCap,
  TrendingUp, Award, Briefcase, User, Users, Gauge,
} from "lucide-react";
import { fetchShareableProfile, type ShareableProfile, type ShareableAchievement } from "@/lib/shareable";
import { LevelBadge } from "@/lib/verification-ui";

const KIND_ICON: Record<string, typeof Target> = {
  kpi: Target,
  project: FolderGit2,
  certification: GraduationCap,
  promotion: TrendingUp,
  award: Award,
  achievement: BadgeCheck,
};

// Display order + labels for achievement categories (kinds).
const CATEGORY_LABELS: { kind: string; label: string }[] = [
  { kind: "promotion", label: "Promotions" },
  { kind: "award", label: "Awards" },
  { kind: "certification", label: "Certifications" },
  { kind: "kpi", label: "KPIs" },
  { kind: "achievement", label: "Achievements" },
];

function formatDate(d: string | null) {
  if (!d) return null;
  const parsed = new Date(d.length <= 7 ? `${d}-01` : d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

function roleRange(start: string | null, end: string | null) {
  const s = formatDate(start);
  const e = end ? formatDate(end) : "Present";
  if (!s && !end) return null;
  return `${s ?? "—"} – ${e}`;
}

function SectionLabel({ icon: Icon, children }: { icon: typeof Target; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-[12px] uppercase tracking-widest opacity-50 mb-3">
      <Icon size={14} /> {children}
    </h2>
  );
}

function AchievementRow({ a }: { a: ShareableAchievement }) {
  const Icon = KIND_ICON[a.kind] ?? Award;
  const date = formatDate(a.date);
  return (
    <li className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
      <div className="p-1.5 rounded-lg shrink-0" style={{ background: "var(--verified-bg)" }}>
        <Icon size={16} style={{ color: "var(--verified-fg)" }} />
      </div>
      <div className="min-w-0">
        <div className="text-[14px] font-medium leading-snug">{a.label}</div>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {date && <span className="text-[12px] opacity-50">{date}</span>}
          {a.role && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
              style={{ background: "var(--surface)", color: "var(--ink-2)" }}>
              <Briefcase size={10} /> {a.role}
            </span>
          )}
          {a.contribution && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
              style={{ background: "var(--surface)", color: "var(--ink-2)" }}>
              {a.contribution === "team" ? <Users size={10} /> : <User size={10} />}
              {a.contribution === "team" ? "Team" : "Individual"}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

export default function ShareableProfilePage({ token }: { token: string }) {
  const [profile, setProfile] = useState<ShareableProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchShareableProfile(token);
      if (cancelled) return;
      if (!data) setMissing(true);
      else setProfile(data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center opacity-60 text-sm" style={{ background: "var(--bg, #eef0f3)" }}>
        Loading…
      </div>
    );
  }

  if (missing || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5" style={{ background: "var(--bg, #eef0f3)" }}>
        <div className="text-center max-w-md">
          <ShieldCheck size={40} className="mx-auto opacity-30" />
          <h1 className="text-xl font-semibold mt-4">Link unavailable</h1>
          <p className="text-[14px] opacity-60 mt-2">This share link was revoked or does not exist.</p>
        </div>
      </div>
    );
  }

  const cardStyle = { borderColor: "var(--line)", background: "var(--surface)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" };
  const categories = CATEGORY_LABELS
    .map((c) => ({ ...c, items: profile.achievements.filter((a) => a.kind === c.kind) }))
    .filter((c) => c.items.length > 0);
  const uncategorized = profile.achievements.filter((a) => !CATEGORY_LABELS.some((c) => c.kind === a.kind));
  const hasAnything =
    profile.roles.length > 0 || profile.achievements.length > 0 ||
    profile.projects.length > 0 || profile.metrics.length > 0;

  return (
    <div className="min-h-screen px-5 py-10" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-[13px] opacity-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cairn-logo-mark.svg" alt="" className="h-6 w-6" />
          Credentia · Verified profile
        </div>

        {/* Identity */}
        <div className="border p-6 sm:p-8" style={cardStyle}>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full"
            style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>
            <BadgeCheck size={12} /> VERIFIED FACTS ONLY
          </span>
          <h1 className="text-2xl sm:text-3xl font-semibold mt-4 serif">{profile.name}</h1>
          {profile.title && <p className="text-[15px] opacity-70 mt-1">{profile.title}</p>}
          {profile.currentManager && (
            <p className="text-[13px] opacity-60 mt-2 inline-flex items-center gap-1.5">
              <User size={13} /> Reports to {profile.currentManager}
            </p>
          )}
        </div>

        {!hasAnything && (
          <div className="border p-6 sm:p-8" style={cardStyle}>
            <p className="text-[14px] opacity-60">No verified records on this profile yet.</p>
          </div>
        )}

        {/* Roles & reporting history */}
        {profile.roles.length > 0 && (
          <div className="border p-6 sm:p-8" style={cardStyle}>
            <SectionLabel icon={Briefcase}>Roles &amp; reporting history</SectionLabel>
            <ol className="space-y-3">
              {profile.roles.map((r, i) => (
                <li key={i} className="p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium leading-snug">{r.title}</div>
                      {r.manager && (
                        <div className="text-[12px] opacity-60 mt-0.5 inline-flex items-center gap-1.5">
                          <User size={11} /> Manager: {r.manager}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <LevelBadge level={r.level} />
                      {roleRange(r.startDate, r.endDate) && (
                        <span className="text-[11px] opacity-50">{roleRange(r.startDate, r.endDate)}</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Achievements by category */}
        {profile.achievements.length > 0 && (
          <div className="border p-6 sm:p-8" style={cardStyle}>
            <SectionLabel icon={Award}>Verified achievements</SectionLabel>
            <div className="space-y-5">
              {categories.map((c) => (
                <div key={c.kind}>
                  <h3 className="text-[13px] font-semibold mb-2 opacity-80">{c.label}</h3>
                  <ul className="space-y-3">
                    {c.items.map((a, i) => <AchievementRow key={i} a={a} />)}
                  </ul>
                </div>
              ))}
              {uncategorized.length > 0 && (
                <div>
                  <h3 className="text-[13px] font-semibold mb-2 opacity-80">Other</h3>
                  <ul className="space-y-3">
                    {uncategorized.map((a, i) => <AchievementRow key={i} a={a} />)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Projects */}
        {profile.projects.length > 0 && (
          <div className="border p-6 sm:p-8" style={cardStyle}>
            <SectionLabel icon={FolderGit2}>Projects</SectionLabel>
            <ul className="space-y-3">
              {profile.projects.map((p, i) => (
                <li key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
                  <div className="p-1.5 rounded-lg shrink-0" style={{ background: "var(--verified-bg)" }}>
                    <FolderGit2 size={16} style={{ color: "var(--verified-fg)" }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium leading-snug">{p.label}</div>
                    {p.outcome && <div className="text-[13px] opacity-70 mt-0.5">{p.outcome}</div>}
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      {p.impact && (
                        <span className="text-[12px] font-medium" style={{ color: "var(--verified-fg)" }}>{p.impact}</span>
                      )}
                      {p.role && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                          style={{ background: "var(--surface)", color: "var(--ink-2)" }}>
                          <Briefcase size={10} /> {p.role}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Metrics (approved KPIs) */}
        {profile.metrics.length > 0 && (
          <div className="border p-6 sm:p-8" style={cardStyle}>
            <SectionLabel icon={Gauge}>Verified metrics</SectionLabel>
            <div className="grid sm:grid-cols-2 gap-3">
              {profile.metrics.map((m, i) => (
                <div key={i} className="p-3 rounded-xl flex items-center justify-between gap-3" style={{ background: "var(--surface-2)" }}>
                  <span className="text-[13px] opacity-80 min-w-0 truncate">{m.label}</span>
                  <span className="text-[14px] font-semibold tabular-nums shrink-0">{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-[12px] opacity-50 inline-flex items-center gap-1.5 w-full justify-center">
          <Lock size={12} /> View only · Not downloadable · No AI inferences
        </p>
      </div>
    </div>
  );
}
