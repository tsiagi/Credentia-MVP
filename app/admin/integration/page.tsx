"use client";

import React, { useEffect, useState } from "react";
import { PageHeader, Card } from "@/components/ui";
import { IntegrationPanel } from "@/components/admin/IntegrationPanel";
import { useAdminSession } from "@/lib/admin/use-session";
import { fetchOrgSettingsForUser } from "@/lib/org-settings";

export default function AdminIntegration() {
  const { userId, ready } = useAdminSession();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (!ready || !userId) return;
    fetchOrgSettingsForUser(userId)
      .then((o) => setOrgId(o?.orgId ?? null))
      .finally(() => setResolved(true));
  }, [ready, userId]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="Integration"
        subtitle="Connect Workday for HRIS sync, or add employees manually — individually or in bulk."
      />
      {!resolved || !userId ? (
        <Card padding="lg"><p className="text-[13px]" style={{ color: "var(--ink-3)" }}>Loading…</p></Card>
      ) : !orgId ? (
        <Card padding="lg"><p className="text-[13px]" style={{ color: "var(--ink-3)" }}>Your profile isn’t linked to an organization yet.</p></Card>
      ) : (
        <IntegrationPanel scope="company" userId={userId} orgId={orgId} />
      )}
    </div>
  );
}
