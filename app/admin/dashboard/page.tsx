"use client";

import React, { useEffect, useState } from "react";
import { UserCheck, Sparkles, ShieldCheck } from "lucide-react";
import { PageHeader, Card } from "@/components/ui";
import { MetricsDashboard } from "@/components/admin/MetricsDashboard";
import { useAdminSession } from "@/lib/admin/use-session";
import { fetchCompanyMetrics, type CompanyMetrics } from "@/lib/admin/company-metrics";

export default function AdminDashboard() {
  const { userId, ready } = useAdminSession();
  const [m, setM] = useState<CompanyMetrics | null>(null);
  const [noOrg, setNoOrg] = useState(false);

  useEffect(() => {
    if (!ready || !userId) return;
    fetchCompanyMetrics(userId).then((res) => {
      if (!res) setNoOrg(true);
      else setM(res);
    });
  }, [ready, userId]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="Dashboard"
        subtitle="Activations, AI usage, and verification activity for your company."
      />

      {noOrg ? (
        <Card padding="lg"><p className="text-[13px]" style={{ color: "var(--ink-3)" }}>Your profile isn’t linked to an organization yet.</p></Card>
      ) : (
        <MetricsDashboard
          loading={!m}
          columns={3}
          metrics={[
            { key: "activations", label: "Activations", value: m?.activeUsers ?? 0, sub: `${m?.totalUsers ?? 0} total · ${m?.invitedUsers ?? 0} invited`, tone: "neutral", icon: UserCheck },
            { key: "ai", label: "AI Usage", value: m?.aiUsageCount ?? 0, sub: "Model-produced insights", tone: "inferred", icon: Sparkles, badgeLabel: "AI usage" },
            { key: "verif", label: "Verifications", value: m?.verifiedCount ?? 0, sub: "Attested records (L2+)", tone: "verified", icon: ShieldCheck, badgeLabel: "Verified" },
          ]}
        />
      )}

      {/* Verification breakdown — verified facts only (blue). */}
      {m && m.verificationBuckets.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}>
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} style={{ color: "var(--verified-fg)" }} />
              <h2 className="text-[15px] font-semibold">Verifications by month</h2>
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-3)" }}>
              Counts of verified records (L2+) by level and type — administrative aggregate, not AI inference.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] text-left min-w-[420px]">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-widest" style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink-3)" }}>
                  <th className="py-2.5 px-5 font-medium">Month</th>
                  <th className="py-2.5 px-4 font-medium">Level</th>
                  <th className="py-2.5 px-4 font-medium">Type</th>
                  <th className="py-2.5 px-4 font-medium text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {m.verificationBuckets.map((b, i) => (
                  <tr key={i} className="border-b" style={{ borderColor: "var(--line)" }}>
                    <td className="py-2.5 px-5">{b.month}</td>
                    <td className="py-2.5 px-4">L{b.level}</td>
                    <td className="py-2.5 px-4">{b.kind}</td>
                    <td className="py-2.5 px-4 text-right font-medium tabular-nums">{b.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
