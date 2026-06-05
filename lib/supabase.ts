// lib/supabase.ts
// The single connection to your Supabase backend.
// Cursor will import this wherever it needs to read/write data.

import { createBrowserClient } from "@supabase/ssr";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Quick usage examples (Cursor will write the real versions for you):
//
//   // sign up
//   await supabase.auth.signUp({ email, password });
//
//   // sign in
//   await supabase.auth.signInWithPassword({ email, password });
//
//   // read your settings
//   const { data } = await supabase.from("user_settings").select("*").single();
//
//   // save a toggle
//   await supabase.from("user_settings").update({ show_outlook: false }).eq("profile_id", userId);
