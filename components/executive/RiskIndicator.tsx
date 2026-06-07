import { AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";
import type { RiskLevel } from "./types";

const CONFIG: Record<RiskLevel, { label: string; bg: string; fg: string; Icon: typeof CheckCircle2 }> = {
  healthy: { label: "Healthy", bg: "var(--verified-bg)", fg: "var(--verified-fg)", Icon: CheckCircle2 },
  attention: { label: "Needs attention", bg: "var(--warn-bg)", fg: "var(--warn)", Icon: AlertCircle },
  high: { label: "High risk", bg: "#be123c1a", fg: "#be123c", Icon: AlertTriangle },
};

export function RiskIndicator({
  level,
  score,
  compact = false,
}: {
  level: RiskLevel;
  score?: number;
  compact?: boolean;
}) {
  const c = CONFIG[level];
  const Icon = c.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-full ${compact ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5"}`}
      style={{ background: c.bg, color: c.fg }}
      title={`${c.label}${score != null ? ` — score ${score}` : ""}`}
    >
      <Icon size={compact ? 10 : 12} aria-hidden />
      {c.label}
      {score != null && !compact && <span className="opacity-80 tabular-nums">· {score}</span>}
    </span>
  );
}
