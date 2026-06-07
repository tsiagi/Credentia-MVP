"use client";

import { ChevronRight } from "lucide-react";
import type { OrgIntelNode } from "./types";
import { breadcrumbLabel } from "@/lib/executive-org-data";

export function BreadcrumbTrail({
  path,
  onNavigate,
  inline = false,
}: {
  path: OrgIntelNode[];
  onNavigate: (index: number) => void;
  inline?: boolean;
}) {
  return (
    <nav
      aria-label="Organization path"
      className={`flex items-center gap-1 flex-wrap text-[13px] ${inline ? "py-1" : "px-4 py-3 border-b"}`}
      style={inline ? undefined : { borderColor: "var(--line)", background: "var(--surface)" }}
    >
      {path.map((node, i) => {
        const isLast = i === path.length - 1;
        const label = breadcrumbLabel(node, i);
        return (
          <span key={node.id} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} className="opacity-35 shrink-0" aria-hidden />}
            {isLast ? (
              <span className="font-semibold" style={{ color: "var(--ink)" }}>{label}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(i)}
                className="font-medium hover:opacity-80 transition"
                style={{ color: "var(--accent)" }}
              >
                {label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
