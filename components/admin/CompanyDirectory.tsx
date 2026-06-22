// components/admin/CompanyDirectory.tsx
// Shared searchable, category-grouped directory used by both admin areas:
//   scope="platform" → the superadmin grid of companies (drill-in links)
//   scope="company"  → the company-admin roster of people (grouped by category)
// The chrome (search + group-by + section headers + empty state) is shared;
// the caller maps its domain rows into DirectoryItem[].
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ChevronRight, Trash2 } from "lucide-react";
import { Card, EmptyState, cn } from "@/components/ui";

export type DirectoryItem = {
  id: string;
  /** Primary line (company / person name). */
  primary: string;
  /** Secondary line (plan / job title). */
  secondary?: string;
  /** Category this row groups under (e.g. department, role, plan). */
  group: string;
  /** Right-aligned status/subscription pill. */
  badge?: React.ReactNode;
  /** Inline meta shown under the secondary line. */
  meta?: string;
  /** Drill-in target (platform scope). */
  href?: string;
  /** Destructive action (company scope user management). */
  onRemove?: () => void;
  removeLabel?: string;
};

export interface CompanyDirectoryProps {
  scope: "platform" | "company";
  items: DirectoryItem[];
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyMessage?: string;
}

export function CompanyDirectory({
  scope,
  items,
  searchPlaceholder,
  emptyTitle = "Nothing here yet",
  emptyMessage,
}: CompanyDirectoryProps) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) =>
      [it.primary, it.secondary, it.group, it.meta]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(needle)),
    );
  }, [items, q]);

  const groups = useMemo(() => {
    const map = new Map<string, DirectoryItem[]>();
    for (const it of filtered) {
      (map.get(it.group) ?? map.set(it.group, []).get(it.group)!).push(it);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-3)" }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder ?? (scope === "platform" ? "Search companies…" : "Search people…")}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        />
      </div>

      {filtered.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={<Search size={22} />}
            title={emptyTitle}
            description={emptyMessage ?? (q ? "No matches for your search." : undefined)}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map(([group, rows]) => (
            <div key={group}>
              <div className="flex items-center gap-2 mb-2">
                <span className="core-roborate-eyebrow">{group}</span>
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "var(--surface-2)", color: "var(--ink-3)" }}>
                  {rows.length}
                </span>
              </div>
              <Card padding="none" className="overflow-hidden">
                {rows.map((it, i) => {
                  const inner = (
                    <div
                      className={cn(
                        "flex items-center gap-3 px-4 py-3",
                        i > 0 && "border-t",
                      )}
                      style={i > 0 ? { borderColor: "var(--line)" } : undefined}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>{it.primary}</div>
                        {(it.secondary || it.meta) && (
                          <div className="text-[12px] truncate" style={{ color: "var(--ink-3)" }}>
                            {[it.secondary, it.meta].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      {it.badge}
                      {it.href && <ChevronRight size={16} style={{ color: "var(--ink-3)" }} />}
                      {it.onRemove && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); it.onRemove?.(); }}
                          className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded-lg border"
                          style={{ borderColor: "var(--line)", color: "var(--danger-fg)" }}
                        >
                          <Trash2 size={13} /> {it.removeLabel ?? "Remove"}
                        </button>
                      )}
                    </div>
                  );
                  return it.href ? (
                    <Link key={it.id} href={it.href} className="block core-roborate-nav-item">{inner}</Link>
                  ) : (
                    <div key={it.id}>{inner}</div>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
