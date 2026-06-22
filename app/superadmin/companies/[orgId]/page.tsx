"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, Users, Sparkles, Workflow, Receipt, KeyRound, Copy, RefreshCw } from "lucide-react";
import { PageHeader, Card, Button, Badge, useToast } from "@/components/ui";
import { BrandingCard } from "@/components/admin/BrandingCard";
import { SubscriptionBadge } from "@/components/admin/SubscriptionBadge";
import { useAdminSession } from "@/lib/admin/use-session";
import {
  fetchCompany, updateCompany,
  type CompanyProfile, type CompanyPatch, type CompanyDetail,
} from "@/lib/admin/companies";
import { revealScimSecret, rotateScimSecret } from "@/lib/admin/scim";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[13px]">
      <span style={{ color: "var(--ink-3)" }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls = "w-full px-3 py-2 rounded-xl border text-sm";
const inputStyle = { borderColor: "var(--line)", background: "var(--surface-2)" } as React.CSSProperties;

function ProfileEditor({ company, token, onSaved }: { company: CompanyProfile; token: string; onSaved: (c: CompanyProfile) => void }) {
  const toast = useToast();
  const [name, setName] = useState(company.name);
  const [plan, setPlan] = useState(company.plan ?? "");
  const [status, setStatus] = useState(company.status);
  const [ssoProvider, setSsoProvider] = useState(company.sso_provider ?? "none");
  const [ssoDomain, setSsoDomain] = useState(company.sso_domain ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const patch: CompanyPatch = { name, plan: plan || null, status, sso_provider: ssoProvider, sso_domain: ssoDomain || null };
    try {
      await updateCompany(token, company.id, patch);
      onSaved({ ...company, ...patch });
      toast.success("Company profile saved — audit logged.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="md">
      <h3 className="font-semibold mb-4">Company profile</h3>
      <form onSubmit={save} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Company name">
            <input className={inputCls} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Plan">
            <select className={inputCls} style={{ borderColor: "var(--line)" }} value={plan} onChange={(e) => setPlan(e.target.value)}>
              {["", "Pilot", "Growth", "Enterprise"].map((p) => <option key={p} value={p}>{p || "Unassigned"}</option>)}
            </select>
          </Field>
          <Field label="Lifecycle status">
            <select className={inputCls} style={{ borderColor: "var(--line)" }} value={status} onChange={(e) => setStatus(e.target.value)}>
              {["provisioning", "active", "suspended"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="SSO provider">
            <select className={inputCls} style={{ borderColor: "var(--line)" }} value={ssoProvider} onChange={(e) => setSsoProvider(e.target.value)}>
              {["none", "okta", "azure", "google"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="SSO email domain">
            <input className={inputCls} style={inputStyle} value={ssoDomain} onChange={(e) => setSsoDomain(e.target.value)} placeholder="acme.com" />
          </Field>
        </div>
        <Button type="submit" leadingIcon={<Save size={15} />} loading={saving}>Save profile</Button>
      </form>
    </Card>
  );
}

function ReadonlyRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg" style={{ background: "var(--surface-2)" }}>
      <div className="min-w-0">
        <div className="core-roborate-eyebrow mb-0.5">{label}</div>
        <div className="font-mono text-[12px] truncate" style={{ color: "var(--ink)" }}>{value}</div>
      </div>
      <Button variant="ghost" size="sm" leadingIcon={<Copy size={14} />} onClick={onCopy}>Copy</Button>
    </div>
  );
}

function ScimCard({ orgId, token }: { orgId: string; token: string }) {
  const toast = useToast();
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "reveal" | "rotate">(null);
  const endpoint = (typeof window !== "undefined" ? window.location.origin : "") + "/api/provision/scim";

  function copy(value: string, label: string) {
    navigator.clipboard?.writeText(value);
    toast.success(`${label} copied`);
  }
  async function reveal() {
    setBusy("reveal");
    try {
      setSecret((await revealScimSecret(token, orgId)).secret);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reveal secret");
    } finally {
      setBusy(null);
    }
  }
  async function rotate() {
    if (!window.confirm("Rotate this org's SCIM token? The current token stops working immediately — you must update Okta with the new one.")) return;
    setBusy("rotate");
    try {
      setSecret((await rotateScimSecret(token, orgId)).secret);
      toast.success("SCIM token rotated — update Okta. Audit logged.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rotate secret");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card padding="md">
      <div className="flex items-center gap-2 mb-3">
        <KeyRound size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">SCIM provisioning (Okta)</h3>
      </div>
      <p className="text-[12px] mb-3" style={{ color: "var(--ink-3)" }}>
        Point the Okta SCIM app at the endpoint below. Each tenant has its own secret, encrypted at rest — reveal or rotate it here. Both actions are audit-logged.
      </p>
      <div className="space-y-2 text-[13px]">
        <ReadonlyRow label="SCIM endpoint URL" value={endpoint} onCopy={() => copy(endpoint, "Endpoint URL")} />
        <ReadonlyRow label="Header" value={`x-org-id: ${orgId}`} onCopy={() => copy(orgId, "Org ID")} />
        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg" style={{ background: "var(--surface-2)" }}>
          <div className="min-w-0">
            <div className="core-roborate-eyebrow mb-0.5">Bearer token</div>
            <div className="font-mono text-[12px] truncate" style={{ color: "var(--ink)" }}>
              {secret ?? "•••••••••••••••••• (hidden)"}
            </div>
          </div>
          {secret ? (
            <Button variant="secondary" size="sm" leadingIcon={<Copy size={14} />} onClick={() => copy(secret, "Token")}>Copy</Button>
          ) : (
            <Button variant="secondary" size="sm" loading={busy === "reveal"} onClick={reveal}>Reveal</Button>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="ghost" size="sm" leadingIcon={<RefreshCw size={14} />} loading={busy === "rotate"} onClick={rotate}>Rotate token</Button>
        {secret && <span className="text-[11px]" style={{ color: "var(--warn-fg)" }}>Sensitive — hidden again when you leave this page.</span>}
      </div>
    </Card>
  );
}

function AccountBadge({ status }: { status: string }) {
  if (status === "active_sso" || status === "active") return <Badge tone="success">Active</Badge>;
  if (status === "active_invited" || status === "invited") return <Badge tone="accent">Invited</Badge>;
  if (status.startsWith("former_")) return <Badge tone="neutral">Former</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

export default function CompanyDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const { token, ready } = useAdminSession();
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const company = detail?.company ?? null;

  useEffect(() => {
    if (!ready || !token) return;
    fetchCompany(token, orgId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load company"));
  }, [ready, token, orgId]);

  function setCompany(updater: (c: CompanyProfile) => CompanyProfile) {
    setDetail((d) => (d ? { ...d, company: updater(d.company) } : d));
  }

  async function saveBranding(patch: { logo_url?: string; brand_color?: string }) {
    if (!token) throw new Error("Not signed in");
    await updateCompany(token, orgId, patch);
    setCompany((c) => ({ ...c, ...patch }));
  }

  return (
    <div className="space-y-6">
      <Link href="/superadmin/companies" className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: "var(--accent-text)" }}>
        <ArrowLeft size={15} /> All companies
      </Link>

      {error && (
        <Card padding="md" style={{ background: "var(--warn-bg)" }}>
          <p className="text-[13px]" style={{ color: "var(--warn-fg)" }}>{error}</p>
        </Card>
      )}

      {!company ? (
        <Card padding="lg"><p className="text-[13px]" style={{ color: "var(--ink-3)" }}>Loading company…</p></Card>
      ) : (
        <>
          <PageHeader
            eyebrow="Company"
            title={company.name}
            subtitle={
              <span className="inline-flex items-center gap-2">
                <SubscriptionBadge status={company.billing_status} plan={company.plan} />
                <span className="inline-flex items-center gap-1"><Users size={13} /> {company.userCount} users</span>
              </span>
            }
          />

          <ProfileEditor company={company} token={token!} onSaved={(c) => setCompany(() => c)} />

          <BrandingCard
            logoUrl={company.logo_url}
            brandColor={company.brand_color}
            onSave={saveBranding}
            description="Logo and accent colour shown in this company's app shell."
          />

          <Card padding="md">
            <h3 className="font-semibold mb-3">Subscription</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[13px]">
              {[
                ["Status", <SubscriptionBadge key="s" status={company.billing_status} />],
                ["Seats", company.seats ?? "—"],
                ["Monthly price", company.monthly_price != null ? `$${company.monthly_price}` : "—"],
                ["Trial ends", company.trial_ends_at ? new Date(company.trial_ends_at).toLocaleDateString() : "—"],
              ].map(([label, value], i) => (
                <div key={i}>
                  <div className="core-roborate-eyebrow mb-1">{label as string}</div>
                  <div className="font-medium" style={{ color: "var(--ink)" }}>{value as React.ReactNode}</div>
                </div>
              ))}
            </div>
            <p className="text-[12px] mt-3" style={{ color: "var(--ink-3)" }}>
              Adjust tier and cost (seats × price, trials, mock charges) in{" "}
              <Link href="/superadmin/org-controls" className="font-medium" style={{ color: "var(--accent-text)" }}>Org Controls</Link>.
            </p>
          </Card>

          {/* AI usage (inference artifacts — amber) */}
          <Card padding="md" style={{ background: "var(--inferred-bg)" }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles size={18} style={{ color: "var(--inferred-fg)" }} />
                <h3 className="font-semibold">AI insight usage</h3>
                <Badge tone="inferred" icon={<Sparkles size={11} />}>AI usage</Badge>
              </div>
              <span className="text-2xl font-semibold serif tabular" style={{ color: "var(--ink)" }}>
                {detail?.aiUsageCount ?? 0}
              </span>
            </div>
            <p className="text-[12px] mt-1" style={{ color: "var(--ink-3)" }}>
              Count of AI-produced artifacts for this company — usage signal, never a verified fact.
            </p>
          </Card>

          {/* People */}
          <Card padding="none" className="overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: "var(--line)" }}>
              <Users size={16} style={{ color: "var(--accent)" }} />
              <h3 className="text-[15px] font-semibold">People</h3>
              <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>{detail?.people.length ?? 0}</span>
            </div>
            {detail && detail.people.length === 0 ? (
              <p className="px-5 py-6 text-[13px]" style={{ color: "var(--ink-3)" }}>
                No people yet — add some from <Link href="/superadmin/integration" className="font-medium" style={{ color: "var(--accent-text)" }}>Integration</Link>.
              </p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--line)" }}>
                {(detail?.people ?? []).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>{p.full_name || "Unnamed"}</div>
                      <div className="text-[12px] capitalize" style={{ color: "var(--ink-3)" }}>{p.role}{p.title ? ` · ${p.title}` : ""}</div>
                    </div>
                    <AccountBadge status={p.account_status} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Integrations */}
          <Card padding="md">
            <div className="flex items-center gap-2 mb-3">
              <Workflow size={18} style={{ color: "var(--accent)" }} />
              <h3 className="font-semibold">Integrations</h3>
            </div>
            {detail && detail.integrations.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>No connectors configured yet.</p>
            ) : (
              <div className="space-y-2">
                {(detail?.integrations ?? []).map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg" style={{ background: "var(--surface-2)" }}>
                    <span className="text-sm font-medium capitalize">{it.source}</span>
                    <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                      {it.status}{it.records_imported ? ` · ${it.records_imported} records` : ""}
                      {it.last_sync_at ? ` · synced ${new Date(it.last_sync_at).toLocaleDateString()}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* SCIM provisioning */}
          <ScimCard orgId={orgId} token={token!} />

          {/* Billing activity */}
          <Card padding="md">
            <div className="flex items-center gap-2 mb-3">
              <Receipt size={18} style={{ color: "var(--accent)" }} />
              <h3 className="font-semibold">Recent billing activity</h3>
            </div>
            {detail && detail.billingEvents.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>No billing events recorded.</p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--line)" }}>
                {(detail?.billingEvents ?? []).map((e, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                    <span className="font-medium capitalize">{e.type.replace(/_/g, " ")}</span>
                    <span style={{ color: "var(--ink-3)" }}>
                      {e.amount != null ? `$${e.amount} · ` : ""}{new Date(e.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
