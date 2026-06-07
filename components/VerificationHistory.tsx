"use client";

import { useEffect, useState } from "react";
import { History, ChevronDown, ChevronUp } from "lucide-react";
import { fetchAuditHistory, formatAuditAction, type AuditLogRow } from "@/lib/audit";

export function VerificationHistory({
  targetTable,
  targetId,
  compact,
}: {
  targetTable: string;
  targetId: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchAuditHistory(targetTable, targetId);
        if (!cancelled) {
          setRows(data);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, loaded, targetTable, targetId]);

  return (
    <div className={compact ? "mt-2" : "mt-3 pt-3 border-t"} style={{ borderColor: "var(--line)" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium opacity-70 hover:opacity-100 transition"
        style={{ color: "var(--accent)" }}
      >
        <History size={13} />
        Verification history
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {rows.length > 0 && !open && (
          <span className="opacity-60">({rows.length})</span>
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {loading && <p className="text-[12px] opacity-60">Loading audit trail…</p>}
          {!loading && rows.length === 0 && (
            <p className="text-[12px] opacity-60">No audit entries yet for this record.</p>
          )}
          {rows.map((r) => (
            <div
              key={r.id}
              className="text-[12px] px-3 py-2 rounded-lg"
              style={{ background: "var(--surface-2)" }}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium">{formatAuditAction(r.action)}</span>
                <span className="opacity-50">·</span>
                <span className="opacity-70">{r.actor_name ?? "Unknown"}</span>
                <span className="opacity-50">·</span>
                <span className="opacity-60">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              {Object.keys(r.changes ?? {}).length > 0 && (
                <pre className="mt-1 text-[11px] opacity-60 whitespace-pre-wrap font-mono">
                  {JSON.stringify(r.changes, null, 0)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
