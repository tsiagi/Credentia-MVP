"use client";
// components/manager/VerificationDeck.tsx
// ─────────────────────────────────────────────────────────────
// Employee Verification Center as a physical, drag-to-swipe card deck.
// The top card is draggable (Framer Motion) on both axes:
//   • drag RIGHT past the threshold (or flick) to Approve
//   • drag LEFT  to Deny
//   • drag UP    to Request clarification (sends the item back)
// Release short and it springs back. Rotation and the APPROVE / DENY /
// CLARIFY stamps track the drag in real time. The action buttons and the
// ← / ↑ / → keys drive the SAME fly-out via an imperative handle, so every
// input path feels identical. The most recent action can be undone, which
// restores the row and writes a compensating audit record.
//
// Animation: Framer Motion (drag gestures + spring physics) for the active
// card; the peeking stack behind it animates with motion springs too.
// ─────────────────────────────────────────────────────────────
import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
} from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import {
  Check, X, ShieldCheck, Target, FolderGit2, GraduationCap,
  TrendingUp, Award, Lightbulb, Crown, Inbox, Link2, Hand,
  MessageSquareWarning, RotateCcw,
} from "lucide-react";
import { LevelBadge } from "@/lib/verification-ui";
import { AnimatedNumber } from "@/components/ui/motion";
import {
  fetchVerifyQueue, verifyQueueAction, undoVerifyQueueAction, fetchDirectReports,
  type VerifyQueueItem,
} from "@/lib/workforce";

const KIND_ICON: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  kpi: Target, project: FolderGit2, certification: GraduationCap,
  promotion: TrendingUp, award: Award, process_improvement: Lightbulb, leadership: Crown,
};

const SWIPE_THRESHOLD = 120; // px of horizontal travel to commit approve/deny
const CLARIFY_THRESHOLD = 96; // px of upward travel to commit clarify
const SWIPE_VELOCITY = 650;   // or a fast enough flick

function reduced() {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}
const keyOf = (it: VerifyQueueItem) => `${it.sourceTable}-${it.id}`;

type Dir = "approve" | "deny" | "clarify";
const DIR_LABEL: Record<Dir, string> = { approve: "approve", deny: "deny", clarify: "clarification" };

// ── side piles that "catch" the flung approve/deny cards ──
function Pile({ side, count, tone }: { side: "approve" | "deny"; count: number; tone: { fg: string; bg: string; line: string } }) {
  const Icon = side === "approve" ? Check : X;
  return (
    <div className={`absolute top-0 ${side === "approve" ? "right-0 items-end" : "left-0 items-start"} flex flex-col gap-1.5 z-[5] select-none`}>
      <div className="relative h-9 w-12">
        {[0, 1, 2].map((d) => (
          <div key={d} className="absolute inset-x-0 h-9 rounded-md border"
            style={{
              background: tone.bg, borderColor: tone.line,
              transform: `translateY(${d * -3}px) rotate(${side === "approve" ? d * 3 : d * -3}deg)`,
              opacity: count > d ? 1 : 0.25, transition: "opacity .3s ease, transform .3s ease",
            }} />
        ))}
      </div>
      <div key={count} className="core-roborate-pop inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-semibold"
        style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.line}` }}>
        <Icon size={13} /> <AnimatedNumber value={count} duration={500} />
      </div>
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--ink-3)" }}>
        {side === "approve" ? "Approved" : "Denied"}
      </span>
    </div>
  );
}

function CardFace({ item, avatarUrl }: { item: VerifyQueueItem; avatarUrl: string | null | undefined }) {
  const Icon = KIND_ICON[item.kind] ?? Target;
  return (
    <div className="h-full flex flex-col p-5 pointer-events-none">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl shrink-0" style={{ background: "var(--accent-soft)" }}>
          <Icon size={20} style={{ color: "var(--accent)" }} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold leading-snug">{item.title}</h4>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <LevelBadge level={item.level} />
            <span className="text-[11px] opacity-50">{item.sourceTable}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-semibold"
            style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
            {initials(item.who)}
          </div>
        )}
        <div className="text-[13px]">
          <div className="font-medium leading-tight">{item.who}</div>
          <div className="opacity-55 text-[11px]">Direct report</div>
        </div>
      </div>

      <p className="text-[13px] opacity-70 mt-4 flex-1 overflow-hidden">{item.desc}</p>

      {item.evidenceUrl && (
        <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium self-start px-2.5 py-1 rounded-lg"
          style={{ color: "var(--accent)", background: "var(--accent-soft)" }}>
          <Link2 size={13} /> Supporting evidence
        </span>
      )}

      <div className="mt-3 text-[11px] px-2.5 py-1.5 rounded-lg" style={{ background: "var(--verified-bg)", color: "var(--verified-fg)" }}>
        Approving writes an audit record and sets L2 (Manager Verified).
      </div>
    </div>
  );
}

// ── the interactive top card (draggable on both axes) ──
type CardHandle = { flyOut: (dir: Dir) => void };
const DraggableCard = forwardRef<CardHandle, {
  item: VerifyQueueItem;
  avatarUrl: string | null | undefined;
  persist: (item: VerifyQueueItem, dir: Dir) => void;
  onCommit: (item: VerifyQueueItem, dir: Dir) => void;
  onBusy: (b: boolean) => void;
}>(function DraggableCard({ item, avatarUrl, persist, onCommit, onBusy }, ref) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-180, 0, 180], [-16, 0, 16]);
  const approveOpacity = useTransform(x, [40, 130], [0, 1]);
  const denyOpacity = useTransform(x, [-130, -40], [1, 0]);
  const clarifyOpacity = useTransform(y, [-120, -40], [1, 0]);
  const gone = useRef(false);

  const flyOut = useCallback((dir: Dir) => {
    if (gone.current) return;
    gone.current = true;
    onBusy(true);
    persist(item, dir);
    if (reduced()) { onCommit(item, dir); return; }
    const fly = { type: "tween" as const, duration: 0.42, ease: [0.36, 0.66, 0.04, 1] as const };
    const settle = { type: "spring" as const, stiffness: 500, damping: 40 };
    if (dir === "clarify") {
      animate(x, 0, settle);
      animate(y, -760, { ...fly, onComplete: () => onCommit(item, dir) });
    } else {
      animate(y, 0, settle);
      animate(x, dir === "approve" ? 760 : -760, { ...fly, onComplete: () => onCommit(item, dir) });
    }
  }, [item, persist, onCommit, onBusy, x, y]);

  useImperativeHandle(ref, () => ({ flyOut }), [flyOut]);

  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 50 }}>
      <motion.div
        className="relative rounded-2xl border overflow-hidden cursor-grab active:cursor-grabbing"
        style={{
          x, y, rotate, width: "min(86%, 400px)", height: 300,
          borderColor: "var(--accent-line)", background: "var(--surface)", boxShadow: "var(--shadow-lg)",
          touchAction: "none",
        }}
        drag
        dragElastic={0.7}
        dragMomentum={false}
        onDragEnd={(_e, info) => {
          const ox = info.offset.x, oy = info.offset.y, vx = info.velocity.x, vy = info.velocity.y;
          const upward = oy < -CLARIFY_THRESHOLD || vy < -SWIPE_VELOCITY;
          if (upward && Math.abs(oy) > Math.abs(ox)) flyOut("clarify");
          else if (ox > SWIPE_THRESHOLD || vx > SWIPE_VELOCITY) flyOut("approve");
          else if (ox < -SWIPE_THRESHOLD || vx < -SWIPE_VELOCITY) flyOut("deny");
          else {
            animate(x, 0, { type: "spring", stiffness: 500, damping: 34 });
            animate(y, 0, { type: "spring", stiffness: 500, damping: 34 });
          }
        }}
        whileDrag={{ scale: 1.03 }}
        initial={{ scale: 0.955, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 32 }}
      >
        {/* live stamps */}
        <motion.div className="absolute top-6 left-6 z-10 px-3 py-1 rounded-lg text-base font-extrabold tracking-widest border-2 pointer-events-none"
          style={{ opacity: approveOpacity, color: "var(--verified-fg)", borderColor: "var(--verified-fg)", rotate: -14 }}>
          APPROVE
        </motion.div>
        <motion.div className="absolute top-6 right-6 z-10 px-3 py-1 rounded-lg text-base font-extrabold tracking-widest border-2 pointer-events-none"
          style={{ opacity: denyOpacity, color: "var(--danger-fg)", borderColor: "var(--danger-fg)", rotate: 14 }}>
          DENY
        </motion.div>
        <div className="absolute top-6 inset-x-0 z-10 flex justify-center pointer-events-none">
          <motion.div className="px-3 py-1 rounded-lg text-base font-extrabold tracking-widest border-2"
            style={{ opacity: clarifyOpacity, color: "var(--accent)", borderColor: "var(--accent)", rotate: -5 }}>
            CLARIFY
          </motion.div>
        </div>
        <CardFace item={item} avatarUrl={avatarUrl} />
      </motion.div>
    </div>
  );
});

// ── a non-interactive peeking card in the stack ──
function PeekCard({ item, depth }: { item: VerifyQueueItem; depth: number }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 50 - depth, pointerEvents: "none" }}>
      <motion.div
        className="rounded-2xl border"
        style={{ width: "min(86%, 400px)", height: 300, borderColor: "var(--line)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
        initial={false}
        animate={{ scale: 1 - depth * 0.045, y: depth * 16, opacity: depth > 2 ? 0 : 1, rotate: depth % 2 ? 1.4 : -1.4 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        aria-hidden
      >
        {/* render a faded face so the stack reads as real cards */}
        <div style={{ opacity: 0.5 }}><CardFace item={item} avatarUrl={null} /></div>
      </motion.div>
    </div>
  );
}

export function VerificationDeck({ userId }: { userId: string }) {
  const [pending, setPending] = useState<VerifyQueueItem[]>([]);
  const [approved, setApproved] = useState<VerifyQueueItem[]>([]);
  const [denied, setDenied] = useState<VerifyQueueItem[]>([]);
  const [clarified, setClarified] = useState<VerifyQueueItem[]>([]);
  const [last, setLast] = useState<{ item: VerifyQueueItem; dir: Dir } | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<CardHandle | null>(null);

  const reviewed = approved.length + denied.length + clarified.length;
  const total = pending.length + reviewed;
  const top = pending[0];
  const peek = pending.slice(1, 4);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [queue, reports] = await Promise.all([
          fetchVerifyQueue(userId),
          fetchDirectReports(userId),
        ]);
        if (cancelled) return;
        setPending(queue.filter((i) => i.status === "pending" || i.status === "clarify"));
        setAvatars(Object.fromEntries(reports.map((r) => [r.id, r.avatar_url ?? null])));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the verification queue.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const persist = useCallback((item: VerifyQueueItem, dir: Dir) => {
    setError(null);
    const action = dir === "approve" ? "approve" : dir === "clarify" ? "clarify" : "reject";
    verifyQueueAction(userId, item, action)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not save — the change may not have persisted."));
  }, [userId]);

  const commit = useCallback((item: VerifyQueueItem, dir: Dir) => {
    setPending((prev) => prev.filter((p) => keyOf(p) !== keyOf(item)));
    if (dir === "approve") setApproved((a) => [item, ...a]);
    else if (dir === "deny") setDenied((d) => [item, ...d]);
    else setClarified((c) => [item, ...c]);
    setLast({ item, dir });
    setBusy(false);
  }, []);

  const fling = useCallback((dir: Dir) => {
    if (busy) return;
    cardRef.current?.flyOut(dir);
  }, [busy]);

  const undo = useCallback(() => {
    if (!last || busy) return;
    const { item, dir } = last;
    setLast(null);
    setError(null);
    if (dir === "approve") setApproved((a) => a.filter((p) => keyOf(p) !== keyOf(item)));
    else if (dir === "deny") setDenied((d) => d.filter((p) => keyOf(p) !== keyOf(item)));
    else setClarified((c) => c.filter((p) => keyOf(p) !== keyOf(item)));
    setPending((prev) => [item, ...prev]);
    undoVerifyQueueAction(userId, item, dir)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not undo — the reversal may not have persisted."));
  }, [last, busy, userId]);

  // keyboard: → approve, ← deny, ↑ clarify
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") fling("approve");
      else if (e.key === "ArrowLeft") fling("deny");
      else if (e.key === "ArrowUp") { e.preventDefault(); fling("clarify"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fling]);

  return (
    <div className="border rounded-2xl p-6" style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">Employee Verification Center</h3>
        <span className="ml-auto text-[13px] px-2.5 py-1 rounded-full" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
          {pending.length} pending
        </span>
      </div>
      <p className="text-[13px] opacity-60 mb-2">
        Drag a card — or use the buttons — to{" "}
        <strong style={{ color: "var(--verified-fg)" }}>Approve</strong>,{" "}
        <strong style={{ color: "var(--accent)" }}>request clarification</strong>, or{" "}
        <strong style={{ color: "var(--danger-fg)" }}>Deny</strong>. Each action creates a permanent audit record.
      </p>

      {error && (
        <p className="text-[13px] px-3 py-2 rounded-lg mb-3" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{error}</p>
      )}

      {loading ? (
        <div className="h-[300px] rounded-2xl border animate-pulse" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} />
      ) : total === 0 ? (
        <div className="h-[260px] grid place-items-center text-center px-6">
          <div>
            <Inbox size={28} style={{ color: "var(--ink-3)" }} className="mx-auto mb-2" />
            <p className="font-medium">Nothing to verify</p>
            <p className="text-[13px] opacity-60 mt-1 max-w-sm">
              When your direct reports submit achievements, KPIs, projects, or process improvements, they land here as cards.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="relative mt-2" style={{ height: 360 }}>
            <Pile side="deny" count={denied.length} tone={{ fg: "var(--danger-fg)", bg: "var(--danger-bg)", line: "var(--danger-fg)" }} />
            <Pile side="approve" count={approved.length} tone={{ fg: "var(--verified-fg)", bg: "var(--verified-bg)", line: "var(--verified-fg)" }} />

            <div className="absolute inset-0">
              {peek.map((item, i) => <PeekCard key={keyOf(item)} item={item} depth={i + 1} />)}
              {top ? (
                <DraggableCard
                  key={keyOf(top)}
                  ref={cardRef}
                  item={top}
                  avatarUrl={avatars[top.profileId]}
                  persist={persist}
                  onCommit={commit}
                  onBusy={setBusy}
                />
              ) : (
                <div className="h-full grid place-items-center text-center px-6 core-roborate-pop">
                  <div>
                    <div className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-3" style={{ background: "var(--verified-bg)" }}>
                      <Check size={24} style={{ color: "var(--verified-fg)" }} />
                    </div>
                    <p className="font-semibold">All caught up</p>
                    <p className="text-[13px] opacity-60 mt-1">
                      Reviewed {reviewed} — <span style={{ color: "var(--verified-fg)" }}>{approved.length} approved</span>,{" "}
                      <span style={{ color: "var(--accent)" }}>{clarified.length} sent back</span>,{" "}
                      <span style={{ color: "var(--danger-fg)" }}>{denied.length} denied</span>.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 mt-4">
            <button
              onClick={() => fling("deny")}
              disabled={!top || busy}
              aria-label="Deny"
              className="w-14 h-14 rounded-full grid place-items-center border-2 transition active:scale-90 disabled:opacity-40 disabled:active:scale-100 hover:scale-105"
              style={{ borderColor: "var(--danger-fg)", color: "var(--danger-fg)", background: "var(--surface)" }}>
              <X size={24} strokeWidth={2.5} />
            </button>

            <button
              onClick={() => fling("clarify")}
              disabled={!top || busy}
              aria-label="Request clarification"
              className="w-12 h-12 rounded-full grid place-items-center border-2 transition active:scale-90 disabled:opacity-40 disabled:active:scale-100 hover:scale-105"
              style={{ borderColor: "var(--accent-line)", color: "var(--accent)", background: "var(--surface)" }}>
              <MessageSquareWarning size={20} strokeWidth={2.5} />
            </button>

            <button
              onClick={() => fling("approve")}
              disabled={!top || busy}
              aria-label="Approve"
              className="w-14 h-14 rounded-full grid place-items-center text-white transition active:scale-90 disabled:opacity-40 disabled:active:scale-100 hover:scale-105"
              style={{ background: "var(--verified-fg)" }}>
              <Check size={24} strokeWidth={2.5} />
            </button>
          </div>

          <div className="flex items-center justify-center gap-3 mt-3">
            <span className="text-[13px] font-semibold tabular">{reviewed} / {total} reviewed</span>
            {last && (
              <button onClick={undo} disabled={busy}
                className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-0.5 rounded-lg border transition active:scale-[0.97] hover:bg-[var(--surface-2)] disabled:opacity-40"
                style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}>
                <RotateCcw size={12} /> Undo {DIR_LABEL[last.dir]}
              </button>
            )}
          </div>

          <p className="text-[11px] opacity-45 mt-3 inline-flex items-center gap-1.5 justify-center w-full">
            <Hand size={13} /> Drag the card, or use ← deny · ↑ clarify · → approve
          </p>
        </>
      )}
    </div>
  );
}
