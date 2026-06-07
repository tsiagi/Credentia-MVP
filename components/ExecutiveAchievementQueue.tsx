"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, X, Award, ShieldCheck } from "lucide-react";
import {
  fetchPendingExecutiveAchievements,
  approveExecutiveAchievement,
  rejectExecutiveAchievement,
  achievementTitle,
  type AchievementRow,
} from "@/lib/achievements";
import { fetchProfileOrgId } from "@/lib/workforce";
import { LevelBadge } from "@/lib/verification-ui";
import { supabase } from "@/lib/supabase";

function ContributionTag({ type }: { type: string }) {
  const label = type === "team" ? "Team contribution" : "Individual contribution";
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: type === "team" ? "var(--accent-soft)" : "var(--surface-2)", color: type === "team" ? "var(--accent)" : "var(--ink-2)" }}>
      {label}
    </span>
  );
}

export function ExecutiveAchievementQueue({ userId }: { userId: string }) {
  const [rows, setRows] = useState<(AchievementRow & { subject_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const orgId = await fetchProfileOrgId(userId);
    if (!orgId) {
      setRows([]);
      return;
    }
    const pending = await fetchPendingExecutiveAchievements(orgId);
    if (!pending.length) {
      setRows([]);
      return;
    }
    const ids = [...new Set(pending.map((p) => p.profile_id))];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, title").in("id", ids);
    const names = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, p.full_name?.trim() || p.title?.trim() || p.id.slice(0, 8)]),
    );
    setRows(pending.map((p) => ({ ...p, subject_name: p.profile_id ? names[p.profile_id] : undefined })));
  }, [userId]);

  useEffect(() => {
    reload()
      .catch(() => { /* schema may lag */ })
      .finally(() => setLoading(false));
  }, [reload]);

  async function act(id: string, action: "approve" | "reject") {
    setActing(id);
    setError(null);
    try {
      if (action === "approve") await approveExecutiveAchievement(id, userId);
      else await rejectExecutiveAchievement(id, userId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setActing(null);
    }
  }

  if (loading) return null;
  if (!rows.length) return null;

  return (
    <div className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <div className="flex items-center gap-2 mb-1">
        <Award size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">Manager-submitted achievements — your approval</h3>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>
          <ShieldCheck size={12} /> VERIFICATION
        </span>
      </div>
      <p className="text-[13px] opacity-60 mb-4">
        Managers add achievements for themselves and their team. Approve to unlock L2 manager verification path; reject to dismiss.
      </p>
      {error && <p className="text-[13px] mb-3 px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}
      <div className="space-y-3">
        {rows.map((a) => (
          <div key={a.id} className="p-4 rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{achievementTitle(a.description)}</span>
                  <LevelBadge level={a.verification_level} />
                  <ContributionTag type={a.contribution_type ?? "individual"} />
                </div>
                <div className="text-[13px] opacity-70 mt-0.5">For: {a.subject_name ?? "Team member"}</div>
                <p className="text-[13px] opacity-60 mt-1">{a.description}</p>
                {a.evidence_url && <p className="text-[12px] opacity-50 mt-1">Evidence: {a.evidence_url}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" disabled={acting === a.id} onClick={() => act(a.id, "approve")}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-white inline-flex items-center gap-1 disabled:opacity-60"
                  style={{ background: "var(--verified-fg)" }}>
                  <Check size={14} /> Approve
                </button>
                <button type="button" disabled={acting === a.id} onClick={() => act(a.id, "reject")}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium border inline-flex items-center gap-1 disabled:opacity-60"
                  style={{ borderColor: "var(--line)", color: "var(--warn)" }}>
                  <X size={14} /> Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
