import { NextRequest, NextResponse } from "next/server";
import type { AiInsightMode, VerifiedEmployeePayload } from "@/lib/ai-client";
import { callAnthropicGuidance } from "@/lib/ai/anthropic";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to .env.local (never commit it)." },
      { status: 503 },
    );
  }

  let body: { mode?: AiInsightMode; employeeData?: VerifiedEmployeePayload };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { mode, employeeData } = body;
  const validModes: AiInsightMode[] = ["coaching", "compensation", "value_score", "promotion"];
  if (!mode || !validModes.includes(mode)) {
    return NextResponse.json({ error: "mode must be coaching | compensation | value_score | promotion" }, { status: 400 });
  }
  if (!employeeData?.profileId) {
    return NextResponse.json({ error: "employeeData.profileId is required" }, { status: 400 });
  }

  try {
    const parsed = await callAnthropicGuidance(mode, employeeData);
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("AI route error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to generate guidance" },
      { status: 500 },
    );
  }
}
