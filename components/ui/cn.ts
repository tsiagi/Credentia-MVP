// components/ui/cn.ts
// Tiny className joiner for the UI primitives. Filters out falsy values so
// callers can write `cn("base", active && "is-active")` without extra noise.
// Presentation-only helper — no deps, no data.
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
