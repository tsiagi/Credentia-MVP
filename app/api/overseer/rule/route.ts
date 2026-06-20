// app/api/overseer/rule/route.ts
// ─────────────────────────────────────────────────────────────
// VP-6 — Overseer rule enable (shadow→active) + pause (kill-switch).
//
// POST { ruleId, action: 'enable' | 'pause', versionId? }
//   enable: exec/admin ONLY (Q3) + the Q4 gate (enforced in enableRule()). The
//           system never self-promotes; this is the explicit human act.
//   pause : manager+ over OWN scope, or admin/exec org-wide (Q3). Kill-switch.
//
// Auth: bearer token → user client resolves the actor + role (like
// app/api/org-chart/approve). Service-role writes happen in lib/overseer/*.
// The DB RLS write policies + promote_candidate's in-txn re-check are the second
// and third lines of defence.
// ─────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAsUser } from "@/lib/supabase-admin";
import { enableRule, pauseRule } from "@/lib/overseer/enable";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const client = getSupabaseAsUser(token);
  const { data: auth, error: authErr } = await client.auth.getUser();
  if (authErr || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await client
    .from("profiles")
    .select("role, org_id")
    .eq("id", auth.user.id)
    .single();
  if (!me?.org_id) return NextResponse.json({ error: "No org" }, { status: 403 });

  let body: { ruleId?: string; versionId?: string; action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.ruleId || !body.action) {
    return NextResponse.json({ error: "ruleId and action required" }, { status: 400 });
  }

  // Confirm the rule belongs to the actor's org (RLS read on the user client).
  const { data: rule } = await client
    .from("overseer_rules")
    .select("id, org_id, scope_subject")
    .eq("id", body.ruleId)
    .single();
  if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  if (body.action === "enable") {
    // Q3: enable is executive/admin only.
    if (!["executive", "admin"].includes(me.role)) {
      return NextResponse.json(
        { error: "Only an executive or admin can enable automation." },
        { status: 403 },
      );
    }
    if (!body.versionId) {
      return NextResponse.json({ error: "versionId required to enable" }, { status: 400 });
    }
    try {
      const result = await enableRule(body.ruleId, body.versionId, auth.user.id);
      return NextResponse.json({ ok: true, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Enable failed";
      // Q4-gate failures are a 409 (precondition not met), not a 500.
      const status = /Q4 gate not met/i.test(msg) ? 409 : 500;
      return NextResponse.json({ error: msg }, { status });
    }
  }

  if (body.action === "pause") {
    // Q3: pause = manager+ over own scope, or admin/exec org-wide.
    const isAdminExec = ["executive", "admin"].includes(me.role);
    let allowed = isAdminExec;
    if (!allowed && me.role === "manager") {
      // Manager may pause a rule scoped to themselves or to one of their reports.
      const subj = rule.scope_subject as string | null;
      if (subj === auth.user.id) allowed = true;
      else if (subj) {
        const { data: rep } = await client
          .from("profiles")
          .select("id")
          .eq("id", subj)
          .eq("manager_id", auth.user.id)
          .maybeSingle();
        allowed = !!rep;
      }
    }
    if (!allowed) {
      return NextResponse.json(
        { error: "Not authorized to pause this rule." },
        { status: 403 },
      );
    }
    try {
      await pauseRule(body.ruleId, auth.user.id, "manual");
      return NextResponse.json({ ok: true, status: "paused" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Pause failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "action must be enable or pause" }, { status: 400 });
}
