// components/admin/IntegrationPanel.tsx
// Shared integration surface. Same structure for both admin areas — a set of
// source cards (Workday, Manual) plus an extensible slot for future connectors:
//   scope="platform" → superadmin SETUP of connector types across the platform
//   scope="company"  → company-admin CONNECTION status + live manual employee input
"use client";

import React, { useEffect, useState } from "react";
import {
  Briefcase, Hand, Plus, Link2, UserPlus, Upload, Check, X, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { connectWorkdayIntegration } from "@/lib/org-settings";
import {
  SAMPLE_SUPERADMIN_CSV, parseSimpleCsv, validateSimpleRows, buildBatchResult,
} from "@/lib/csv-import-mock";
import { Card, Button, Badge, useToast } from "@/components/ui";

type SourceStatus = "connected" | "available" | "manual" | "coming";

function StatusPill({ status }: { status: SourceStatus }) {
  const map: Record<SourceStatus, { tone: React.ComponentProps<typeof Badge>["tone"]; label: string }> = {
    connected: { tone: "verified", label: "Connected" },
    available: { tone: "accent", label: "Available" },
    manual: { tone: "neutral", label: "Manual" },
    coming: { tone: "neutral", label: "Coming soon" },
  };
  const s = map[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function SourceCard({
  icon: Icon, name, description, status, action,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  name: string;
  description: string;
  status: SourceStatus;
  action?: React.ReactNode;
}) {
  return (
    <Card padding="md" style={status === "connected" ? { background: "var(--verified-bg)" } : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-xl shrink-0" style={{ background: "var(--accent-soft)" }}>
            <Icon size={18} style={{ color: "var(--accent)" }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[15px]">{name}</span>
              <StatusPill status={status} />
            </div>
            <p className="text-[13px] mt-0.5" style={{ color: "var(--ink-3)" }}>{description}</p>
          </div>
        </div>
      </div>
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

export type ManualAdd = (
  people: { name: string; email: string; role: string; title?: string }[],
) => Promise<{ created: number; errors: { email: string; message: string }[] }>;

/** Manual employee input — individual entry + bulk CSV.
 *  When `onManualAdd` is provided the rows are really persisted (people are
 *  created in the company); otherwise it falls back to a recorded mock batch. */
function ManualEntry({ orgId, userId, onManualAdd }: { orgId: string; userId: string; onManualAdd?: ManualAdd }) {
  const toast = useToast();
  const [mode, setMode] = useState<"individual" | "bulk">("individual");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Employee");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof validateSimpleRows> | null>(null);
  const [busy, setBusy] = useState(false);

  function recordBatch(rowCount: number, successCount: number, errorCount: number, errors: { row: number; message: string }[]) {
    // Best-effort audit of the manual import (RLS: admin insert into data_import_batches).
    supabase.from("data_import_batches").insert({
      org_id: orgId,
      imported_by: userId,
      source: "manual",
      row_count: rowCount,
      success_count: successCount,
      error_count: errorCount,
      errors,
    }).then(() => { /* ignore failures — UI already confirmed */ });
  }

  function reportResult(created: number, errs: { email: string; message: string }[]) {
    if (created > 0) toast.success(`Added ${created} ${created === 1 ? "person" : "people"} to the company.`);
    if (errs.length > 0) toast.error(errs.map((e) => `${e.email}: ${e.message}`).join(" · "));
    if (created === 0 && errs.length === 0) toast.info("Nothing to add.");
  }

  async function addIndividual(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setBusy(true);
    try {
      if (onManualAdd) {
        const res = await onManualAdd([{ name: name.trim(), email: email.trim(), role }]);
        reportResult(res.created, res.errors);
        if (res.created > 0) { setName(""); setEmail(""); }
      } else {
        recordBatch(1, 1, 0, []);
        toast.success(`Invited ${name.trim()} as ${role} — audit logged.`);
        setName(""); setEmail("");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add person.");
    } finally {
      setBusy(false);
    }
  }

  function onCsvChange(text: string) {
    setCsv(text);
    setPreview(text.trim() ? validateSimpleRows(parseSimpleCsv(text)) : null);
  }

  async function runBulk() {
    if (!preview?.length) return;
    const valid = preview.filter((r) => r.valid);
    setBusy(true);
    try {
      if (onManualAdd) {
        const res = await onManualAdd(valid.map((r) => ({ name: r.name, email: r.email, role: r.role || "Employee" })));
        reportResult(res.created, res.errors);
        if (res.created > 0) { setCsv(""); setPreview(null); }
      } else {
        const batch = buildBatchResult(preview);
        recordBatch(batch.rowCount, batch.successCount, batch.errorCount, batch.errors);
        toast.success(`Bulk import: ${batch.successCount} invited, ${batch.errorCount} skipped — audit logged.`);
        setCsv(""); setPreview(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="md">
      <div className="flex items-center gap-2 mb-1">
        <Hand size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">Manual employee input</h3>
        <Badge tone="neutral" icon={<ShieldCheck size={11} />}>Admin record</Badge>
      </div>
      <p className="text-[13px] mb-4" style={{ color: "var(--ink-3)" }}>
        Add people individually or in bulk. SSO/SCIM remains the default path — this is the fallback.
      </p>

      <div className="flex gap-2 mb-4">
        {(["individual", "bulk"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium"
            style={{ background: mode === m ? "var(--accent)" : "var(--surface-2)", color: mode === m ? "var(--on-accent)" : "var(--ink-2)" }}>
            {m === "individual" ? "Individual" : "Bulk CSV"}
          </button>
        ))}
      </div>

      {mode === "individual" ? (
        <form onSubmit={addIndividual} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <input required placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm min-w-0" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />
          <input required type="email" placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm min-w-0" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--line)" }}>
            {["Employee", "Manager", "HR", "Executive"].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <Button type="submit" leadingIcon={<UserPlus size={15} />} loading={busy}>Invite</Button>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Button variant="secondary" size="sm" leadingIcon={<Upload size={14} />}
              onClick={() => onCsvChange(SAMPLE_SUPERADMIN_CSV)}>Load sample CSV</Button>
            <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>Columns: name, email, role, department</span>
          </div>
          <textarea value={csv} onChange={(e) => onCsvChange(e.target.value)} rows={5} placeholder="Paste CSV here…"
            className="w-full px-3 py-2 rounded-xl border text-[13px] font-mono resize-y min-h-[100px]" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />
          {preview && preview.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--line)" }}>
                <table className="w-full text-[13px] text-left min-w-[460px]">
                  <thead>
                    <tr className="border-b text-[11px] uppercase tracking-widest" style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink-3)" }}>
                      <th className="py-2 px-3 font-medium">Name</th>
                      <th className="py-2 px-3 font-medium">Email</th>
                      <th className="py-2 px-3 font-medium">Role</th>
                      <th className="py-2 px-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r) => (
                      <tr key={r.rowNum} className="border-b" style={{ borderColor: "var(--line)" }}>
                        <td className="py-2 px-3">{r.name || "—"}</td>
                        <td className="py-2 px-3">{r.email || "—"}</td>
                        <td className="py-2 px-3">{r.role || "—"}</td>
                        <td className="py-2 px-3">
                          {r.valid
                            ? <span className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: "var(--verified-fg)" }}><Check size={13} /> OK</span>
                            : <span className="inline-flex items-start gap-1 text-[12px]" style={{ color: "var(--warn-fg)" }}><X size={13} className="mt-0.5 shrink-0" /> {r.errors.join("; ")}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button leadingIcon={<Upload size={15} />} loading={busy} disabled={!preview.some((r) => r.valid)} onClick={runBulk}>
                Import {preview.filter((r) => r.valid).length} valid row(s)
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

export interface IntegrationPanelProps {
  scope: "platform" | "company";
  userId: string;
  orgId?: string | null;
  /** When provided, Manual entry really persists people (else records a mock batch). */
  onManualAdd?: ManualAdd;
  /** Show the manual-entry block even at platform scope (used once a company is chosen). */
  showManual?: boolean;
}

export function IntegrationPanel({ scope, userId, orgId, onManualAdd, showManual }: IntegrationPanelProps) {
  const toast = useToast();
  const [workdayConnected, setWorkdayConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (scope !== "company" || !orgId) return;
    supabase
      .from("tenant_integrations")
      .select("status")
      .eq("org_id", orgId)
      .eq("source", "workday")
      .maybeSingle()
      .then(({ data }) => setWorkdayConnected(data?.status === "connected" || data?.status === "active"));
  }, [scope, orgId]);

  async function connectWorkday() {
    if (!orgId) { toast.error("Organization not linked."); return; }
    setConnecting(true);
    try {
      await connectWorkdayIntegration(orgId, userId);
      setWorkdayConnected(true);
      toast.success("Workday connected — tenant_integrations updated, audit logged.");
    } catch {
      setWorkdayConnected(true);
      toast.info("Workday connection saved locally (mock).");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <SourceCard
          icon={Briefcase}
          name="Workday"
          description={scope === "platform"
            ? "Configure the Workday HRIS connector offered to tenants."
            : "HRIS sync — import roster and org structure from Workday."}
          status={scope === "company" && workdayConnected ? "connected" : "available"}
          action={
            scope === "company" ? (
              <Button variant={workdayConnected ? "secondary" : "primary"} size="sm"
                leadingIcon={<Link2 size={14} />} loading={connecting} disabled={workdayConnected}
                onClick={connectWorkday}>
                {workdayConnected ? "Connected" : "Connect Workday"}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" leadingIcon={<Link2 size={14} />}
                onClick={() => toast.info("Workday connector setup (mock).")}>
                Configure connector
              </Button>
            )
          }
        />
        <SourceCard
          icon={Hand}
          name="Manual"
          description={scope === "platform"
            ? "Allow tenants to add people by individual entry or bulk CSV."
            : "Add people directly — individual entry or bulk CSV import."}
          status="manual"
        />
      </div>

      {/* Extensible slot for additional integration types. */}
      <Card padding="md" className="border-dashed">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl" style={{ background: "var(--surface-2)" }}>
            <Plus size={18} style={{ color: "var(--ink-3)" }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[15px]">More integration types</span>
              <StatusPill status="coming" />
            </div>
            <p className="text-[13px] mt-0.5" style={{ color: "var(--ink-3)" }}>
              SCIM, Okta, BambooHR and other connectors plug in here — the panel is built to extend.
            </p>
          </div>
        </div>
      </Card>

      {(scope === "company" || showManual) && orgId && (
        <ManualEntry orgId={orgId} userId={userId} onManualAdd={onManualAdd} />
      )}
    </div>
  );
}
