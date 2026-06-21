// middleware.ts
// Route-level role separation for the admin route trees.
//
//   /superadmin/*  → role 'superadmin' only (Credentia operators)
//   /admin/*       → role 'admin' only (company admins)
//
// Anyone else is redirected away. This is enforcement in addition to (never
// instead of) Supabase RLS — RLS is still the authoritative data boundary;
// this just keeps the wrong role from ever loading the wrong shell.
//
// NOTE: resolving the role costs one `profiles` select per guarded request.
// Acceptable here because only the two admin trees are matched (employees,
// managers, executives and marketing never hit this codepath).

import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareSupabase } from "@/lib/supabase/middleware-client";

function homeFor(role: string | null): string {
  if (role === "superadmin") return "/superadmin/dashboard";
  if (role === "admin") return "/admin/dashboard";
  return "/";
}

export async function middleware(request: NextRequest) {
  const { supabase, getResponse } = createMiddlewareSupabase(request);

  // Touch the session first so any rotated auth cookies land on the response.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const wantsSuperadmin = path.startsWith("/superadmin");
  const wantsAdmin = path.startsWith("/admin");

  // Not signed in → send to the marketing/sign-in entry point.
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (profile?.role as string) ?? null;

  const allowed =
    (wantsSuperadmin && role === "superadmin") || (wantsAdmin && role === "admin");

  if (!allowed) {
    const url = request.nextUrl.clone();
    url.pathname = homeFor(role);
    // Avoid a redirect loop if the computed home is itself the blocked path.
    if (url.pathname === path) url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return getResponse();
}

export const config = {
  // Only guard the two admin trees. Everything else (marketing at /, public
  // /p/* profiles, /api, Next internals, static assets) is untouched.
  matcher: ["/superadmin/:path*", "/admin/:path*"],
};
