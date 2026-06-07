"use client";

import React from "react";
import { FileText, ExternalLink } from "lucide-react";

function isDataUrl(value: string) {
  return value.startsWith("data:");
}

function isPdfDataUrl(value: string) {
  return value.startsWith("data:application/pdf");
}

function isImageDataUrl(value: string) {
  return value.startsWith("data:image/");
}

function fileNameFromDataUrl(value: string) {
  if (isPdfDataUrl(value)) return "proof-document.pdf";
  if (isImageDataUrl(value)) return "proof-image";
  return "supporting-document";
}

export function ProofDocumentView({ evidenceUrl, compact }: { evidenceUrl: string | null | undefined; compact?: boolean }) {
  if (!evidenceUrl?.trim()) return null;

  const value = evidenceUrl.trim();
  const isDoc = isDataUrl(value);

  if (!isDoc) {
    return (
      <div className={`${compact ? "mt-2" : "mt-3"} p-3 rounded-xl border text-[13px]`} style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <div className="text-[11px] uppercase tracking-widest opacity-60 mb-1">Supporting proof</div>
        <a href={value} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium break-all" style={{ color: "var(--accent)" }}>
          <ExternalLink size={14} className="shrink-0" /> {value}
        </a>
      </div>
    );
  }

  const label = fileNameFromDataUrl(value);

  return (
    <div className={`${compact ? "mt-2" : "mt-3"} p-3 rounded-xl border`} style={{ borderColor: "var(--line)", background: "var(--verified-bg)" }}>
      <div className="flex items-center gap-2 mb-2">
        <FileText size={16} style={{ color: "var(--verified-fg)" }} />
        <span className="text-[12px] font-semibold" style={{ color: "var(--verified-fg)" }}>Proof document attached</span>
      </div>
      {isImageDataUrl(value) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="Proof document" className="max-h-48 rounded-lg border mb-2 object-contain" style={{ borderColor: "var(--line)" }} />
      )}
      <a href={value} download={label} className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: "var(--verified-fg)" }}>
        <ExternalLink size={14} /> View / download {label}
      </a>
    </div>
  );
}

export function ProofDocumentUpload({
  requireProof,
  documentDataUrl,
  onDocumentChange,
  note,
}: {
  requireProof: boolean;
  documentDataUrl: string | null;
  onDocumentChange: (dataUrl: string | null, fileName: string | null) => void;
  note?: string;
}) {
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      onDocumentChange(null, null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onDocumentChange(reader.result as string, file.name);
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2">
      <label className="block text-[12px] uppercase tracking-widest opacity-60">
        Proof document {requireProof ? "(required)" : "(optional)"}
      </label>
      <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border cursor-pointer"
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <FileText size={16} style={{ color: "var(--accent)" }} />
        {documentDataUrl ? "Replace document" : "Attach document"}
        <input type="file" accept=".pdf,image/*,.doc,.docx" className="hidden" onChange={handleFile} />
      </label>
      {documentDataUrl && (
        <p className="text-[12px]" style={{ color: "var(--verified-fg)" }}>
          Document attached — your manager can review it during verification.
        </p>
      )}
      {note && <p className="text-[12px] opacity-60">{note}</p>}
    </div>
  );
}
