export type OrgLevel =
  | "ceo"
  | "executive"
  | "director"
  | "manager"
  | "team_lead"
  | "contributor";

export type RiskLevel = "healthy" | "attention" | "high";

export type MetricKey =
  | "productivity"
  | "morale"
  | "innovation"
  | "retentionRisk"
  | "compensationHealth"
  | "promotionReadiness"
  | "skillsGrowth"
  | "revenueImpact"
  | "operationalEfficiency"
  | "customerImpact"
  | "complianceHealth"
  | "workloadBalance";

export type OrgIntelNode = {
  id: string;
  name: string;
  role: string;
  department: string;
  level: OrgLevel;
  parentId: string | null;
  employeeCount: number;
  healthScore: number;
  productivityScore: number;
  moraleScore: number;
  innovationScore: number;
  retentionRisk: number;
  compensationHealth: number;
  promotionReadiness: number;
  skillsGrowth: number;
  revenueImpact: number;
  operationalEfficiency: number;
  customerImpact: number;
  complianceHealth: number;
  workloadBalance: number;
  alerts: string[];
  recommendations: string[];
  trends: { productivity: number[]; morale: number[] };
  children?: OrgIntelNode[];
};

export type ExecutiveSummary = {
  companyHealth: number;
  totalEmployees: number;
  highRiskDepartments: number;
  promotionReady: number;
  pendingCompActions: number;
  newProcessImprovements: number;
};

export const METRIC_LABELS: Record<MetricKey, string> = {
  productivity: "Productivity",
  morale: "Morale",
  innovation: "Innovation",
  retentionRisk: "Retention Risk",
  compensationHealth: "Comp Health",
  promotionReadiness: "Promotion Ready",
  skillsGrowth: "Skills Growth",
  revenueImpact: "Revenue Impact",
  operationalEfficiency: "Ops Efficiency",
  customerImpact: "Customer Impact",
  complianceHealth: "Compliance",
  workloadBalance: "Workload",
};

export const LEVEL_RANK: Record<OrgLevel, number> = {
  ceo: 6,
  executive: 5,
  director: 4,
  manager: 3,
  team_lead: 2,
  contributor: 1,
};

/** Label for the cohort grid shown beneath the selected parent */
export const COHORT_LABEL: Record<OrgLevel, string> = {
  ceo: "Executive Leadership Team",
  executive: "Department Leadership",
  director: "Management Layer",
  manager: "Team Lead Layer",
  team_lead: "Individual Contributors",
  contributor: "Contributors",
};

/** Auto-cluster peer groups above this count */
export const COHORT_CLUSTER_THRESHOLD = 18;

/** Metrics shown in focus analytics strip */
export const FOCUS_METRICS: MetricKey[] = [
  "productivity",
  "morale",
  "retentionRisk",
  "compensationHealth",
  "promotionReadiness",
  "skillsGrowth",
  "innovation",
];

/** Metrics used in comparison workspace */
export const COMPARE_METRICS: { key: MetricKey | "employeeValue" | "kpiCompletion" | "compRecommendation"; label: string; lowerIsBetter?: boolean }[] = [
  { key: "productivity", label: "Productivity" },
  { key: "morale", label: "Morale" },
  { key: "operationalEfficiency", label: "KPI Completion" },
  { key: "retentionRisk", label: "Retention Risk", lowerIsBetter: true },
  { key: "promotionReadiness", label: "Promotion Readiness" },
  { key: "innovation", label: "Innovation Contributions" },
  { key: "compensationHealth", label: "Comp Recommendations" },
  { key: "employeeValue", label: "Employee Value Score" },
];
