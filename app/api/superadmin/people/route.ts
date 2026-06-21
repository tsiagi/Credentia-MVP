import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

async function requireSuperadmin(token: string) {
  const client = getSupabaseAsUser(token);
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: me } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (me?.role !== "superadmin") {
    return { error: NextResponse.json({ error: "Superadmin required" }, { status: 403 }) };
  }
  return { actorId: auth.user.id };
}

const VALID_ROLES = ["employee", "manager", "executive", "admin", "hr"];

type PersonInput = { name?: string; email?: string; role?: string; title?: string };

/** Create real people (auth user + profile) in a company. Service-role only. */
export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });
  const auth = await requireSuperadmin(token);
  if ("error" in auth) return auth.error;

  let body: { orgId?: string; people?: PersonInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.orgId || !Array.isArray(body.people) || body.people.length === 0) {
    return NextResponse.json({ error: "orgId and a non-empty people[] are required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const created: { id: string; name: string; email: string; role: string }[] = [];
  const errors: { email: string; message: string }[] = [];

  for (const p of body.people) {
    const email = (p.email ?? "").trim().toLowerCase();
    const name = (p.name ?? "").trim();
    const role = (p.role ?? "employee").trim().toLowerCase();
    if (!email || !name) {
      errors.push({ email: email || "(missing)", message: "name and email are required" });
      continue;
    }
    if (!VALID_ROLES.includes(role)) {
      errors.push({ email, message: `invalid role "${role}"` });
      continue;
    }
    // Create the auth user (confirmed, no password — they finish via invite/reset).
    const { data: createdUser, error: userErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: name, seeded_by: "superadmin_manual" },
    });
    if (userErr || !createdUser.user) {
      errors.push({ email, message: userErr?.message ?? "could not create user" });
      continue;
    }
    const uid = createdUser.user.id;
    const { error: profErr } = await admin.from("profiles").insert({
      id: uid,
      org_id: body.orgId,
      role,
      full_name: name,
      title: (p.title ?? "").trim() || null,
      account_status: "active_invited",
    });
    if (profErr) {
      // Roll back the orphaned auth user so a retry is clean.
      await admin.auth.admin.deleteUser(uid).catch(() => {});
      errors.push({ email, message: profErr.message });
      continue;
    }
    created.push({ id: uid, name, email, role });
  }

  if (created.length > 0) {
    await admin.from("audit_log").insert({
      actor_id: auth.actorId,
      action: "company_people_added",
      target_table: "profiles",
      target_id: body.orgId,
      changes: { count: created.length, emails: created.map((c) => c.email) },
    });
  }

  return NextResponse.json({ created: created.length, people: created, errors });
}
