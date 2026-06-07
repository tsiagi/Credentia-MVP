"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  trialDaysRemaining,
  EXPORT_DISCLAIMER,
  type AccountStatus,
} from "@/lib/lifecycle";
import { exportVerifiedRecord } from "@/lib/org-chart";
import { ShieldCheck, Clock, Download, Globe, CreditCard, Check } from "lucide-react";

const Card = ({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
  <div className={`rounded-2xl border ${className}`} style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "0 1px 2px rgba(0,0,0,.04)", ...style }}>
    {children}
  </div>
);

type LifecycleProps = {
  userId: string;
  accountStatus: AccountStatus;
  trialEndsAt: string | null;
  onStatusChange?: (status: AccountStatus) => void;
};

export function FormerTrialBanner({ accountStatus, trialEndsAt }: Pick<LifecycleProps, "accountStatus" | "trialEndsAt">) {
  if (accountStatus !== "former_trial") return null;

  const days = trialDaysRemaining(trialEndsAt);
  const endLabel = trialEndsAt ? new Date(trialEndsAt).toLocaleDateString() : "soon";

  return (
    <Card className="p-5 border-2" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
      <div className="flex items-start gap-3">
        <Clock size={22} className="shrink-0 mt-0.5" style={{ color: "var(--accent)" }} />
        <div>
          <h3 className="font-semibold">Personal passport trial — {days ?? "—"} days left</h3>
          <p className="text-[14px] opacity-85 mt-1 leading-relaxed">
            Your employment ended. Your <strong>verified record is frozen</strong> and always yours to view and export (free).
            This trial ({endLabel}) includes the <strong>shareable recruiter passport</strong>. After it ends, you keep free access to your record;
            subscribe to keep the live share link active.
          </p>
        </div>
      </div>
    </Card>
  );
}

export function BillingPlanView({ userId, accountStatus, trialEndsAt, onStatusChange }: LifecycleProps) {
  const [status, setStatus] = useState(accountStatus);
  const [subscribing, setSubscribing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isFormer = status.startsWith("former_");
  if (!isFormer) {
    return (
      <Card className="p-6">
        <p className="text-sm opacity-60">Plan &amp; billing applies after you leave your employer and enter a personal account.</p>
      </Card>
    );
  }

  async function mockSubscribe() {
    setSubscribing(true);
    setNotice(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const res = await fetch("/api/lifecycle/subscribe", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          setStatus("former_paid");
          onStatusChange?.("former_paid");
          setNotice("Subscribed (mock) — shareable passport unlocked.");
          return;
        }
      }
      setStatus("former_paid");
      onStatusChange?.("former_paid");
      setNotice("Subscribed (mock, local) — shareable passport unlocked.");
    } catch {
      setStatus("former_paid");
      onStatusChange?.("former_paid");
      setNotice("Subscribed (mock, local).");
    } finally {
      setSubscribing(false);
    }
  }

  async function downloadExport() {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in again");
      const blob = await exportVerifiedRecord(session.access_token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "credentia-verified-record.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice("Export API unavailable — run schema migration. Your data right to export still applies.");
    } finally {
      setExporting(false);
    }
  }

  const paid = status === "former_paid";
  const onTrial = status === "former_trial";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="serif text-2xl font-semibold">Plan &amp; billing</h2>
        <p className="text-[14px] opacity-60 mt-1 max-w-2xl">Your data rights vs optional paid features — no AI inference on this page.</p>
      </div>

      {onTrial && <FormerTrialBanner accountStatus={status} trialEndsAt={trialEndsAt} />}
      {notice && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{notice}</p>}

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={20} style={{ color: "var(--verified-fg)" }} />
            <h3 className="font-semibold text-lg">Free — always</h3>
          </div>
          <p className="text-[13px] opacity-70 mb-4 flex-1">
            <strong>Data right:</strong> view and export your own verified employment record forever.
            Attested facts stay frozen from your employment period. This never requires payment.
          </p>
          <ul className="text-[13px] space-y-2 mb-4">
            {["View frozen verified facts", "Export JSON of your record", "Dispute or request corrections"].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check size={14} style={{ color: "var(--verified-fg)" }} />{t}</li>
            ))}
          </ul>
          <button type="button" disabled={exporting} onClick={downloadExport}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-medium border inline-flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ borderColor: "var(--line)" }}>
            <Download size={16} /> {exporting ? "Exporting…" : "Export verified record"}
          </button>
          <p className="text-[11px] opacity-50 mt-2">{EXPORT_DISCLAIMER}</p>
        </Card>

        <Card className="p-6 flex flex-col border-2" style={{ borderColor: paid ? "var(--verified-fg)" : "var(--line)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Globe size={20} style={{ color: "var(--accent)" }} />
            <h3 className="font-semibold text-lg">Paid — passport</h3>
            {paid && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>Active</span>}
          </div>
          <p className="text-[13px] opacity-70 mb-4 flex-1">
            <strong>Value-add:</strong> active, shareable, recruiter-facing verified passport at{" "}
            <code className="text-[12px]">/p/verify/…</code>. Not required to access your raw record — that stays free.
          </p>
          <ul className="text-[13px] space-y-2 mb-4">
            {["Live share link for recruiters", "Verified-only public view", "Trial included after departure"].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check size={14} style={{ color: "var(--accent)" }} />{t}</li>
            ))}
          </ul>
          {paid ? (
            <p className="text-[13px] font-medium" style={{ color: "var(--verified-fg)" }}>You have the paid passport plan (mock).</p>
          ) : (
            <button type="button" disabled={subscribing} onClick={mockSubscribe}
              className="w-full px-4 py-2.5 rounded-xl text-sm font-medium text-white inline-flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: "var(--accent)" }}>
              <CreditCard size={16} /> {subscribing ? "Processing…" : "Subscribe — $9/mo (mock)"}
            </button>
          )}
          {!paid && onTrial && (
            <p className="text-[11px] opacity-50 mt-2">Trial includes passport preview until {trialEndsAt ? new Date(trialEndsAt).toLocaleDateString() : "trial end"}.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
