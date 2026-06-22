import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";
import { encryptField, decryptField, isEncrypted } from "@/lib/crypto";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
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

function toPlaintext(stored: string): string {
  return isEncrypted(stored) ? decryptField(stored) : stored; // tolerate legacy plaintext
}

/** GET ?orgId= — reveal the org's SCIM secret (decrypted). Audited. */
export async function GET(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });
  const auth = await requireSuperadmin(token);
  if ("error" in auth) return auth.error;

  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfigured" }, { status: 503 });
  }

  const { data: org } = await admin.from("organizations").select("scim_secret").eq("id", orgId).maybeSingle();
  if (!org?.scim_secret) {
    return NextResponse.json({ error: "No SCIM secret set — rotate to generate one." }, { status: 404 });
  }

  let secret: string;
  try {
    secret = toPlaintext(org.scim_secret);
  } catch {
    return NextResponse.json({ error: "Secret unreadable (encryption key mismatch)" }, { status: 503 });
  }

  await admin.from("audit_log").insert({
    actor_id: auth.actorId,
    action: "scim_secret_revealed",
    target_table: "organizations",
    target_id: orgId,
    changes: {},
  });

  return NextResponse.json({ orgId, secret, headerName: "x-org-id", endpointPath: "/api/provision/scim" });
}

/** POST { orgId } — rotate (regenerate) the org's SCIM secret. Audited. */
export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });
  const auth = await requireSuperadmin(token);
  if ("error" in auth) return auth.error;

  let body: { orgId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfigured" }, { status: 503 });
  }

  const fresh = randomBytes(24).toString("hex");
  const { error } = await admin
    .from("organizations")
    .update({ scim_secret: encryptField(fresh) })
    .eq("id", body.orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("audit_log").insert({
    actor_id: auth.actorId,
    action: "scim_secret_rotated",
    target_table: "organizations",
    target_id: body.orgId,
    changes: {},
  });

  return NextResponse.json({ orgId: body.orgId, secret: fresh, headerName: "x-org-id", endpointPath: "/api/provision/scim" });
}
