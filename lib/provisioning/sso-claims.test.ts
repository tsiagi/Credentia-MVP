// Run: npm test   (node --test, native TS via type-stripping on Node >=22.6)
//
// Regression test for security audit finding #1: a self-service SSO sync must
// not let the request body assert role / org / reporting line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSsoClaims } from "./sso-claims.ts";

const ATTACKER = "11111111-1111-1111-1111-111111111111";
const OWN_ORG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const VICTIM_ORG = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

test("self-service: ignores spoofed admin role + cross-tenant orgId in body", () => {
  const claims = resolveSsoClaims({
    isTrustedIdp: false,
    userId: ATTACKER,
    resolvedDomainOrgId: OWN_ORG,
    existingProfile: { org_id: OWN_ORG, role: "employee" },
    // The crafted escalation payload from DevTools:
    body: { role: "admin", orgId: VICTIM_ORG, managerExternalId: "ceo", externalId: "spoofed" },
  });

  assert.equal(claims.role, "employee", "must NOT honour body.role");
  assert.equal(claims.orgId, OWN_ORG, "must NOT honour body.orgId (no cross-tenant move)");
  assert.notEqual(claims.orgId, VICTIM_ORG);
  assert.equal(claims.managerExternalId, undefined, "must NOT honour body.managerExternalId");
  assert.equal(claims.externalId, ATTACKER, "external id is pinned to the caller");
});

test("self-service: first login (no profile) defaults to employee + domain org", () => {
  const claims = resolveSsoClaims({
    isTrustedIdp: false,
    userId: ATTACKER,
    resolvedDomainOrgId: OWN_ORG,
    existingProfile: null,
    body: { role: "superadmin", orgId: VICTIM_ORG },
  });

  assert.equal(claims.role, "employee");
  assert.equal(claims.orgId, OWN_ORG);
});

test("self-service: existing admin keeps admin (no self-downgrade)", () => {
  const claims = resolveSsoClaims({
    isTrustedIdp: false,
    userId: ATTACKER,
    resolvedDomainOrgId: OWN_ORG,
    existingProfile: { org_id: OWN_ORG, role: "admin" },
    body: { role: "employee" },
  });

  assert.equal(claims.role, "admin", "role is preserved from the existing profile");
});

test("trusted IdP webhook: body claims are authoritative", () => {
  const claims = resolveSsoClaims({
    isTrustedIdp: true,
    userId: ATTACKER,
    resolvedDomainOrgId: OWN_ORG,
    existingProfile: null,
    body: { role: "admin", orgId: VICTIM_ORG, managerExternalId: "mgr-1", externalId: "ext-1" },
  });

  assert.equal(claims.role, "admin");
  assert.equal(claims.orgId, VICTIM_ORG);
  assert.equal(claims.managerExternalId, "mgr-1");
  assert.equal(claims.externalId, "ext-1");
});

test("trusted IdP webhook: falls back to domain org when body omits orgId", () => {
  const claims = resolveSsoClaims({
    isTrustedIdp: true,
    userId: ATTACKER,
    resolvedDomainOrgId: OWN_ORG,
    existingProfile: null,
    body: { role: "manager" },
  });

  assert.equal(claims.orgId, OWN_ORG);
  assert.equal(claims.externalId, ATTACKER, "external id falls back to userId");
});
