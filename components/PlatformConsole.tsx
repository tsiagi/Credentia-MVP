"use client";

import React, { useMemo, useState } from "react";
import {
  ShieldCheck, Building2, Plus, Users, Mail, Upload, UserPlus,
  ChevronDown, Check, X, AlertTriangle, ClipboardList, Link2,
} from "lucide-react";
import {
  SAMPLE_SUPERADMIN_CSV, parseSimpleCsv, validateSimpleRows, buildBatchResult,
  type ImportBatchResult,
} from "@/lib/csv-import-mock";

/** Platform operator view — administrative records only, no AI inference. */

type OrgStatus = "provisioning" | "active" | "suspended";
type IntegrationSource = "manual" | "csv" | "scim" | "okta" | "none";

type MockTenant = {
  id: string;
  name: string;
  status: OrgStatus;
  plan: string;
  headcount: number;
  integrationSource: IntegrationSource;
  adminEmail: string;
  recentBatches: ImportBatchResult[];
};

const INITIAL_TENANTS: MockTenant[] = [
  { id: "t1", name: "Demo Corp", status: "active", plan: "Enterprise", headcount: 24, integrationSource: "okta", adminEmail: "admin@demo.corp.com", recentBatches: [] },
  { id: "t2", name: "Acme Industries", status: "provisioning", plan: "Growth", headcount: 0, integrationSource: "manual", adminEmail: "ops@acme.com", recentBatches: [] },
  { id: "t3", name: "Northwind Logistics", status: "active", plan: "Enterprise", headcount: 156, integrationSource: "csv", adminEmail: "hr@northwind.io", recentBatches: [] },
  { id: "t4", name: "Globex Partners", status: "active", plan: "Growth", headcount: 42, integrationSource: "scim", adminEmail: "it@globex.co", recentBatches: [] },
  { id: "t5", name: "Initech LLC", status: "suspended", plan: "Growth", headcount: 18, integrationSource: "manual", adminEmail: "admin@initech.com", recentBatches: [] },
];

function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-2xl border ${className}`} style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "0 1px 2px rgba(0,0,0,.04)", ...style }}>
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

function StatusPill({ status }: { status: OrgStatus }) {
  const styles: Record<OrgStatus, { bg: string; fg: string; label: string }> = {
    provisioning: { bg: "var(--accent-soft)", fg: "var(--accent)", label: "Provisioning" },
    active: { bg: "var(--verified-bg)", fg: "var(--verified-fg)", label: "Active" },
    suspended: { bg: "var(--warn-bg)", fg: "var(--warn)", label: "Suspended" },
  };
  const s = styles[status];
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

function IntegrationLabel({ source }: { source: IntegrationSource }) {
  const labels: Record<IntegrationSource, string> = {
    manual: "Manual", csv: "CSV import", scim: "SCIM", okta: "Okta SSO", none: "None",
  };
  return <span className="text-[13px] opacity-80">{labels[source]}</span>;
}

function TenantIntegratePanel({ tenant, onUpdate }: { tenant: MockTenant; onUpdate: (t: MockTenant) => void }) {
  const [tab, setTab] = useState<"individual" | "bulk">("individual");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("Employee");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof validateSimpleRows> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  }

  function addIndividual(e: React.FormEvent) {
    e.preventDefault();
    if (!userName.trim() || !userEmail.trim()) return;
    onUpdate({
      ...tenant,
      headcount: tenant.headcount + 1,
      integrationSource: tenant.integrationSource === "none" ? "manual" : tenant.integrationSource,
      recentBatches: [
        {
          id: `batch-${Date.now()}`,
          rowCount: 1,
          successCount: 1,
          errorCount: 0,
          errors: [],
          createdAt: new Date().toISOString(),
        },
        ...tenant.recentBatches,
      ].slice(0, 5),
    });
    flash(`Added ${userName} to ${tenant.name} (mock — audit logged).`);
    setUserName("");
    setUserEmail("");
  }

  function loadSampleCsv() {
    setCsvText(SAMPLE_SUPERADMIN_CSV);
    const rows = parseSimpleCsv(SAMPLE_SUPERADMIN_CSV);
    setPreview(validateSimpleRows(rows));
  }

  function handleCsvChange(text: string) {
    setCsvText(text);
    if (text.trim()) {
      setPreview(validateSimpleRows(parseSimpleCsv(text)));
    } else {
      setPreview(null);
    }
  }

  function runBulkImport() {
    if (!preview?.length) return;
    const batch = buildBatchResult(preview);
    onUpdate({
      ...tenant,
      headcount: tenant.headcount + batch.successCount,
      integrationSource: "csv",
      recentBatches: [batch, ...tenant.recentBatches].slice(0, 5),
    });
    flash(`Import complete: ${batch.successCount} succeeded, ${batch.errorCount} failed (mock).`);
    setCsvText("");
    setPreview(null);
  }

  return (
    <div className="mt-4 pt-4 border-t space-y-4" style={{ borderColor: "var(--line)" }}>
      {notice && (
        <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{notice}</p>
      )}

      <div className="flex gap-2 flex-wrap">
        {(["individual", "bulk"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium capitalize"
            style={{ background: tab === t ? "var(--accent)" : "var(--surface-2)", color: tab === t ? "#fff" : "var(--ink-2)" }}>
            {t === "individual" ? "Add user" : "Bulk CSV"}
          </button>
        ))}
      </div>

      {tab === "individual" && (
        <form onSubmit={addIndividual} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <input required placeholder="Full name" value={userName} onChange={(e) => setUserName(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm min-w-0" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />
          <input required type="email" placeholder="email@company.com" value={userEmail} onChange={(e) => setUserEmail(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm min-w-0" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />
          <select value={userRole} onChange={(e) => setUserRole(e.target.value)} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)" }}>
            {["Employee", "Manager", "Executive", "Admin"].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button type="submit" className="px-4 py-2 rounded-xl text-sm font-medium text-white inline-flex items-center justify-center gap-2" style={{ background: "var(--accent)" }}>
            <UserPlus size={16} /> Add to tenant
          </button>
        </form>
      )}

      {tab === "bulk" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadSampleCsv} className="text-[13px] font-medium px-3 py-1.5 rounded-lg border inline-flex items-center gap-1.5" style={{ borderColor: "var(--line)", color: "var(--accent)" }}>
              <Upload size={14} /> Load sample CSV
            </button>
            <span className="text-[12px] opacity-60 self-center">Columns: name, email, role, department</span>
          </div>
          <textarea value={csvText} onChange={(e) => handleCsvChange(e.target.value)} rows={5} placeholder="Paste CSV here…"
            className="w-full px-3 py-2 rounded-xl border text-[13px] font-mono resize-y min-h-[100px]" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />

          {preview && preview.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--line)" }}>
                <table className="w-full text-[13px] text-left min-w-[480px]">
                  <thead>
                    <tr className="border-b opacity-60 text-[11px] uppercase tracking-widest" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                      <th className="py-2 px-3 font-medium">Row</th>
                      <th className="py-2 px-3 font-medium">Name</th>
                      <th className="py-2 px-3 font-medium">Email</th>
                      <th className="py-2 px-3 font-medium">Role</th>
                      <th className="py-2 px-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r) => (
                      <tr key={r.rowNum} className="border-b" style={{ borderColor: "var(--line)" }}>
                        <td className="py-2 px-3 opacity-60">{r.rowNum}</td>
                        <td className="py-2 px-3">{r.name || "—"}</td>
                        <td className="py-2 px-3">{r.email || "—"}</td>
                        <td className="py-2 px-3">{r.role || "—"}</td>
                        <td className="py-2 px-3">
                          {r.valid ? (
                            <span className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: "var(--verified-fg)" }}><Check size={14} /> OK</span>
                          ) : (
                            <span className="inline-flex items-start gap-1 text-[12px]" style={{ color: "var(--warn)" }}>
                              <X size={14} className="shrink-0 mt-0.5" /> {r.errors.join("; ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={runBulkImport} disabled={!preview.some((r) => r.valid)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white inline-flex items-center gap-2 disabled:opacity-40"
                style={{ background: "var(--accent)" }}>
                <Upload size={16} /> Import valid rows ({preview.filter((r) => r.valid).length})
              </button>
            </>
          )}
        </div>
      )}

      {tenant.recentBatches.length > 0 && (
        <div>
          <div className="text-[12px] uppercase tracking-widest opacity-60 mb-2">Recent import batches</div>
          <div className="space-y-2">
            {tenant.recentBatches.map((b) => (
              <div key={b.id} className="text-[13px] px-3 py-2 rounded-lg flex flex-wrap gap-x-4 gap-y-1" style={{ background: "var(--surface-2)" }}>
                <span><strong>{b.successCount}</strong> / {b.rowCount} imported</span>
                {b.errorCount > 0 && <span style={{ color: "var(--warn)" }}>{b.errorCount} errors</span>}
                <span className="opacity-50">{new Date(b.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PlatformConsole() {
  const [tenants, setTenants] = useState(INITIAL_TENANTS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showProvision, setShowProvision] = useState(false);
  const [provName, setProvName] = useState("");
  const [provPlan, setProvPlan] = useState("Growth");
  const [provAdminEmail, setProvAdminEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const stats = useMemo(() => ({
    total: tenants.length,
    active: tenants.filter((t) => t.status === "active").length,
    provisioning: tenants.filter((t) => t.status === "provisioning").length,
  }), [tenants]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 5000);
  }

  function provisionCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!provName.trim() || !provAdminEmail.trim()) return;
    const newTenant: MockTenant = {
      id: `t-${Date.now()}`,
      name: provName.trim(),
      status: "provisioning",
      plan: provPlan,
      headcount: 0,
      integrationSource: "manual",
      adminEmail: provAdminEmail.trim(),
      recentBatches: [],
    };
    setTenants((prev) => [newTenant, ...prev]);
    flash(`Created "${provName}" in provisioning. Invite sent to ${provAdminEmail} (mock — audit logged).`);
    setProvName("");
    setProvAdminEmail("");
    setShowProvision(false);
  }

  function updateTenant(updated: MockTenant) {
    setTenants((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h2 className="serif text-2xl font-semibold">Platform Console</h2>
          <AdminFactTag />
        </div>
        <p className="text-[14px] opacity-60 max-w-3xl">
          Tenant provisioning, integration setup, and bulk data loads. All actions are administrative records — not AI inference.
        </p>
      </div>

      {/* Audit notice */}
      <Card className="p-4 sm:p-5" style={{ background: "var(--warn-bg)" }}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" style={{ color: "var(--warn)" }} />
          <div>
            <div className="font-semibold text-[14px]">Audit trail active</div>
            <p className="text-[13px] opacity-80 mt-0.5">
              Every action in this console — provisioning, invites, user adds, CSV imports — is written to <code className="text-[12px]">audit_log</code> with actor, target, and timestamp. Mock UI for now; wire to <code className="text-[12px]">writeAuditLog</code> when connected live.
            </p>
          </div>
        </div>
      </Card>

      {notice && (
        <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{notice}</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Total tenants", value: String(stats.total) },
          { label: "Active", value: String(stats.active) },
          { label: "Provisioning", value: String(stats.provisioning) },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-[11px] uppercase tracking-widest opacity-60">{s.label}</div>
            <div className="text-2xl font-semibold serif mt-1">{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Provision new company */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Plus size={18} style={{ color: "var(--accent)" }} />
            <h3 className="font-semibold">Provision new company</h3>
            <AdminFactTag />
          </div>
          {!showProvision && (
            <button type="button" onClick={() => setShowProvision(true)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white inline-flex items-center gap-2 shrink-0"
              style={{ background: "var(--accent)" }}>
              <Building2 size={16} /> New tenant
            </button>
          )}
        </div>
        {showProvision && (
          <form onSubmit={provisionCompany} className="space-y-3">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <label className="block text-[13px]">
                <span className="opacity-70">Company name</span>
                <input required value={provName} onChange={(e) => setProvName(e.target.value)} placeholder="Acme Industries"
                  className="mt-1 w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />
              </label>
              <label className="block text-[13px]">
                <span className="opacity-70">Plan</span>
                <select value={provPlan} onChange={(e) => setProvPlan(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)" }}>
                  {["Growth", "Enterprise", "Pilot"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="block text-[13px] sm:col-span-2 lg:col-span-1">
                <span className="opacity-70">Admin contact email</span>
                <input required type="email" value={provAdminEmail} onChange={(e) => setProvAdminEmail(e.target.value)} placeholder="admin@acme.com"
                  className="mt-1 w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />
              </label>
            </div>
            <p className="text-[12px] opacity-60">Creates org with status <strong>provisioning</strong> and sends first company-admin invite (mock).</p>
            <div className="flex gap-2 flex-wrap">
              <button type="submit" className="px-4 py-2 rounded-xl text-sm font-medium text-white inline-flex items-center gap-2" style={{ background: "var(--accent)" }}>
                <Mail size={16} /> Create & invite admin
              </button>
              <button type="button" onClick={() => setShowProvision(false)} className="px-4 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: "var(--line)" }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Card>

      {/* Tenant list */}
      <Card className="p-5 sm:p-6 overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={18} style={{ color: "var(--accent)" }} />
          <h3 className="font-semibold">All companies</h3>
          <AdminFactTag />
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-[13px] text-left">
            <thead>
              <tr className="border-b opacity-60 text-[11px] uppercase tracking-widest" style={{ borderColor: "var(--line)" }}>
                <th className="py-2 pr-4 font-medium">Company</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Plan</th>
                <th className="py-2 pr-4 font-medium">Headcount</th>
                <th className="py-2 pr-4 font-medium">Integration</th>
                <th className="py-2 pr-4 font-medium">Admin</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <React.Fragment key={t.id}>
                  <tr className="border-b" style={{ borderColor: "var(--line)" }}>
                    <td className="py-3 pr-4 font-medium">{t.name}</td>
                    <td className="py-3 pr-4"><StatusPill status={t.status} /></td>
                    <td className="py-3 pr-4">{t.plan}</td>
                    <td className="py-3 pr-4"><span className="inline-flex items-center gap-1"><Users size={13} className="opacity-50" />{t.headcount}</span></td>
                    <td className="py-3 pr-4"><IntegrationLabel source={t.integrationSource} /></td>
                    <td className="py-3 pr-4 opacity-80 text-[12px]">{t.adminEmail}</td>
                    <td className="py-3">
                      <button type="button" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                        className="text-[12px] font-medium px-2 py-1 rounded-lg border inline-flex items-center gap-1" style={{ borderColor: "var(--line)", color: "var(--accent)" }}>
                        <Link2 size={13} /> Integrate data
                      </button>
                    </td>
                  </tr>
                  {expandedId === t.id && (
                    <tr>
                      <td colSpan={7} className="pb-4 px-2">
                        <TenantIntegratePanel tenant={t} onUpdate={updateTenant} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile / tablet cards */}
        <div className="lg:hidden space-y-2">
          {tenants.map((t) => {
            const open = expandedId === t.id;
            return (
              <div key={t.id} className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                <button type="button" className="w-full text-left p-4 flex items-center justify-between gap-2" onClick={() => setExpandedId(open ? null : t.id)}>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="text-[12px] opacity-60 mt-0.5">{t.plan} · {t.headcount} people · <IntegrationLabel source={t.integrationSource} /></div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusPill status={t.status} />
                    <ChevronDown size={16} className={`opacity-50 transition ${open ? "rotate-180" : ""}`} />
                  </div>
                </button>
                {open && (
                  <div className="px-4 pb-4 border-t" style={{ borderColor: "var(--line)" }}>
                    <div className="text-[13px] py-3 space-y-1 opacity-80">
                      <div><ClipboardList size={13} className="inline mr-1 opacity-50" /> Admin: {t.adminEmail}</div>
                    </div>
                    <TenantIntegratePanel tenant={t} onUpdate={updateTenant} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
