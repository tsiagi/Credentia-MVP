"use client";

import React, { useState } from "react";
import { AlertTriangle, UserMinus } from "lucide-react";
import { createRemovalRequest, fetchOrgSettingsForUser } from "@/lib/org-settings";

function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-2xl border p-5 sm:p-6 ${className}`} style={{ borderColor: "var(--line)", background: "var(--surface-2)", ...style }}>
      {children}
    </div>
  );
}

export function RemovalRequestPanel({ userId }: { userId: string }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const org = await fetchOrgSettingsForUser(userId);
      if (!org) throw new Error("No organization linked to your profile.");
      await createRemovalRequest({
        orgId: org.orgId,
        subjectProfileId: userId,
        requestedBy: userId,
        reason: reason.trim() || undefined,
      });
      setNotice("Your request to remove your profile was sent to your company admin for review.");
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <UserMinus size={16} style={{ color: "var(--warn)" }} />
        <h3 className="font-semibold text-[15px]">Request profile removal</h3>
      </div>
      <p className="text-[13px] opacity-70 mb-3">
        Current employees cannot delete their own org profile directly. Submit a request — only your company admin can remove it.
        This is separate from former-employee self-delete after you leave.
      </p>
      {error && <p className="text-[13px] mb-2 px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}
      {notice && <p className="text-[13px] mb-2 px-3 py-2 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{notice}</p>}
      <form onSubmit={submit} className="space-y-3">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional reason for your admin"
          rows={2} className="w-full px-3 py-2 rounded-lg border text-sm resize-y" style={{ borderColor: "var(--line)", background: "var(--surface)" }} />
        <button type="submit" disabled={submitting}
          className="px-4 py-2 rounded-lg text-[13px] font-medium border disabled:opacity-60"
          style={{ borderColor: "var(--line)", color: "var(--warn)" }}>
          {submitting ? "Sending…" : "Request removal"}
        </button>
      </form>
    </Card>
  );
}

export function FormerEmployeeDeletePanel({ userId, onDeleted }: { userId: string; onDeleted?: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const { deleteOwnAccount } = await import("@/lib/org-settings");
      await deleteOwnAccount(userId);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete account.");
      setConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card style={{ borderColor: "var(--warn)" }}>
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: "var(--warn)" }} />
        <div>
          <h3 className="font-semibold text-[15px]">Delete my account permanently</h3>
          <p className="text-[13px] opacity-70 mt-1 leading-relaxed">
            As a former employee, you may delete your account and personal data. This is <strong>permanent</strong> and cannot be undone.
            Facts you already attested and shared externally (share links, passports) may persist where they were distributed —
            we cannot recall copies outside Core-Roborate.
          </p>
        </div>
      </div>
      {error && <p className="text-[13px] mb-2 px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}
      {confirm && (
        <p className="text-[13px] mb-3 px-3 py-2 rounded-lg font-medium" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>
          Are you sure? Click again to permanently delete your account. An audit log entry will be recorded.
        </p>
      )}
      <button type="button" disabled={deleting} onClick={handleDelete}
        className="px-4 py-2 rounded-lg text-[13px] font-medium text-white disabled:opacity-60"
        style={{ background: "var(--warn)" }}>
        {deleting ? "Deleting…" : confirm ? "Yes — delete my account forever" : "Delete my account"}
      </button>
    </Card>
  );
}
