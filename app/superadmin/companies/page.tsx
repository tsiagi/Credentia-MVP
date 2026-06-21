"use client";

import React, { useEffect, useState } from "react";
import { PageHeader, Card } from "@/components/ui";
import { CompanyDirectory, type DirectoryItem } from "@/components/admin/CompanyDirectory";
import { SubscriptionBadge } from "@/components/admin/SubscriptionBadge";
import { useAdminSession } from "@/lib/admin/use-session";
import { fetchCompanies, type CompanyProfile } from "@/lib/admin/companies";

export default function CompaniesPage() {
  const { token, ready } = useAdminSession();
  const [companies, setCompanies] = useState<CompanyProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !token) return;
    fetchCompanies(token)
      .then(setCompanies)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load companies"));
  }, [ready, token]);

  const items: DirectoryItem[] = (companies ?? []).map((c) => ({
    id: c.id,
    primary: c.name,
    secondary: `${c.userCount} ${c.userCount === 1 ? "user" : "users"}`,
    meta: c.seats ? `${c.seats} seats` : undefined,
    group: c.plan ? `${c.plan} plan` : "Unassigned plan",
    badge: <SubscriptionBadge status={c.billing_status} />,
    href: `/superadmin/companies/${c.id}`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Companies"
        subtitle="Every tenant on the platform. Search, then drill in to view or modify a company profile."
      />
      {error && (
        <Card padding="md" style={{ background: "var(--warn-bg)" }}>
          <p className="text-[13px]" style={{ color: "var(--warn-fg)" }}>{error}</p>
        </Card>
      )}
      <CompanyDirectory
        scope="platform"
        items={items}
        searchPlaceholder="Search companies…"
        emptyTitle={companies ? "No companies yet" : "Loading companies…"}
        emptyMessage={companies ? "Provision the first company in Org Controls." : undefined}
      />
    </div>
  );
}
