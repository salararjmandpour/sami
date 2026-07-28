import { comparable } from "../normalization/string-normalizer.js";
import { metric } from "../../utils/formatters.js";
import { sum, average, ratio } from "./time-calculator.js";
import { capacityUtilization, personCapacity, personCapacityRecord, totalUniqueCapacity, totalUniqueCapacityField } from "./capacity-calculator.js";
import { deliveryRate, deliveryRateDevelop } from "./delivery-calculator.js";
import { qaMetrics } from "./qa-calculator.js";
import { hotfixCount, bugfixCount } from "./quality-calculator.js";
import { estimationAccuracy, timeVariance } from "./estimation-calculator.js";
import { normalizePossibleExcelHours } from "../normalization/unit-normalizer.js";
import { buildManagementWorkLogBreakdown, buildPersonWorkLogBreakdown } from "../work-log-category-service.js";
import { hasReachedInProgress, startDetectionSource } from "../normalization/status-normalizer.js";

function workMix(issues) {
  const byPlan = { planned: 0, unplanned: 0, carry_over: 0 };
  issues.forEach((issue) => {
    if (byPlan[issue.planType] !== undefined) byPlan[issue.planType] += (issue.devEstimate || 0) + (issue.testEstimate || 0);
  });
  const total = byPlan.planned + byPlan.unplanned + byPlan.carry_over;
  return {
    ...byPlan,
    plannedPercent: ratio(byPlan.planned, total),
    unplannedPercent: ratio(byPlan.unplanned, total)
  };
}

function distinctIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = comparable(issue.issueKey || issue.issueKeyComparable);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function issueCountMetric(issues) {
  return metric(distinctIssues(issues).length);
}

function issueKeys(issues) {
  return distinctIssues(issues).map((issue) => issue.issueKey);
}

function startedIssues(issues) {
  return distinctIssues(issues).filter(hasReachedInProgress);
}

function productiveRowsForPlan(breakdown, planType) {
  return (breakdown?.rows || []).filter((row) => row.planType === planType && row.workCategory === "productive");
}

function drillRows(issues, breakdown, mapping = null) {
  const rowsByKey = new Map((breakdown?.rows || []).map((row) => [comparable(row.issueKey), row]));
  return distinctIssues(issues).map((issue) => {
    const row = rowsByKey.get(comparable(issue.issueKey)) || {};
    return {
      issueKey: issue.issueKey,
      summary: issue.summary,
      person: mapping?.jiraName || issue.assignee || issue.qaOwner || "",
      role: mapping?.role || "",
      planType: displayPlanType(issue.planType),
      currentStatus: issue.status,
      hasReachedInProgress: hasReachedInProgress(issue),
      startDetectionSource: startDetectionSource(issue),
      productiveWorkLogged: row.productiveWorkLoggedHours || 0,
      nonProductiveWorkLogged: row.nonProductiveWorkLoggedHours || 0,
      devEstimate: issue.devEstimate || 0,
      testEstimate: issue.testEstimate || 0
    };
  });
}

function displayPlanType(planType) {
  if (planType === "carry_over") return "Carry Over";
  if (planType === "planned") return "Planned";
  if (planType === "unplanned") return "Unplanned";
  return planType || "Unknown";
}

function kpiJson(kpiName, definition, result, unit, evaluatedIssues, includedIssues, excludedReasons = []) {
  const includedIssueKeys = issueKeys(includedIssues);
  return {
    kpiName,
    definition,
    result,
    displayValue: result === null || result === undefined || Number.isNaN(result) ? "N/A" : String(result),
    unit,
    evaluatedIssueCount: distinctIssues(evaluatedIssues).length,
    includedIssueCount: includedIssueKeys.length,
    includedIssueKeys,
    excludedIssueCount: Math.max(0, distinctIssues(evaluatedIssues).length - includedIssueKeys.length),
    exclusionReasons: excludedReasons
  };
}

function capacityDebug(capacityRecord) {
  return {
    total: capacityRecord?.availableCapacity ?? null,
    planned: capacityRecord?.plannedCapacity ?? null,
    unplanned: capacityRecord?.unplannedCapacity ?? null,
    totalSource: capacityRecord?.capacitySources?.total || "missing",
    plannedSource: capacityRecord?.capacitySources?.planned || "missing",
    unplannedSource: capacityRecord?.capacitySources?.unplanned || "missing"
  };
}

export function calculateManagementMetrics(issues, capacityPeople, mappings, workCategoryMapping) {
  const mix = workMix(issues);
  const plannedUnplanned = issues.filter((issue) => ["planned", "unplanned"].includes(issue.planType));
  const workload = sum(plannedUnplanned.map((issue) => (issue.devEstimate || 0) + (issue.testEstimate || 0)));
  const capacity = totalUniqueCapacity(capacityPeople, mappings);
  const totalPlannedCapacity = totalUniqueCapacityField(capacityPeople, mappings, "plannedCapacity");
  const totalUnplannedCapacity = totalUniqueCapacityField(capacityPeople, mappings, "unplannedCapacity");
  const qa = qaMetrics(issues);
  const estimated = sum(issues.map((issue) => (issue.devEstimate || 0) + (issue.testEstimate || 0)));
  const workLogBreakdown = buildManagementWorkLogBreakdown(issues, mappings, {}, workCategoryMapping);
  const workLogged = workLogBreakdown.totals.rawWorkLoggedHours;
  const productiveIssueKeys = new Set(workLogBreakdown.rows.filter((row) => row.workCategory === "productive").map((row) => row.issueKey));
  const productiveIssues = issues.filter((issue) => productiveIssueKeys.has(issue.issueKey));
  const productiveEstimated = sum(productiveIssues.map((issue) => (issue.devEstimate || 0) + (issue.testEstimate || 0)));
  const productiveWorkLogged = workLogBreakdown.totals.productiveWorkLoggedHours;
  const plannedIssues = distinctIssues(issues.filter((issue) => issue.planType === "planned"));
  const unplannedIssues = distinctIssues(issues.filter((issue) => issue.planType === "unplanned"));
  const startedPlanned = startedIssues(plannedIssues);
  const startedUnplanned = startedIssues(unplannedIssues);
  const plannedProductiveRows = productiveRowsForPlan(workLogBreakdown, "planned");
  const unplannedProductiveRows = productiveRowsForPlan(workLogBreakdown, "unplanned");
  const plannedProductiveWork = sum(plannedProductiveRows.map((row) => row.productiveWorkLoggedHours || 0));
  const unplannedProductiveWork = sum(unplannedProductiveRows.map((row) => row.productiveWorkLoggedHours || 0));
  const completedWithStoryPoints = issues.filter((issue) => issue.statusCanonical === "done" && Number.isFinite(issue.storyPoints));
  const averageStorySize = completedWithStoryPoints.length ? sum(completedWithStoryPoints.map((issue) => issue.storyPoints)) / completedWithStoryPoints.length : null;
  console.group?.("KPI Calculations");
  console.log?.({ issueCount: issues.length, workload, capacity, estimated, workLogged, productiveWorkLogged });
  console.groupEnd?.();
  return {
    capacityUtilization: metric(capacityUtilization(workload, capacity), "%", "ظرفیت موجود نیست."),
    totalPlannedCapacity: metric(totalPlannedCapacity, "h"),
    totalUnplannedCapacity: metric(totalUnplannedCapacity, "h"),
    totalPlannedIssueCount: issueCountMetric(plannedIssues),
    totalStartedPlannedIssueCount: issueCountMetric(startedPlanned),
    totalUnplannedIssueCount: issueCountMetric(unplannedIssues),
    totalStartedUnplannedIssueCount: issueCountMetric(startedUnplanned),
    plannedStartRate: metric(ratio(startedPlanned.length, plannedIssues.length), "%"),
    unplannedStartRate: metric(ratio(startedUnplanned.length, unplannedIssues.length), "%"),
    plannedProductiveWork: metric(plannedProductiveWork, "h"),
    unplannedProductiveWork: metric(unplannedProductiveWork, "h"),
    plannedCapacityUtilization: metric(capacityUtilization(plannedProductiveWork, totalPlannedCapacity), "%"),
    unplannedCapacityUtilization: metric(capacityUtilization(unplannedProductiveWork, totalUnplannedCapacity), "%"),
    plannedWork: metric(mix.planned, "h"),
    unplannedWork: metric(mix.unplanned, "h"),
    carryOver: metric(mix.carry_over, "h"),
    deliveryRateDevelop: metric(deliveryRateDevelop(issues), "%"),
    deliveryRate: metric(deliveryRate(issues), "%"),
    submittedToQa: metric(qa.submitted),
    qaReturnRate: metric(qa.qaReturnRate, "%"),
    firstPassRate: metric(qa.firstPassRate, "%"),
    hotfixCount: metric(hotfixCount(issues)),
    bugfixCount: metric(bugfixCount(issues)),
    rawWorkLogged: metric(workLogBreakdown.totals.rawWorkLoggedHours, "h"),
    productiveWorkLogged: metric(workLogBreakdown.totals.productiveWorkLoggedHours, "h"),
    blockWorkLogged: metric(workLogBreakdown.totals.blockWorkLoggedHours, "h"),
    meetingWorkLogged: metric(workLogBreakdown.totals.meetingWorkLoggedHours, "h"),
    technicalWorkLogged: metric(workLogBreakdown.totals.technicalWorkLoggedHours, "h"),
    versionWorkLogged: metric(workLogBreakdown.totals.versionWorkLoggedHours, "h"),
    technicalVersionWorkLogged: metric(workLogBreakdown.totals.technicalVersionWorkLoggedHours, "h"),
    nonProductiveWorkLogged: metric(workLogBreakdown.totals.nonProductiveWorkLoggedHours, "h"),
    leadTime: metric(average(issues.map((issue) => issue.leadTimeHours)), "h"),
    cycleTime: metric(average(issues.map((issue) => issue.cycleTimeHours)), "h"),
    blockedTime: metric(sum(issues.map((issue) => issue.blockedHours || 0)), "h"),
    estimationAccuracy: metric(estimationAccuracy(productiveEstimated, productiveWorkLogged), "%", "Productive Work Logged صفر یا خالی است.", {
      productiveEstimatedHours: productiveEstimated,
      productiveWorkLoggedHours: productiveWorkLogged,
      rawEstimatedHours: estimated,
      rawWorkLoggedHours: workLogged,
      rawEstimationAccuracy: estimationAccuracy(estimated, workLogged)
    }),
    averageStorySize: metric(averageStorySize, "", "Story Points یا داستان تکمیل‌شده کافی نیست."),
    reworkRate: metric(null, "", "فیلد Rework Time وجود ندارد."),
    wip: metric(null, "", "برای WIP میانگین، تاریخچه انتقال یا snapshot تاریخی لازم است."),
    timeVariance: metric(timeVariance(issues), "h"),
    workMix: mix,
    planningDrillDown: {
      plannedIssueKeys: drillRows(plannedIssues, workLogBreakdown),
      startedPlannedIssueKeys: drillRows(startedPlanned, workLogBreakdown),
      unplannedIssueKeys: drillRows(unplannedIssues, workLogBreakdown),
      startedUnplannedIssueKeys: drillRows(startedUnplanned, workLogBreakdown)
    },
    kpiJson: {
      startedPlannedIssueCount: kpiJson("Started Planned Issue Count", "Distinct planned issues that reached In Progress or a later workflow stage.", startedPlanned.length, "issues", plannedIssues, startedPlanned, [{ reason: "Never reached In Progress", issueKeys: issueKeys(plannedIssues.filter((issue) => !hasReachedInProgress(issue))) }]),
      startedUnplannedIssueCount: kpiJson("Started Unplanned Issue Count", "Distinct unplanned issues that reached In Progress or a later workflow stage.", startedUnplanned.length, "issues", unplannedIssues, startedUnplanned, [{ reason: "Never reached In Progress", issueKeys: issueKeys(unplannedIssues.filter((issue) => !hasReachedInProgress(issue))) }]),
      plannedCapacityUtilization: {
        kpiName: "Planned Capacity Utilization",
        numerator: plannedProductiveWork,
        denominator: totalPlannedCapacity,
        result: capacityUtilization(plannedProductiveWork, totalPlannedCapacity),
        capacitySource: "capacity-file/fallback by person",
        includedIssueKeys: [...new Set(plannedProductiveRows.map((row) => row.issueKey))],
        excludedNonProductiveIssueKeys: [...new Set((workLogBreakdown.rows || []).filter((row) => row.planType === "planned" && row.workCategory !== "productive").map((row) => row.issueKey))]
      },
      unplannedCapacityUtilization: {
        kpiName: "Unplanned Capacity Utilization",
        numerator: unplannedProductiveWork,
        denominator: totalUnplannedCapacity,
        result: capacityUtilization(unplannedProductiveWork, totalUnplannedCapacity),
        capacitySource: "capacity-file/fallback by person",
        includedIssueKeys: [...new Set(unplannedProductiveRows.map((row) => row.issueKey))],
        excludedNonProductiveIssueKeys: [...new Set((workLogBreakdown.rows || []).filter((row) => row.planType === "unplanned" && row.workCategory !== "productive").map((row) => row.issueKey))]
      }
    },
    totalCapacity: capacity,
    totalWorkLogged: workLogged,
    productiveEstimatedHours: productiveEstimated,
    workLogBreakdown
  };
}

export function calculatePersonDashboards(issues, capacityPeople, mappings, workCategoryMapping) {
  return mappings.filter((mapping) => mapping.enabled && mapping.jiraName).map((mapping) => {
    const role = mapping.role;
    const related = issues.filter((issue) => {
      if (role === "qa") return comparable(issue.qaOwner) === comparable(mapping.jiraName);
      return comparable(issue.assignee) === comparable(mapping.jiraName);
    });
    const capacity = personCapacity(capacityPeople, mapping);
    const capacityRecord = personCapacityRecord(capacityPeople, mapping);
    const plannedCapacity = capacityRecord?.plannedCapacity ?? null;
    const unplannedCapacity = capacityRecord?.unplannedCapacity ?? null;
    const planned = sum(related.filter((i) => i.planType === "planned").map((i) => role === "qa" ? i.testEstimate || 0 : i.devEstimate || 0));
    const unplanned = sum(related.filter((i) => i.planType === "unplanned").map((i) => role === "qa" ? i.testEstimate || 0 : i.devEstimate || 0));
    const carry = sum(related.filter((i) => i.planType === "carry_over").map((i) => role === "qa" ? i.testEstimate || 0 : i.devEstimate || 0));
    const workloadForCapacity = role === "qa" ? planned + unplanned + carry : planned + unplanned;
    const workLogBreakdown = buildPersonWorkLogBreakdown(issues, mapping, workCategoryMapping);
    const relatedWorkLogBreakdown = buildPersonWorkLogBreakdown(related, mapping, workCategoryMapping);
    const plannedIssues = distinctIssues(related.filter((issue) => issue.planType === "planned"));
    const unplannedIssues = distinctIssues(related.filter((issue) => issue.planType === "unplanned"));
    const startedPlanned = startedIssues(plannedIssues);
    const startedUnplanned = startedIssues(unplannedIssues);
    const plannedProductiveRows = productiveRowsForPlan(relatedWorkLogBreakdown, "planned");
    const unplannedProductiveRows = productiveRowsForPlan(relatedWorkLogBreakdown, "unplanned");
    const plannedProductiveWork = sum(plannedProductiveRows.map((row) => row.productiveWorkLoggedHours || 0));
    const unplannedProductiveWork = sum(unplannedProductiveRows.map((row) => row.productiveWorkLoggedHours || 0));
    const carryOverLoggedRows = role === "developer" ? workLogBreakdown.rows.filter((row) => row.planType === "carry_over" && row.rawWorkLoggedHours !== 0) : [];
    const carryOverWorkLogged = sum(carryOverLoggedRows.map((row) => row.rawWorkLoggedHours || 0));
    const carryOverProductiveWorkLogged = sum(carryOverLoggedRows.map((row) => row.productiveWorkLoggedHours || 0));
    const carryOverIssuesLogged = related.filter((issue) => carryOverLoggedRows.some((row) => comparable(row.issueKey) === comparable(issue.issueKey)));
    const workLogged = workLogBreakdown.totals.rawWorkLoggedHours;
    const qa = qaMetrics(related);
    const estimated = role === "qa" ? sum(related.map((i) => i.testEstimate || 0)) : sum(related.map((i) => i.devEstimate || 0));
    const productiveRelatedKeys = new Set(relatedWorkLogBreakdown.rows.filter((row) => row.workCategory === "productive").map((row) => row.issueKey));
    const productiveRelated = related.filter((issue) => productiveRelatedKeys.has(issue.issueKey));
    const productiveEstimated = role === "qa" ? sum(productiveRelated.map((i) => i.testEstimate || 0)) : sum(productiveRelated.map((i) => i.devEstimate || 0));
    return {
      name: mapping.jiraName,
      role,
      issues: related,
      workLogBreakdown,
      planningDrillDown: {
        plannedIssueKeys: drillRows(plannedIssues, relatedWorkLogBreakdown, mapping),
        startedPlannedIssueKeys: drillRows(startedPlanned, relatedWorkLogBreakdown, mapping),
        unplannedIssueKeys: drillRows(unplannedIssues, relatedWorkLogBreakdown, mapping),
        startedUnplannedIssueKeys: drillRows(startedUnplanned, relatedWorkLogBreakdown, mapping),
        carryOverLoggedIssueKeys: carryOverIssuesLogged.map((issue) => {
          const row = carryOverLoggedRows.find((candidate) => comparable(candidate.issueKey) === comparable(issue.issueKey)) || {};
          return {
            issueKey: issue.issueKey,
            summary: issue.summary,
            developer: mapping.jiraName,
            developerWorkLogged: row.rawWorkLoggedHours || 0,
            currentStatus: issue.status,
            planType: "Carry Over"
          };
        })
      },
      debug: {
        person: mapping.jiraName,
        role: role === "qa" ? "QA" : "Developer",
        capacity: capacityDebug(capacityRecord),
        planned: {
          issueCount: plannedIssues.length,
          startedIssueCount: startedPlanned.length,
          issueKeys: issueKeys(plannedIssues),
          startedIssueKeys: issueKeys(startedPlanned),
          productiveWorkLogged: plannedProductiveWork,
          capacityUtilization: capacityUtilization(plannedProductiveWork, plannedCapacity),
          capacityUtilizationReason: capacityUtilization(plannedProductiveWork, plannedCapacity) === null ? "N/A because planned capacity is zero, missing, or invalid" : ""
        },
        unplanned: {
          issueCount: unplannedIssues.length,
          startedIssueCount: startedUnplanned.length,
          issueKeys: issueKeys(unplannedIssues),
          startedIssueKeys: issueKeys(startedUnplanned),
          productiveWorkLogged: unplannedProductiveWork,
          capacityUtilization: capacityUtilization(unplannedProductiveWork, unplannedCapacity),
          capacityUtilizationReason: capacityUtilization(unplannedProductiveWork, unplannedCapacity) === null ? "N/A because unplanned capacity is zero, missing, or invalid" : ""
        },
        carryOver: {
          displayCountForDeveloper: role !== "developer",
          workLogged: carryOverWorkLogged,
          productiveWorkLogged: carryOverProductiveWorkLogged,
          loggedIssueKeys: carryOverLoggedRows.map((row) => row.issueKey)
        }
      },
      metrics: {
        availableCapacity: metric(capacity, "h"),
        totalCapacity: metric(capacity, "h"),
        plannedCapacity: metric(plannedCapacity, "h"),
        unplannedCapacity: metric(unplannedCapacity, "h"),
        plannedIssueCount: issueCountMetric(plannedIssues),
        startedPlannedIssueCount: issueCountMetric(startedPlanned),
        unplannedIssueCount: issueCountMetric(unplannedIssues),
        startedUnplannedIssueCount: issueCountMetric(startedUnplanned),
        plannedProductiveWork: metric(plannedProductiveWork, "h"),
        unplannedProductiveWork: metric(unplannedProductiveWork, "h"),
        plannedCapacityUtilization: metric(capacityUtilization(plannedProductiveWork, plannedCapacity), "%"),
        unplannedCapacityUtilization: metric(capacityUtilization(unplannedProductiveWork, unplannedCapacity), "%"),
        carryOverWorkLogged: metric(role === "developer" ? carryOverWorkLogged : null, "h"),
        plannedWork: metric(planned, "h"),
        unplannedWork: metric(unplanned, "h"),
        carryOver: metric(carry, "h"),
        capacityUtilization: metric(capacityUtilization(workloadForCapacity, capacity), "%"),
        deliveryRateDevelop: metric(deliveryRateDevelop(related), "%"),
        deliveryRate: metric(role === "qa" ? ratio(related.filter((i) => i.statusCanonical === "done").length, related.length) : deliveryRate(related), "%"),
        submittedToQa: metric(qa.submitted),
        qaReturnCount: metric(qa.returned),
        qaReturnRate: metric(qa.qaReturnRate, "%"),
        firstPassRate: metric(qa.firstPassRate, "%"),
        workLogged: metric(workLogged, "h"),
        rawWorkLogged: metric(workLogBreakdown.totals.rawWorkLoggedHours, "h"),
        productiveWorkLogged: metric(workLogBreakdown.totals.productiveWorkLoggedHours, "h"),
        blockWorkLogged: metric(workLogBreakdown.totals.blockWorkLoggedHours, "h"),
        meetingWorkLogged: metric(workLogBreakdown.totals.meetingWorkLoggedHours, "h"),
        technicalWorkLogged: metric(workLogBreakdown.totals.technicalWorkLoggedHours, "h"),
        versionWorkLogged: metric(workLogBreakdown.totals.versionWorkLoggedHours, "h"),
        technicalVersionWorkLogged: metric(workLogBreakdown.totals.technicalVersionWorkLoggedHours, "h"),
        nonProductiveWorkLogged: metric(workLogBreakdown.totals.nonProductiveWorkLoggedHours, "h"),
        estimationAccuracy: metric(estimationAccuracy(productiveEstimated, workLogBreakdown.totals.productiveWorkLoggedHours), "%", "Productive Work Logged صفر یا خالی است.", {
          productiveEstimatedHours: productiveEstimated,
          productiveWorkLoggedHours: workLogBreakdown.totals.productiveWorkLoggedHours,
          rawEstimatedHours: estimated,
          rawWorkLoggedHours: workLogged,
          rawEstimationAccuracy: estimationAccuracy(estimated, workLogged)
        }),
        leadTime: metric(average(related.map((i) => i.leadTimeHours)), "h"),
        cycleTime: metric(average(related.map((i) => i.cycleTimeHours)), "h"),
        blockedTime: metric(sum(related.map((i) => i.blockedHours || 0)), "h"),
        hotfixCount: metric(hotfixCount(related)),
        bugfixCount: metric(bugfixCount(related))
      }
    };
  });
}
