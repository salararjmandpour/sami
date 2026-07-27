const KNOWN_KPI_MAP = new Map([
  ["capacity utilization", "capacityUtilization"],
  ["delivery rate develop", "deliveryRateDevelop"],
  ["delivery rate", "deliveryRate"],
  ["capacity utilizationqa", "capacityUtilizationQa"],
  ["unplanned work", "unplannedWork"],
  ["planned work", "plannedWork"],
  ["qa return rate", "qaReturnRate"],
  ["first pass rate", "firstPassRate"],
  ["rework rate", "reworkRate"],
  ["hotfix count", "hotfixCount"],
  ["bug fix count", "bugfixCount"],
  ["cycle time", "cycleTime"],
  ["lead time", "leadTime"],
  ["blocked time", "blockedTime"],
  ["estimation accuracy", "estimationAccuracy"],
  ["time variance", "timeVariance"],
  ["average story size", "averageStorySize"],
  ["wip", "wip"]
]);

export function normalizeKpiConfig(kpis) {
  return kpis.map((kpi) => ({
    ...kpi,
    calculationKey: KNOWN_KPI_MAP.get(String(kpi.name).trim().toLowerCase()) || "unsupported"
  }));
}

