import { comparable } from "../normalization/string-normalizer.js";
import { metric } from "../../utils/formatters.js";
import { sum, average, ratio } from "./time-calculator.js";
import { capacityUtilization, personCapacity, totalUniqueCapacity } from "./capacity-calculator.js";
import { deliveryRate, deliveryRateDevelop } from "./delivery-calculator.js";
import { qaMetrics } from "./qa-calculator.js";
import { hotfixCount, bugfixCount } from "./quality-calculator.js";
import { estimationAccuracy, timeVariance } from "./estimation-calculator.js";
import { normalizePossibleExcelHours } from "../normalization/unit-normalizer.js";
import { buildManagementWorkLogBreakdown, buildPersonWorkLogBreakdown } from "../work-log-category-service.js";

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

export function calculateManagementMetrics(issues, capacityPeople, mappings, workCategoryMapping) {
  const mix = workMix(issues);
  const plannedUnplanned = issues.filter((issue) => ["planned", "unplanned"].includes(issue.planType));
  const workload = sum(plannedUnplanned.map((issue) => (issue.devEstimate || 0) + (issue.testEstimate || 0)));
  const capacity = totalUniqueCapacity(capacityPeople, mappings);
  const qa = qaMetrics(issues);
  const estimated = sum(issues.map((issue) => (issue.devEstimate || 0) + (issue.testEstimate || 0)));
  const workLogBreakdown = buildManagementWorkLogBreakdown(issues, mappings, {}, workCategoryMapping);
  const workLogged = workLogBreakdown.totals.rawWorkLoggedHours;
  const productiveIssueKeys = new Set(workLogBreakdown.rows.filter((row) => row.workCategory === "productive").map((row) => row.issueKey));
  const productiveIssues = issues.filter((issue) => productiveIssueKeys.has(issue.issueKey));
  const productiveEstimated = sum(productiveIssues.map((issue) => (issue.devEstimate || 0) + (issue.testEstimate || 0)));
  const productiveWorkLogged = workLogBreakdown.totals.productiveWorkLoggedHours;
  const completedWithStoryPoints = issues.filter((issue) => issue.statusCanonical === "done" && Number.isFinite(issue.storyPoints));
  const averageStorySize = completedWithStoryPoints.length ? sum(completedWithStoryPoints.map((issue) => issue.storyPoints)) / completedWithStoryPoints.length : null;
  console.group?.("KPI Calculations");
  console.log?.({ issueCount: issues.length, workload, capacity, estimated, workLogged, productiveWorkLogged });
  console.groupEnd?.();
  return {
    capacityUtilization: metric(capacityUtilization(workload, capacity), "%", "ظرفیت موجود نیست."),
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
    const planned = sum(related.filter((i) => i.planType === "planned").map((i) => role === "qa" ? i.testEstimate || 0 : i.devEstimate || 0));
    const unplanned = sum(related.filter((i) => i.planType === "unplanned").map((i) => role === "qa" ? i.testEstimate || 0 : i.devEstimate || 0));
    const carry = sum(related.filter((i) => i.planType === "carry_over").map((i) => role === "qa" ? i.testEstimate || 0 : i.devEstimate || 0));
    const workloadForCapacity = role === "qa" ? planned + unplanned + carry : planned + unplanned;
    const workLogBreakdown = buildPersonWorkLogBreakdown(issues, mapping, workCategoryMapping);
    const relatedWorkLogBreakdown = buildPersonWorkLogBreakdown(related, mapping, workCategoryMapping);
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
      metrics: {
        availableCapacity: metric(capacity, "h"),
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
