"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck, SlidersHorizontal, Sparkles, ToggleLeft, ToggleRight,
  Palette, Printer, BarChart3, AlertTriangle, ImageIcon,
} from "lucide-react";
import {
  fetchOrgSettingsForUser,
  updateOrgSettings,
  fetchVerificationStats,
  type OrgSettings,
  type EvaluationModel,
  type VerificationStatBucket,
} from "@/lib/org-settings";

function Card({ children, className = "", style, id }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties; id?: string;
}) {
  return (
    <div id={id} className={`rounded-2xl border ${className}`} style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "0 1px 2px rgba(0,0,0,.04)", ...style }}>
      {children}
    </div>
  );
}

function AdminFactTag() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full"
      style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
      <ShieldCheck size={12} /> ADMIN RECORD
    </span>
  );
}

function SettingToggle({ label, desc, value, onChange, saving }: {
  label: string; desc: string; value: boolean; onChange: () => void; saving?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b last:border-0" style={{ borderColor: "var(--line)" }}>
      <div className="min-w-0">
        <div className="font-medium text-[15px]">{label}</div>
        <div className="text-[13px] opacity-60">{desc}</div>
      </div>
      <button type="button" onClick={onChange} disabled={saving} className="shrink-0 disabled:opacity-50">
        {value ? <ToggleRight size={30} style={{ color: "var(--accent)" }} /> : <ToggleLeft size={30} className="opacity-30" />}
      </button>
    </div>
  );
}

function StatsTable({ stats }: { stats: VerificationStatBucket[] }) {
  if (!stats.length) {
    return <p className="text-sm opacity-60">No verified completions yet (L2+ achievements and facts).</p>;
  }

  const byMonth = stats.reduce<Record<string, VerificationStatBucket[]>>((acc, s) => {
    (acc[s.month] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(byMonth).sort(([a], [b]) => b.localeCompare(a)).map(([month, rows]) => (
        <div key={month}>
          <div className="text-[12px] uppercase tracking-widest opacity-60 mb-2">{month}</div>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--line)" }}>
            <table className="w-full text-[13px] min-w-[420px]">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-widest opacity-60" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                  <th className="py-2 px-3 text-left font-medium">Level</th>
                  <th className="py-2 px-3 text-left font-medium">Type</th>
                  <th className="py-2 px-3 text-right font-medium">Count</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b" style={{ borderColor: "var(--line)" }}>
                    <td className="py-2 px-3">L{r.level}</td>
                    <td className="py-2 px-3">{r.kind}</td>
                    <td className="py-2 px-3 text-right font-medium">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminOrgControls({ userId }: { userId: string }) {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [stats, setStats] = useState<VerificationStatBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [logoNotice, setLogoNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const org = await fetchOrgSettingsForUser(userId);
    setSettings(org);
    if (org) {
      const s = await fetchVerificationStats(org.orgId);
      setStats(s);
    }
  }, [userId]);

  useEffect(() => {
    reload()
      .catch(() => { /* columns may not exist yet */ })
      .finally(() => setLoading(false));
  }, [reload]);

  async function patch(partial: Partial<Omit<OrgSettings, "orgId">>, key: string) {
    if (!settings) return;
    setSavingKey(key);
    setNotice(null);
    try {
      await updateOrgSettings(userId, settings.orgId, partial);
      setSettings({ ...settings, ...partial });
      setNotice("Saved — change recorded in audit log.");
      setTimeout(() => setNotice(null), 3500);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSavingKey(null);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !settings) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        await patch({ logo_url: dataUrl }, "logo");
        setLogoNotice("Company logo updated (mock URL).");
        setTimeout(() => setLogoNotice(null), 3500);
      } catch {
        setLogoNotice("Could not save logo.");
      }
    };
    reader.readAsDataURL(file);
  }

  if (loading) return <p className="text-sm opacity-60">Loading org controls…</p>;

  if (!settings) {
    return (
      <Card className="p-6">
        <p className="text-sm opacity-60">Link your profile to an organization to manage org-wide settings.</p>
      </Card>
    );
  }

  const modelOptions: { id: EvaluationModel; t: string; d: string }[] = [
    { id: "A", t: "Model A — Employee-driven peer selection", d: "Employees nominate evaluators; AI checks shared project history for relevance." },
    { id: "B", t: "Model B — Constant kudos ecosystem", d: "Continuous micro-validations accumulate into quarterly aggregates." },
    { id: "both", t: "Both models concurrently", d: "Run peer selection and kudos together — employees see both flows where applicable." },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h2 className="serif text-2xl font-semibold">Org controls</h2>
          <AdminFactTag />
        </div>
        <p className="text-[14px] opacity-60 max-w-3xl">
          Company-wide policies for AI features, verification trust, evaluation architecture, and branding.
          Changes are audit-logged with who and when.
        </p>
      </div>

      {notice && (
        <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{notice}</p>
      )}

      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-1"><ImageIcon size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Company branding</h3></div>
        <p className="text-[13px] opacity-60 mb-4">Logo appears on the left of the app header/sidebar for everyone in your org.</p>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {settings.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logo_url} alt="Company logo" className="h-12 w-auto max-w-[160px] object-contain rounded-lg border p-1" style={{ borderColor: "var(--line)" }} />
          ) : (
            <div className="h-12 w-12 rounded-lg flex items-center justify-center border" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
              <BuildingPlaceholder />
            </div>
          )}
          <div>
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white cursor-pointer"
              style={{ background: "var(--accent)" }}>
              <ImageIcon size={16} /> Upload logo
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </label>
            <p className="text-[12px] opacity-60 mt-2">Mock upload — stored as preview URL until Supabase Storage is wired.</p>
            {logoNotice && <p className="text-[12px] mt-1" style={{ color: "var(--verified-fg)" }}>{logoNotice}</p>}
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-1"><Sparkles size={18} style={{ color: "var(--inferred-fg)" }} /><h3 className="font-semibold">AI feature toggles</h3></div>
        <p className="text-[13px] opacity-60 mb-3">When off, the corresponding panels are hidden org-wide. AI outputs remain labeled inference when enabled.</p>
        <SettingToggle
          label="AI Coaching"
          desc="Manager coaching insights from promotion_readiness."
          value={settings.ai_coaching_enabled}
          saving={savingKey === "ai_coaching"}
          onChange={() => patch({ ai_coaching_enabled: !settings.ai_coaching_enabled }, "ai_coaching")}
        />
        <SettingToggle
          label="Promotion Readiness engine"
          desc="Promotion timing panels for managers and executives."
          value={settings.promotion_engine_enabled}
          saving={savingKey === "promotion"}
          onChange={() => patch({ promotion_engine_enabled: !settings.promotion_engine_enabled }, "promotion")}
        />
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-1"><AlertTriangle size={18} style={{ color: "var(--warn)" }} /><h3 className="font-semibold">Proof requirement</h3></div>
        <p className="text-[13px] opacity-60 mb-3">Require evidence before achievements or attestations can be sent. Disabling weakens verification trust — logged in audit.</p>
        <SettingToggle
          label="Require proof / evidence"
          desc="Employees must attach evidence when submitting achievements or attestation requests."
          value={settings.require_proof}
          saving={savingKey === "proof"}
          onChange={() => patch({ require_proof: !settings.require_proof }, "proof")}
        />
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-1"><SlidersHorizontal size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Evaluation model</h3></div>
        <p className="text-[13px] opacity-60 mb-4">Choose how performance signals are collected org-wide. You can run one model or both.</p>
        {modelOptions.map((m) => {
          const active = settings.evaluation_model === m.id;
          return (
            <button key={m.id} type="button" disabled={savingKey === "model"}
              onClick={() => patch({ evaluation_model: m.id }, "model")}
              className="w-full text-left p-4 rounded-xl border mb-2 flex items-start gap-3 transition disabled:opacity-60"
              style={{ borderColor: active ? "var(--accent)" : "var(--line)", background: active ? "var(--inferred-bg)" : "var(--surface-2)" }}>
              {active ? <ToggleRight size={22} style={{ color: "var(--accent)" }} /> : <ToggleLeft size={22} className="opacity-40" />}
              <div><div className="font-medium">{m.t}</div><div className="text-[13px] opacity-60">{m.d}</div></div>
            </button>
          );
        })}
      </Card>

      <Card id="verification-stats-print" className="p-5 sm:p-6 print:border-0 print:shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1"><BarChart3 size={18} style={{ color: "var(--verified-fg)" }} /><h3 className="font-semibold">Verification completed</h3><AdminFactTag /></div>
            <p className="text-[13px] opacity-60 max-w-2xl">
              Counts of verified records (L2+) by level and type over time. Administrative aggregate — not individual AI inference.
              Company admins do not perform attestations; this is read-only reporting.
            </p>
          </div>
          <button type="button" onClick={() => window.print()}
            className="px-4 py-2 rounded-xl text-sm font-medium border inline-flex items-center gap-2 shrink-0 print:hidden"
            style={{ borderColor: "var(--line)" }}>
            <Printer size={16} /> Print report
          </button>
        </div>
        <StatsTable stats={stats} />
      </Card>
    </div>
  );
}

function BuildingPlaceholder() {
  return <Palette size={20} className="opacity-40" />;
}
