import type { AiGuidanceResponse, AiInsightMode, VerifiedEmployeePayload } from "@/lib/ai-client";

export const AI_SYSTEM_PROMPT = `You are Credentia's internal workforce advisory model.

STRICT RULES (never break these):
1. Output is AI INFERENCE / decision SUPPORT only — never a final decision.
2. Do NOT approve promotions, comp changes, terminations, or ratings. Only suggest ranges and guidance.
3. Base reasoning ONLY on the verified employee data provided (L2+ items weigh more than L1).
4. Never invent credentials, tenure, or metrics not supported by the input.
5. Respond with valid JSON only — no markdown, no prose outside the JSON object.

JSON shape:
{
  "disclaimer": "string — must state humans decide",
  "coaching": [{ "label": "string", "evidence": ["string"], "confidence": 0.0-1.0 }],
  "compensation": [{
    "type": "raise" | "bonus",
    "rangeLabel": "e.g. Recommended raise: 5%–8%",
    "rangeMin": number,
    "rangeMax": number,
    "unit": "percent" | "usd",
    "reasoning": ["string"],
    "factors": ["KPI achievement"|"Project impact"|"Certifications"|"Market benchmark"|"Internal equity"],
    "confidence": 0.0-1.0
  }],
  "valueScore": {
    "score": 0-1000,
    "inputs": { "kpis": 0-1, "reviews": 0-1, "projects": 0-1, "certs": 0-1, "leadership": 0-1, "innovation": 0-1, "skills": 0-1, "recognition": 0-1 },
    "reasoning": ["string"],
    "confidence": 0.0-1.0
  },
  "promotionReadiness": {
    "category": "ready_now" | "6mo" | "12mo" | "dev_needed",
    "evidence": ["string"],
    "confidence": 0.0-1.0
  }
}

For mode "all", include coaching, compensation (1-2 items), valueScore, and promotionReadiness.
For a single mode, include only that section plus disclaimer.`;

function buildUserPrompt(mode: AiInsightMode | "all", data: VerifiedEmployeePayload): string {
  const verified = {
    achievements: (data.achievements ?? []).filter((a) => a.verification_level >= 2),
    projects: (data.projects ?? []).filter((p) => p.verification_level >= 2),
    facts: data.verifiedFacts ?? [],
    kpis: (data.kpis ?? []).filter((k) => k.status === "approved"),
    selfReported: {
      achievements: (data.achievements ?? []).filter((a) => a.verification_level < 2),
      projects: (data.projects ?? []).filter((p) => p.verification_level < 2),
    },
  };

  return `Mode: ${mode}

Employee: ${data.fullName ?? "Unknown"} — ${data.title ?? "No title"}
Profile ID: ${data.profileId}

Verified data (prefer this):
${JSON.stringify(verified, null, 2)}

Generate advisory JSON for mode "${mode}".`;
}

function parseJsonFromText(text: string): AiGuidanceResponse {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  return JSON.parse(trimmed.slice(start, end + 1)) as AiGuidanceResponse;
}

export async function callAnthropicGuidance(
  mode: AiInsightMode | "all",
  employeeData: VerifiedEmployeePayload,
): Promise<AiGuidanceResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: AI_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(mode, employeeData) }],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText.slice(0, 200)}`);
  }

  const anthropicJson = await anthropicRes.json();
  const textBlock = anthropicJson.content?.find((b: { type: string }) => b.type === "text");
  const text = textBlock?.text;
  if (!text) throw new Error("Empty AI response");

  const parsed = parseJsonFromText(text);
  if (!parsed.disclaimer) {
    parsed.disclaimer = "AI INFERENCE — advisory only. Managers and leaders make all final decisions.";
  }
  return parsed;
}
