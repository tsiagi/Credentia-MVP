import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";
import type { CompanyPatch, CompanyProfile, NewCompanyInput } from "@/lib/admin/companies";

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

// `select("*")` keeps this resilient to migration lag (e.g. brand_color may not
// exist yet); we map defensively from a loose record.
function toCompany(row: Record<string, unknown>, userCount: number): CompanyProfile {
  const g = <T,>(k: string, d: T): T => (row[k] === undefined || row[k] === null ? d : (row[k] as T));
  return {
    id: g("id", ""),
    name: g("name", ""),
    plan: g<string | null>("plan", null),
    status: g("status", "provisioning"),
    billing_status: g("billing_status", "trial"),
    seats: g<number | null>("seats", null),
    monthly_price: g<number | null>("monthly_price", null),
    billing_notes: g<string | null>("billing_notes", null),
    logo_url: g<string | null>("logo_url", null),
    brand_color: g<string | null>("brand_color", null),
    sso_provider: g<string | null>("sso_provider", null),
    sso_domain: g<string | null>("sso_domain", null),
    evaluation_model: g<string | null>("evaluation_model", null),
    require_proof: g<boolean | null>("require_proof", null),
    ai_coaching_enabled: g<boolean | null>("ai_coaching_enabled", null),
    promotion_engine_enabled: g<boolean | null>("promotion_engine_enabled", null),
    trial_ends_at: g<string | null>("trial_ends_at", null),
    created_at: g<string | null>("created_at", null),
    userCount,
  };
}

async function countsByOrg(admin: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await admin.from("profiles").select("org_id");
  const counts = new Map<string, number>();
  for (const p of data ?? []) {
    if (p.org_id) counts.set(p.org_id, (counts.get(p.org_id) ?? 0) + 1);
  }
  return counts;
}

const NON_BILLING_FIELDS = ["name", "plan", "status", "logo_url", "brand_color", "sso_provider", "sso_domain"] as const;

export async function GET(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });
  const auth = await requireSuperadmin(token);
  if ("error" in auth) return auth.error;

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfigured" }, { status: 503 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const counts = await countsByOrg(admin);

  if (orgId) {
    const { data, error } = await admin.from("organizations").select("*").eq("id", orgId).single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });

    const [people, integrations, billing, aiTasks, aiReports] = await Promise.all([
      admin.from("profiles").select("id, full_name, role, title, account_status").eq("org_id", orgId).order("full_name"),
      admin.from("tenant_integrations").select("source, status, records_imported, last_sync_at").eq("org_id", orgId),
      admin.from("billing_events").select("type, amount, created_at, detail").eq("org_id", orgId).order("created_at", { ascending: false }).limit(10),
      admin.from("ai_inference_tasks").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      admin.from("ai_inference_reports").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    ]);

    return NextResponse.json({
      company: toCompany(data, counts.get(orgId) ?? 0),
      people: people.data ?? [],
      integrations: integrations.data ?? [],
      billingEvents: billing.data ?? [],
      aiUsageCount: (aiTasks.count ?? 0) + (aiReports.count ?? 0),
    });
  }

  const { data, error } = await admin.from("organizations").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    companies: (data ?? []).map((o) => toCompany(o, counts.get((o as { id: string }).id) ?? 0)),
  });
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });
  const auth = await requireSuperadmin(token);
  if ("error" in auth) return auth.error;

  let body: NewCompanyInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.name?.trim()) return NextResponse.json({ error: "Company name required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("organizations")
    .insert({ name: body.name.trim(), plan: body.plan ?? null, status: "provisioning" })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });

  await admin.from("audit_log").insert({
    actor_id: auth.actorId,
    action: "company_provisioned",
    target_table: "organizations",
    target_id: data.id,
    changes: { name: body.name.trim(), plan: body.plan ?? null, admin_email: body.adminEmail ?? null },
  });

  return NextResponse.json({ orgId: data.id });
}

export async function PATCH(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });
  const auth = await requireSuperadmin(token);
  if ("error" in auth) return auth.error;

  let body: { orgId?: string; patch?: CompanyPatch };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.orgId || !body.patch) return NextResponse.json({ error: "orgId and patch required" }, { status: 400 });

  // Only non-billing fields here; billing/tier changes go through /api/billing/org.
  const patch: Record<string, unknown> = {};
  for (const k of NON_BILLING_FIELDS) {
    if (k in body.patch && body.patch[k] !== undefined) patch[k] = body.patch[k];
  }
  // organizations.sso_provider only accepts null | okta | azure | google —
  // normalize the editor's "none" sentinel to null so the update doesn't 500.
  if (patch.sso_provider === "none" || patch.sso_provider === "") patch.sso_provider = null;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No editable fields in patch" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("organizations").update(patch).eq("id", body.orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("audit_log").insert({
    actor_id: auth.actorId,
    action: "company_profile_updated",
    target_table: "organizations",
    target_id: body.orgId,
    changes: patch,
  });

  return NextResponse.json({ ok: true });
}
