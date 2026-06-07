import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

export async function GET(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const client = getSupabaseAsUser(token);
  const { data: auth, error: authErr } = await client.auth.getUser();
  if (authErr || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await client.from("profiles").select("role, org_id").eq("id", auth.user.id).single();
  if (!me?.org_id) return NextResponse.json({ requests: [] });

  let query = client
    .from("org_membership_requests")
    .select("id, org_id, subject_profile_id, proposed_manager_id, requested_by, status, created_at")
    .eq("org_id", me.org_id)
    .order("created_at", { ascending: false });

  if (me.role !== "admin") {
    query = query.or(`requested_by.eq.${auth.user.id},subject_profile_id.eq.${auth.user.id}`);
  }

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = new Set<string>();
  for (const r of data ?? []) {
    ids.add(r.subject_profile_id);
    ids.add(r.proposed_manager_id);
    ids.add(r.requested_by);
  }

  const { data: names } = await client.from("profiles").select("id, full_name, title").in("id", [...ids]);
  const label = Object.fromEntries(
    (names ?? []).map((p) => [p.id, p.full_name?.trim() || p.title || p.id.slice(0, 8)]),
  );

  return NextResponse.json({
    requests: (data ?? []).map((r) => ({
      ...r,
      subject_name: label[r.subject_profile_id],
      manager_name: label[r.proposed_manager_id],
      requester_name: label[r.requested_by],
    })),
  });
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const client = getSupabaseAsUser(token);
  const { data: auth, error: authErr } = await client.auth.getUser();
  if (authErr || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await client.from("profiles").select("role, org_id").eq("id", auth.user.id).single();
  if (!me?.org_id || !["manager", "executive"].includes(me.role)) {
    return NextResponse.json({ error: "Only managers can propose reporting changes" }, { status: 403 });
  }

  let body: { subjectProfileId?: string; proposedManagerId?: string; employeeId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subjectProfileId = body.subjectProfileId ?? body.employeeId;
  const proposedManagerId = body.proposedManagerId;

  if (!subjectProfileId || !proposedManagerId) {
    return NextResponse.json({ error: "subjectProfileId and proposedManagerId required" }, { status: 400 });
  }

  const { data, error } = await client
    .from("org_membership_requests")
    .insert({
      org_id: me.org_id,
      subject_profile_id: subjectProfileId,
      proposed_manager_id: proposedManagerId,
      requested_by: auth.user.id,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  getSupabaseAdmin().from("audit_log").insert({
    actor_id: auth.user.id,
    action: "org_membership_proposed",
    target_table: "org_membership_requests",
    target_id: data.id,
    changes: { subject_profile_id: subjectProfileId, proposed_manager_id: proposedManagerId },
  });

  return NextResponse.json({ requestId: data.id });
}
