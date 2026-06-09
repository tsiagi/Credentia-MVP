"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Lock, ShieldCheck, Target, FolderGit2, GraduationCap, TrendingUp, Award } from "lucide-react";
import { fetchShareableProfile, type ShareableProfile } from "@/lib/shareable";

const KIND_ICON: Record<string, typeof Target> = {
  kpi: Target,
  project: FolderGit2,
  certification: GraduationCap,
  promotion: TrendingUp,
  award: Award,
};

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

  return (
    <div className="min-h-screen px-5 py-10" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-2 text-[13px] opacity-50 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cairn-logo-mark.svg" alt="" className="h-6 w-6" />
          Credentia · Verified profile
        </div>

        <div className="border p-6 sm:p-8" style={{ borderColor: "var(--line)", background: "var(--surface)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" }}>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full"
            style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>
            <BadgeCheck size={12} /> VERIFIED FACTS ONLY
          </span>
          <h1 className="text-2xl sm:text-3xl font-semibold mt-4 serif">{profile.name}</h1>
          {profile.title && <p className="text-[15px] opacity-70 mt-1">{profile.title}</p>}

          <div className="mt-8">
            <h2 className="text-[12px] uppercase tracking-widest opacity-50 mb-3">Verified achievements</h2>
            {profile.achievements.length === 0 ? (
              <p className="text-[14px] opacity-60">No verified achievements on this profile yet.</p>
            ) : (
              <ul className="space-y-3">
                {profile.achievements.map((a, i) => {
                  const Icon = KIND_ICON[a.kind] ?? Award;
                  return (
                    <li key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
                      <div className="p-1.5 rounded-lg shrink-0" style={{ background: "var(--verified-bg)" }}>
                        <Icon size={16} style={{ color: "var(--verified-fg)" }} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[14px] font-medium leading-snug">{a.label}</div>
                        {a.date && <div className="text-[12px] opacity-50 mt-0.5">{a.date}</div>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <p className="text-center text-[12px] opacity-50 mt-6 inline-flex items-center gap-1.5 w-full justify-center">
          <Lock size={12} /> View only · Not downloadable · No AI inferences
        </p>
      </div>
    </div>
  );
}
