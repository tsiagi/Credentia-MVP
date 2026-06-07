import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";
import type { BillingAction, BillingStatus } from "@/lib/billing";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

async function requireSuperadmin(token: string) {
  const client = getSupabaseAsUser(token);
  const { data: auth, error: authErr } = await client.auth.getUser();
  if (authErr || !auth.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: me } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (me?.role !== "superadmin") {
    return { error: NextResponse.json({ error: "Superadmin required" }, { status: 403 }) };
  }

  return { actorId: auth.user.id };
}

async function insertBillingEvent(
  admin: ReturnType<typeof getSupabaseAdmin>,
  input: {
    orgId: string;
    type: string;
    amount?: number | null;
    createdBy: string;
    detail?: Record<string, unknown>;
  },
) {
  const { error } = await admin.from("billing_events").insert({
    org_id: input.orgId,
    type: input.type,
    amount: input.amount ?? null,
    created_by: input.createdBy,
    detail: input.detail ?? {},
  });
  if (error) throw error;

  await admin.from("audit_log").insert({
    actor_id: input.createdBy,
    action: `billing_${input.type}`,
    target_table: "billing_events",
    target_id: input.orgId,
    changes: { type: input.type, amount: input.amount ?? null, ...(input.detail ?? {}) },
  });
}

export async function GET(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const auth = await requireSuperadmin(token);
  if ("error" in auth) return auth.error;

  try {
    getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfigured" }, { status: 503 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("organizations")
    .select("id, name, billing_status, trial_starts_at, trial_ends_at, monthly_price, seats, billing_notes")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orgs: data ?? [] });
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const auth = await requireSuperadmin(token);
  if ("error" in auth) return auth.error;

  let body: BillingAction;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfigured" }, { status: 503 });
  }

  const admin = getSupabaseAdmin();
  const actorId = auth.actorId;

  try {
    switch (body.action) {
      case "set_plan": {
        const { error } = await admin.from("organizations").update({
          monthly_price: body.monthlyPrice,
          seats: body.seats,
          billing_status: body.billingStatus,
          billing_notes: body.notes ?? null,
        }).eq("id", body.orgId);
        if (error) throw error;
        await insertBillingEvent(admin, {
          orgId: body.orgId,
          type: "plan_set",
          createdBy: actorId,
          amount: body.monthlyPrice,
          detail: { seats: body.seats, billing_status: body.billingStatus, notes: body.notes ?? null },
        });
        break;
      }
      case "start_trial": {
        const start = new Date();
        const end = new Date(start);
        end.setDate(end.getDate() + body.trialDays);
        const { error } = await admin.from("organizations").update({
          billing_status: "trial" as BillingStatus,
          trial_starts_at: start.toISOString(),
          trial_ends_at: end.toISOString(),
        }).eq("id", body.orgId);
        if (error) throw error;
        await insertBillingEvent(admin, {
          orgId: body.orgId,
          type: "trial_started",
          createdBy: actorId,
          detail: { trial_days: body.trialDays, trial_ends_at: end.toISOString() },
        });
        break;
      }
      case "extend_trial": {
        const { data: org } = await admin.from("organizations").select("trial_ends_at").eq("id", body.orgId).single();
        const base = org?.trial_ends_at ? new Date(org.trial_ends_at) : new Date();
        base.setDate(base.getDate() + body.extraDays);
        const { error } = await admin.from("organizations").update({
          billing_status: "trial",
          trial_ends_at: base.toISOString(),
        }).eq("id", body.orgId);
        if (error) throw error;
        await insertBillingEvent(admin, {
          orgId: body.orgId,
          type: "trial_extended",
          createdBy: actorId,
          detail: { extra_days: body.extraDays, trial_ends_at: base.toISOString() },
        });
        break;
      }
      case "end_trial": {
        const { error } = await admin.from("organizations").update({
          billing_status: "active",
          trial_ends_at: new Date().toISOString(),
        }).eq("id", body.orgId);
        if (error) throw error;
        await insertBillingEvent(admin, {
          orgId: body.orgId,
          type: "trial_ended",
          createdBy: actorId,
        });
        break;
      }
      case "record_charge_mocked": {
        await insertBillingEvent(admin, {
          orgId: body.orgId,
          type: "charge_mocked",
          amount: body.amount,
          createdBy: actorId,
          detail: { ...(body.detail ?? {}), mock: true },
        });
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Billing action failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
