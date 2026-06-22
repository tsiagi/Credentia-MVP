"use client";

import React, { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { PageHeader, Card, Badge } from "@/components/ui";
import { CompanyDirectory, type DirectoryItem } from "@/components/admin/CompanyDirectory";
import { SubscriptionBadge } from "@/components/admin/SubscriptionBadge";
import { useAdminSession } from "@/lib/admin/use-session";
import { supabase } from "@/lib/supabase";
import { fetchOrgSettingsForUser } from "@/lib/org-settings";
import { fetchOrgRoster, type OrgPerson } from "@/lib/admin/company-metrics";

type Subscription = { billing_status: string; plan: string | null; seats: number | null };

function AccountBadge({ status }: { status: string }) {
  if (status === "active_sso" || status === "active") return <Badge tone="success">Active</Badge>;
  if (status === "invited") return <Badge tone="accent">Invited</Badge>;
  if (status.startsWith("former_")) return <Badge tone="neutral">Former</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

const ROLE_LABEL: Record<string, string> = {
  employee: "Employees", manager: "Managers", executive: "Executives", hr: "HR / People Ops", admin: "Admins",
};

export default function AdminCompany() {
  const { userId, ready } = useAdminSession();
  const [roster, setRoster] = useState<OrgPerson[] | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);

  useEffect(() => {
    if (!ready || !userId) return;
    (async () => {
      const org = await fetchOrgSettingsForUser(userId);
      if (!org) { setRoster([]); return; }
      const [people, orgRow] = await Promise.all([
        fetchOrgRoster(org.orgId),
        supabase.from("organizations").select("billing_status, plan, seats").eq("id", org.orgId).single(),
      ]);
      setRoster(people);
      if (orgRow.data) setSub(orgRow.data as Subscription);
    })();
  }, [ready, userId]);

  const items: DirectoryItem[] = (roster ?? []).map((p) => ({
    id: p.id,
    primary: p.full_name || p.title || "Unnamed",
    secondary: p.title ?? undefined,
    group: ROLE_LABEL[p.role] ?? p.role,
    badge: <AccountBadge status={p.account_status} />,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="Company"
        subtitle="Search and browse everyone in your company, grouped by category."
        actions={sub ? <SubscriptionBadge status={sub.billing_status} plan={sub.plan} /> : undefined}
      />

      {sub && (
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ background: "var(--accent-soft)" }}>
              <Building2 size={18} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">Subscription</span>
                <SubscriptionBadge status={sub.billing_status} plan={sub.plan} />
              </div>
              <p className="text-[13px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                {sub.seats ? `${sub.seats} licensed seats` : "Seat count set by your Core-Roborate operator"}.
              </p>
            </div>
          </div>
        </Card>
      )}

      <CompanyDirectory
        scope="company"
        items={items}
        searchPlaceholder="Search people by name, title, or category…"
        emptyTitle={roster ? "No people yet" : "Loading people…"}
        emptyMessage={roster ? "Add people from the Integration tab." : undefined}
      />
    </div>
  );
}
