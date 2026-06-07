import { NextRequest, NextResponse } from "next/server";
import { callAnthropicGuidance } from "@/lib/ai/anthropic";
import { loadEmployeePayload } from "@/lib/ai/employee-data";
import { persistAiGuidance } from "@/lib/ai/persist";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type GenerateBody = {
  employeeIds?: string[];
  /** "team" = direct reports (default). "org" = all employees/managers in caller's org (executive/admin). */
  scope?: "team" | "org";
};

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Authorization: Bearer <access_token> required" }, { status: 401 });
  }

  const userClient = getSupabaseAsUser(token);
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  const managerId = authData.user.id;

  let body: GenerateBody = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok — generate for all direct reports */
  }

  const { data: managerProfile } = await userClient.from("profiles").select("role, org_id").eq("id", managerId).single();
  const role = managerProfile?.role;
  if (!role || !["manager", "executive", "admin"].includes(role)) {
    return NextResponse.json({ error: "Only managers, executives, or admins can generate AI insights" }, { status: 403 });
  }

  const scope = body.scope ?? "team";
  let targetIds: string[] = body.employeeIds ?? [];

  if (!targetIds.length) {
    if (scope === "org") {
      if (role !== "executive" && role !== "admin") {
        return NextResponse.json({ error: "Org-wide generation requires executive or admin role" }, { status: 403 });
      }
      const orgId = managerProfile?.org_id;
      if (!orgId) {
        return NextResponse.json({ error: "Set profiles.org_id on your profile for org-wide generation." }, { status: 400 });
      }
      const { data: orgMembers, error } = await userClient
        .from("profiles")
        .select("id")
        .eq("org_id", orgId)
        .in("role", ["employee", "manager"]);
      if (error) return NextResponse.json({ error: error.message }, { status: 403 });
      targetIds = (orgMembers ?? []).map((r) => r.id);
    } else {
      const { data: reports, error } = await userClient.from("profiles").select("id").eq("manager_id", managerId);
      if (error) return NextResponse.json({ error: error.message }, { status: 403 });
      targetIds = (reports ?? []).map((r) => r.id);
    }
  } else {
    for (const id of targetIds) {
      if (role === "executive" || role === "admin") {
        const orgId = managerProfile?.org_id;
        if (!orgId) {
          return NextResponse.json({ error: "Set profiles.org_id on your profile." }, { status: 403 });
        }
        const { data: member } = await userClient.from("profiles").select("id").eq("id", id).eq("org_id", orgId).maybeSingle();
        if (!member) {
          return NextResponse.json({ error: `Not authorized for employee ${id}` }, { status: 403 });
        }
      } else {
        const { data: report } = await userClient.from("profiles").select("id").eq("id", id).eq("manager_id", managerId).maybeSingle();
        if (!report) {
          return NextResponse.json({ error: `Not authorized for employee ${id}` }, { status: 403 });
        }
      }
    }
  }

  if (!targetIds.length) {
    const hint = scope === "org"
      ? "No employees or managers found in your org."
      : "No direct reports found. Set profiles.manager_id on your team.";
    return NextResponse.json({ error: hint }, { status: 400 });
  }

  try {
    getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfigured" }, { status: 503 });
  }

  const results: { employeeId: string; ok: boolean; error?: string }[] = [];

  for (const employeeId of targetIds) {
    try {
      const payload = await loadEmployeePayload(employeeId);
      if (!payload) {
        results.push({ employeeId, ok: false, error: "Profile not found" });
        continue;
      }

      const guidance = await callAnthropicGuidance("all", payload);
      await persistAiGuidance(employeeId, guidance, managerId);
      results.push({ employeeId, ok: true });
    } catch (e) {
      results.push({
        employeeId,
        ok: false,
        error: e instanceof Error ? e.message : "Generation failed",
      });
    }
  }

  const processed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  return NextResponse.json({
    disclaimer: "AI INFERENCE — advisory only. You decide all comp, promotion, and rating outcomes.",
    processed,
    total: targetIds.length,
    failed,
    results,
  });
}
