import type { ExecutiveSummary, MetricKey, OrgIntelNode, OrgLevel, RiskLevel } from "@/components/executive/types";
import { LEVEL_RANK } from "@/components/executive/types";

const METRIC_FIELD: Record<MetricKey, keyof OrgIntelNode> = {
  productivity: "productivityScore",
  morale: "moraleScore",
  innovation: "innovationScore",
  retentionRisk: "retentionRisk",
  compensationHealth: "compensationHealth",
  promotionReadiness: "promotionReadiness",
  skillsGrowth: "skillsGrowth",
  revenueImpact: "revenueImpact",
  operationalEfficiency: "operationalEfficiency",
  customerImpact: "customerImpact",
  complianceHealth: "complianceHealth",
  workloadBalance: "workloadBalance",
};

export function getNodeMetric(node: OrgIntelNode, key: MetricKey): number {
  return node[METRIC_FIELD[key]] as number;
}

type Seed = {
  id: string;
  name: string;
  role: string;
  department: string;
  level: OrgLevel;
  parentId: string | null;
  employeeCount: number;
  health: number;
  productivity: number;
  morale: number;
  innovation: number;
  retentionRisk: number;
  compHealth: number;
  promoReady: number;
  skills: number;
  revenue: number;
  ops: number;
  customer: number;
  compliance: number;
  workload: number;
  alerts?: string[];
  recommendations?: string[];
  trendBias?: "up" | "down" | "flat";
};

function trend(base: number, bias: "up" | "down" | "flat" = "flat"): number[] {
  const drift = bias === "up" ? 0.04 : bias === "down" ? -0.04 : 0;
  return [0, 1, 2, 3, 4, 5].map((i) =>
    Math.min(1, Math.max(0, base + drift * i + (i % 2 === 0 ? 0.02 : -0.02))),
  );
}

export function getRiskLevel(node: OrgIntelNode): RiskLevel {
  if (node.healthScore >= 75) return "healthy";
  if (node.healthScore >= 55) return "attention";
  return "high";
}

function s(
  id: string, name: string, role: string, department: string, level: OrgLevel, parentId: string | null,
  employeeCount: number, health: number, productivity: number, morale: number, innovation: number,
  retentionRisk: number, compHealth: number, trendBias: "up" | "down" | "flat" = "flat",
  extras?: Partial<Seed>,
): Seed {
  return {
    id, name, role, department, level, parentId, employeeCount, health, productivity, morale, innovation,
    retentionRisk, compHealth, promoReady: compHealth - 0.08, skills: morale, revenue: productivity,
    ops: productivity - 0.05, customer: morale, compliance: 0.9, workload: morale - 0.05, trendBias,
    ...extras,
  };
}

const SEEDS: Seed[] = [
  s("ceo-1", "Jordan Park", "Chief Executive Officer", "Credentia Inc.", "ceo", null, 210, 82, 0.84, 0.79, 0.71, 0.22, 0.88, "up",
    { recommendations: ["Review Operations retention", "Approve Q3 comp for Fulfillment cohort"] }),

  // Level 2 — Executive Leadership (all peers visible)
  s("exec-coo", "Morgan Lee", "Chief Operating Officer", "Operations", "executive", "ceo-1", 86, 70, 0.76, 0.66, 0.54, 0.44, 0.74, "down", { alerts: ["Fulfillment morale declining"] }),
  s("exec-cfo", "Priya Shah", "Chief Financial Officer", "Finance", "executive", "ceo-1", 18, 86, 0.88, 0.82, 0.58, 0.18, 0.9, "up"),
  s("exec-chro", "Riley Chen", "Chief Human Resources Officer", "Human Resources", "executive", "ceo-1", 22, 79, 0.81, 0.77, 0.62, 0.28, 0.86, "flat"),
  s("exec-cto", "Alex Rivera", "Chief Technology Officer", "Engineering", "executive", "ceo-1", 58, 86, 0.89, 0.82, 0.88, 0.15, 0.9, "up"),
  s("exec-cmo", "Jordan Ellis", "Chief Marketing Officer", "Marketing", "executive", "ceo-1", 16, 78, 0.8, 0.76, 0.74, 0.26, 0.82, "flat"),

  // Level 3 — COO department leaders (cohort)
  s("dir-ops", "James Okafor", "Director of Operations", "Operations", "director", "exec-coo", 42, 64, 0.68, 0.56, 0.4, 0.56, 0.66, "down",
    { alerts: ["Night shift attrition spike"], recommendations: ["Pilot flexible scheduling"] }),
  s("dir-cs", "Taylor Brooks", "Director of Customer Success", "Customer Success", "director", "exec-coo", 32, 81, 0.84, 0.78, 0.66, 0.24, 0.84, "up"),
  s("dir-fac", "Sam Ortiz", "Director of Facilities", "Operations", "director", "exec-coo", 12, 76, 0.78, 0.72, 0.52, 0.32, 0.78, "flat"),

  // Level 4 — Operations managers (cohort)
  s("mgr-east", "Chris Park", "Operations Manager, East", "Operations", "manager", "dir-ops", 18, 58, 0.62, 0.48, 0.34, 0.68, 0.6, "down", { alerts: ["Highest attrition cohort"] }),
  s("mgr-west", "Ava Morris", "Operations Manager, West", "Operations", "manager", "dir-ops", 14, 72, 0.74, 0.68, 0.48, 0.42, 0.72, "flat"),
  s("mgr-central", "Noah Bell", "Operations Manager, Central", "Operations", "manager", "dir-ops", 10, 78, 0.8, 0.74, 0.55, 0.3, 0.78, "up"),

  // Level 5 — Team leads under East manager
  s("lead-east-1", "Dana Fox", "Team Lead, East Region A", "Operations", "team_lead", "mgr-east", 9, 60, 0.64, 0.5, 0.36, 0.66, 0.62, "down"),
  s("lead-east-2", "Lee Santos", "Team Lead, East Region B", "Operations", "team_lead", "mgr-east", 9, 56, 0.6, 0.46, 0.32, 0.7, 0.58, "down"),

  // Level 6 — ICs under lead-east-1 (small cohort)
  s("ic-east-1", "Taylor Kim", "Operations Specialist", "Operations", "contributor", "lead-east-1", 1, 62, 0.66, 0.52, 0.38, 0.62, 0.64, "flat"),
  s("ic-east-2", "Riley Santos", "Operations Specialist", "Operations", "contributor", "lead-east-1", 1, 58, 0.62, 0.48, 0.34, 0.68, 0.6, "down"),
  s("ic-east-3", "Maya Chen", "Operations Specialist", "Operations", "contributor", "lead-east-1", 1, 64, 0.68, 0.54, 0.4, 0.58, 0.66, "flat"),

  // CS branch — manager → lead → 25 ICs (cluster demo)
  s("mgr-cs", "Emma Liu", "Customer Success Manager", "Customer Success", "manager", "dir-cs", 28, 82, 0.85, 0.79, 0.68, 0.22, 0.86, "up"),
  s("lead-cs-1", "Casey Wu", "Team Lead, Enterprise CS", "Customer Success", "team_lead", "mgr-cs", 25, 80, 0.83, 0.77, 0.66, 0.24, 0.84, "up"),

  // CFO branch (shorter, for peer compare at exec level)
  s("dir-fpna", "Alex Kim", "Director, FP&A", "Finance", "director", "exec-cfo", 10, 84, 0.86, 0.8, 0.54, 0.2, 0.88, "up"),
  s("mgr-acct", "Priya Nair", "Accounting Manager", "Finance", "manager", "dir-fpna", 6, 83, 0.85, 0.78, 0.5, 0.22, 0.86, "flat"),
  s("lead-acct", "James Okafor", "Team Lead, Accounting", "Finance", "team_lead", "mgr-acct", 4, 82, 0.84, 0.76, 0.48, 0.24, 0.84, "flat"),
  s("ic-acct-1", "Sam Lee", "Financial Analyst", "Finance", "contributor", "lead-acct", 1, 81, 0.83, 0.75, 0.46, 0.26, 0.82, "flat"),

  // CTO branch
  s("dir-platform", "Dana Fox", "Director, Platform Engineering", "Engineering", "director", "exec-cto", 28, 84, 0.87, 0.8, 0.9, 0.18, 0.88, "up"),
  s("dir-data", "Priya Nair", "Director, Data", "Engineering", "director", "exec-cto", 18, 81, 0.85, 0.78, 0.82, 0.2, 0.86, "up"),
  s("mgr-infra", "Ava Morris", "Engineering Manager, Platform", "Engineering", "manager", "dir-platform", 12, 85, 0.88, 0.81, 0.86, 0.16, 0.87, "up"),
  s("lead-infra", "Noah Bell", "Team Lead, Platform", "Engineering", "team_lead", "mgr-infra", 8, 84, 0.87, 0.8, 0.84, 0.17, 0.86, "up"),
  s("ic-eng-1", "Taylor Kim", "Software Engineer", "Engineering", "contributor", "lead-infra", 1, 86, 0.89, 0.82, 0.85, 0.15, 0.88, "up"),
  s("ic-eng-2", "Jordan Ellis", "Software Engineer", "Engineering", "contributor", "lead-infra", 1, 83, 0.86, 0.79, 0.82, 0.18, 0.85, "up"),

  // CHRO branch
  s("dir-talent", "Emma Liu", "Director, Talent", "Human Resources", "director", "exec-chro", 12, 77, 0.8, 0.76, 0.6, 0.3, 0.84, "flat"),
  s("mgr-recruiting", "Riley Santos", "Recruiting Manager", "Human Resources", "manager", "dir-talent", 7, 76, 0.79, 0.74, 0.58, 0.32, 0.82, "flat"),
  s("lead-talent", "Morgan Lee", "Team Lead, Talent Acquisition", "Human Resources", "team_lead", "mgr-recruiting", 5, 75, 0.78, 0.72, 0.55, 0.34, 0.8, "flat"),

  // CMO branch
  s("dir-growth", "Maya Chen", "Director, Growth Marketing", "Marketing", "director", "exec-cmo", 10, 77, 0.79, 0.75, 0.76, 0.28, 0.8, "flat"),
  s("mgr-content", "Casey Wu", "Content Manager", "Marketing", "manager", "dir-growth", 6, 76, 0.78, 0.74, 0.72, 0.3, 0.78, "flat"),
];

// Generate 25 CS representatives under lead-cs-1 (triggers cluster tile)
for (let i = 1; i <= 25; i++) {
  const health = 76 + (i % 5) * 2;
  SEEDS.push(s(
    `ic-cs-${i}`,
    `CSR ${String(i).padStart(2, "0")}`,
    "Customer Success Representative",
    "Customer Success",
    "contributor",
    "lead-cs-1",
    1,
    health,
    0.8 + (i % 3) * 0.03,
    0.76 + (i % 4) * 0.02,
    0.62 + (i % 2) * 0.04,
    0.2 + (i % 5) * 0.04,
    0.82 + (i % 3) * 0.02,
    i % 7 === 0 ? "down" : "up",
  ));
}

function seedToNode(s: Seed): OrgIntelNode {
  return {
    id: s.id,
    name: s.name,
    role: s.role,
    department: s.department,
    level: s.level,
    parentId: s.parentId,
    employeeCount: s.employeeCount,
    healthScore: s.health,
    productivityScore: s.productivity,
    moraleScore: s.morale,
    innovationScore: s.innovation,
    retentionRisk: s.retentionRisk,
    compensationHealth: s.compHealth,
    promotionReadiness: s.promoReady,
    skillsGrowth: s.skills,
    revenueImpact: s.revenue,
    operationalEfficiency: s.ops,
    customerImpact: s.customer,
    complianceHealth: s.compliance,
    workloadBalance: s.workload,
    alerts: s.alerts ?? [],
    recommendations: s.recommendations ?? [],
    trends: {
      productivity: trend(s.productivity, s.trendBias),
      morale: trend(s.morale, s.trendBias),
    },
  };
}

export function buildOrgIntelTree(): OrgIntelNode {
  const nodes = SEEDS.map(seedToNode);
  const byId = new Map<string, OrgIntelNode & { children?: OrgIntelNode[] }>(
    nodes.map((n) => [n.id, { ...n, children: [] }]),
  );
  let root: OrgIntelNode | null = null;

  for (const n of byId.values()) {
    if (!n.parentId) {
      root = n;
      continue;
    }
    const parent = byId.get(n.parentId);
    if (parent) {
      if (!parent.children) parent.children = [];
      parent.children.push(n);
    }
  }

  for (const n of byId.values()) {
    if (n.children?.length) {
      n.children.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.name.localeCompare(b.name));
    } else {
      n.children = undefined;
    }
  }

  if (!root) throw new Error("Org tree requires CEO root");
  return root;
}

export function flattenOrgTree(root: OrgIntelNode): OrgIntelNode[] {
  const out: OrgIntelNode[] = [];
  function walk(n: OrgIntelNode) {
    out.push(n);
    n.children?.forEach(walk);
  }
  walk(root);
  return out;
}

export function computeExecutiveSummary(nodes: OrgIntelNode[]): ExecutiveSummary {
  const ceo = nodes.find((n) => n.level === "ceo");
  const directors = nodes.filter((n) => n.level === "director");
  const nonCeo = nodes.filter((n) => n.level !== "ceo");
  return {
    companyHealth: Math.round(ceo?.healthScore ?? 0),
    totalEmployees: ceo?.employeeCount ?? 0,
    highRiskDepartments: directors.filter((n) => n.healthScore < 55).length,
    promotionReady: Math.round(
      nonCeo.reduce((sum, n) => sum + n.promotionReadiness * n.employeeCount, 0) / 15,
    ),
    pendingCompActions: nonCeo.filter((n) => n.compensationHealth < 0.75).length + 3,
    newProcessImprovements: Math.round(
      nonCeo.reduce((sum, n) => sum + n.innovationScore * 2, 0),
    ),
  };
}

export function breadcrumbLabel(node: OrgIntelNode, index: number): string {
  if (index === 0) return "Company";
  if (node.level === "executive") return node.department;
  if (node.level === "director") return node.department;
  return node.name;
}

export function computeEmployeeValueScore(node: OrgIntelNode): number {
  const raw =
    (node.productivityScore +
      node.moraleScore +
      node.innovationScore +
      node.compensationHealth +
      node.skillsGrowth -
      node.retentionRisk) /
    5;
  return Math.round(Math.min(100, Math.max(0, raw * 100)));
}

type CompareMetricKey =
  | MetricKey
  | "employeeValue"
  | "kpiCompletion"
  | "compRecommendation";

export function getCompareMetricValue(node: OrgIntelNode, key: CompareMetricKey): number {
  if (key === "employeeValue") return computeEmployeeValueScore(node) / 100;
  if (key === "kpiCompletion") return node.operationalEfficiency;
  if (key === "compRecommendation") return node.compensationHealth;
  return getNodeMetric(node, key);
}

export function avgMetric(nodes: OrgIntelNode[], key: MetricKey): number {
  if (!nodes.length) return 0;
  return nodes.reduce((s, n) => s + getNodeMetric(n, key), 0) / nodes.length;
}
