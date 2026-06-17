"use client";
// components/docs/DocRepository.tsx
// ─────────────────────────────────────────────────────────────
// Verified Documentation Repository.
//
// Drafts render NEUTRAL (grey "Draft" pill). A manager/admin/superadmin can
// verify a doc — it then shows the BLUE shield and joins the verified-facts
// graph. The verify button only appears for privileged roles; the database
// trigger is the real gate (a crafted request from an employee is rejected).
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from "react";
import { BookOpen, Plus, ShieldCheck, FileText, Loader2, Lock, Upload } from "lucide-react";
import { Reveal } from "@/components/ui/motion";
import {
  fetchDocs, createDoc, verifyDoc, canVerifyDocs,
  type DocRow, type DocType, type DocVisibility,
} from "@/lib/documentation";

const TYPE_LABEL: Record<DocType, string> = {
  guide: "Guide", task_outcome: "Task outcome",
  conversation_summary: "Conversation summary", reference: "Reference",
};

export function DocRepository({
  userId, orgId, role,
}: { userId: string; orgId: string; role: string | null }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ title: string; body: string; docType: DocType; visibility: DocVisibility }>(
    { title: "", body: "", docType: "guide", visibility: "org" },
  );
  const fileRef = useRef<HTMLInputElement | null>(null);

  const privileged = canVerifyDocs(role);

  // Import a text-based document from the local computer into the draft.
  async function importFile(file: File) {
    setError(null);
    const tooBig = file.size > 1_000_000; // 1 MB cap for inline text
    if (tooBig) {
      setError("File is larger than 1 MB. Paste the relevant section instead.");
      return;
    }
    try {
      const text = await file.text();
      const titleFromName = file.name.replace(/\.[^.]+$/, "");
      setCreating(true);
      setDraft((d) => ({
        ...d,
        title: d.title.trim() || titleFromName,
        body: d.body.trim() ? `${d.body}\n\n${text}` : text,
      }));
    } catch {
      setError("Could not read that file. Text files (.txt, .md, .csv, …) work best.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchDocs();
        if (!cancelled) setDocs(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load documentation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function addDoc() {
    if (!draft.title.trim() || !draft.body.trim()) return;
    setError(null);
    try {
      const d = await createDoc(userId, orgId, draft);
      setDocs((prev) => [d, ...prev]);
      setDraft({ title: "", body: "", docType: "guide", visibility: "org" });
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the document.");
    }
  }

  async function verify(doc: DocRow) {
    setBusy(doc.id); setError(null);
    try {
      const updated = await verifyDoc(userId, doc.id);
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify this document.");
    } finally { setBusy(null); }
  }

  return (
    <div className="border rounded-2xl p-6" style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
      <div className="flex items-center gap-2 mb-1">
        <BookOpen size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">Documentation</h3>
        <button onClick={() => setCreating((v) => !v)}
          className="ml-auto px-3 py-1.5 rounded-lg text-[13px] font-medium inline-flex items-center gap-1 transition active:scale-[0.98]"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
          <Plus size={14} style={{ transform: creating ? "rotate(45deg)" : "none", transition: "transform var(--duration-base)" }} /> New doc
        </button>
      </div>
      <p className="text-[13px] opacity-60 mb-4">
        Drafts are neutral. Verified docs carry the blue shield and become official facts —
        only a manager or admin can verify.
      </p>

      <div className="grid transition-all duration-300" style={{ gridTemplateRows: creating ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className="p-4 rounded-xl border mb-4 cairn-pop" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>Write below, or import a file from your computer.</span>
              <input ref={fileRef} type="file" className="hidden"
                accept=".txt,.md,.markdown,.csv,.json,.log,.rtf,text/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
              <button type="button" onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition active:scale-[0.98]"
                style={{ background: "var(--surface)", color: "var(--ink-2)", border: "1px solid var(--line)" }}>
                <Upload size={13} /> Import file
              </button>
            </div>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Title"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none mb-2"
              style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }} />
            <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="Write the guide, outcome, or summary…" rows={4}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none mb-2 resize-none"
              style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }} />
            <div className="flex items-center gap-2 flex-wrap">
              <select value={draft.docType} onChange={(e) => setDraft({ ...draft, docType: e.target.value as DocType })}
                className="px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={draft.visibility} onChange={(e) => setDraft({ ...draft, visibility: e.target.value as DocVisibility })}
                className="px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}>
                <option value="org">Public</option>
                <option value="team">Immediate team</option>
                <option value="private">Just me (private)</option>
              </select>
              <button onClick={addDoc} disabled={!draft.title.trim() || !draft.body.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
                style={{ background: "var(--accent)" }}>Save draft</button>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-[13px] px-3 py-2 rounded-lg mb-3" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "var(--surface-2)" }} />)}</div>
      ) : docs.length === 0 ? (
        <div className="py-10 grid place-items-center text-center">
          <FileText size={26} style={{ color: "var(--ink-3)" }} className="mb-2" />
          <p className="font-medium">No documentation yet</p>
          <p className="text-[13px] opacity-60 mt-1 max-w-sm">Capture a guide or a task outcome. A manager can verify it to make it official.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((d, idx) => {
            const isVerified = d.status === "verified";
            return (
              <Reveal key={d.id} delay={idx * 50}
                className="rounded-xl border p-4"
                style={{
                  borderColor: isVerified ? "var(--verified-fg)" : "var(--line)",
                  background: isVerified ? "var(--verified-bg)" : "var(--surface-2)",
                }}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" style={{ color: "var(--ink)" }}>{d.title}</span>
                      {isVerified ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: "var(--surface)", color: "var(--verified-fg)" }}>
                          <ShieldCheck size={12} /> Verified
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: "var(--surface)", color: "var(--ink-3)" }}>Draft</span>
                      )}
                      <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--surface)", color: "var(--ink-3)" }}>
                        {TYPE_LABEL[d.doc_type]}
                      </span>
                      {d.visibility !== "org" && (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--surface)", color: "var(--ink-3)" }}>
                          <Lock size={10} /> {d.visibility === "managers" ? "Managers" : "Private"}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] mt-1 line-clamp-3" style={{ color: "var(--ink-2)" }}>{d.body}</p>
                  </div>
                  {privileged && !isVerified && (
                    <button onClick={() => verify(d)} disabled={busy === d.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white transition active:scale-[0.98] disabled:opacity-40 shrink-0"
                      style={{ background: "var(--verified-fg)" }}>
                      {busy === d.id ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Verify
                    </button>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
