"use client";
// components/agent/AgentConfiguration.tsx
// ─────────────────────────────────────────────────────────────
// Digital-Twin Agent configuration.
//
// The strict data silo, made explicit in the UI:
//   • TRAINING DATA (left) — VERIFIED facts only (blue shield): completed
//     verified tasks, verified docs the user may see, saved messages. The
//     "Train" action ingests these server-side (role/visibility re-checked).
//   • OUTPUTS (right) — the agent's suggestions are AI INFERENCE (amber
//     sparkle), always advisory, never written back as verified.
//
// An employee's agent can only ever learn from what their role can see —
// enforced by RLS during ingestion, not just hidden in the UI.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Bot, ShieldCheck, Sparkles, Brain, Trash2, Loader2, Power, GraduationCap,
} from "lucide-react";
import { Reveal } from "@/components/ui/motion";
import {
  fetchMyAgent, provisionAgent, updateAgentConfig, fetchAgentMemory, forgetMemory,
  MEMORY_SOURCE_LABEL, type UserAgent, type AgentMemoryItem,
} from "@/lib/agents";

export function AgentConfiguration({ userId, orgId }: { userId: string; orgId: string }) {
  const [agent, setAgent] = useState<UserAgent | null>(null);
  const [memory, setMemory] = useState<AgentMemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [training, setTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await fetchMyAgent(userId);
        if (cancelled) return;
        setAgent(a);
        if (a) setMemory(await fetchAgentMemory(userId));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load your agent.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  async function provision() {
    setBusy(true); setError(null);
    try {
      const a = await provisionAgent(userId, orgId);
      setAgent(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not provision your agent.");
    } finally { setBusy(false); }
  }

  async function patch(p: Partial<UserAgent>) {
    if (!agent) return;
    setAgent({ ...agent, ...p });
    try {
      await updateAgentConfig(userId, agent.id, p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  }

  async function train() {
    setTraining(true); setError(null); setNote(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in again to train your agent.");
      const res = await fetch("/api/ai/agent/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Training failed.");
      setNote(json.note ?? `Learned ${json.learned} verified fact${json.learned === 1 ? "" : "s"}.`);
      setMemory(await fetchAgentMemory(userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Training failed.");
    } finally { setTraining(false); }
  }

  async function forget(id: string) {
    try {
      await forgetMemory(userId, id);
      setMemory((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not forget that.");
    }
  }

  if (loading) {
    return <div className="h-64 rounded-2xl animate-pulse" style={{ background: "var(--surface-2)" }} />;
  }

  if (!agent) {
    return (
      <div className="border rounded-2xl p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
        <Bot size={32} style={{ color: "var(--accent)" }} className="mx-auto mb-3" />
        <h3 className="font-semibold text-lg">Create your Digital Twin</h3>
        <p className="text-[13px] opacity-65 mt-1 max-w-md mx-auto">
          A personal agent that learns from your verified work — completed tasks, verified docs, and the
          messages you save. Its suggestions are always AI estimates you stay in control of.
        </p>
        <button onClick={provision} disabled={busy}
          className="mt-4 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-40 inline-flex items-center gap-2"
          style={{ background: "var(--accent)" }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Bot size={15} />} Provision agent
        </button>
      </div>
    );
  }

  const toggles: { key: keyof UserAgent; label: string }[] = [
    { key: "learn_from_tasks", label: "Completed tasks" },
    { key: "learn_from_docs", label: "Verified docs" },
    { key: "learn_from_messages", label: "Saved messages" },
  ];

  return (
    <div className="space-y-4">
      {/* header / config */}
      <div className="border rounded-2xl p-6" style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-11 h-11 rounded-xl grid place-items-center" style={{ background: "var(--accent-soft)" }}>
            <Bot size={22} style={{ color: "var(--accent)" }} />
          </div>
          <div className="min-w-0">
            <input value={agent.name} onChange={(e) => setAgent({ ...agent, name: e.target.value })}
              onBlur={() => patch({ name: agent.name })}
              className="font-semibold text-lg bg-transparent outline-none border-b border-transparent focus:border-[var(--line)]"
              style={{ color: "var(--ink)" }} />
            <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>One twin per person · scoped to your org &amp; role</p>
          </div>
          <button onClick={() => patch({ enabled: !agent.enabled })}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition active:scale-[0.98]"
            style={agent.enabled
              ? { background: "var(--verified-bg)", color: "var(--verified-fg)" }
              : { background: "var(--surface-2)", color: "var(--ink-3)" }}>
            <Power size={13} /> {agent.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>

        <textarea value={agent.persona ?? ""} onChange={(e) => setAgent({ ...agent, persona: e.target.value })}
          onBlur={() => patch({ persona: agent.persona })}
          placeholder="Persona / tone (e.g. 'Concise, detail-oriented program manager')" rows={2}
          className="w-full mt-4 px-3 py-2 rounded-lg border text-sm outline-none resize-none"
          style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink)" }} />

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span className="text-[12px] font-medium" style={{ color: "var(--ink-2)" }}>Learn from:</span>
          {toggles.map((t) => {
            const on = agent[t.key] as boolean;
            return (
              <button key={t.key} onClick={() => patch({ [t.key]: !on } as Partial<UserAgent>)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium transition active:scale-[0.98]"
                style={on ? { background: "var(--verified-bg)", color: "var(--verified-fg)" } : { background: "var(--surface-2)", color: "var(--ink-3)" }}>
                <ShieldCheck size={12} /> {t.label}
              </button>
            );
          })}
          <button onClick={train} disabled={training || !agent.enabled}
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
            style={{ background: "var(--accent)" }}>
            {training ? <Loader2 size={14} className="animate-spin" /> : <GraduationCap size={14} />} Train now
          </button>
        </div>
        {note && <p className="text-[12px] mt-2 inline-flex items-center gap-1" style={{ color: "var(--verified-fg)" }}><ShieldCheck size={12} /> {note}</p>}
        {error && <p className="text-[12px] px-3 py-2 rounded-lg mt-2" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>}
      </div>

      {/* the silo: training data (blue) vs outputs (amber) */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* training data — verified, blue */}
        <div className="border rounded-2xl p-5" style={{ borderColor: "var(--verified-fg)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={16} style={{ color: "var(--verified-fg)" }} />
            <h4 className="font-semibold text-[14px]">Training data · Verified facts</h4>
            <span className="ml-auto text-[12px] px-2 py-0.5 rounded-full" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>{memory.length}</span>
          </div>
          <p className="text-[12px] mb-3" style={{ color: "var(--ink-3)" }}>Only verified, role-appropriate facts. Nothing inferred lives here.</p>
          {memory.length === 0 ? (
            <div className="py-8 text-center">
              <Brain size={22} style={{ color: "var(--ink-3)" }} className="mx-auto mb-1.5" />
              <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>Nothing learned yet — press “Train now”.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {memory.map((m, idx) => (
                <Reveal key={m.id} delay={idx * 30} className="rounded-lg border p-2.5 flex items-start gap-2"
                  style={{ borderColor: "var(--line)", background: "var(--verified-bg)" }}>
                  <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: "var(--verified-fg)" }} />
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--verified-fg)" }}>{MEMORY_SOURCE_LABEL[m.source_type]}</span>
                    <p className="text-[12px] line-clamp-2" style={{ color: "var(--ink-2)" }}>{m.content}</p>
                  </div>
                  <button onClick={() => forget(m.id)} title="Forget" className="shrink-0 w-6 h-6 grid place-items-center rounded transition" style={{ color: "var(--ink-3)" }}>
                    <Trash2 size={13} />
                  </button>
                </Reveal>
              ))}
            </div>
          )}
        </div>

        {/* outputs — AI inference, amber */}
        <div className="border rounded-2xl p-5 cairn-pulse" style={{ borderColor: "var(--inferred-fg)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} style={{ color: "var(--inferred-fg)" }} />
            <h4 className="font-semibold text-[14px]">Agent outputs · AI estimates</h4>
          </div>
          <p className="text-[12px] mb-3" style={{ color: "var(--ink-3)" }}>
            Everything the agent produces is an AI suggestion — advisory only, never a verified fact.
          </p>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--inferred-fg)", background: "var(--inferred-bg)" }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles size={13} style={{ color: "var(--inferred-fg)" }} />
              <span className="text-[11px] font-semibold tracking-wide" style={{ color: "var(--inferred-fg)" }}>AI ESTIMATE</span>
            </div>
            <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
              {agent.enabled
                ? `Based on ${memory.length} verified fact${memory.length === 1 ? "" : "s"}, ${agent.name} can draft updates, suggest next steps, and break tasks down. You approve anything before it becomes real work.`
                : "Enable the agent to receive suggestions."}
            </p>
          </div>
          <p className="text-[11px] mt-3 inline-flex items-center gap-1" style={{ color: "var(--ink-3)" }}>
            <Brain size={11} /> Outputs are generated server-side and labelled amber wherever they appear.
          </p>
        </div>
      </div>
    </div>
  );
}
