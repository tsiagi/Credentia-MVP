"use client";

import React, { useCallback, useEffect, useState, type FormEvent } from "react";
import { Award, Plus } from "lucide-react";
import {
  fetchAchievements,
  saveAchievement,
  achievementTitle,
  type AchievementRow,
} from "@/lib/achievements";
import { fetchProfileOrgId } from "@/lib/workforce";
import { LevelBadge } from "@/lib/verification-ui";
import { VerificationHistory } from "@/components/VerificationHistory";
import { ProofDocumentUpload, ProofDocumentView } from "@/components/ProofDocumentView";

const KIND_ICON: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  achievement: Award,
  award: Award,
  certification: Award,
  promotion: Award,
  kpi: Award,
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border p-5 sm:p-6 ${className}`} style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, sub }: { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold text-lg">{title}</h3>
      </div>
      {sub && <p className="text-[13px] opacity-60 max-w-2xl">{sub}</p>}
    </div>
  );
}

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

export function AchievementVaultView({ userId, requireProof = true }: { userId: string; requireProof?: boolean }) {
  const [vault, setVault] = useState<AchievementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", desc: "", date: "", evidence: "", kind: "achievement" });
  const [proofDoc, setProofDoc] = useState<string | null>(null);
  const [proofFileName, setProofFileName] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setVault(await fetchAchievements(userId));
    } catch (e) {
      setError(errorMessage(e, "Could not load achievement vault."));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    const hasProof = Boolean(proofDoc || draft.evidence.trim());
    if (requireProof && !hasProof) {
      setError("Your organization requires proof — attach a document or add a supporting link.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const orgId = await fetchProfileOrgId(userId);
      const evidence = proofDoc ?? draft.evidence.trim();
      const row = await saveAchievement(userId, orgId, { ...draft, evidence });
      setVault((prev) => [row, ...prev]);
      setDraft({ title: "", desc: "", date: "", evidence: "", kind: "achievement" });
      setProofDoc(null);
      setProofFileName(null);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err, "Could not save achievement."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm opacity-60">Loading achievement vault…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="serif text-2xl font-semibold">Achievement Vault</h2>
        <p className="text-[14px] opacity-60 mt-1 max-w-2xl">
          Add accomplishments to your verified record. New items start as self-reported (L1) until your manager verifies them (L2+).
        </p>
      </div>

      {error && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}

      <Card>
        <SectionHeader
          icon={Award}
          title="Add achievement"
          sub="Attach proof when your organization requires it — managers see documents during verification."
        />
        <form onSubmit={submit} className="p-4 rounded-xl border space-y-3" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
          <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
            <option value="achievement">Kind: Achievement</option>
            <option value="kpi">Kind: KPI</option>
            <option value="certification">Kind: Certification</option>
            <option value="promotion">Kind: Promotion</option>
            <option value="award">Kind: Award</option>
          </select>
          <div className="grid sm:grid-cols-2 gap-2">
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" required
              className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)" }} />
            <input value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} placeholder="Date (YYYY-MM)"
              className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)" }} />
          </div>
          <textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="Description" rows={2}
            className="w-full px-3 py-2 rounded-lg border text-sm resize-y" style={{ borderColor: "var(--line)", background: "var(--surface)" }} />
          <ProofDocumentUpload
            requireProof={requireProof}
            documentDataUrl={proofDoc}
            onDocumentChange={(url, name) => { setProofDoc(url); setProofFileName(name); }}
            note={proofFileName ? `Selected: ${proofFileName}` : "PDF or image — stored securely for manager review (mock upload)."}
          />
          <input value={draft.evidence} onChange={(e) => setDraft({ ...draft, evidence: e.target.value })}
            placeholder="Or paste a supporting link (optional if document attached)"
            className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)" }} />
          <div className="flex items-center gap-3 flex-wrap">
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium text-white inline-flex items-center gap-1 disabled:opacity-60" style={{ background: "var(--accent)" }}>
              <Plus size={14} /> {submitting ? "Saving…" : "Save to vault (L1 self-reported)"}
            </button>
            {saved && <span className="text-[13px]" style={{ color: "var(--verified-fg)" }}>Saved — pending manager verification.</span>}
          </div>
        </form>
      </Card>

      <Card>
        <SectionHeader icon={Award} title="Your vault" sub={`${vault.length} item(s) · ${vault.filter((a) => a.verification_level >= 2).length} verified`} />
        {vault.length === 0 ? (
          <p className="text-sm opacity-60">No achievements yet — add your first one above.</p>
        ) : (
          <div className="space-y-3">
            {vault.map((a) => {
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
                      <ProofDocumentView evidenceUrl={a.evidence_url} compact />
                      <VerificationHistory targetTable="achievements" targetId={a.id} compact />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
