// app/dev/workspace/page.tsx
// Preview route for the Task/Project · Documentation · Messaging · Scout
// workspace. Not linked from the marketing site; safe to delete. Mounts the new
// features against the signed-in user's real session (RLS scopes everything).
"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { KanbanSquare, BookOpen, MessageSquare, Bot } from "lucide-react";
import { ProjectTaskBoard } from "@/components/projects/ProjectTaskBoard";
import { DocRepository } from "@/components/docs/DocRepository";
import { ChatInterface } from "@/components/messaging/ChatInterface";
import { AgentConfiguration } from "@/components/agent/AgentConfiguration";

type Me = { id: string; orgId: string; role: string | null };
type Tab = "board" | "docs" | "messages" | "agent";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "board", label: "Project Board", icon: <KanbanSquare size={15} /> },
  { key: "docs", label: "Documentation", icon: <BookOpen size={15} /> },
  { key: "messages", label: "Messages", icon: <MessageSquare size={15} /> },
  { key: "agent", label: "Scout", icon: <Bot size={15} /> },
];

export default function WorkspacePreview() {
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>("board");
  const [status, setStatus] = useState<"loading" | "ready" | "signed-out">("loading");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setStatus("signed-out"); return; }
      const { data: profile } = await supabase
        .from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
      setMe({ id: user.id, orgId: (profile?.org_id as string) ?? "", role: (profile?.role as string) ?? null });
      setStatus("ready");
    })();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--content-bg, var(--bg))" }}>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-6">
          <div className="core-roborate-eyebrow mb-2">Preview · Workspace</div>
          <h1 className="text-[28px] font-semibold" style={{ color: "var(--ink)" }}>Tasks, Knowledge &amp; Your Twin</h1>
          <p className="text-[14px] mt-1" style={{ color: "var(--ink-3)" }}>
            Verified facts stay blue; AI suggestions stay amber — never mixed.
          </p>
        </div>

        {status === "loading" && <div className="h-64 rounded-2xl animate-pulse" style={{ background: "var(--surface-2)" }} />}

        {status === "signed-out" && (
          <div className="border rounded-2xl p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
            <p className="font-medium">Sign in to use the workspace</p>
            <p className="text-[13px] opacity-60 mt-1">These features read and write your real, RLS-scoped data.</p>
          </div>
        )}

        {status === "ready" && me && (
          <>
            <div className="flex items-center gap-1.5 mb-5 flex-wrap">
              {TABS.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium transition active:scale-[0.98]"
                  style={tab === t.key
                    ? { background: "var(--accent)", color: "var(--on-accent)" }
                    : { background: "var(--surface-2)", color: "var(--ink-2)" }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            <div className="animate-in fade-in duration-200">
              {tab === "board" && <ProjectTaskBoard userId={me.id} orgId={me.orgId} />}
              {tab === "docs" && <DocRepository userId={me.id} orgId={me.orgId} role={me.role} />}
              {tab === "messages" && <ChatInterface userId={me.id} orgId={me.orgId} />}
              {tab === "agent" && <AgentConfiguration userId={me.id} orgId={me.orgId} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
