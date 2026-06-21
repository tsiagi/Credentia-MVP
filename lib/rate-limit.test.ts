// Run: npm test
// Tests the safety-critical behavior we rely on for launch: when no store is
// configured the limiter FAILS OPEN (never blocks traffic / adds latency), and
// the 429 builder is well-formed. (Actual sliding-window counting is exercised
// against a real Upstash store in staging, not here.)
import { test } from "node:test";
import assert from "node:assert/strict";

// Ensure no store is configured for this test process.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;

const { checkRateLimit, tooManyRequests, isRateLimitConfigured } = await import("./rate-limit.ts");

test("unconfigured store → isRateLimitConfigured() is false", () => {
  assert.equal(isRateLimitConfigured(), false);
});

test("unconfigured store → checkRateLimit fails OPEN (allows)", async () => {
  for (let i = 0; i < 50; i++) {
    const r = await checkRateLimit("ai-batch", "user-123");
    assert.equal(r.success, true, "must allow when no store is configured");
  }
});

test("tooManyRequests builds a 429 with a Retry-After header", () => {
  const res = tooManyRequests({ success: false, limit: 8, remaining: 0, reset: Date.now() + 30_000 });
  assert.equal(res.status, 429);
  const retry = Number(res.headers.get("Retry-After"));
  assert.ok(retry >= 1 && retry <= 31, `Retry-After should be ~30s, got ${retry}`);
  assert.equal(res.headers.get("X-RateLimit-Limit"), "8");
});
