"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Building2, Mail, Palette, ArrowRight } from "lucide-react";
import { PageHeader, Card, Button, useToast } from "@/components/ui";
import { PlatformBillingSection } from "@/components/PlatformBillingSection";
import { useAdminSession } from "@/lib/admin/use-session";
import { createCompany } from "@/lib/admin/companies";

const inputCls = "w-full px-3 py-2 rounded-xl border text-sm";

function AddCompanyCard({ token, onCreated }: { token: string; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("Growth");
  const [adminEmail, setAdminEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { orgId } = await createCompany(token, { name: name.trim(), plan, adminEmail: adminEmail.trim() || undefined });
      toast.success(`Created "${name.trim()}" (provisioning). Invite to ${adminEmail || "admin"} — audit logged.`);
      setName(""); setAdminEmail("");
      onCreated();
      return orgId;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create company.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="md">
      <div className="flex items-center gap-2 mb-1">
        <Building2 size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">Add a new company</h3>
      </div>
      <p className="text-[13px] mb-4" style={{ color: "var(--ink-3)" }}>
        Creates the tenant in <strong>provisioning</strong> and sends the first company-admin invite.
      </p>
      <form onSubmit={submit} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <input className={inputCls} style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} required />
        <select className={inputCls} style={{ borderColor: "var(--line)" }} value={plan} onChange={(e) => setPlan(e.target.value)}>
          {["Pilot", "Growth", "Enterprise"].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input className={inputCls} style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} type="email" placeholder="admin@company.com" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
        <Button type="submit" leadingIcon={<Mail size={15} />} loading={saving}>Create &amp; invite</Button>
      </form>
    </Card>
  );
}

export default function SuperadminOrgControls() {
  const { token, ready } = useAdminSession();
  // Bump to re-mount billing section after a company is created.
  const [version, setVersion] = useState(0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Org Controls"
        subtitle="Add companies, set subscription tiers and cost, and manage per-company branding."
      />

      {ready && token && <AddCompanyCard token={token} onCreated={() => setVersion((v) => v + 1)} />}

      {/* Per-company branding pointer */}
      <Card padding="md">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl" style={{ background: "var(--accent-soft)" }}>
              <Palette size={18} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <h3 className="font-semibold">Per-company branding</h3>
              <p className="text-[13px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                Logo and accent colour are configured per tenant in the company drill-in.
              </p>
            </div>
          </div>
          <Link href="/superadmin/companies" className="inline-flex items-center gap-1.5 text-[13px] font-medium shrink-0" style={{ color: "var(--accent-text)" }}>
            Open Companies <ArrowRight size={15} />
          </Link>
        </div>
      </Card>

      {/* Subscription tiers & cost (seats × price, trials, mock charges) */}
      <div>
        <h2 className="text-[15px] font-semibold mb-1">Subscription tiers &amp; cost</h2>
        <p className="text-[12px] mb-3" style={{ color: "var(--ink-3)" }}>
          Cost scales with employee count (seats × per-seat price). Card data is never stored — real charges run
          through Stripe later.
        </p>
        <PlatformBillingSection key={version} />
      </div>
    </div>
  );
}
