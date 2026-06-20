// components/flow/ItemDetailDrawer.tsx
// ─────────────────────────────────────────────────────────────
// Item detail = the append-only LEDGER for one work item + the transition
// control. This is where evidence-gating shows its teeth:
//   • Choosing ATTESTED (or a target column that is ATTESTED-only) REQUIRES an
//     evidence artifact. The server enforces it too — this UI just surfaces it.
//   • Every move appends a new ledger event; history is never edited.
// ─────────────────────────────────────────────────────────────
"use client";

import React, { useEffect, useState } from "react";
import { X, ShieldCheck, Paperclip, Plus, ArrowRight, Lock } from "lucide-react";
import {
  type FlowItem,
  type FlowColumn,
  type TransitionEvent,
  type EvidenceArtifact,
  type ArtifactKind,
  getItemLedger,
  getArtifacts,
  addArtifact,
  recordTransition,
} from "@/lib/flow";
import { ProvenanceBadge } from "./ProvenanceBadge";

const ARTIFACT_KINDS: { value: ArtifactKind; label: string }[] = [
  { value: "merged_pr", label: "Merged PR" },
  { value: "deploy", label: "Deploy ID" },
  { value: "approval", label: "Signed approval" },
  { value: "file", label: "Uploaded file" },
  { value: "webhook", label: "External webhook" },
  { value: "link", label: "Link" },
];

export function ItemDetailDrawer({
  item,
  columns,
  colNameById,
  me,
  onClose,
  onChanged,
}: {
  item: FlowItem;
  columns: FlowColumn[];
  colNameById: Map<string, string>;
  me: { id: string; orgId: string };
  onClose: () => void;
  onChanged: () => void;
}) {
  const [ledger, setLedger] = useState<TransitionEvent[]>([]);
  const [artifacts, setArtifacts] = useState<EvidenceArtifact[]>([]);
  const [loading, setLoading] = useState(true);

  const [targetCol, setTargetCol] = useState<string>("");
  const [tier, setTier] = useState<"ASSERTED" | "ATTESTED">("ASSERTED");
  const [artifactId, setArtifactId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // new-artifact mini form
  const [showNewArtifact, setShowNewArtifact] = useState(false);
  const [aKind, setAKind] = useState<ArtifactKind>("merged_pr");
  const [aUri, setAUri] = useState("");
  const [aLabel, setALabel] = useState("");

  async function refresh() {
    const [l, a] = await Promise.all([getItemLedger(item.id), getArtifacts([item.id])]);
    setLedger(l);
    setArtifacts(a);
    setLoading(false);
  }
  useEffect(() => {
    let active = true;
    (async () => {
      const [l, a] = await Promise.all([getItemLedger(item.id), getArtifacts([item.id])]);
      if (!active) return;
      setLedger(l);
      setArtifacts(a);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [item.id]);

  const targetColumn = columns.find((c) => c.id === targetCol);
  const columnForcesAttested = targetColumn?.required_tier === "ATTESTED";
  const effectiveTier: "ASSERTED" | "ATTESTED" = columnForcesAttested ? "ATTESTED" : tier;
  const needsArtifact = effectiveTier === "ATTESTED";

  async function createArtifact() {
    setError(null);
    if (!aUri.trim()) {
      setError("Artifact reference (URL / id) is required.");
      return;
    }
    try {
      const created = await addArtifact({
        orgId: me.orgId,
        itemId: item.id,
        kind: aKind,
        uri: aUri.trim(),
        label: aLabel.trim() || undefined,
        addedBy: me.id,
      });
      setArtifacts((xs) => [created, ...xs]);
      setArtifactId(created.id);
      setShowNewArtifact(false);
      setAUri("");
      setALabel("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add artifact");
    }
  }

  async function submitTransition() {
    setError(null);
    if (!targetCol) {
      setError("Pick a destination column.");
      return;
    }
    if (needsArtifact && !artifactId) {
      setError("An ATTESTED move requires a linked evidence artifact.");
      return;
    }
    setSaving(true);
    try {
      await recordTransition({
        itemId: item.id,
        toColumnId: targetCol,
        tier: effectiveTier,
        artifactId: needsArtifact ? artifactId : null,
        reason: reason.trim() || null,
      });
      setReason("");
      setTargetCol("");
      setTier("ASSERTED");
      setArtifactId("");
      await refresh();
      onChanged();
    } catch (e) {
      // Server-side gate (e.g. ATTESTED-only column) surfaces here verbatim.
      setError(e instanceof Error ? e.message : "Transition rejected");
    } finally {
      setSaving(false);
    }
  }

  const artifactLabel = (id: string | null) =>
    id ? artifacts.find((a) => a.id === id)?.label ?? artifacts.find((a) => a.id === id)?.uri ?? "evidence" : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      <div
        className="relative w-full max-w-md h-full overflow-y-auto animate-in slide-in-from-right duration-200 border-l"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <div className="sticky top-0 z-10 px-5 py-4 border-b flex items-start justify-between gap-3"
          style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
          <div>
            <h2 className="text-[16px] font-semibold leading-tight" style={{ color: "var(--ink)" }}>{item.title}</h2>
            <p className="text-[12px] mt-0.5 font-mono" style={{ color: "var(--ink-3)" }}>{item.point_estimate} pts</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md transition" style={{ color: "var(--ink-3)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {item.description && (
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>{item.description}</p>
          )}

          {/* ── Transition control ─────────────────────────── */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>Record a transition</h3>

            <div>
              <label className="text-[11.5px] font-medium" style={{ color: "var(--ink-3)" }}>Move to</label>
              <select
                value={targetCol}
                onChange={(e) => setTargetCol(e.target.value)}
                className="w-full mt-1 rounded-lg border px-2.5 py-2 text-[13px] bg-[var(--surface)]"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              >
                <option value="">Select column…</option>
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.required_tier === "ATTESTED" ? " — ATTESTED only" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Tier selector — locked to ATTESTED when the column demands it */}
            <div>
              <label className="text-[11.5px] font-medium" style={{ color: "var(--ink-3)" }}>Provenance tier</label>
              <div className="flex gap-1.5 mt-1">
                {(["ASSERTED", "ATTESTED"] as const).map((t) => {
                  const active = effectiveTier === t;
                  const locked = columnForcesAttested && t === "ASSERTED";
                  return (
                    <button
                      key={t}
                      disabled={locked}
                      onClick={() => setTier(t)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12px] font-semibold transition disabled:opacity-40"
                      style={{
                        border: active ? "1.5px solid var(--accent)" : "1px solid var(--line)",
                        background: active ? "var(--accent-soft)" : "var(--surface)",
                        color: active ? "var(--accent-text)" : "var(--ink-3)",
                      }}
                    >
                      {t === "ATTESTED" ? <ShieldCheck size={13} /> : null}
                      {t === "ASSERTED" ? "Asserted (self-report)" : "Attested (evidence)"}
                    </button>
                  );
                })}
              </div>
              {columnForcesAttested && (
                <p className="text-[11px] mt-1.5 inline-flex items-center gap-1" style={{ color: "var(--verified-fg)" }}>
                  <Lock size={11} /> This column accepts evidence-backed work only.
                </p>
              )}
            </div>

            {/* Artifact picker — only when ATTESTED */}
            {needsArtifact && (
              <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--verified-fg)", background: "var(--verified-bg)" }}>
                <label className="text-[11.5px] font-semibold inline-flex items-center gap-1" style={{ color: "var(--verified-fg)" }}>
                  <Paperclip size={12} /> Evidence artifact (required)
                </label>
                <select
                  value={artifactId}
                  onChange={(e) => setArtifactId(e.target.value)}
                  className="w-full mt-1.5 rounded-lg border px-2.5 py-2 text-[12.5px] bg-[var(--surface)]"
                  style={{ borderColor: "var(--line)", color: "var(--ink)" }}
                >
                  <option value="">Select artifact…</option>
                  {artifacts.map((a) => (
                    <option key={a.id} value={a.id}>{a.label ?? a.uri} ({a.kind})</option>
                  ))}
                </select>

                {!showNewArtifact ? (
                  <button
                    onClick={() => setShowNewArtifact(true)}
                    className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium"
                    style={{ color: "var(--verified-fg)" }}
                  >
                    <Plus size={12} /> Attach new artifact
                  </button>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    <select value={aKind} onChange={(e) => setAKind(e.target.value as ArtifactKind)}
                      className="w-full rounded-lg border px-2 py-1.5 text-[12px] bg-[var(--surface)]" style={{ borderColor: "var(--line)", color: "var(--ink)" }}>
                      {ARTIFACT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                    <input value={aUri} onChange={(e) => setAUri(e.target.value)} placeholder="https://… or deploy:prod:…"
                      className="w-full rounded-lg border px-2 py-1.5 text-[12px] bg-[var(--surface)]" style={{ borderColor: "var(--line)", color: "var(--ink)" }} />
                    <input value={aLabel} onChange={(e) => setALabel(e.target.value)} placeholder="Label (optional)"
                      className="w-full rounded-lg border px-2 py-1.5 text-[12px] bg-[var(--surface)]" style={{ borderColor: "var(--line)", color: "var(--ink)" }} />
                    <div className="flex gap-1.5">
                      <button onClick={createArtifact} className="text-[11.5px] font-semibold rounded-md px-2.5 py-1.5"
                        style={{ background: "var(--verified-fg)", color: "white" }}>Save artifact</button>
                      <button onClick={() => setShowNewArtifact(false)} className="text-[11.5px] px-2.5 py-1.5" style={{ color: "var(--ink-3)" }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why? (recorded in the ledger)"
              className="w-full rounded-lg border px-2.5 py-2 text-[12.5px] bg-[var(--surface)]"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}
            />

            {error && <p className="text-[12px]" style={{ color: "var(--error, #EF4444)" }}>{error}</p>}

            <button
              onClick={submitTransition}
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition active:scale-[0.98] disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              <ArrowRight size={14} /> {saving ? "Recording…" : "Append to ledger"}
            </button>
          </div>

          {/* ── Append-only ledger ─────────────────────────── */}
          <div>
            <h3 className="text-[13px] font-semibold mb-2" style={{ color: "var(--ink)" }}>
              Change ledger <span className="font-normal" style={{ color: "var(--ink-3)" }}>· append-only</span>
            </h3>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "var(--surface-2)" }} />)}
              </div>
            ) : (
              <ol className="relative space-y-3 pl-4" style={{ borderLeft: "2px solid var(--line)" }}>
                {ledger.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full"
                      style={{ background: e.provenance_tier === "ATTESTED" ? "var(--verified-fg)" : "var(--ink-3)" }} />
                    <div className="flex items-center gap-2 flex-wrap">
                      <ProvenanceBadge tier={e.provenance_tier} size="sm" />
                      <span className="text-[12px] font-medium" style={{ color: "var(--ink)" }}>
                        {e.event_type === "create" ? "Created" : "→"} {e.to_column_id ? colNameById.get(e.to_column_id) ?? "" : e.event_type}
                      </span>
                    </div>
                    {e.reason && <p className="text-[11.5px] mt-0.5" style={{ color: "var(--ink-2)" }}>{e.reason}</p>}
                    {e.artifact_id && (
                      <p className="text-[11px] mt-0.5 inline-flex items-center gap-1" style={{ color: "var(--verified-fg)" }}>
                        <Paperclip size={10} /> {artifactLabel(e.artifact_id)}
                      </p>
                    )}
                    {e.source_inference_id && (
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--inferred-fg)" }}>
                        promoted from AI inference
                      </p>
                    )}
                    <p className="text-[10.5px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                      {new Date(e.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
