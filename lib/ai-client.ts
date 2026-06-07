/**
 * Client helper for /api/ai — the API key never leaves the server.
 */

export type AiInsightMode = "coaching" | "compensation" | "value_score" | "promotion";

export type VerifiedEmployeePayload = {
  profileId: string;
  fullName?: string | null;
  title?: string | null;
  achievements?: { kind: string; description: string; verification_level: number }[];
  kpis?: { title: string; status: string }[];
  projects?: { description: string; verification_level: number }[];
  verifiedFacts?: { kind: string; label: string; verification_level: number }[];
};

export type AiGuidanceResponse = {
  disclaimer: string;
  coaching?: { label: string; evidence: string[]; confidence: number }[];
  compensation?: {
    type: "raise" | "bonus";
    rangeLabel: string;
    rangeMin: number;
    rangeMax: number;
    unit: "percent" | "usd";
    reasoning: string[];
    factors: string[];
    confidence: number;
  }[];
  valueScore?: {
    score: number;
    inputs: Record<string, number>;
    reasoning: string[];
    confidence: number;
  };
  promotionReadiness?: {
    category: "ready_now" | "6mo" | "12mo" | "dev_needed";
    evidence: string[];
    confidence: number;
  };
};

export type AiGenerateResult = {
  disclaimer: string;
  processed: number;
  total: number;
  failed: { employeeId: string; ok: boolean; error?: string }[];
  results: { employeeId: string; ok: boolean; error?: string }[];
};

export type AiGenerateOptions = {
  employeeIds?: string[];
  /** team = direct reports; org = all employees/managers in org (executive/admin). */
  scope?: "team" | "org";
};

/** Manager/executive: call Anthropic server-side and persist to inference tables. */
export async function generateManagerInsights(
  accessToken: string,
  options?: AiGenerateOptions,
): Promise<AiGenerateResult> {
  const payload: AiGenerateOptions = {};
  if (options?.employeeIds?.length) payload.employeeIds = options.employeeIds;
  else if (options?.scope) payload.scope = options.scope;

  const res = await fetch("/api/ai/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Generate failed (${res.status})`);
  }
  return data as AiGenerateResult;
}

/** Executive/admin: generate AI insights for every employee and manager in the org. */
export function generateOrgInsights(accessToken: string): Promise<AiGenerateResult> {
  return generateManagerInsights(accessToken, { scope: "org" });
}

export async function fetchAiGuidance(
  mode: AiInsightMode,
  employeeData: VerifiedEmployeePayload,
): Promise<AiGuidanceResponse> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, employeeData }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `AI request failed (${res.status})`);
  }
  return body as AiGuidanceResponse;
}
