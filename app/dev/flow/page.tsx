// app/dev/flow/page.tsx
// Preview route for FLOW — Provenance-Native Work Tracking. Mounts the board
// against the signed-in user's real session (RLS scopes everything to the org).
"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, CircleDashed, Sparkles } from "lucide-react";
import { FlowBoard } from "@/components/flow/FlowBoard";

type Me = { id: string; orgId: string };

export default function FlowPreview() {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "signed-out">("loading");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setStatus("signed-out"); return; }
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
      setMe({ id: user.id, orgId: (profile?.org_id as string) ?? "" });
      setStatus("ready");
    })();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--content-bg, var(--bg))" }}>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-5">
          <div className="cairn-eyebrow mb-2">Preview · Flow</div>
          <h1 className="text-[28px] font-semibold" style={{ color: "var(--ink)" }}>Provenance-Native Work Tracking</h1>
          <p className="text-[14px] mt-1 max-w-2xl" style={{ color: "var(--ink-3)" }}>
            Every status carries a trust tier. Evidence-backed work is attested; self-reported work is flagged
            unverified; AI stays quarantined until a human promotes it.
          </p>
          <div className="flex items-center gap-2 mt-3 flex-wrap text-[12px]">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium"
              style={{ color: "var(--verified-fg)", background: "var(--verified-bg)" }}>
              <ShieldCheck size={12} /> Attested · evidence-backed
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium"
              style={{ color: "var(--ink-3)", border: "1px dashed var(--line-strong)" }}>
              <CircleDashed size={12} /> Asserted · self-reported
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium"
              style={{ color: "var(--inferred-fg)", background: "var(--inferred-bg)" }}>
              <Sparkles size={12} /> Inferred · AI, quarantined
            </span>
          </div>
        </div>

        {status === "loading" && <div className="h-64 rounded-2xl animate-pulse" style={{ background: "var(--surface-2)" }} />}

        {status === "signed-out" && (
          <div className="border rounded-2xl p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
            <p className="font-medium">Sign in to use Flow</p>
            <p className="text-[13px] opacity-60 mt-1">The board reads and writes your real, RLS-scoped data.</p>
          </div>
        )}

        {status === "ready" && me && (
          <div className="animate-in fade-in duration-200">
            <FlowBoard userId={me.id} orgId={me.orgId} />
          </div>
        )}
      </div>
    </div>
  );
}
