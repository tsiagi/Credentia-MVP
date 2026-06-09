"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck, Lock, Globe, Copy, Check, ExternalLink, AlertTriangle,
  Target, FolderGit2, GraduationCap, TrendingUp, Award, BadgeCheck,
} from "lucide-react";
import { ensurePassportSlug, passportUrl, type PublicPassport } from "@/lib/passport";
import { supabase } from "@/lib/supabase";
import { LevelBadge } from "@/lib/verification-ui";

const KIND_ICON: Record<string, typeof Target> = {
  kpi: Target,
  project: FolderGit2,
  certification: GraduationCap,
  promotion: TrendingUp,
  award: Award,
  employment: BadgeCheck,
  title: BadgeCheck,
  tenure: BadgeCheck,
};

export function PassportLinkCard({ userId }: { userId: string }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    const [{ data: profile }, { data: settings }] = await Promise.all([
      supabase.from("profiles").select("public_slug, passport_published").eq("id", userId).single(),
      supabase.from("user_settings").select("passport_published").eq("profile_id", userId).maybeSingle(),
    ]);
    setSlug(profile?.public_slug ?? null);
    setPublished(settings?.passport_published ?? profile?.passport_published ?? false);
    setLoading(false);
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  async function generateLink() {
    setGenerating(true);
    try {
      const s = await ensurePassportSlug(userId);
      setSlug(s);
    } finally {
      setGenerating(false);
    }
  }

  async function copyLink() {
    if (!slug) return;
    await navigator.clipboard.writeText(passportUrl(slug));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return null;

  const url = slug ? passportUrl(slug) : null;

  return (
    <div
      className="rounded-2xl border p-6"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Globe size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">Verified Resume Network</h3>
      </div>
      <p className="text-[13px] opacity-70 mb-4 max-w-2xl">
        Generate a secure, token-based link for recruiters. They see attested career data only —
        never AI inferences, value scores, or compensation. View-only; not downloadable.
      </p>

      {!slug ? (
        <button
          type="button"
          disabled={generating}
          onClick={generateLink}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {generating ? "Generating…" : "Generate secure link"}
        </button>
      ) : (
        <div className="space-y-3">
          <div
            className="flex items-center gap-2 p-3 rounded-xl font-mono text-[13px] break-all"
            style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
          >
            <Lock size={14} className="shrink-0 opacity-60" />
            {url}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="px-3 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-1.5 text-white"
              style={{ background: "var(--accent)" }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy link"}
            </button>
            {published && slug && (
              <a
                href={passportUrl(slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl text-sm font-medium border inline-flex items-center gap-1.5"
                style={{ borderColor: "var(--line)" }}
              >
                <ExternalLink size={14} /> Preview
              </a>
            )}
          </div>
        </div>
      )}

      {!published && slug && (
        <p
          className="text-[13px] mt-3 px-3 py-2 rounded-lg flex items-start gap-2"
          style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
        >
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          Link exists but passport is not published. Enable &quot;Publish public passport&quot; in Settings.
        </p>
      )}
    </div>
  );
}

function RecordList({
  records,
  verified,
}: {
  records: PublicPassport["verified"];
  verified: boolean;
}) {
  if (!records.length) {
    return (
      <p className="text-sm opacity-60 py-4">
        {verified ? "No manager-verified records yet." : "No self-reported items."}
      </p>
    );
  }

  const grouped = records.reduce<Record<string, typeof records>>((acc, r) => {
    const k = r.kind || "other";
    if (!acc[k]) acc[k] = [];
    acc[k].push(r);
    return acc;
  }, {});

  const kindLabels: Record<string, string> = {
    employment: "Tenure & role",
    title: "Job title",
    tenure: "Tenure",
    kpi: "KPIs",
    project: "Projects",
    certification: "Certifications",
    promotion: "Promotions",
    award: "Awards & recognition",
    achievement: "Achievements",
  };

  return (
    <div className="space-y-5">
      {Object.entries(grouped).map(([kind, items]) => {
        const Icon = KIND_ICON[kind] ?? Award;
        return (
          <div key={kind}>
            <div className="flex items-center gap-2 mb-2">
              <Icon size={16} className="opacity-50" />
              <h4 className="text-[13px] font-semibold uppercase tracking-widest opacity-70">
                {kindLabels[kind] ?? kind}
              </h4>
            </div>
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="p-4 rounded-xl border text-[14px]"
                  style={{
                    borderColor: verified ? "var(--verified-fg)" : "var(--line)",
                    background: verified ? "var(--verified-bg)" : "var(--surface-2)",
                    borderLeftWidth: verified ? 3 : 1,
                  }}
                >
                  <div className="font-medium leading-snug">{item.label}</div>
                  {verified && item.level >= 2 && (
                    <div className="mt-1"><LevelBadge level={item.level} /></div>
                  )}
                  {item.detail && <div className="text-[13px] opacity-70 mt-1">{item.detail}</div>}
                  {item.date && <div className="text-[11px] opacity-50 mt-1">{item.date}</div>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export default function VerifiedResumePage({ token }: { token: string }) {
  const [passport, setPassport] = useState<PublicPassport | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    document.body.classList.add("passport-view");
    return () => document.body.classList.remove("passport-view");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { fetchPublicPassport } = await import("@/lib/passport");
        const data = await fetchPublicPassport(token);
        if (!cancelled) {
          if (!data) setNotFound(true);
          else setPassport(data);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const theme = {
    "--bg": "#EAEAF2",
    "--surface": "#FBFAFD",
    "--surface-2": "#E4E3EE",
    "--ink": "#242838",
    "--ink-2": "#4A4F63",
    "--line": "#D8D6E3",
    "--accent": "#6B7FC0",
    "--verified-fg": "#586340",
    "--verified-bg": "#E7EAD7",
    "--warn": "#A5731F",
    "--warn-bg": "#F6E7C7",
  } as CSSProperties;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm opacity-60" style={theme}>
        Loading verified resume…
      </div>
    );
  }

  if (notFound || !passport) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 text-center" style={theme}>
        <ShieldCheck size={40} style={{ color: "var(--accent)" }} />
        <h1 className="text-xl font-semibold mt-4">Resume not available</h1>
        <p className="text-sm opacity-70 mt-2 max-w-md">
          This link may be invalid, revoked, or not yet published by the employee.
        </p>
      </div>
    );
  }

  return (
    <>
    <div
      className="min-h-screen passport-no-print passport-page select-none"
      style={{ ...theme, background: "var(--bg)", color: "var(--ink)" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <header
        className="border-b sticky top-0 z-10 backdrop-blur"
        style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--bg) 90%, transparent)" }}
      >
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg" style={{ background: "var(--accent)" }}>
              <ShieldCheck size={16} color="#fff" />
            </div>
            <span className="font-semibold text-[15px]">Credentia Verified Resume</span>
          </div>
          <div
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full"
            style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}
          >
            <Lock size={12} /> View only · Not downloadable
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10">
        <div className="mb-8">
          <p className="text-[12px] uppercase tracking-widest opacity-50 mb-2">Verified Resume Network</p>
          <h1 className="text-3xl font-semibold serif">{passport.fullName ?? "Professional"}</h1>
          {passport.title && (
            <p className="text-lg opacity-80 mt-1">{passport.title}</p>
          )}
          {passport.orgName && (
            <p className="text-[14px] opacity-60 mt-1">{passport.orgName}</p>
          )}
        </div>

        <div
          className="p-4 rounded-xl mb-8 text-[13px] leading-relaxed flex gap-3"
          style={{ background: "var(--verified-bg)", border: "1px solid var(--verified-fg)" }}
        >
          <BadgeCheck size={18} className="shrink-0 mt-0.5" style={{ color: "var(--verified-fg)" }} />
          <div>
            <strong>Recruiter view.</strong> Green-bordered items are attested by a manager or higher (L2+).
            Gray items are self-reported by the employee and clearly labeled. This page excludes all AI
            inferences, internal scores, and compensation data. It cannot be exported or printed.
          </div>
        </div>

        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <BadgeCheck size={20} style={{ color: "var(--verified-fg)" }} />
            <h2 className="text-xl font-semibold">Verified information</h2>
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}
            >
              Attested L2+
            </span>
          </div>
          <RecordList records={passport.verified} verified />
        </section>

        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xl font-semibold">Self-reported</h2>
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}
            >
              Not yet attested
            </span>
          </div>
          <p className="text-[13px] opacity-60 mb-4">
            Submitted by the employee; not confirmed by an attesting manager. Shown for transparency — not proof.
          </p>
          <RecordList records={passport.selfReported} verified={false} />
        </section>

        <footer
          className="text-center text-[12px] opacity-50 pt-8 border-t"
          style={{ borderColor: "var(--line)" }}
        >
          Credentia Verified Resume Network · Token-gated · Records are correctable with audit trail
        </footer>
      </main>
    </div>
    </>
  );
}
