// lib/supabase/server.ts
// Server-Component / route-handler Supabase client. Reads the cookie-stored
// session (createBrowserClient already persists to cookies), so server code
// sees the same authenticated user as the browser. Honours RLS.
//
// NOTE: middleware must NOT import this module — it pulls in `next/headers`,
// which is unavailable in the middleware runtime. Middleware uses
// lib/supabase/middleware-client.ts instead.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

function readEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Add both in Vercel → Project → Settings → Environment Variables.",
    );
  }
  return { url, key };
}

/** Server Component / route handler client bound to the request cookies. */
export async function getSupabaseServer(): Promise<SupabaseClient> {
  const { url, key } = readEnv();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // In a Server Component (read-only cookies) this throws; that's fine —
        // middleware is responsible for refreshing the session cookie.
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* called from a Server Component — ignore */
        }
      },
    },
  });
}

/** Resolve the signed-in user's role, or null if signed out / no profile. */
export async function getServerUserRole(): Promise<{ userId: string; role: string | null } | null> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return { userId: user.id, role: (data?.role as string) ?? null };
}
