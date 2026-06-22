import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

/**
 * POST /api/dsr/erase  { profileId }
 * Right-to-be-forgotten / erasure. Anonymizes the subject and scrubs their
 * personal data via the SECURITY DEFINER forget_subject() RPC (frozen
 * employment-era attestations are kept, de-identified).
 *
 * Authority (controller/processor model):
 *   • the subject themselves, but ONLY for a personal (former_*) account;
 *   • an admin/HR of the subject's org (current OR former) — the employer is the
 *     controller acting on a DSR;
 *   • a platform superadmin.
 * Active-employee erasure is intentionally routed through the employer.
 */
export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const client = getSupabaseAsUser(token);
  const { data: auth, error: authErr } = await client.auth.getUser();
  if (authErr || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const callerId = auth.user.id;

  // Per-user rate limit (sensitive, irreversible action).
  const rl = await checkRateLimit("export", callerId);
  if (!rl.success) return tooManyRequests(rl);

  let body: { profileId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.profileId) return NextResponse.json({ error: "profileId is required" }, { status: 400 });

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfigured" }, { status: 503 });
  }

  const { data: caller } = await client.from("profiles").select("role, org_id").eq("id", callerId).single();
  const callerRole = caller?.role;
  const callerOrg = caller?.org_id;

  // Read the target via the service role (former employees have org_id cleared,
  // so the caller's RLS may not see them).
  const { data: target, error: targetErr } = await admin
    .from("profiles")
    .select("id, org_id, former_org_id, account_status, anonymized_at")
    .eq("id", body.profileId)
    .maybeSingle();
  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const isSelfFormer = callerId === target.id && String(target.account_status ?? "").startsWith("former_");
  const isController =
    !!callerOrg &&
    (callerRole === "admin" || callerRole === "hr") &&
    (target.org_id === callerOrg || target.former_org_id === callerOrg);
  const isSuperadmin = callerRole === "superadmin";

  if (!isSelfFormer && !isController && !isSuperadmin) {
    return NextResponse.json(
      { error: "Not authorized to erase this profile. Active-employee erasure is handled by the employer." },
      { status: 403 },
    );
  }

  if (target.anonymized_at) {
    return NextResponse.json({ ok: true, alreadyErased: true });
  }

  const { error } = await admin.rpc("forget_subject", {
    p_profile_id: target.id,
    p_actor_id: callerId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    profileId: target.id,
    note: "Personal data anonymized and scrubbed. Frozen employment-era attestations are retained in de-identified form per record-integrity policy.",
  });
}
