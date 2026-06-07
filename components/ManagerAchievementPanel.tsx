"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Award, Plus, User, Users } from "lucide-react";
import {
  fetchDirectReports,
} from "@/lib/workforce";
import {
  saveManagerAchievement,
  type ContributionType,
  type AchievementRow,
} from "@/lib/achievements";
import { fetchOrgSettingsForUser } from "@/lib/org-settings";
import { supabase } from "@/lib/supabase";
import { LevelBadge } from "@/lib/verification-ui";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border p-5 sm:p-6 ${className}`} style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      {children}
    </div>
  );
}

function ContributionTag({ type }: { type: ContributionType }) {
  const label = type === "team" ? "Team contribution" : "Individual contribution";
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: type === "team" ? "var(--accent-soft)" : "var(--surface-2)", color: type === "team" ? "var(--accent)" : "var(--ink-2)" }}>
      {label}
    </span>
  );
}

export function ManagerAchievementPanel({ userId }: { userId: string }) {
  const [reports, setReports] = useState<{ id: string; full_name: string | null; title: string | null }[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [requireProof, setRequireProof] = useState(true);
  const [target, setTarget] = useState<"self" | string>("self");
  const [contributionType, setContributionType] = useState<ContributionType>("individual");
  const [draft, setDraft] = useState({ title: "", desc: "", date: "", evidence: "", kind: "achievement" });
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<AchievementRow[]>([]);

  const reload = useCallback(async () => {
    const [reportsList, orgSettings] = await Promise.all([
      fetchDirectReports(userId),
      fetchOrgSettingsForUser(userId),
    ]);
    setReports(reportsList);
    setOrgId(orgSettings?.orgId ?? null);
    setRequireProof(orgSettings?.require_proof ?? true);

    const subjectIds = [userId, ...reportsList.map((r) => r.id)];
    const { data } = await supabase
      .from("achievements")
      .select("id, kind, description, evidence_url, achievement_date, verification_level, created_at, contribution_type, pending_executive, profile_id")
      .in("profile_id", subjectIds)
      .eq("submitted_by", userId)
      .order("created_at", { ascending: false });

    setPending((data ?? []) as AchievementRow[]);
  }, [userId]);

  useEffect(() => {
    reload().catch(() => { /* schema may lag */ });
  }, [reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    if (requireProof && !draft.evidence.trim()) {
      setError("Your organization requires proof or evidence before submission.");
      return;
    }

    const profileId = target === "self" ? userId : target;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await saveManagerAchievement(userId, profileId, orgId, draft, contributionType);
      setDraft({ title: "", desc: "", date: "", evidence: "", kind: "achievement" });
      setNotice("Achievement submitted. It stays at L1 until an executive approves — you'll see pending status below.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit achievement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <Award size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">Add achievements — you &amp; your team</h3>
      </div>
      <p className="text-[13px] opacity-60 mb-4 max-w-2xl">
        Submit achievements for yourself or direct reports. They remain self-reported (L1) until an executive approves,
        then they can move through the normal verification path.
      </p>

      {error && <p className="text-[13px] px-3 py-2 rounded-lg mb-3" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}
      {notice && <p className="text-[13px] px-3 py-2 rounded-lg mb-3" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{notice}</p>}

      <form onSubmit={submit} className="p-4 rounded-xl border space-y-3 mb-5" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] uppercase tracking-widest opacity-60 block mb-1">For whom</label>
            <select value={target} onChange={(e) => setTarget(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
              <option value="self">Myself</option>
              {reports.map((r) => (
                <option key={r.id} value={r.id}>{r.full_name ?? r.title ?? r.id.slice(0, 8)} (direct report)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[12px] uppercase tracking-widest opacity-60 block mb-1">Contribution type</label>
            <div className="flex gap-2 flex-wrap">
              {(["individual", "team"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setContributionType(t)}
                  className="px-3 py-2 rounded-lg text-[13px] font-medium border inline-flex items-center gap-1.5"
                  style={{
                    borderColor: contributionType === t ? "var(--accent)" : "var(--line)",
                    background: contributionType === t ? "var(--accent-soft)" : "var(--surface)",
                    color: contributionType === t ? "var(--accent)" : "var(--ink-2)",
                  }}>
                  {t === "individual" ? <User size={14} /> : <Users size={14} />}
                  {t === "individual" ? "Individual" : "Team"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          <option value="achievement">Kind: Achievement</option>
          <option value="award">Kind: Award</option>
          <option value="promotion">Kind: Promotion</option>
        </select>

        <div className="grid sm:grid-cols-2 gap-2">
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" required
            className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)" }} />
          <input value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} placeholder="Date (YYYY-MM)"
            className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)" }} />
        </div>
        <textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="Description" rows={2}
          className="w-full px-3 py-2 rounded-lg border text-sm resize-y" style={{ borderColor: "var(--line)", background: "var(--surface)" }} />
        <input value={draft.evidence} onChange={(e) => setDraft({ ...draft, evidence: e.target.value })}
          placeholder={requireProof ? "Evidence URL or note (required)" : "Evidence URL or note (optional)"}
          className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          required={requireProof} />
        <button type="submit" disabled={submitting}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white inline-flex items-center gap-1 disabled:opacity-60"
          style={{ background: "var(--accent)" }}>
          <Plus size={14} /> {submitting ? "Submitting…" : "Submit for executive approval (L1 pending)"}
        </button>
      </form>

      {pending.length > 0 && (
        <div>
          <div className="text-[12px] uppercase tracking-widest opacity-60 mb-2">Your submissions</div>
          <div className="space-y-2">
            {pending.map((a) => (
              <div key={a.id} className="p-3 rounded-xl border text-[13px]" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{a.description.split(":")[0]}</span>
                  <LevelBadge level={a.verification_level} />
                  <ContributionTag type={a.contribution_type ?? "individual"} />
                  {a.pending_executive && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>
                      Pending executive approval
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
