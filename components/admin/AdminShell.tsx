// components/admin/AdminShell.tsx
// Left-sidebar enterprise shell for the two admin route trees. Visuals follow
// the Cairn tokens used across the app; the nav set is chosen by `variant`.
//   superadmin → Dashboard · Companies · Integration · Org Controls
//   admin      → Dashboard · Company  · Integration · Org Controls
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Building2, Workflow, SlidersHorizontal,
  Menu, X, ChevronDown, UserCircle2, LogOut, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge, ToastProvider, cn } from "@/components/ui";

export type AdminVariant = "superadmin" | "admin";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ size?: number }> };

const NAV: Record<AdminVariant, NavItem[]> = {
  superadmin: [
    { href: "/superadmin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/superadmin/companies", label: "Companies", icon: Building2 },
    { href: "/superadmin/integration", label: "Integration", icon: Workflow },
    { href: "/superadmin/org-controls", label: "Org Controls", icon: SlidersHorizontal },
  ],
  admin: [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/company", label: "Company", icon: Building2 },
    { href: "/admin/integration", label: "Integration", icon: Workflow },
    { href: "/admin/org-controls", label: "Org Controls", icon: SlidersHorizontal },
  ],
};

const ROLE_LABEL: Record<AdminVariant, string> = {
  superadmin: "Platform Operator",
  admin: "Company Admin",
};

export interface AdminShellProps {
  variant: AdminVariant;
  userName?: string | null;
  orgName?: string | null;
  orgLogoUrl?: string | null;
  children: React.ReactNode;
}

export function AdminShell({ variant, userName, orgName, orgLogoUrl, children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const nav = NAV[variant];
  const roleLabel = ROLE_LABEL[variant];

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  const Brand = (
    <div className="flex items-center gap-2 min-w-0">
      {variant === "admin" && orgLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={orgLogoUrl} alt="" className="h-7 w-auto max-w-[120px] object-contain shrink-0" />
      ) : (
        <img src="/cairn-logo-mark.svg" alt="" className="h-7 w-7 shrink-0" />
      )}
      <div className="min-w-0">
        <div className="serif text-[15px] font-semibold leading-tight truncate" style={{ color: "var(--ink)" }}>
          {variant === "admin" ? orgName || "Credentia" : "Credentia"}
        </div>
        <div className="text-[11px] leading-tight truncate" style={{ color: "var(--ink-3)" }}>
          {variant === "superadmin" ? "Platform Console" : "Company Admin"}
        </div>
      </div>
    </div>
  );

  const renderNav = (onNavigate?: () => void) => (
    <nav className="space-y-1">
      {nav.map((n) => {
        const Icon = n.icon;
        const active = pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium border-l-2 transition-colors duration-150",
              !active && "cairn-nav-item border-transparent",
            )}
            style={
              active
                ? { background: "var(--accent-soft)", color: "var(--accent-text)", borderColor: "var(--accent)" }
                : { color: "var(--ink-2)" }
            }
          >
            <Icon size={16} /> {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const SidebarFooter = (
    <div className="mt-auto pt-4">
      <div
        className="flex items-center gap-2 p-2.5 rounded-xl"
        style={{ background: "var(--surface-2)" }}
      >
        <UserCircle2 size={26} style={{ color: "var(--ink-3)" }} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium truncate" style={{ color: "var(--ink)" }}>
            {userName ?? "Account"}
          </div>
          <Badge tone={variant === "superadmin" ? "accent" : "neutral"} icon={<ShieldCheck size={11} />}>
            {roleLabel}
          </Badge>
        </div>
      </div>
      <button
        type="button"
        onClick={signOut}
        className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium cairn-nav-item"
        style={{ color: "var(--ink-2)" }}
      >
        <LogOut size={15} /> Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex w-64 shrink-0 flex-col px-4 py-5 border-r sticky top-0 h-screen"
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      >
        <div className="px-1 mb-6">{Brand}</div>
        {renderNav()}
        {SidebarFooter}
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-40" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <aside
            className="absolute left-0 top-0 bottom-0 w-72 px-4 py-5 flex flex-col border-r shadow-xl"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              {Brand}
              <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu">
                <X size={20} />
              </button>
            </div>
            {renderNav(() => setDrawer(false))}
            {SidebarFooter}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header
          className="lg:hidden sticky top-0 z-30 border-b backdrop-blur flex items-center justify-between gap-2 px-4 h-14"
          style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--bg) 92%, transparent)" }}
        >
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            {Brand}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
              style={{ color: "var(--ink-2)" }}
            >
              <UserCircle2 size={20} />
              <ChevronDown size={14} style={{ transform: menu ? "rotate(180deg)" : "none" }} />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                <div
                  className="absolute right-0 mt-1 w-48 rounded-xl border shadow-xl z-40 p-1"
                  style={{ background: "var(--surface)", borderColor: "var(--line)" }}
                >
                  <button
                    type="button"
                    onClick={signOut}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium cairn-nav-item"
                    style={{ color: "var(--ink-2)" }}
                  >
                    <LogOut size={15} /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 min-w-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 w-full cairn-reveal">
            <ToastProvider>{children}</ToastProvider>
          </div>
        </main>
      </div>
    </div>
  );
}
