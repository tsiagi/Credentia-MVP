import type { MetricKey } from "./types";
import { METRIC_LABELS } from "./types";

export function MetricBadge({
  metric,
  value,
  compact = false,
}: {
  metric: MetricKey;
  value: number;
  compact?: boolean;
}) {
  const isRisk = metric === "retentionRisk";
  const display = isRisk
    ? `${Math.round(value * 100)}% risk`
    : metric === "productivity" || metric === "morale" || metric === "innovation"
      ? `${Math.round(value * 100)}%`
      : `${Math.round(value * 100)}`;

  const level = isRisk
    ? value >= 0.5 ? "high" : value >= 0.3 ? "mid" : "low"
    : value >= 0.8 ? "high" : value >= 0.6 ? "mid" : "low";

  const colors = isRisk
    ? { high: { bg: "var(--danger-bg)", fg: "var(--danger-fg)" }, mid: { bg: "var(--warn-bg)", fg: "var(--warn-fg)" }, low: { bg: "var(--verified-bg)", fg: "var(--verified-fg)" } }
    : { high: { bg: "var(--verified-bg)", fg: "var(--verified-fg)" }, mid: { bg: "var(--accent-soft)", fg: "var(--accent)" }, low: { bg: "var(--warn-bg)", fg: "var(--warn)" } };

  const c = colors[level];

  return (
    <div
      className={`rounded-lg border px-2 py-1 ${compact ? "text-[10px]" : "text-[11px]"}`}
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <div className="opacity-55 truncate">{METRIC_LABELS[metric]}</div>
      <div className="font-semibold tabular-nums mt-0.5 inline-flex items-center gap-1" style={{ color: c.fg }}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.fg }} aria-hidden />
        {display}
      </div>
    </div>
  );
}
