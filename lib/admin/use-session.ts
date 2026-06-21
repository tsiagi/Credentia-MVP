"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** Client hook: the signed-in user's id + access token for the admin APIs. */
export function useAdminSession() {
  const [state, setState] = useState<{ userId: string | null; token: string | null; ready: boolean }>({
    userId: null,
    token: null,
    ready: false,
  });
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({ userId: session?.user.id ?? null, token: session?.access_token ?? null, ready: true });
    });
  }, []);
  return state;
}
