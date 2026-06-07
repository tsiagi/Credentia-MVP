"use client";

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  fetchOrgProvisioningConfig,
  fetchPendingInvites,
  sendOrgInvite,
  updateOrgBillingSettings,
  type OrgInvite,
  type OrgProvisioningConfig,
} from "@/lib/provisioning";
import {
  fetchManagerAssignmentRequests,
  reviewManagerAssignment,
  departEmployee,
  extendEmployeeTrial,
  type ManagerAssignmentRequest,
} from "@/lib/org-chart";
import { ShareableLinkCard } from "@/components/ShareableLinkCard";
import { Users, Mail, GitBranch, UserMinus, Clock, ShieldCheck, Check, X } from "lucide-react";

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-2xl border ${className}`} style={{ borderColor: "var(--line)", background: "var(--surface)", ...style }}>
      {children}
    </div>
  );
}

export function OrgPeopleView({ userId }: { userId: string }) {
  const [config, setConfig] = useState<OrgProvisioningConfig | null>(null);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [requests, setRequests] = useState<ManagerAssignmentRequest[]>([]);
  const [orgMembers, setOrgMembers] = useState<{ id: string; full_name: string | null; title: string | null; role: string; account_status: string }[]>([]);
  const [formerMembers, setFormerMembers] = useState<{ id: string; full_name: string | null; account_status: string; trial_ends_at: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("employee");
  const [acting, setActing] = useState<string | null>(null);
  const [lastInviteToken, setLastInviteToken] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sign in again");

    const { data: me } = await supabase.from("profiles").select("org_id").eq("id", userId).single();
    if (!me?.org_id) {
      setConfig(null);
      return;
    }

    const [cfg, inv, reqs, members, former] = await Promise.all([
      fetchOrgProvisioningConfig(session.access_token),
      fetchPendingInvites(session.access_token),
      fetchManagerAssignmentRequests(session.access_token),
      supabase.from("profiles").select("id, full_name, title, role, account_status").eq("org_id", me.org_id).order("full_name"),
      supabase.from("profiles").select("id, full_name, account_status, trial_ends_at").eq("former_org_id", me.org_id).in("account_status", ["former_trial", "former_free", "former_paid"]),
    ]);

    setConfig(cfg);
    setInvites(inv);
    setRequests(reqs);
    if (members.error) throw members.error;
    setOrgMembers(members.data ?? []);
    if (former.error) throw former.error;
    setFormerMembers(former.data ?? []);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
      } catch (e) {
        if (!cancelled) setError(errorMessage(e, "Could not load people settings."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reload]);

  async function withSession<T>(fn: (token: string) => Promise<T>) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sign in again");
    return fn(session.access_token);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setActing("invite");
    setError(null);
    setNotice(null);
    try {
      const result = await withSession((t) => sendOrgInvite(t, { email: inviteEmail.trim(), role: inviteRole }));
      setLastInviteToken(result.token);
      setNotice(`Invite sent to ${inviteEmail}. Share accept link with token (fallback path).`);
      setInviteEmail("");
      await reload();
    } catch (e) {
      setError(errorMessage(e, "Invite failed"));
    } finally {
      setActing(null);
    }
  }

  async function toggleAutoTrial() {
    if (!config) return;
    setActing("billing");
    try {
      await withSession((t) => updateOrgBillingSettings(t, { auto_trial_on_departure: !config.auto_trial_on_departure }));
      setNotice(config.auto_trial_on_departure ? "Auto-trial on departure turned OFF." : "Auto-trial on departure turned ON (default).");
      await reload();
    } catch (e) {
      setError(errorMessage(e, "Update failed"));
    } finally {
      setActing(null);
    }
  }

  async function handleReview(requestId: string, action: "approve" | "reject") {
    setActing(requestId);
    try {
      await withSession((t) => reviewManagerAssignment(t, { requestId, action }));
      setNotice(action === "approve" ? "Manager assignment approved and applied." : "Proposal rejected.");
      await reload();
    } catch (e) {
      setError(errorMessage(e, "Review failed"));
    } finally {
      setActing(null);
    }
  }

  async function handleDepart(profileId: string, name: string) {
    if (!confirm(`Process departure for ${name}? Verified records will be frozen; account transfers to individual.`)) return;
    setActing(profileId);
    try {
      await withSession((t) => departEmployee(t, profileId));
      setNotice(`${name} departed — records frozen, personal account active.`);
      await reload();
    } catch (e) {
      setError(errorMessage(e, "Departure failed"));
    } finally {
      setActing(null);
    }
  }

  async function handleExtendTrial(profileId: string, name: string) {
    setActing(`trial-${profileId}`);
    try {
      await withSession((t) => extendEmployeeTrial(t, { profileId, extraDays: 30 }));
      setNotice(`Extended ${name}'s passport trial by 30 days.`);
      await reload();
    } catch (e) {
      setError(errorMessage(e, "Extend failed"));
    } finally {
      setActing(null);
    }
  }

  if (loading) return <div className="opacity-60 text-sm">Loading people & access…</div>;

  if (!config) {
    return (
      <Card className="p-6">
        <p className="text-sm opacity-70">Set <code className="text-[12px]">profiles.org_id</code> on your admin/HR profile, then run <code className="text-[12px]">supabase/provisioning-lifecycle.sql</code>.</p>
      </Card>
    );
  }

  const pendingReqs = requests.filter((r) => r.status === "pending");
  const idpPrimary = config.sso_enabled || config.scim_enabled;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="serif text-2xl font-semibold">People & Access</h2>
        <p className="text-[14px] opacity-60 mt-1 max-w-3xl">
          SSO/SCIM is the default source of truth. Manual email invite is the fallback. Only admin/HR sets reporting structure.
        </p>
      </div>

      {error && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}
      {notice && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{notice}</p>}

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-3"><ShieldCheck size={18} style={{ color: "var(--verified-fg)" }} /><h3 className="font-semibold">Provisioning</h3></div>
        <div className="grid sm:grid-cols-3 gap-3 text-[13px]">
          <div className="p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
            <div className="opacity-60 text-[11px] uppercase tracking-widest mb-1">SSO</div>
            <div className="font-medium">{config.sso_enabled ? `Enabled (${config.sso_provider ?? "Okta"})` : "Not configured"}</div>
          </div>
          <div className="p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
            <div className="opacity-60 text-[11px] uppercase tracking-widest mb-1">SCIM sync</div>
            <div className="font-medium">{config.scim_enabled ? "Enabled" : "Not configured"}</div>
          </div>
          <div className="p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
            <div className="opacity-60 text-[11px] uppercase tracking-widest mb-1">Default path</div>
            <div className="font-medium">{idpPrimary ? "IdP (SSO/SCIM)" : "Manual invite fallback"}</div>
          </div>
        </div>
        <p className="text-[12px] opacity-60 mt-3">Configure Okta SAML/OIDC in Supabase Auth; point SCIM to <code>/api/provision/scim</code>; post-login sync via <code>/api/provision/sso</code>.</p>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-3"><Mail size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Email invite (fallback)</h3></div>
        {idpPrimary && (
          <p className="text-[13px] mb-3 px-3 py-2 rounded-lg" style={{ background: "var(--inferred-bg)" }}>
            Your org uses IdP provisioning. Invites are for contractors or exceptions only.
          </p>
        )}
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2 mb-4">
          <input type="email" required placeholder="colleague@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)" }}>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="hr">HR</option>
          </select>
          <button type="submit" disabled={acting === "invite"} className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
            Send invite
          </button>
        </form>
        {lastInviteToken && (
          <p className="text-[12px] opacity-70 break-all">Accept token: <code>{lastInviteToken}</code> — employee signs up then POSTs to accept API.</p>
        )}
        {invites.filter((i) => i.status === "pending").length > 0 && (
          <div className="text-[13px] opacity-70">{invites.filter((i) => i.status === "pending").length} pending invite(s)</div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-3"><Clock size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Billing — departing employees</h3></div>
        <p className="text-[13px] opacity-70 mb-4">
          Free tier: former employees always <strong>view + export</strong> their verified record. Paid tier unlocks the shareable passport only.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={config.auto_trial_on_departure} onChange={toggleAutoTrial} disabled={acting === "billing"} />
            Auto-trial on departure ({config.default_trial_days} days) — {config.auto_trial_on_departure ? "ON" : "OFF"}
          </label>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-3"><GitBranch size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Org chart proposals</h3></div>
        <p className="text-[13px] opacity-70 mb-4">Managers propose reporting changes. You approve — they cannot self-assign direct reports.</p>
        {pendingReqs.length === 0 ? (
          <p className="text-sm opacity-60">No pending manager assignment requests.</p>
        ) : (
          <div className="space-y-3">
            {pendingReqs.map((r) => (
              <div key={r.id} className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                <div className="text-[13px]">
                  <strong>{r.employee_name}</strong> → manager <strong>{r.manager_name}</strong>
                  <div className="opacity-60">Proposed by {r.requester_name}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={acting === r.id} onClick={() => handleReview(r.id, "approve")}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-white inline-flex items-center gap-1 disabled:opacity-60" style={{ background: "var(--verified-fg)" }}>
                    <Check size={14} /> Approve
                  </button>
                  <button type="button" disabled={acting === r.id} onClick={() => handleReview(r.id, "reject")}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-medium border inline-flex items-center gap-1 disabled:opacity-60" style={{ borderColor: "var(--line)", color: "var(--warn)" }}>
                    <X size={14} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-3"><Users size={18} style={{ color: "var(--accent)" }} /><h3 className="font-semibold">Active org members</h3></div>
        <div className="space-y-2">
          {orgMembers.map((m) => (
            <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
              <div>
                <span className="font-medium">{m.full_name ?? m.title ?? m.id.slice(0, 8)}</span>
                <span className="text-[12px] opacity-60 ml-2 capitalize">{m.role} · {m.account_status.replace(/_/g, " ")}</span>
              </div>
              <button type="button" disabled={!!acting} onClick={() => handleDepart(m.id, m.full_name ?? "employee")}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium border inline-flex items-center gap-1 disabled:opacity-60" style={{ borderColor: "var(--line)", color: "var(--warn)" }}>
                <UserMinus size={14} /> Process departure
              </button>
            </div>
          ))}
        </div>
      </Card>

      {formerMembers.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-3"><Clock size={18} style={{ color: "var(--inferred-fg)" }} /><h3 className="font-semibold">Former employees — trial management</h3></div>
          <div className="space-y-2">
            {formerMembers.map((m) => (
              <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
                <div>
                  <span className="font-medium">{m.full_name ?? m.id.slice(0, 8)}</span>
                  <span className="text-[12px] opacity-60 ml-2 capitalize">{m.account_status.replace(/_/g, " ")}</span>
                  {m.trial_ends_at && <span className="text-[12px] opacity-60 ml-2">trial until {new Date(m.trial_ends_at).toLocaleDateString()}</span>}
                </div>
                <button type="button" disabled={acting === `trial-${m.id}`} onClick={() => handleExtendTrial(m.id, m.full_name ?? "employee")}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium border disabled:opacity-60" style={{ borderColor: "var(--line)" }}>
                  Extend trial +30 days
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export function EmployeeDataRightsCard({ userId }: { userId: string }) {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("account_status").eq("id", userId).single().then(({ data }) => {
      setStatus(data?.account_status ?? null);
    });
  }, [userId]);

  if (!status) return null;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="text-[13px] opacity-70">
          Status: <span className="capitalize">{status.replace(/_/g, " ")}</span>.
          Share a view-only link to verified achievements — no AI inferences, not downloadable.
        </p>
      </Card>
      <ShareableLinkCard userId={userId} />
    </div>
  );
}
