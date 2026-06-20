// lib/overseer/index.ts
// VP-6 — Overseer AI module barrel.
//
// SERVER (service-role) writers: rules.ts, runShadow.ts, enable.ts.
// BROWSER (RLS) reads: reads.ts. Client outcome seam: outcome-client.ts.
// Pure deterministic evaluator: evaluate.ts. Types/policy constants: types.ts.
export * from "./types";
export { evaluateRule, isEnactable } from "./evaluate";
export {
  proposeRule,
  addRuleVersion,
  approveVersion,
} from "./rules";
export {
  runShadowForCandidate,
  recordHumanOutcome,
} from "./runShadow";
export {
  enableRule,
  pauseRule,
  checkAutoPause,
  evaluateEnablementGate,
} from "./enable";
export { listRules, listShadowDecisions } from "./reads";
export type { RuleWithMetrics } from "./reads";
export { reportHumanOutcome } from "./outcome-client";
