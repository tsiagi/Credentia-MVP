"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, ToggleLeft, ToggleRight, Users, Trash2, ShieldCheck } from "lucide-react";
import { PageHeader, Card, Badge, useToast } from "@/components/ui";
import { BrandingCard } from "@/components/admin/BrandingCard";
import { useAdminSession } from "@/lib/admin/use-session";
import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";
import { fetchOrgRoster, type OrgPerson } from "@/lib/admin/company-metrics";

type OrgRow = {
  logo_url: string | null;
  brand_color: string | null;
  ai_coaching_enabled: boolean;
  promotion_engine_enabled: boolean;
  require_proof: boolean;
};

function Toggle({ label, desc, value, onChange, busy }: { label: string; desc: string; value: boolean; onChange: () => void; busy?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b last:border-0" style={{ borderColor: "var(--line)" }}>
      <div className="min-w-0">
        <div className="font-medium text-[14px]">{label}</div>
        <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>{desc}</div>
      </div>
      <button type="button" onClick={onChange} disabled={busy} className="shrink-0 disabled:opacity-50">
        {value ? <ToggleRight size={28} style={{ color: "var(--accent)" }} /> : <ToggleLeft size={28} style={{ color: "var(--ink-3)" }} />}
      </button>
    </div>
  );
}

export default function AdminOrgControls() {
  const { userId, ready } = useAdminSession();
  const toast = useToast();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [roster, setRoster] = useState<OrgPerson[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !userId) return;
    let cancelled = false;
    (async () => {
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", userId).single();
      const oid = profile?.org_id as string | undefined;
      if (!oid || cancelled) return;
      const [{ data: orgRow }, people] = await Promise.all([
        supabase.from("organizations").select("*").eq("id", oid).single(),
        fetchOrgRoster(oid),
      ]);
      if (cancelled) return;
      setOrgId(oid);
      if (orgRow) {
        setOrg({
          logo_url: (orgRow.logo_url as string) ?? null,
          brand_color: (orgRow.brand_color as string) ?? null,
          ai_coaching_enabled: orgRow.ai_coaching_enabled ?? true,
          promotion_engine_enabled: orgRow.promotion_engine_enabled ?? true,
          require_proof: orgRow.require_proof ?? true,
        });
      }
      setRoster(people);
    })();
    return () => { cancelled = true; };
  }, [ready, userId]);

  async function saveBranding(patch: { logo_url?: string; brand_color?: string }) {
    if (!orgId || !userId) throw new Error("Not linked to an organization");
    const { error } = await supabase.from("organizations").update(patch).eq("id", orgId);
    if (error) throw error;
    await writeAuditLog({ actorId: userId, action: "org_branding_updated", targetTable: "organizations", targetId: orgId, changes: patch });
    setOrg((o) => (o ? { ...o, ...patch } : o));
  }

  async function toggle(key: keyof OrgRow) {
    if (!orgId || !userId || !org) return;
    const next = !org[key];
    setBusyKey(key);
    try {
      const { error } = await supabase.from("organizations").update({ [key]: next }).eq("id", orgId);
      if (error) throw error;
      await writeAuditLog({ actorId: userId, action: `org_${key}_toggled`, targetTable: "organizations", targetId: orgId, changes: { [key]: next } });
      setOrg({ ...org, [key]: next });
      toast.success("Saved — audit logged.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusyKey(null);
    }
  }

  async function removeUser(person: OrgPerson) {
    if (!orgId || !userId) return;
    if (!window.confirm(`Remove ${person.full_name || "this user"}? Only a company admin can delete a profile — this is permanent.`)) return;
    try {
      const { error } = await supabase.from("profiles").delete().eq("id", person.id).eq("org_id", orgId);
      if (error) throw error;
      await writeAuditLog({ actorId: userId, action: "user_removed", targetTable: "profiles", targetId: person.id, changes: { name: person.full_name } });
      setRoster((r) => r.filter((p) => p.id !== person.id));
      toast.success(`${person.full_name || "User"} removed — audit logged.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove user (RLS may require the admin-delete policy).");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="Org Controls"
        subtitle="Branding, AI feature policy, and user management for your company."
      />

      {org && (
        <BrandingCard
          logoUrl={org.logo_url}
          brandColor={org.brand_color}
          onSave={saveBranding}
          title="Color settings & branding"
          description="Your logo and accent colour appear in the app shell for everyone in your company."
        />
      )}

      {org && (
        <Card padding="md">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={18} style={{ color: "var(--inferred-fg)" }} />
            <h3 className="font-semibold">AI feature policy</h3>
            <Badge tone="inferred" icon={<Sparkles size={11} />}>AI</Badge>
          </div>
          <p className="text-[13px] mb-2" style={{ color: "var(--ink-3)" }}>
            When off, the corresponding panels are hidden company-wide. AI outputs stay labeled estimates when on.
          </p>
          <Toggle label="AI Coaching" desc="Manager coaching insights from promotion readiness." value={org.ai_coaching_enabled} busy={busyKey === "ai_coaching_enabled"} onChange={() => toggle("ai_coaching_enabled")} />
          <Toggle label="Promotion Readiness engine" desc="Promotion-timing panels for managers and executives." value={org.promotion_engine_enabled} busy={busyKey === "promotion_engine_enabled"} onChange={() => toggle("promotion_engine_enabled")} />
          <Toggle label="Require proof / evidence" desc="Employees must attach evidence before achievements or attestations." value={org.require_proof} busy={busyKey === "require_proof"} onChange={() => toggle("require_proof")} />
        </Card>
      )}

      <Card padding="md">
        <div className="flex items-center gap-2 mb-1">
          <Users size={18} style={{ color: "var(--accent)" }} />
          <h3 className="font-semibold">User management</h3>
          <Badge tone="neutral" icon={<ShieldCheck size={11} />}>Admin record</Badge>
        </div>
        <p className="text-[13px] mb-4" style={{ color: "var(--ink-3)" }}>
          You are the only role that can remove a profile from this company. Removal is permanent and audit-logged.
        </p>
        {roster.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>No people to manage yet.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--line)" }}>
            {roster.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>{p.full_name || p.title || "Unnamed"}</div>
                  <div className="text-[12px] capitalize" style={{ color: "var(--ink-3)" }}>{p.role}{p.title ? ` · ${p.title}` : ""}</div>
                </div>
                <button type="button" onClick={() => removeUser(p)}
                  className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-lg border shrink-0"
                  style={{ borderColor: "var(--line)", color: "var(--danger-fg)" }}>
                  <Trash2 size={13} /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
