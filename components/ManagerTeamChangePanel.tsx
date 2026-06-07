"use client";

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  proposeManagerAssignment,
  fetchManagerAssignmentRequests,
  type OrgMembershipRequest,
} from "@/lib/org-chart";
import { fetchDirectReports } from "@/lib/workforce";
import { GitBranch, ShieldCheck, Clock, Check, X, AlertTriangle } from "lucide-react";

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

const Card = ({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
  <div className={`rounded-2xl border ${className}`} style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "0 1px 2px rgba(0,0,0,.04)", ...style }}>
    {children}
  </div>
);

function RequestStatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    pending: { bg: "var(--warn-bg)", fg: "var(--warn)", label: "Pending admin review" },
    approved: { bg: "var(--verified-bg)", fg: "var(--verified-fg)", label: "Approved" },
    rejected: { bg: "var(--surface-2)", fg: "var(--ink-2)", label: "Rejected" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

export function ManagerTeamChangePanel({ userId }: { userId: string }) {
  const [reports, setReports] = useState<{ id: string; full_name: string | null; title: string | null }[]>([]);
  const [managers, setManagers] = useState<{ id: string; full_name: string | null; title: string | null }[]>([]);
  const [requests, setRequests] = useState<OrgMembershipRequest[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const reload = useCallback(async () => {
    const { data: me } = await supabase.from("profiles").select("org_id").eq("id", userId).single();
    if (!me?.org_id) return;

    const [direct, orgPeople, reqs] = await Promise.all([
      fetchDirectReports(userId),
      supabase.from("profiles").select("id, full_name, title, role").eq("org_id", me.org_id).in("role", ["manager", "executive", "admin"]),
      (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return [];
        return fetchManagerAssignmentRequests(session.access_token);
      })(),
    ]);

    setReports(direct);
    setManagers(orgPeople.data ?? []);
    setRequests(reqs.filter((r) => r.requested_by === userId));
    if (!subjectId && direct[0]) setSubjectId(direct[0].id);
    if (!managerId) setManagerId(userId);
  }, [userId, subjectId, managerId]);

  useEffect(() => {
    reload().catch(() => { /* table may not exist yet — mock-friendly */ });
  }, [reload]);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectId || !managerId) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in again.");
      await proposeManagerAssignment(session.access_token, {
        subjectProfileId: subjectId,
        proposedManagerId: managerId,
      });
      setNotice("Your request to update your team was sent to your admin for approval. They'll review it and let you know when it's done.");
      await reload();
    } catch (err) {
      setError(errorMessage(err, "Could not submit request. If tables are not migrated yet, this will work after running schema.sql."));
    } finally {
      setSubmitting(false);
    }
  }

  const orgPeopleOptions = [...reports];

  return (
    <Card className="p-5 sm:p-6">
      <button type="button" className="w-full text-left" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <GitBranch size={18} style={{ color: "var(--accent)" }} />
            <div>
              <h3 className="font-semibold">Request team change</h3>
              <p className="text-[13px] opacity-60 mt-0.5">Ask your admin to add someone to your team or update reporting lines</p>
            </div>
          </div>
          <span className="text-[12px] opacity-50 shrink-0">{expanded ? "Hide" : "Show"}</span>
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t space-y-4" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-start gap-2 p-3 rounded-xl text-[13px]" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>
            <ShieldCheck size={16} className="shrink-0 mt-0.5" />
            <p>
              You can&apos;t change your team directly — that keeps everyone&apos;s access safe.
              Submit a request here and your company admin will approve it in People &amp; Org.
            </p>
          </div>

          {error && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}
          {notice && <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{notice}</p>}

          <form onSubmit={submitRequest} className="space-y-3">
            <div>
              <label className="text-[12px] uppercase tracking-widest opacity-60 block mb-1">Team member (subject)</label>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required
                className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                <option value="">Select person…</option>
                {reports.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name ?? p.title ?? p.id.slice(0, 8)} (direct report)</option>
                ))}
              </select>
              <p className="text-[11px] opacity-50 mt-1">To add someone new to your team, ask admin to invite them first, then propose the reporting line.</p>
            </div>
            <div>
              <label className="text-[12px] uppercase tracking-widest opacity-60 block mb-1">Proposed manager</label>
              <select value={managerId} onChange={(e) => setManagerId(e.target.value)} required
                className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                <option value={userId}>Me ({userId.slice(0, 8)}…)</option>
                {managers.filter((m) => m.id !== userId).map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name ?? m.title ?? m.id.slice(0, 8)}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={submitting || !subjectId} className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
              {submitting ? "Submitting…" : "Submit for admin approval"}
            </button>
          </form>

          {requests.length > 0 && (
            <div>
              <div className="text-[12px] uppercase tracking-widest opacity-60 mb-2 flex items-center gap-1">
                <Clock size={13} /> Your requests
              </div>
              <div className="space-y-2">
                {requests.map((r) => (
                  <div key={r.id} className="p-3 rounded-xl border text-[13px] flex flex-col sm:flex-row sm:items-center justify-between gap-2" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                    <div>
                      <span className="font-medium">{r.subject_name ?? "Team member"}</span>
                      <span className="opacity-70"> → {r.manager_name ?? "new manager"}</span>
                      <div className="text-[11px] opacity-50 mt-0.5">{new Date(r.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <RequestStatusPill status={r.status} />
                      {r.status === "pending" && <AlertTriangle size={14} style={{ color: "var(--warn)" }} aria-hidden />}
                      {r.status === "approved" && <Check size={14} style={{ color: "var(--verified-fg)" }} />}
                      {r.status === "rejected" && <X size={14} style={{ color: "var(--warn)" }} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
