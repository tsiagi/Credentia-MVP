"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  DollarSign, Clock, CreditCard, AlertTriangle, Play, FastForward, Square, Receipt,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  fetchBillingOrgs,
  postBillingAction,
  computeBillingOverview,
  type OrgBillingRow,
  type BillingStatus,
} from "@/lib/billing";

function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-2xl border p-4 sm:p-5 ${className}`} style={{ borderColor: "var(--line)", background: "var(--surface)", ...style }}>
      {children}
    </div>
  );
}

function BillingStatusPill({ status }: { status: BillingStatus }) {
  const map: Record<BillingStatus, { bg: string; fg: string; label: string }> = {
    trial: { bg: "var(--accent-soft)", fg: "var(--accent)", label: "Trial" },
    active: { bg: "var(--verified-bg)", fg: "var(--verified-fg)", label: "Active" },
    past_due: { bg: "var(--warn-bg)", fg: "var(--warn)", label: "Past due" },
    canceled: { bg: "var(--surface-2)", fg: "var(--ink-2)", label: "Canceled" },
  };
  const s = map[status] ?? map.trial;
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.fg }}>{s.label}</span>
  );
}

function TenantBillingControls({ org, onUpdated }: { org: OrgBillingRow; onUpdated: () => void }) {
  const [price, setPrice] = useState(String(org.monthly_price ?? ""));
  const [seats, setSeats] = useState(String(org.seats ?? ""));
  const [status, setStatus] = useState<BillingStatus>(org.billing_status);
  const [trialDays, setTrialDays] = useState("30");
  const [extendDays, setExtendDays] = useState("14");
  const [mockAmount, setMockAmount] = useState(String(org.monthly_price ?? "99"));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: Parameters<typeof postBillingAction>[1]) {
    setBusy(true);
    setNotice(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in again.");
      await postBillingAction(session.access_token, action);
      setNotice("Saved — billing event recorded and audit logged.");
      onUpdated();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Action failed — run migrate-batch-ef.sql on remote DB.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t space-y-4" style={{ borderColor: "var(--line)" }}>
      {notice && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{notice}</p>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[13px]">
        <div><span className="opacity-60 block text-[11px] uppercase tracking-widest">Trial start</span>{org.trial_starts_at ? new Date(org.trial_starts_at).toLocaleDateString() : "—"}</div>
        <div><span className="opacity-60 block text-[11px] uppercase tracking-widest">Trial end</span>{org.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString() : "—"}</div>
        <div><span className="opacity-60 block text-[11px] uppercase tracking-widest">Status</span><BillingStatusPill status={org.billing_status} /></div>
        <div><span className="opacity-60 block text-[11px] uppercase tracking-widest">MRR (list)</span>${org.monthly_price ?? "—"}/mo · {org.seats ?? "—"} seats</div>
      </div>

      <div>
        <div className="text-[12px] uppercase tracking-widest opacity-60 mb-2">Plan</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Monthly price" type="number" min="0" step="1"
            className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />
          <input value={seats} onChange={(e) => setSeats(e.target.value)} placeholder="Seats" type="number" min="1"
            className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />
          <select value={status} onChange={(e) => setStatus(e.target.value as BillingStatus)} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)" }}>
            {(["trial", "active", "past_due", "canceled"] as const).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={() => run({ action: "set_plan", orgId: org.id, monthlyPrice: Number(price) || 0, seats: Number(seats) || 0, billingStatus: status })}
            className="px-3 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
            Save plan
          </button>
        </div>
      </div>

      <div>
        <div className="text-[12px] uppercase tracking-widest opacity-60 mb-2">Trial controls</div>
        <div className="flex flex-wrap gap-2">
          <input value={trialDays} onChange={(e) => setTrialDays(e.target.value)} type="number" min="1" className="w-20 px-2 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)" }} />
          <button type="button" disabled={busy} onClick={() => run({ action: "start_trial", orgId: org.id, trialDays: Number(trialDays) || 30 })}
            className="px-3 py-2 rounded-xl text-[13px] font-medium border inline-flex items-center gap-1" style={{ borderColor: "var(--line)" }}>
            <Play size={14} /> Start trial
          </button>
          <input value={extendDays} onChange={(e) => setExtendDays(e.target.value)} type="number" min="1" className="w-20 px-2 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)" }} />
          <button type="button" disabled={busy} onClick={() => run({ action: "extend_trial", orgId: org.id, extraDays: Number(extendDays) || 14 })}
            className="px-3 py-2 rounded-xl text-[13px] font-medium border inline-flex items-center gap-1" style={{ borderColor: "var(--line)" }}>
            <FastForward size={14} /> Extend trial
          </button>
          <button type="button" disabled={busy} onClick={() => run({ action: "end_trial", orgId: org.id })}
            className="px-3 py-2 rounded-xl text-[13px] font-medium border inline-flex items-center gap-1" style={{ borderColor: "var(--line)", color: "var(--warn)" }}>
            <Square size={14} /> End trial
          </button>
        </div>
      </div>

      <div className="p-4 rounded-xl border" style={{ borderColor: "var(--warn)", background: "var(--warn-bg)" }}>
        <div className="flex items-center gap-2 mb-2">
          <Receipt size={16} style={{ color: "var(--warn)" }} />
          <span className="font-semibold text-[14px]">Record charge — MOCK (no real payment)</span>
        </div>
        <p className="text-[12px] opacity-80 mb-3">Creates a <code className="text-[11px]">charge_mocked</code> billing event only. Connect a payment processor before going live — card numbers never touch our database.</p>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={mockAmount} onChange={(e) => setMockAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="Amount"
            className="w-28 px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)" }} />
          <button type="button" disabled={busy} onClick={() => run({ action: "record_charge_mocked", orgId: org.id, amount: Number(mockAmount) || 0, detail: { label: "Mock invoice" } })}
            className="px-3 py-2 rounded-xl text-[13px] font-medium text-white disabled:opacity-60" style={{ background: "var(--warn)" }}>
            Record mock charge
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlatformBillingSection() {
  const [orgs, setOrgs] = useState<OrgBillingRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      setOrgs(await fetchBillingOrgs(session.access_token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load billing data.");
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const overview = computeBillingOverview(orgs);

  return (
    <div className="space-y-6">
      <Card className="" style={{ background: "var(--warn-bg)" }}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" style={{ color: "var(--warn)" }} />
          <div>
            <div className="font-semibold">Mock billing — connect a payment processor before going live</div>
            <p className="text-[13px] opacity-80 mt-1">All charges here are ledger entries only. Real card data is handled by Stripe (or similar) later — never stored in Credentia.</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total companies", value: String(overview.totalCompanies), icon: DollarSign },
          { label: "On trial", value: String(overview.onTrial), icon: Clock },
          { label: "Active", value: String(overview.active), icon: CreditCard },
          { label: "Mocked MRR", value: `$${overview.mockedMrr.toLocaleString()}`, icon: Receipt },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <div className="flex items-center gap-2 mb-1"><Icon size={16} style={{ color: "var(--accent)" }} /><span className="text-[11px] uppercase tracking-widest opacity-60">{s.label}</span></div>
              <div className="text-2xl font-semibold serif">{s.value}</div>
            </Card>
          );
        })}
      </div>

      <Card>
        <h3 className="font-semibold mb-1">Per-company billing</h3>
        <p className="text-[13px] opacity-60 mb-4">Set plans, control trials, and record mock charges. Each action appends a row to <code className="text-[12px]">billing_events</code> and the audit log.</p>
        {loading ? <p className="text-sm opacity-60">Loading…</p> : error ? (
          <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>
        ) : orgs.length === 0 ? (
          <p className="text-sm opacity-60">No organizations in database yet — provision a company first.</p>
        ) : (
          <div className="space-y-2">
            {orgs.map((org) => {
              const open = expandedId === org.id;
              return (
                <div key={org.id} className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                  <button type="button" className="w-full text-left p-4 flex items-center justify-between gap-3" onClick={() => setExpandedId(open ? null : org.id)}>
                    <div>
                      <div className="font-medium">{org.name}</div>
                      <div className="text-[12px] opacity-60 mt-0.5">${org.monthly_price ?? "—"}/mo · {org.seats ?? "—"} seats</div>
                    </div>
                    <BillingStatusPill status={org.billing_status} />
                  </button>
                  {open && <div className="px-4 pb-4"><TenantBillingControls org={org} onUpdated={reload} /></div>}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
