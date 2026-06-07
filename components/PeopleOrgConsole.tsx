"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  ShieldCheck, Users, Mail, GitBranch, Clock, Check, X, Link2, UserPlus,
  Building2, ChevronDown, Upload, Download, Briefcase, UserMinus, Trash2,
} from "lucide-react";
import {
  SAMPLE_PEOPLE_CSV, parsePeopleCsv, validatePeopleRows, buildBatchResult,
} from "@/lib/csv-import-mock";
import {
  connectWorkdayIntegration,
  fetchRemovalRequests,
  resolveRemovalRequest,
  buildAdminRecordCsv,
  downloadCsv,
  fetchOrgSettingsForUser,
  type RemovalRequestRow,
} from "@/lib/org-settings";
import { supabase } from "@/lib/supabase";

/** Administrative facts only — no AI inference on this screen. */

type AccountStatus = "active_sso" | "invited" | "former_trial" | "former_free" | "former_paid";

type MockPerson = {
  id: string;
  name: string;
  role: string;
  department: string;
  manager: string | null;
  accountStatus: AccountStatus;
  trialEndsAt?: string;
};

type MockMembershipRequest = {
  id: string;
  subjectName: string;
  proposedManager: string;
  requestedBy: string;
  createdAt: string;
};

const MOCK_PEOPLE: MockPerson[] = [
  { id: "1", name: "Maya Chen", role: "Employee", department: "Operations", manager: "Jordan Lee", accountStatus: "active_sso" },
  { id: "2", name: "Jordan Lee", role: "Manager", department: "Engineering", manager: "Alex Rivera", accountStatus: "active_sso" },
  { id: "3", name: "James Okafor", role: "Employee", department: "Finance & Equity", manager: "Jordan Lee", accountStatus: "active_sso" },
  { id: "4", name: "Alex Rivera", role: "Executive", department: "People & HR", manager: null, accountStatus: "active_sso" },
  { id: "5", name: "Sam Ortiz", role: "Employee", department: "Engineering", manager: "Jordan Lee", accountStatus: "invited" },
  { id: "6", name: "Priya Nair", role: "Employee", department: "Operations", manager: "Jordan Lee", accountStatus: "former_trial", trialEndsAt: "2026-07-06" },
];

const MOCK_REQUESTS: MockMembershipRequest[] = [
  { id: "r1", subjectName: "James Okafor", proposedManager: "Alex Rivera", requestedBy: "Jordan Lee", createdAt: "2026-06-04" },
  { id: "r2", subjectName: "Sam Ortiz", proposedManager: "Jordan Lee", requestedBy: "Jordan Lee", createdAt: "2026-06-05" },
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

function StatusBadge({ status }: { status: AccountStatus }) {
  const styles: Record<AccountStatus, { bg: string; fg: string; label: string }> = {
    active_sso: { bg: "var(--verified-bg)", fg: "var(--verified-fg)", label: "Active (SSO)" },
    invited: { bg: "var(--accent-soft)", fg: "var(--accent)", label: "Invited" },
    former_trial: { bg: "var(--inferred-bg)", fg: "var(--inferred-fg)", label: "Former · trial" },
    former_free: { bg: "var(--surface-2)", fg: "var(--ink-2)", label: "Former · free" },
    former_paid: { bg: "var(--verified-bg)", fg: "var(--verified-fg)", label: "Former · paid" },
  };
  const s = styles[status];
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

export function PeopleOrgConsole({ userId }: { userId: string }) {
  const [ssoConnected, setSsoConnected] = useState(true);
  const [workdayConnected, setWorkdayConnected] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [removalQueue, setRemovalQueue] = useState<RemovalRequestRow[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [autoTrialEnabled, setAutoTrialEnabled] = useState(true);
  const [trialDays, setTrialDays] = useState(30);
  const [people, setPeople] = useState(MOCK_PEOPLE);
  const [requests, setRequests] = useState(MOCK_REQUESTS);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Employee");
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"single" | "bulk">("single");
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<ReturnType<typeof validatePeopleRows> | null>(null);
  const [lastBatch, setLastBatch] = useState<{ success: number; errors: number } | null>(null);

  const activeCount = useMemo(() => people.filter((p) => p.accountStatus === "active_sso").length, [people]);

  const reloadRemovals = useCallback(async () => {
    if (!orgId) return;
    try {
      const rows = await fetchRemovalRequests(orgId);
      setRemovalQueue(rows.filter((r) => r.status === "pending"));
    } catch {
      setRemovalQueue([]);
    }
  }, [orgId]);

  useEffect(() => {
    fetchOrgSettingsForUser(userId).then((org) => {
      if (org) {
        setOrgId(org.orgId);
        supabase.from("tenant_integrations").select("status").eq("org_id", org.orgId).eq("source", "workday").maybeSingle()
          .then(({ data }) => setWorkdayConnected(data?.status === "connected"));
      }
    }).catch(() => { /* schema may lag */ });
  }, [userId]);

  useEffect(() => {
    reloadRemovals();
  }, [reloadRemovals]);

  async function connectWorkday() {
    if (!orgId) {
      flash("Organization not linked.");
      return;
    }
    try {
      await connectWorkdayIntegration(orgId, userId);
      setWorkdayConnected(true);
      flash("Workday connected (mock) — tenant_integrations row created with source=workday.");
    } catch {
      flash("Workday connection saved locally (mock).");
      setWorkdayConnected(true);
    }
  }

  async function handleRemovalAction(id: string, action: "approved" | "rejected") {
    try {
      await resolveRemovalRequest(id, userId, action);
      if (action === "approved") {
        const req = removalQueue.find((r) => r.id === id);
        if (req) setPeople((prev) => prev.filter((p) => p.name !== req.subject_name));
        flash(`Profile removed — only company admin can delete profiles in the org.`);
      } else {
        flash("Removal request rejected.");
      }
      await reloadRemovals();
    } catch {
      flash(action === "approved" ? "Approved (mock) — run migrate-batch-cd.sql on Supabase." : "Rejected (mock).");
      setRemovalQueue((prev) => prev.filter((r) => r.id !== id));
    }
  }

  async function downloadAdminRecord() {
    if (!orgId) {
      flash("Organization not linked.");
      return;
    }
    setDownloading(true);
    try {
      const csv = await buildAdminRecordCsv(orgId);
      downloadCsv("people-admin-record.csv", csv);
      flash("People / Admin Record downloaded (roster + verification stats).");
    } catch {
      flash("Download failed — ensure org profiles exist in Supabase.");
    } finally {
      setDownloading(false);
    }
  }

  function adminDeletePerson(personId: string, name: string) {
    if (!window.confirm(`Delete ${name}? Only company admin can remove profiles — this is permanent.`)) return;
    setPeople((prev) => prev.filter((p) => p.id !== personId));
    flash(`${name} removed from org (mock). In production this deletes the profile row.`);
  }

  const knownManagerEmails = useMemo(() => {
    const emails = new Set<string>();
    for (const p of people) {
      if (p.accountStatus === "active_sso" || p.role === "Manager" || p.role === "Executive") {
        const slug = p.name.toLowerCase().replace(/\s+/g, ".");
        emails.add(`${slug}@demo.corp.com`);
      }
    }
    emails.add("jordan.lee@demo.corp.com");
    emails.add("alex.rivera@demo.corp.com");
    return emails;
  }, [people]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  }

  function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setPeople((prev) => [
      ...prev,
      {
        id: `inv-${Date.now()}`,
        name: inviteEmail.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        role: inviteRole,
        department: "—",
        manager: null,
        accountStatus: "invited",
      },
    ]);
    flash(`Invite sent to ${inviteEmail} (mock — provisioned_via=invite, audit logged).`);
    setInviteEmail("");
  }

  function loadSampleCsv() {
    setCsvText(SAMPLE_PEOPLE_CSV);
    const rows = parsePeopleCsv(SAMPLE_PEOPLE_CSV);
    setCsvPreview(validatePeopleRows(rows, knownManagerEmails));
  }

  function handleCsvChange(text: string) {
    setCsvText(text);
    if (text.trim()) {
      setCsvPreview(validatePeopleRows(parsePeopleCsv(text), knownManagerEmails));
    } else {
      setCsvPreview(null);
    }
  }

  function commitBulkImport() {
    if (!csvPreview?.length) return;
    const batch = buildBatchResult(csvPreview);
    const validRows = csvPreview.filter((r) => r.valid);
    setPeople((prev) => [
      ...prev,
      ...validRows.map((r) => ({
        id: `csv-${r.rowNum}-${Date.now()}`,
        name: r.name,
        role: r.role,
        department: r.department || "—",
        manager: r.managerEmail ? r.managerEmail.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null,
        accountStatus: "invited" as const,
      })),
    ]);
    setLastBatch({ success: batch.successCount, errors: batch.errorCount });
    flash(`Bulk import: ${batch.successCount} invitations created (provisioned_via=csv), ${batch.errorCount} rows skipped. data_import_batch recorded (mock).`);
    setCsvText("");
    setCsvPreview(null);
  }

  function approveRequest(id: string) {
    const req = requests.find((r) => r.id === id);
    if (req) {
      setPeople((prev) => prev.map((p) => (p.name === req.subjectName ? { ...p, manager: req.proposedManager } : p)));
      flash(`Approved: ${req.subjectName} → ${req.proposedManager}. Admin applied manager_id (mock).`);
    }
    setRequests((prev) => prev.filter((r) => r.id !== id));
  }

  function rejectRequest(id: string) {
    setRequests((prev) => prev.filter((r) => r.id !== id));
    flash("Request rejected (mock).");
  }

  function extendTrial(personId: string) {
    setPeople((prev) => prev.map((p) => {
      if (p.id !== personId) return p;
      const d = new Date(p.trialEndsAt ?? Date.now());
      d.setDate(d.getDate() + 30);
      return { ...p, accountStatus: "former_trial" as const, trialEndsAt: d.toISOString().slice(0, 10) };
    }));
    flash("Trial extended 30 days (mock).");
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h2 className="serif text-2xl font-semibold">People & Org</h2>
          <AdminFactTag />
        </div>
        <p className="text-[14px] opacity-60 max-w-3xl">
          Provisioning, org chart, and account lifecycle controls. SSO/SCIM is the default path; email invite is the exception.
          All data below is mock for Step 9c — administrative records, not AI inference.
        </p>
      </div>

      {notice && (
        <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{notice}</p>
      )}

      {/* SSO banner */}
      <Card className="p-5 sm:p-6" style={ssoConnected ? { background: "var(--verified-bg)" } : undefined}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl shrink-0" style={{ background: ssoConnected ? "var(--verified-fg)" : "var(--accent-soft)" }}>
              <Link2 size={20} color={ssoConnected ? "#fff" : "var(--accent)"} />
            </div>
            <div>
              <div className="font-semibold">{ssoConnected ? "Connected to Okta" : "Connect SSO"}</div>
              <p className="text-[13px] opacity-70 mt-0.5">
                {ssoConnected
                  ? "demo.corp.com · SCIM sync enabled · IdP is source of truth for profiles and manager_id from HRIS."
                  : "Connect Okta SAML/OIDC + SCIM so users provision automatically on login."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setSsoConnected(!ssoConnected); flash(ssoConnected ? "SSO disconnected (mock)." : "Okta connected (mock)."); }}
            className="px-4 py-2.5 rounded-xl text-sm font-medium shrink-0"
            style={{ background: ssoConnected ? "var(--surface)" : "var(--accent)", color: ssoConnected ? "var(--ink)" : "#fff", border: ssoConnected ? "1px solid var(--line)" : "none" }}
          >
            {ssoConnected ? "Manage connection" : "Connect SSO"}
          </button>
        </div>
      </Card>

      {/* Workday integration */}
      <Card className="p-5 sm:p-6" style={workdayConnected ? { background: "var(--verified-bg)" } : undefined}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl shrink-0" style={{ background: workdayConnected ? "var(--verified-fg)" : "var(--accent-soft)" }}>
              <Briefcase size={20} color={workdayConnected ? "#fff" : "var(--accent)"} />
            </div>
            <div>
              <div className="font-semibold">{workdayConnected ? "Connected to Workday" : "Connect Workday"}</div>
              <p className="text-[13px] opacity-70 mt-0.5">
                {workdayConnected
                  ? "HRIS sync via Workday — roster and org structure import (mock status + tenant_integrations row)."
                  : "Connect Workday alongside Okta/SCIM for workforce data provisioning."}
              </p>
            </div>
          </div>
          <button type="button" onClick={connectWorkday} disabled={workdayConnected}
            className="px-4 py-2.5 rounded-xl text-sm font-medium shrink-0 disabled:opacity-60"
            style={{ background: workdayConnected ? "var(--surface)" : "var(--accent)", color: workdayConnected ? "var(--ink)" : "#fff", border: workdayConnected ? "1px solid var(--line)" : "none" }}>
            {workdayConnected ? "Connected" : "Connect Workday"}
          </button>
        </div>
      </Card>

      {/* Admin record download */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1"><Download size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">People / Admin Record</h3><AdminFactTag /></div>
            <p className="text-[13px] opacity-70 max-w-2xl">Download roster plus verification stats as CSV. Administrative org data — not individual AI inferences.</p>
          </div>
          <button type="button" disabled={downloading} onClick={downloadAdminRecord}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-white inline-flex items-center gap-2 shrink-0 disabled:opacity-60"
            style={{ background: "var(--accent)" }}>
            <Download size={16} /> {downloading ? "Preparing…" : "Download CSV"}
          </button>
        </div>
      </Card>

      {/* Removal requests — only admin can delete */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-3"><UserMinus size={18} style={{ color: "var(--warn)" }} /><h3 className="font-semibold">Profile removal requests</h3><AdminFactTag /></div>
        <p className="text-[13px] opacity-70 mb-4">Employees and managers can only request removal. You are the only role that can delete a profile in this org.</p>
        {removalQueue.length === 0 ? (
          <p className="text-sm opacity-60">No pending removal requests.</p>
        ) : (
          <div className="space-y-3">
            {removalQueue.map((r) => (
              <div key={r.id} className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                <div className="text-[13px] min-w-0">
                  <strong>{r.subject_name ?? "Profile"}</strong>
                  <div className="opacity-70 mt-0.5">Requested by {r.requester_name ?? "—"} · {new Date(r.created_at).toLocaleDateString()}</div>
                  {r.reason && <div className="opacity-60 text-[12px] mt-1">Reason: {r.reason}</div>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => handleRemovalAction(r.id, "approved")} className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-white inline-flex items-center gap-1" style={{ background: "var(--warn)" }}>
                    <Trash2 size={14} /> Delete profile
                  </button>
                  <button type="button" onClick={() => handleRemovalAction(r.id, "rejected")} className="px-3 py-1.5 rounded-lg text-[13px] font-medium border inline-flex items-center gap-1" style={{ borderColor: "var(--line)" }}>
                    <X size={14} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Org billing controls */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-3"><Clock size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Departing employee trial</h3><AdminFactTag /></div>
        <p className="text-[13px] opacity-70 mb-4">Company subscription setting. Free tier always allows view + export of verified record; paid tier is the shareable passport only.</p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={autoTrialEnabled} onChange={() => { setAutoTrialEnabled(!autoTrialEnabled); flash(`Auto-trial ${!autoTrialEnabled ? "ON" : "OFF"} (mock).`); }} />
            Auto-trial on departure (default ON)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="opacity-70">Trial length</span>
            <select value={trialDays} onChange={(e) => setTrialDays(Number(e.target.value))} className="px-2 py-1 rounded-lg border text-sm" style={{ borderColor: "var(--line)" }}>
              {[14, 30, 45, 60].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </label>
        </div>
      </Card>

      {/* Add people: single invite or bulk CSV */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-3"><Mail size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Add people</h3><AdminFactTag /></div>
        <p className="text-[13px] opacity-70 mb-4">Single email invite or bulk CSV import. SSO/SCIM remains the default path; these are fallback provisioning methods.</p>

        <div className="flex gap-2 mb-4 flex-wrap">
          {(["single", "bulk"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setImportMode(m)}
              className="px-3 py-1.5 rounded-lg text-[13px] font-medium"
              style={{ background: importMode === m ? "var(--accent)" : "var(--surface-2)", color: importMode === m ? "#fff" : "var(--ink-2)" }}>
              {m === "single" ? "Single invite" : "Bulk CSV"}
            </button>
          ))}
        </div>

        {importMode === "single" && (
          <form onSubmit={sendInvite} className="flex flex-col sm:flex-row gap-2">
            <input type="email" required placeholder="colleague@demo.corp.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border text-sm min-w-0" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)" }}>
              {["Employee", "Manager", "HR", "Executive"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button type="submit" className="px-4 py-2 rounded-xl text-sm font-medium text-white inline-flex items-center justify-center gap-2" style={{ background: "var(--accent)" }}>
              <UserPlus size={16} /> Send invite
            </button>
          </form>
        )}

        {importMode === "bulk" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <button type="button" onClick={loadSampleCsv} className="text-[13px] font-medium px-3 py-1.5 rounded-lg border inline-flex items-center gap-1.5" style={{ borderColor: "var(--line)", color: "var(--accent)" }}>
                <Upload size={14} /> Load sample CSV
              </button>
              <span className="text-[12px] opacity-60">Columns: name, email, role, department, manager_email</span>
            </div>
            <textarea value={csvText} onChange={(e) => handleCsvChange(e.target.value)} rows={5} placeholder="Paste CSV here…"
              className="w-full px-3 py-2 rounded-xl border text-[13px] font-mono resize-y min-h-[100px]" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />

            {csvPreview && csvPreview.length > 0 && (
              <>
                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--line)" }}>
                  <table className="w-full text-[13px] text-left min-w-[560px]">
                    <thead>
                      <tr className="border-b opacity-60 text-[11px] uppercase tracking-widest" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                        <th className="py-2 px-3 font-medium">Row</th>
                        <th className="py-2 px-3 font-medium">Name</th>
                        <th className="py-2 px-3 font-medium">Email</th>
                        <th className="py-2 px-3 font-medium">Role</th>
                        <th className="py-2 px-3 font-medium">Dept</th>
                        <th className="py-2 px-3 font-medium">Manager</th>
                        <th className="py-2 px-3 font-medium">Validation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.map((r) => (
                        <tr key={r.rowNum} className="border-b" style={{ borderColor: "var(--line)", background: r.valid ? undefined : "var(--warn-bg)" }}>
                          <td className="py-2 px-3 opacity-60">{r.rowNum}</td>
                          <td className="py-2 px-3">{r.name || "—"}</td>
                          <td className="py-2 px-3">{r.email || "—"}</td>
                          <td className="py-2 px-3">{r.role || "—"}</td>
                          <td className="py-2 px-3">{r.department || "—"}</td>
                          <td className="py-2 px-3 text-[12px]">{r.managerEmail || "—"}</td>
                          <td className="py-2 px-3">
                            {r.valid ? (
                              <span className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: "var(--verified-fg)" }}><Check size={14} /> Ready</span>
                            ) : (
                              <span className="text-[12px]" style={{ color: "var(--warn)" }}>{r.errors.join("; ")}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" onClick={commitBulkImport} disabled={!csvPreview.some((r) => r.valid)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white inline-flex items-center gap-2 disabled:opacity-40"
                  style={{ background: "var(--accent)" }}>
                  <Upload size={16} /> Import {csvPreview.filter((r) => r.valid).length} valid row(s)
                </button>
              </>
            )}

            {lastBatch && (
              <p className="text-[13px] opacity-70">
                Last batch: {lastBatch.success} imported, {lastBatch.errors} errors — recorded in <code className="text-[12px]">data_import_batches</code> (mock).
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Pending org chart requests */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-3"><GitBranch size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Org chart proposals</h3><AdminFactTag /></div>
        <p className="text-[13px] opacity-70 mb-4">Managers propose reporting changes. Only you can approve and apply <code className="text-[12px]">manager_id</code>.</p>
        {requests.length === 0 ? (
          <p className="text-sm opacity-60">No pending requests.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                <div className="text-[13px] min-w-0">
                  <strong>{r.subjectName}</strong>
                  <span className="opacity-70"> → manager </span>
                  <strong>{r.proposedManager}</strong>
                  <div className="opacity-60 text-[12px] mt-0.5">Proposed by {r.requestedBy} · {r.createdAt}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => approveRequest(r.id)} className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-white inline-flex items-center gap-1" style={{ background: "var(--verified-fg)" }}>
                    <Check size={14} /> Approve
                  </button>
                  <button type="button" onClick={() => rejectRequest(r.id)} className="px-3 py-1.5 rounded-lg text-[13px] font-medium border inline-flex items-center gap-1" style={{ borderColor: "var(--line)", color: "var(--warn)" }}>
                    <X size={14} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* People table */}
      <Card className="p-5 sm:p-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2"><Users size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">People</h3><AdminFactTag /></div>
          <span className="text-[13px] opacity-60">{activeCount} active · {people.length} total (mock)</span>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-[13px] text-left">
            <thead>
              <tr className="border-b opacity-60 text-[11px] uppercase tracking-widest" style={{ borderColor: "var(--line)" }}>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Department</th>
                <th className="py-2 pr-4 font-medium">Manager</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b" style={{ borderColor: "var(--line)" }}>
                  <td className="py-3 pr-4 font-medium">{p.name}</td>
                  <td className="py-3 pr-4">{p.role}</td>
                  <td className="py-3 pr-4"><span className="inline-flex items-center gap-1"><Building2 size={13} className="opacity-50" />{p.department}</span></td>
                  <td className="py-3 pr-4 opacity-80">{p.manager ?? "—"}</td>
                  <td className="py-3 pr-4"><StatusBadge status={p.accountStatus} /></td>
                  <td className="py-3">
                    <div className="flex gap-2 flex-wrap">
                      {(p.accountStatus === "former_trial" || p.accountStatus === "former_free") && (
                        <button type="button" onClick={() => extendTrial(p.id)} className="text-[12px] font-medium px-2 py-1 rounded-lg border" style={{ borderColor: "var(--line)", color: "var(--accent)" }}>
                          Extend trial
                        </button>
                      )}
                      {p.accountStatus !== "former_trial" && p.accountStatus !== "former_free" && (
                        <button type="button" onClick={() => adminDeletePerson(p.id, p.name)} className="text-[12px] font-medium px-2 py-1 rounded-lg border inline-flex items-center gap-1" style={{ borderColor: "var(--line)", color: "var(--warn)" }}>
                          <Trash2 size={12} /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {people.map((p) => {
            const open = expandedId === p.id;
            return (
              <div key={p.id} className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                <button type="button" className="w-full text-left p-4 flex items-center justify-between gap-2" onClick={() => setExpandedId(open ? null : p.id)}>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-[12px] opacity-60">{p.role} · {p.department}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={p.accountStatus} />
                    <ChevronDown size={16} className={`opacity-50 transition ${open ? "rotate-180" : ""}`} />
                  </div>
                </button>
                {open && (
                  <div className="px-4 pb-4 pt-0 text-[13px] space-y-2 border-t" style={{ borderColor: "var(--line)" }}>
                    <div><span className="opacity-60">Manager:</span> {p.manager ?? "—"}</div>
                    {p.trialEndsAt && <div><span className="opacity-60">Trial ends:</span> {p.trialEndsAt}</div>}
                    {(p.accountStatus === "former_trial" || p.accountStatus === "former_free") && (
                      <button type="button" onClick={() => extendTrial(p.id)} className="text-[12px] font-medium px-3 py-1.5 rounded-lg border w-full sm:w-auto" style={{ borderColor: "var(--line)", color: "var(--accent)" }}>
                        Extend trial +30 days
                      </button>
                    )}
                    {p.accountStatus !== "former_trial" && p.accountStatus !== "former_free" && (
                      <button type="button" onClick={() => adminDeletePerson(p.id, p.name)} className="text-[12px] font-medium px-3 py-1.5 rounded-lg border w-full sm:w-auto inline-flex items-center justify-center gap-1" style={{ borderColor: "var(--line)", color: "var(--warn)" }}>
                        <Trash2 size={12} /> Delete profile (admin only)
                      </button>
                    )}
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
