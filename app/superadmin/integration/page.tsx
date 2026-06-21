"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Building2, ArrowLeft, ChevronRight } from "lucide-react";
import { PageHeader, Card } from "@/components/ui";
import { IntegrationPanel, type ManualAdd } from "@/components/admin/IntegrationPanel";
import { SubscriptionBadge } from "@/components/admin/SubscriptionBadge";
import { useAdminSession } from "@/lib/admin/use-session";
import { fetchCompanies, type CompanyProfile } from "@/lib/admin/companies";
import { addPeople } from "@/lib/admin/people";

export default function SuperadminIntegration() {
  const { userId, token, ready } = useAdminSession();
  const [companies, setCompanies] = useState<CompanyProfile[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!ready || !token) return;
    fetchCompanies(token)
      .then(setCompanies)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load companies"));
  }, [ready, token]);

  const selected = useMemo(
    () => companies?.find((c) => c.id === selectedId) ?? null,
    [companies, selectedId],
  );

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (companies ?? []).filter((c) => !n || c.name.toLowerCase().includes(n));
  }, [companies, q]);

  const onManualAdd: ManualAdd = async (people) => {
    if (!token || !selected) throw new Error("No company selected");
    const res = await addPeople(token, selected.id, people.map((p) => ({
      name: p.name, email: p.email, role: p.role, title: p.title,
    })));
    return { created: res.created, errors: res.errors };
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Integration"
        subtitle="Choose a company, then connect a source or add people. Built to extend as new connectors are added."
      />

      {error && (
        <Card padding="md" style={{ background: "var(--warn-bg)" }}>
          <p className="text-[13px]" style={{ color: "var(--warn-fg)" }}>{error}</p>
        </Card>
      )}

      {/* Step 1 — choose which company to integrate */}
      {!selected ? (
        <Card padding="md">
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={18} style={{ color: "var(--accent)" }} />
            <h3 className="font-semibold">Which company do you want to integrate?</h3>
          </div>
          <p className="text-[13px] mb-4" style={{ color: "var(--ink-3)" }}>
            Pick a company to see its integration options (Workday, manual entry, and more).
          </p>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search companies…"
            className="w-full px-3 py-2.5 rounded-xl border text-sm mb-3"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          />
          {!companies ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>Loading companies…</p>
          ) : filtered.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>No companies match.</p>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--line)" }}>
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left cairn-nav-item"
                  style={i > 0 ? { borderTop: "1px solid var(--line)" } : undefined}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>{c.name}</div>
                    <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>{c.userCount} users</div>
                  </div>
                  <SubscriptionBadge status={c.billing_status} plan={c.plan} />
                  <ChevronRight size={16} style={{ color: "var(--ink-3)" }} />
                </button>
              ))}
            </div>
          )}
        </Card>
      ) : (
        /* Step 2 — integration options for the chosen company */
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium"
              style={{ color: "var(--accent-text)" }}
            >
              <ArrowLeft size={15} /> Change company
            </button>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{selected.name}</span>
              <SubscriptionBadge status={selected.billing_status} plan={selected.plan} />
            </div>
          </div>
          {userId && (
            <IntegrationPanel scope="company" userId={userId} orgId={selected.id} onManualAdd={onManualAdd} />
          )}
        </>
      )}
    </div>
  );
}
