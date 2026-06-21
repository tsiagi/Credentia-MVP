// lib/rate-limit.ts
// ─────────────────────────────────────────────────────────────
// Per-user rate limiting for expensive / abusable API routes
// (security audit #5). Backed by Upstash Redis (HTTP REST — no
// persistent socket, so it works on serverless with zero connection
// warm-up). Also reads Vercel KV's env names as a fallback.
//
// Design goals (per product requirements):
//   • No launch delay — the Redis client and limiters are created LAZILY on
//     first use; there is no top-level await or connection step.
//   • No added latency / no blocking — `limit()` is given a 1s timeout and
//     fails OPEN; any Redis error also fails open. Availability > strictness.
//   • Scales to many users — sliding-window counters live in Redis (shared
//     across all serverless instances), and an in-process `ephemeralCache`
//     short-circuits already-blocked identifiers to save round-trips.
//   • Safe when unconfigured — local dev / preview / build without Upstash
//     env vars simply allow all traffic (logged once), so nothing breaks.
//
// Configure in production:
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
//   (or KV_REST_API_URL / KV_REST_API_TOKEN from a Vercel KV store)
// ─────────────────────────────────────────────────────────────
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Named limits. Tokens are PER USER per window. Tuned for a 500+ user base:
// generous enough for real interactive use, tight enough to stop a scripted
// replay from running up Anthropic / export cost.
export type RateLimitName = "ai-single" | "ai-batch" | "ai-ingest" | "export";

const LIMITS: Record<RateLimitName, { tokens: number; window: `${number} ${"s" | "m"}` }> = {
  // single-subject AI guidance / one task breakdown — cheap-ish per call
  "ai-single": { tokens: 20, window: "1 m" },
  // batch generation over a whole team/org/department — expensive per call
  "ai-batch": { tokens: 8, window: "1 m" },
  // digital-twin memory ingestion
  "ai-ingest": { tokens: 12, window: "1 m" },
  // verified-record export — guard against scraping
  "export": { tokens: 30, window: "1 m" },
};

// `undefined` = not yet resolved, `null` = no store configured.
let redis: Redis | null | undefined;
let warned = false;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    redis = new Redis({ url, token });
  } else {
    redis = null;
    if (!warned) {
      warned = true;
      console.warn(
        "[rate-limit] No Upstash/KV env vars set — rate limiting is DISABLED (fail-open). " +
          "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in production.",
      );
    }
  }
  return redis;
}

// One shared in-process cache across all limiters (per serverless instance).
const ephemeralCache = new Map<string, number>();
const limiters = new Map<RateLimitName, Ratelimit>();

function getLimiter(name: RateLimitName): Ratelimit | null {
  const client = getRedis();
  if (!client) return null;
  let limiter = limiters.get(name);
  if (!limiter) {
    const cfg = LIMITS[name];
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(cfg.tokens, cfg.window),
      prefix: `rl:${name}`,
      analytics: false,
      ephemeralCache,
      // Fail open if Redis hasn't answered in 1s — never make a user wait on
      // the limiter.
      timeout: 1000,
    });
    limiters.set(name, limiter);
  }
  return limiter;
}

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // epoch ms when the window resets
};

const ALLOW: RateLimitResult = { success: true, limit: 0, remaining: 0, reset: 0 };

/**
 * Check the per-user limit for a named bucket. `identifier` should be the
 * authenticated user id. Fails OPEN when the store is unconfigured or errors.
 */
export async function checkRateLimit(name: RateLimitName, identifier: string): Promise<RateLimitResult> {
  const limiter = getLimiter(name);
  if (!limiter) return ALLOW;
  try {
    const r = await limiter.limit(identifier);
    return { success: r.success, limit: r.limit, remaining: r.remaining, reset: r.reset };
  } catch (e) {
    console.error("[rate-limit] limiter error — failing open:", e);
    return ALLOW;
  }
}

/**
 * Standard 429 response with rate-limit headers. Returns a Web `Response`
 * (which Next route handlers accept), so this module stays free of `next/server`
 * and remains unit-testable under the bare Node test runner.
 */
export function tooManyRequests(result: RateLimitResult): Response {
  const retryAfter = result.reset
    ? Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
    : 60;
  return Response.json(
    { error: "Too many requests — please slow down and try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    },
  );
}

/** True when a backing store is configured (useful for tests / health checks). */
export function isRateLimitConfigured(): boolean {
  return getRedis() !== null;
}
