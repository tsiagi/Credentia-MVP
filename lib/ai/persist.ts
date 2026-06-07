import type { AiGuidanceResponse } from "@/lib/ai-client";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function clampScore(n: number) {
  return Math.min(1000, Math.max(0, Math.round(n)));
}

function clampConfidence(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** Write AI inference rows (service role). Replaces prior promo/comp rows for this employee. */
export async function persistAiGuidance(
  employeeId: string,
  guidance: AiGuidanceResponse,
  actorId: string,
): Promise<{ promo: boolean; comp: number; score: boolean }> {
  const admin = getSupabaseAdmin();
  let compCount = 0;
  let wrotePromo = false;
  let wroteScore = false;

  if (guidance.promotionReadiness) {
    await admin.from("promotion_readiness").delete().eq("employee_id", employeeId);
    const evidence = guidance.promotionReadiness.evidence.join(" ");
    const { error } = await admin.from("promotion_readiness").insert({
      employee_id: employeeId,
      category: guidance.promotionReadiness.category,
      evidence: evidence || "AI inference from verified workforce signals.",
    });
    if (error) throw error;
    wrotePromo = true;
  }

  if (guidance.compensation?.length) {
    await admin.from("compensation_recommendations").delete().eq("employee_id", employeeId).eq("status", "pending");
    for (const c of guidance.compensation) {
      const { error } = await admin.from("compensation_recommendations").insert({
        employee_id: employeeId,
        type: c.type,
        suggested_min: c.rangeMin,
        suggested_max: c.rangeMax,
        reasoning: c.reasoning.join(" "),
        confidence: clampConfidence(c.confidence),
        status: "pending",
      });
      if (error) throw error;
      compCount += 1;
    }
  }

  if (guidance.valueScore) {
    const vs = guidance.valueScore;
    const { error } = await admin.from("employee_value_scores").insert({
      employee_id: employeeId,
      score: clampScore(vs.score),
      inputs: {
        ...vs.inputs,
        ai_confidence: vs.confidence,
        ai_reasoning: vs.reasoning,
      },
    });
    if (error) throw error;
    wroteScore = true;
  }

  await admin.from("audit_log").insert({
    actor_id: actorId,
    action: "ai_insights_generated",
    target_table: "profiles",
    target_id: employeeId,
    changes: {
      promotion: wrotePromo,
      compensation_count: compCount,
      value_score: wroteScore,
      disclaimer: guidance.disclaimer,
    },
  });

  return { promo: wrotePromo, comp: compCount, score: wroteScore };
}
