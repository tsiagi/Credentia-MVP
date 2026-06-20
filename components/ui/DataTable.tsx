"use client";
// components/ui/DataTable.tsx
// ─────────────────────────────────────────────────────────────
// Generic table: sticky header, row hover, click-to-sort columns,
// skeleton loading rows, and an empty-with-CTA state (never blank).
// Sorting is presentation-side only over the rows it's given —
// no data fetching, no queries.
// ─────────────────────────────────────────────────────────────
import React, { useMemo, useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "./cn";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** Cell renderer. */
  render: (row: T) => React.ReactNode;
  /** Provide to make the column sortable; returns a comparable value. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  className?: string;
  /** Header width hint, e.g. "w-32". */
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  /** Rows of skeleton to show while loading. */
  skeletonRows?: number;
  onRowClick?: (row: T) => void;
  /** Shown when `rows` is empty and not loading. */
  empty?: React.ReactNode;
  className?: string;
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  skeletonRows = 5,
  onRowClick,
  empty,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string) =>
    setSort((prev) =>
      prev?.key === key ? (prev.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" },
    );

  return (
    <div
      className={cn("overflow-hidden rounded-[var(--radius-lg)] border", className)}
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              {columns.map((col) => {
                const sortable = !!col.sortValue;
                const active = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "sticky top-0 z-10 px-4 py-2.5 font-semibold whitespace-nowrap",
                      ALIGN[col.align ?? "left"],
                      col.width,
                    )}
                    style={{ color: "var(--ink-2)", background: "var(--surface-2)" }}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          "inline-flex items-center gap-1 transition-colors hover:text-[var(--ink)]",
                          col.align === "right" && "flex-row-reverse",
                        )}
                        style={{ color: active ? "var(--ink)" : "inherit" }}
                      >
                        {col.header}
                        {active ? (
                          sort!.dir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />
                        ) : (
                          <ChevronsUpDown size={13} style={{ color: "var(--ink-3)" }} />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--line)" }}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <Skeleton className="h-3.5 w-full max-w-[140px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  {empty ?? <EmptyState title="Nothing here yet" description="There's no data to show." />}
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-t transition-colors",
                    onRowClick && "cursor-pointer",
                    "hover:bg-[var(--surface-2)]",
                  )}
                  style={{ borderColor: "var(--line)" }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn("px-4 py-3 align-middle", ALIGN[col.align ?? "left"], col.className)}
                      style={{ color: "var(--ink)" }}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
