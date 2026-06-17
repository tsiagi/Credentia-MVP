"use client";
// components/ui/motion.tsx
// ─────────────────────────────────────────────────────────────
// Shared presentation-only motion primitives for dashboards.
// Pure React + CSS (no animation library). Paired with the
// `.cairn-reveal` / `.cairn-lift` utilities in styles/cairn/tokens/base.css.
// These touch presentation only — never data, queries, or RLS.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";

export function prefersReducedMotion() {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Eases a number from 0 → target once on mount (or when target changes). */
export function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    if (prefersReducedMotion()) { setVal(target); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setVal(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setVal(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

export function AnimatedNumber({
  value, decimals = 0, prefix = "", suffix = "", duration,
}: { value: number; decimals?: number; prefix?: string; suffix?: string; duration?: number }) {
  const v = useCountUp(value, duration);
  const formatted = v.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return <span className="tabular">{prefix}{formatted}{suffix}</span>;
}

/** Staggered entrance wrapper — apply an index-based delay (ms). */
export function Reveal({
  children, delay = 0, className = "", style,
}: { children: React.ReactNode; delay?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`cairn-reveal ${className}`} style={{ animationDelay: `${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

/** Bar that grows from 0 → pct on mount. */
export function GrowBar({
  pct, met = false, color,
}: { pct: number; met?: boolean; color?: string }) {
  const [w, setW] = useState(() => (prefersReducedMotion() ? pct : 0));
  useEffect(() => {
    if (prefersReducedMotion()) { setW(pct); return; }
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
      <div className="h-full rounded-full"
        style={{
          width: w + "%",
          background: color ?? (met ? "var(--verified-fg)" : "var(--accent)"),
          transition: "width 0.95s var(--ease-out)",
        }} />
    </div>
  );
}
