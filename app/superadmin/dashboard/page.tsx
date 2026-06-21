"use client";

import React, { useEffect, useState } from "react";
import { Building2, Users, Sparkles, CreditCard } from "lucide-react";
import { PageHeader, Card } from "@/components/ui";
import { MetricsDashboard } from "@/components/admin/MetricsDashboard";
import { SubscriptionBadge } from "@/components/admin/SubscriptionBadge";
import { useAdminSession } from "@/lib/admin/use-session";
import { fetchPlatformMetrics, type PlatformMetrics } from "@/lib/admin/superadmin-metrics";

export default function SuperadminDashboard() {
  const { token, ready } = useAdminSession();
  const [data, setData] = useState<PlatformMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !token) return;
    fetchPlatformMetrics(token)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load metrics"));
  }, [ready, token]);

  const t = data?.totals;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Platform Dashboard"
        subtitle="Usage across every company on Credentia — administrative aggregates and AI-insight volume."
      />

      {error && (
        <Card padding="md" style={{ background: "var(--warn-bg)" }}>
          <p className="text-[13px]" style={{ color: "var(--warn-fg)" }}>{error}</p>
        </Card>
      )}

      <MetricsDashboard
        loading={!data && !error}
        columns={4}
        metrics={[
          { key: "companies", label: "Companies", value: t?.companies ?? 0, sub: `${t?.activeCompanies ?? 0} active`, tone: "neutral", icon: Building2 },
          { key: "users", label: "Total users", value: t?.users ?? 0, sub: `${t?.activeUsers ?? 0} active`, tone: "neutral", icon: Users },
          { key: "ai", label: "AI insights generated", value: t?.aiInsights ?? 0, sub: "Model-produced artifacts", tone: "inferred", icon: Sparkles, badgeLabel: "AI usage" },
          { key: "mrr", label: "Mocked MRR", value: `$${(t?.mrr ?? 0).toLocaleString()}`, sub: "Active subscriptions", tone: "neutral", icon: CreditCard },
        ]}
      />

      {/* Per-company breakdown */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}>
          <h2 className="text-[15px] font-semibold">Per-company usage</h2>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-3)" }}>
            Users, AI-insight usage, and subscription state for each company.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] text-left min-w-[640px]">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-widest" style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink-3)" }}>
                <th className="py-2.5 px-5 font-medium">Company</th>
                <th className="py-2.5 px-4 font-medium">Users</th>
                <th className="py-2.5 px-4 font-medium">Active</th>
                <th className="py-2.5 px-4 font-medium">AI insights</th>
                <th className="py-2.5 px-4 font-medium">Subscription</th>
              </tr>
            </thead>
            <tbody>
              {(data?.companies ?? []).map((c) => (
                <tr key={c.orgId} className="border-b" style={{ borderColor: "var(--line)" }}>
                  <td className="py-3 px-5 font-medium" style={{ color: "var(--ink)" }}>{c.name}</td>
                  <td className="py-3 px-4 tabular-nums">{c.userCount}</td>
                  <td className="py-3 px-4 tabular-nums" style={{ color: "var(--ink-3)" }}>{c.activeUserCount}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 tabular-nums font-medium" style={{ color: "var(--inferred-fg)" }}>
                      <Sparkles size={13} /> {c.aiInsightCount}
                    </span>
                  </td>
                  <td className="py-3 px-4"><SubscriptionBadge status={c.billingStatus} plan={c.plan} /></td>
                </tr>
              ))}
              {data && data.companies.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center" style={{ color: "var(--ink-3)" }}>No companies yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
