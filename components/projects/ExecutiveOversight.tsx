"use client";
// components/projects/ExecutiveOversight.tsx
// ─────────────────────────────────────────────────────────────
// Executive read-only rollup over the new task/knowledge layer.
//
// Executives don't author or edit tasks here — they see the VERIFIED knowledge
// graph (blue) and where AI suggestions (amber) are still awaiting human review
// across teams. Everything is RLS-scoped: leaders read their org via the
// "leader read" policies; nothing crosses the verified/AI line.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, Sparkles, FolderKanban, BadgeCheck, BookOpen, Layers } from "lucide-react";
import { Reveal } from "@/components/ui/motion";
import { fetchProjects, fetchTasks, type VerifiedTask, type WorkProject } from "@/lib/projects";
import { fetchDocs, type DocRow } from "@/lib/documentation";

type Rollup = {
  projects: WorkProject[];
  tasks: VerifiedTask[];
  docs: DocRow[];
  pendingAi: number;
};

function Stat({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <div className="flex items-center gap-1.5 mb-1" style={{ color: color ?? "var(--ink-3)" }}>
        {icon}<span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular" style={{ color: "var(--ink)" }}>{value}</div>
      {sub && <div className="text-[12px] mt-0.5" style={{ color: "var(--ink-3)" }}>{sub}</div>}
    </div>
  );
}

export function ExecutiveOversight() {
  const [data, setData] = useState<Rollup | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [projects, tasks, docs, aiCount] = await Promise.all([
          fetchProjects(),
          fetchTasks({}),
          fetchDocs(),
          supabase.from("ai_inference_tasks").select("id", { count: "exact", head: true }).eq("status", "pending"),
        ]);
        if (!cancelled) {
          setData({ projects, tasks, docs, pendingAi: aiCount.count ?? 0 });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load oversight data.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return <p className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>;
  }
  if (!data) {
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: "var(--surface-2)" }} />)}
      </div>
    );
  }

  const doneTasks = data.tasks.filter((t) => t.status === "done");
  const promoted = data.tasks.filter((t) => t.achievement_id).length;
  const verifiedDocs = data.docs.filter((d) => d.status === "verified");

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Layers size={18} style={{ color: "var(--accent)" }} />
          <h3 className="font-semibold text-lg">Work Oversight</h3>
        </div>
        <p className="text-[13px] opacity-65 max-w-2xl">
          Read-only rollup of verified work and knowledge across your org. Verified facts are blue;
          AI suggestions stay amber until a human approves them.
        </p>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        <Stat icon={<FolderKanban size={13} />} label="Active projects" value={String(data.projects.length)} sub="across teams" />
        <Stat icon={<ShieldCheck size={13} />} label="Verified tasks done" value={String(doneTasks.length)}
          sub={`${data.tasks.length} total tracked`} color="var(--verified-fg)" />
        <Stat icon={<BadgeCheck size={13} />} label="Promoted to L2" value={String(promoted)}
          sub="entered verification chain" color="var(--accent-text)" />
        <Stat icon={<BookOpen size={13} />} label="Verified docs" value={String(verifiedDocs.length)}
          sub={`${data.docs.length} total`} color="var(--verified-fg)" />
      </div>

      {/* AI suggestions awaiting human review — advisory, never counted as fact */}
      <div className="rounded-xl border p-4 core-roborate-pulse" style={{ borderColor: "var(--inferred-fg)", background: "var(--inferred-bg)" }}>
        <div className="flex items-center gap-2">
          <Sparkles size={15} style={{ color: "var(--inferred-fg)" }} />
          <span className="text-[13px] font-semibold" style={{ color: "var(--inferred-fg)" }}>
            {data.pendingAi} AI sub-task suggestion{data.pendingAi === 1 ? "" : "s"} awaiting human review
          </span>
        </div>
        <p className="text-[12px] mt-1" style={{ color: "var(--ink-2)" }}>
          AI INFERENCE — advisory only. Managers and individuals approve each suggestion before it becomes verified work.
        </p>
      </div>

      {/* Verified knowledge graph (blue) */}
      <div className="rounded-2xl border p-5" style={{ borderColor: "var(--verified-fg)", background: "var(--surface)" }}>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={16} style={{ color: "var(--verified-fg)" }} />
          <h4 className="font-semibold text-[14px]">Verified knowledge</h4>
          <span className="ml-auto text-[12px] px-2 py-0.5 rounded-full" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{verifiedDocs.length}</span>
        </div>
        {verifiedDocs.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>No verified documentation yet. Managers verify drafts to add them here.</p>
        ) : (
          <div className="space-y-2">
            {verifiedDocs.slice(0, 8).map((d, idx) => (
              <Reveal key={d.id} delay={idx * 30} className="rounded-lg border p-3 flex items-start gap-2"
                style={{ borderColor: "var(--line)", background: "var(--verified-bg)" }}>
                <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: "var(--verified-fg)" }} />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>{d.title}</p>
                  <p className="text-[12px] line-clamp-2" style={{ color: "var(--ink-2)" }}>{d.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
