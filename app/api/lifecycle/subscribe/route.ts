import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

/** Mock subscribe — flips account_status to former_paid (no Stripe yet). */
export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const client = getSupabaseAsUser(token);
  const { data: auth, error: authErr } = await client.auth.getUser();
  if (authErr || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = auth.user.id;

  const { data: profile } = await client
    .from("profiles")
    .select("account_status")
    .eq("id", userId)
    .single();

  if (!profile?.account_status?.startsWith("former_")) {
    return NextResponse.json({ error: "Personal plan is for former employees only" }, { status: 400 });
  }

  try {
    getSupabaseAdmin();
  } catch {
    return NextResponse.json({ ok: true, accountStatus: "former_paid", mock: true });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("profiles")
    .update({ account_status: "former_paid", updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("audit_log").insert({
    actor_id: userId,
    action: "personal_plan_subscribed",
    target_table: "profiles",
    target_id: userId,
    changes: { account_status: "former_paid", mock: true },
  });

  return NextResponse.json({ ok: true, accountStatus: "former_paid" });
}
