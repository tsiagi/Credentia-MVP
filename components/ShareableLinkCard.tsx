"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Copy, Check, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { ensureShareableLink, revokeShareableLinks, shareableUrl } from "@/lib/shareable";

export function ShareableLinkCard({ userId }: { userId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    const { data } = await supabaseFromShare(userId);
    setToken(data?.token ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  async function createLink() {
    setGenerating(true);
    try {
      const t = await ensureShareableLink(userId);
      setToken(t);
    } finally {
      setGenerating(false);
    }
  }

  async function rotateLink() {
    setGenerating(true);
    try {
      await revokeShareableLinks(userId);
      const t = await ensureShareableLink(userId);
      setToken(t);
    } finally {
      setGenerating(false);
    }
  }

  async function copyLink() {
    if (!token) return;
    await navigator.clipboard.writeText(shareableUrl(token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return null;

  const url = token ? shareableUrl(token) : null;

  return (
    <div className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Link2 size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">Shareable verified profile</h3>
      </div>
      <p className="text-[13px] opacity-70 mb-4 max-w-2xl">
        Get a URL that shows your name, role, and <strong>verified achievements only</strong>.
        No AI inferences, compensation, or value scores. View-only — not downloadable.
      </p>

      {!token ? (
        <button type="button" onClick={createLink} disabled={generating}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-white inline-flex items-center gap-2 disabled:opacity-60"
          style={{ background: "var(--accent)" }}>
          <Globe size={16} /> {generating ? "Creating…" : "Create shareable link"}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input readOnly value={url ?? ""} className="flex-1 px-3 py-2 rounded-xl border text-[13px] font-mono min-w-0"
              style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={copyLink} className="px-3 py-2 rounded-xl text-sm font-medium border inline-flex items-center gap-1.5"
                style={{ borderColor: "var(--line)" }}>
                {copied ? <Check size={15} style={{ color: "var(--verified-fg)" }} /> : <Copy size={15} />}
                {copied ? "Copied" : "Copy"}
              </button>
              <a href={url!} target="_blank" rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl text-sm font-medium text-white inline-flex items-center gap-1.5"
                style={{ background: "var(--verified-fg)" }}>
                <ExternalLink size={15} /> Preview
              </a>
            </div>
          </div>
          <button type="button" onClick={rotateLink} disabled={generating}
            className="text-[13px] font-medium inline-flex items-center gap-1.5 opacity-70 hover:opacity-100"
            style={{ color: "var(--accent)" }}>
            <RefreshCw size={14} /> {generating ? "Rotating…" : "Revoke & create new link"}
          </button>
        </div>
      )}
    </div>
  );
}

async function supabaseFromShare(userId: string) {
  const { supabase } = await import("@/lib/supabase");
  return supabase
    .from("shareable_links")
    .select("token")
    .eq("profile_id", userId)
    .eq("revoked", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}
