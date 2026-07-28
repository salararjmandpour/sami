import { FIELD_ALIASES } from "../config/field-aliases.js";
import { CALCULATION_VERSION } from "../utils/constants.js";
import { comparable, normalizeString } from "./normalization/string-normalizer.js";
import { normalizePossibleExcelHours } from "./normalization/unit-normalizer.js";
import { sum, average } from "./calculations/time-calculator.js";
import { buildManagementWorkLogBreakdown, buildPersonWorkLogBreakdown, buildWorkLogQualityWarnings } from "./work-log-category-service.js";

const TOLERANCE = 0.01;
const PLAN_TYPES = ["planned", "unplanned", "carry_over", "unknown"];

export function buildReconciliation({ report, issues, capacityPeople = [], personMappings = [], fieldMappings = {}, fileMetadata = {}, dataQualityIssues = [] }) {
  const enabledMappings = personMappings.filter((mapping) => mapping.enabled !== false);
  const context = {
    report,
    issues,
    capacityPeople,
    personMappings: enabledMappings,
    fieldMappings,
    mappedDevelopers: personSet(enabledMappings, "developer"),
    mappedQa: personSet(enabledMappings, "qa")
  };
  const estimateReconciliation = buildEstimateReconciliation(context);
  const planTypeReconciliation = buildPlanTypeReconciliation(context);
  const personReconciliation = buildPersonReconciliation(context);
  const qaReconciliation = buildQaReconciliation(context);
  const workLogReconciliation = buildWorkLogReconciliation(context);
  const workLogCategoryReconciliation = buildWorkLogCategoryReconciliation(context);
  const blockedTimeDistribution = buildBlockedTimeDistribution(context);
  const timeReconciliation = buildTimeReconciliation(context);
  const unallocatedBuckets = buildUnallocatedBuckets(estimateReconciliation, workLogReconciliation, planTypeReconciliation);
  const drillDown = buildDrillDown(context, estimateReconciliation, workLogReconciliation, blockedTimeDistribution);
  const reconciliationIssues = [
    ...estimateReconciliation.errors,
    ...workLogCategoryReconciliation.errors,
    ...blockedTimeDistribution.warnings,
    ...timeReconciliation.warnings
  ];
  const reconciliationStatus = estimateReconciliation.errors.length ? "failed" : reconciliationIssues.length || dataQualityIssues.some((item) => item.severity === "warning") ? "warning" : "passed";
  return {
    reportMetadata: {
      id: report?.id || "",
      teamName: report?.teamName || "",
      sprintName: report?.sprintName || "",
      createdAt: report?.createdAt || new Date().toISOString(),
      calculationVersion: report?.calculationVersion || CALCULATION_VERSION
    },
    fileMetadata,
    estimateReconciliation,
    planTypeReconciliation,
    personReconciliation,
    qaReconciliation,
    workLogReconciliation,
    workLogCategoryReconciliation,
    workLogBreakdown: workLogCategoryReconciliation.managementBreakdown,
    personWorkLogBreakdowns: workLogCategoryReconciliation.personBreakdowns,
    blockedTimeDistribution,
    leadTimeDistribution: timeReconciliation.leadTimeDistribution,
    cycleTimeDistribution: timeReconciliation.cycleTimeDistribution,
    timeReconciliation,
    unallocatedBuckets,
    drillDown,
    dataQualityIssues,
    reconciliationStatus,
    generatedAt: new Date().toISOString()
  };
}

export function buildBlockedTimeWarnings(issues) {
  return issues.flatMap((issue) => {
    const warnings = [];
    const hours = issue.blockedHours;
    if (hours === null || hours === undefined || Number.isNaN(hours)) return warnings;
    const meta = getMeta(issue, "Time in block");
    if (hours < 0) warnings.push(warn(issue, "Blocked Time is negative", `${issue.issueKey}: ${hours}h`));
    if (hours > 500) warnings.push(warn(issue, "Blocked Time > 500 working hours", `${issue.issueKey}: ${hours}h`));
    if (issue.leadTimeHours !== null && hours > issue.leadTimeHours) warnings.push(warn(issue, "Blocked Time > Lead Time", `${issue.issueKey}: blocked ${hours}h > lead ${issue.leadTimeHours}h`));
    if (issue.cycleTimeHours !== null && hours > issue.cycleTimeHours) warnings.push(warn(issue, "Blocked Time > Cycle Time", `${issue.issueKey}: blocked ${hours}h > cycle ${issue.cycleTimeHours}h`));
    if (hours && !detectUnit(meta, issue.raw?.["Time in block"]).unit) warnings.push(warn(issue, "Blocked Time has an ambiguous unit", `${issue.issueKey}: ${JSON.stringify(meta.rawValue)}`));
    return warnings;
  });
}

function buildEstimateReconciliation(context) {
  const rows = [];
  const ownershipTotals = emptyOwnershipTotals();
  PLAN_TYPES.forEach((planType) => {
    const planIssues = context.issues.filter((issue) => issue.planType === planType);
    rows.push(...ownershipRows(planType, planIssues, context, ownershipTotals));
  });
  const managementDev = sum(context.issues.map((issue) => issue.devEstimate || 0));
  const managementTest = sum(context.issues.map((issue) => issue.testEstimate || 0));
  const managementTotal = managementDev + managementTest;
  const ownershipTotal = ownershipTotals.mappedDeveloperDevEstimate + ownershipTotals.unmappedDeveloperDevEstimate + ownershipTotals.unassignedDevEstimate + ownershipTotals.mappedQaTestEstimate + ownershipTotals.unmappedQaTestEstimate + ownershipTotals.testEstimateWithoutQaOwner;
  const difference = managementTotal - ownershipTotal;
  const errors = Math.abs(difference) > TOLERANCE ? [{ code: "ESTIMATE_RECONCILIATION_DIFF", difference, tolerance: TOLERANCE }] : [];
  const managementByPlan = Object.fromEntries(PLAN_TYPES.map((planType) => {
    const planIssues = context.issues.filter((issue) => issue.planType === planType);
    return [planType, { issueCount: planIssues.length, devEstimate: sum(planIssues.map((issue) => issue.devEstimate || 0)), testEstimate: sum(planIssues.map((issue) => issue.testEstimate || 0)), totalEstimate: sum(planIssues.map((issue) => (issue.devEstimate || 0) + (issue.testEstimate || 0))), issueKeys: planIssues.map((issue) => issue.issueKey) }];
  }));
  return { rows, ownershipTotals, management: { devEstimate: managementDev, testEstimate: managementTest, totalEstimate: managementTotal, byPlan: managementByPlan }, ownershipTotal, difference, tolerance: TOLERANCE, errors };
}

function ownershipRows(planType, planIssues, context, totals) {
  const buckets = [
    ["Mapped Developer", (issue) => issue.assignee && context.mappedDevelopers.has(comparable(issue.assignee)), "devEstimate"],
    ["Unmapped Developer", (issue) => issue.assignee && !context.mappedDevelopers.has(comparable(issue.assignee)), "devEstimate"],
    ["No Assignee", (issue) => !issue.assignee, "devEstimate"],
    ["Mapped QA", (issue) => issue.qaOwner && context.mappedQa.has(comparable(issue.qaOwner)), "testEstimate"],
    ["Unmapped QA", (issue) => issue.qaOwner && !context.mappedQa.has(comparable(issue.qaOwner)), "testEstimate"],
    ["No QA Owner", (issue) => !issue.qaOwner, "testEstimate"]
  ];
  return buckets.map(([ownership, predicate, estimateField]) => {
    const related = planIssues.filter(predicate);
    const devEstimate = estimateField === "devEstimate" ? sum(related.map((issue) => issue.devEstimate || 0)) : 0;
    const testEstimate = estimateField === "testEstimate" ? sum(related.map((issue) => issue.testEstimate || 0)) : 0;
    if (ownership === "Mapped Developer") totals.mappedDeveloperDevEstimate += devEstimate;
    if (ownership === "Unmapped Developer") totals.unmappedDeveloperDevEstimate += devEstimate;
    if (ownership === "No Assignee") totals.unassignedDevEstimate += devEstimate;
    if (ownership === "Mapped QA") totals.mappedQaTestEstimate += testEstimate;
    if (ownership === "Unmapped QA") totals.unmappedQaTestEstimate += testEstimate;
    if (ownership === "No QA Owner") totals.testEstimateWithoutQaOwner += testEstimate;
    return { planType, ownership, issueCount: related.length, devEstimate, testEstimate, totalEstimate: devEstimate + testEstimate, issueKeys: related.map((issue) => issue.issueKey) };
  });
}

function buildPlanTypeReconciliation(context) {
  const groups = new Map();
  context.issues.forEach((issue) => {
    const state = rawPlanState(issue, context.fieldMappings.planType);
    const key = `${state.originalValueLabel}|${issue.planType}`;
    if (!groups.has(key)) groups.set(key, { originalValue: state.originalValueLabel, rawKind: state.kind, normalizedValue: issue.planType, issueCount: 0, devEstimate: 0, testEstimate: 0, totalEstimate: 0, issueKeys: [] });
    const row = groups.get(key);
    row.issueCount += 1;
    row.devEstimate += issue.devEstimate || 0;
    row.testEstimate += issue.testEstimate || 0;
    row.totalEstimate += (issue.devEstimate || 0) + (issue.testEstimate || 0);
    row.issueKeys.push(issue.issueKey);
  });
  const rows = [...groups.values()].sort((a, b) => b.totalEstimate - a.totalEstimate);
  const carryOverIssues = context.issues.filter((issue) => issue.planType === "carry_over").map((issue) => ({
    issueKey: issue.issueKey,
    summary: issue.summary,
    status: issue.status,
    assignee: issue.assignee,
    qaOwner: issue.qaOwner,
    rawPlanType: rawPlanState(issue, context.fieldMappings.planType).originalValueLabel,
    devEstimate: issue.devEstimate || 0,
    testEstimate: issue.testEstimate || 0,
    totalEstimate: (issue.devEstimate || 0) + (issue.testEstimate || 0)
  })).sort((a, b) => b.totalEstimate - a.totalEstimate);
  return { rows, carryOverIssues };
}

function buildPersonReconciliation(context) {
  return context.personMappings.filter((mapping) => mapping.jiraName).map((mapping) => {
    const role = mapping.role;
    const related = context.issues.filter((issue) => comparable(role === "qa" ? issue.qaOwner : issue.assignee) === comparable(mapping.jiraName));
    const byPlan = Object.fromEntries(PLAN_TYPES.map((planType) => {
      const issues = related.filter((issue) => issue.planType === planType);
      return [planType, { issueCount: issues.length, devEstimate: sum(issues.map((issue) => issue.devEstimate || 0)), testEstimate: sum(issues.map((issue) => issue.testEstimate || 0)), workLogged: sumPersonWork(issues, mapping), issueKeys: issues.map((issue) => issue.issueKey) }];
    }));
    return { person: mapping.jiraName, role, workLogColumn: mapping.workLogColumn, issueCount: related.length, byPlan, totalWorkLogged: sumPersonWork(related, mapping) };
  });
}

function buildQaReconciliation(context) {
  const mappedQaByPlan = context.personMappings.filter((mapping) => mapping.enabled !== false && (mapping.role === "qa" || mapping.role === "both") && mapping.jiraName).map((mapping) => {
    const related = context.issues.filter((issue) => comparable(issue.qaOwner) === comparable(mapping.jiraName));
    return { person: mapping.jiraName, rows: PLAN_TYPES.map((planType) => {
      const issues = related.filter((issue) => issue.planType === planType);
      return { planType, issueCount: issues.length, testEstimate: sum(issues.map((issue) => issue.testEstimate || 0)), issueKeys: issues.map((issue) => issue.issueKey) };
    }) };
  });
  const blankQa = context.issues.filter((issue) => !issue.qaOwner);
  const unmappedQa = context.issues.filter((issue) => issue.qaOwner && !context.mappedQa.has(comparable(issue.qaOwner)));
  const mappedQa = context.issues.filter((issue) => issue.qaOwner && context.mappedQa.has(comparable(issue.qaOwner)));
  return {
    mappedQaByPlan,
    buckets: {
      blankQaOwner: qaBucket(blankQa),
      unmappedQaOwner: qaBucket(unmappedQa),
      mappedQaOwner: qaBucket(mappedQa),
      noFirstAutomationTest: qaBucket(context.issues.filter((issue) => !issue.firstAutomationTest)),
      submittedToQa: qaBucket(context.issues.filter((issue) => issue.firstAutomationTest)),
      done: qaBucket(context.issues.filter((issue) => issue.statusCanonical === "done")),
      notDone: qaBucket(context.issues.filter((issue) => issue.statusCanonical !== "done"))
    }
  };
}

function buildWorkLogReconciliation(context) {
  const sourceColumn = selectManagementWorkLogColumn(context);
  const rows = context.issues.map((issue) => {
    const sourceMeta = getMeta(issue, sourceColumn);
    const source = normalizePossibleExcelHours(issue.raw?.[sourceColumn], sourceMeta);
    const personValues = context.personMappings.filter((mapping) => mapping.enabled !== false && mapping.workLogColumn).map((mapping) => {
      const meta = getMeta(issue, mapping.workLogColumn);
      return { person: mapping.jiraName, column: mapping.workLogColumn, rawValue: issue.raw?.[mapping.workLogColumn], cellType: meta.type || "", format: meta.format || "", normalizedHours: normalizePossibleExcelHours(issue.raw?.[mapping.workLogColumn], meta).hours };
    });
    const mappedTotal = sum(personValues.map((value) => value.normalizedHours || 0));
    const managementTotal = source.hours || 0;
    return {
      issueKey: issue.issueKey,
      managementTotalWorkLog: managementTotal,
      sumOfMappedPersonColumns: mappedTotal,
      residual: managementTotal - mappedTotal,
      sourceColumnUsed: sourceColumn,
      rawSourceValue: issue.raw?.[sourceColumn],
      cellType: sourceMeta.type || "",
      excelNumberFormat: sourceMeta.format || "",
      detectedUnit: detectUnit(sourceMeta, issue.raw?.[sourceColumn]).label,
      normalizedHours: managementTotal,
      personValues
    };
  });
  const managementTotal = sum(rows.map((row) => row.managementTotalWorkLog));
  const mappedIndividualTotal = sum(rows.map((row) => row.sumOfMappedPersonColumns));
  const residualTotal = managementTotal - mappedIndividualTotal;
  return {
    sourceColumn,
    rows,
    totals: {
      managementWorkLogged: managementTotal,
      mappedIndividualWorkLogged: mappedIndividualTotal,
      residualWorkLogged: residualTotal,
      classification: Math.abs(residualTotal) > TOLERANCE ? "Unallocated / Other Users Work Logged" : "reconciled"
    }
  };
}

function buildBlockedTimeDistribution(context) {
  const rows = context.issues.map((issue) => {
    const meta = getMeta(issue, context.fieldMappings.blockedTime || "Time in block");
    const rawValue = issue.raw?.[context.fieldMappings.blockedTime || "Time in block"];
    const unit = detectUnit(meta, rawValue);
    return {
      issueKey: issue.issueKey,
      summary: issue.summary,
      status: issue.status,
      rawJavaScriptValue: rawValue,
      originalSheetJsValue: meta.rawValue ?? rawValue,
      cellType: meta.type || "",
      cellNumberFormat: meta.format || "",
      parsedSerialValue: typeof rawValue === "number" ? rawValue : null,
      detectedDurationUnit: unit.label,
      normalizedHours: issue.blockedHours || 0,
      leadTimeHours: issue.leadTimeHours,
      cycleTimeHours: issue.cycleTimeHours
    };
  }).filter((row) => row.normalizedHours !== 0);
  const values = rows.map((row) => row.normalizedHours).sort((a, b) => a - b);
  const total = sum(values);
  const distribution = { count: values.length, minimum: values[0] || 0, median: percentile(values, 0.5), average: average(values), p90: percentile(values, 0.9), p95: percentile(values, 0.95), maximum: values.at(-1) || 0, total };
  const top20 = [...rows].sort((a, b) => b.normalizedHours - a.normalizedHours).slice(0, 20).map((row) => ({ ...row, percentOfTotal: total ? row.normalizedHours / total * 100 : null }));
  const warnings = buildBlockedTimeWarnings(context.issues);
  return { rows, distribution, top20, warnings, conclusion: "Source cells are Excel duration values using [h]:mm; conversion is serial day fraction * 24 hours." };
}

function buildTimeReconciliation(context) {
  const rows = context.issues.map((issue) => {
    const lead = issue.leadTimeHours;
    const cycle = issue.cycleTimeHours;
    const calendarLead = issue.created && issue.doneDate ? Math.max(0, (new Date(issue.doneDate) - new Date(issue.created)) / 36e5) : null;
    const calendarCycle = issue.firstInProgress && issue.doneDate ? Math.max(0, (new Date(issue.doneDate) - new Date(issue.firstInProgress)) / 36e5) : null;
    return {
      issueKey: issue.issueKey,
      created: issue.created,
      firstInProgress: issue.firstInProgress,
      doneDate: issue.doneDate,
      leadHours: lead,
      cycleHours: cycle,
      excludedWeekendHours: calendarLead !== null && lead !== null ? Math.max(0, calendarLead - lead) : null,
      excludedHolidayHours: 0,
      cycleGreaterThanLead: lead !== null && cycle !== null && cycle > lead
    };
  });
  const leadValues = rows.map((row) => row.leadHours).filter((value) => value !== null);
  const cycleValues = rows.map((row) => row.cycleHours).filter((value) => value !== null);
  const warnings = rows.filter((row) => row.cycleGreaterThanLead).map((row) => ({ code: "CYCLE_GT_LEAD", severity: "warning", issueKey: row.issueKey, message: `${row.issueKey}: Cycle Time > Lead Time` }));
  return {
    rows,
    leadTimeDistribution: distribution(leadValues),
    cycleTimeDistribution: distribution(cycleValues),
    top20LeadTime: [...rows].filter((row) => row.leadHours !== null).sort((a, b) => b.leadHours - a.leadHours).slice(0, 20),
    top20CycleTime: [...rows].filter((row) => row.cycleHours !== null).sort((a, b) => b.cycleHours - a.cycleHours).slice(0, 20),
    cycleGreaterThanLead: rows.filter((row) => row.cycleGreaterThanLead),
    missingCreated: context.issues.filter((issue) => !issue.created).map((issue) => issue.issueKey),
    missingFirstInProgress: context.issues.filter((issue) => !issue.firstInProgress).map((issue) => issue.issueKey),
    missingDoneDate: context.issues.filter((issue) => !issue.doneDate).map((issue) => issue.issueKey),
    warnings
  };
}

function buildUnallocatedBuckets(estimate, workLog, planType) {
  return {
    unassignedDeveloperWork: estimate.ownershipTotals.unassignedDevEstimate,
    unmappedDeveloperWork: estimate.ownershipTotals.unmappedDeveloperDevEstimate,
    testWorkWithoutQaOwner: estimate.ownershipTotals.testEstimateWithoutQaOwner,
    unmappedQaWork: estimate.ownershipTotals.unmappedQaTestEstimate,
    otherUsersWorkLogged: workLog.totals.residualWorkLogged,
    unknownPlanTypeWork: estimate.management.byPlan.unknown.totalEstimate,
    carryOverFromBlankPlanType: sum(planType.rows.filter((row) => row.normalizedValue === "carry_over").map((row) => row.totalEstimate))
  };
}

function buildWorkLogCategoryReconciliation(context) {
  const managementBreakdown = buildManagementWorkLogBreakdown(context.issues, context.personMappings, context.fieldMappings, context.report?.workCategoryMapping);
  const personBreakdowns = context.personMappings.filter((mapping) => mapping.jiraName).map((mapping) => ({
    person: mapping.jiraName,
    role: mapping.role,
    ...buildPersonWorkLogBreakdown(context.issues, mapping, context.report?.workCategoryMapping)
  }));
  const totals = managementBreakdown.totals;
  const rows = [
    { field: "Raw Work Logged", hours: totals.rawWorkLoggedHours },
    { field: "Productive Work Logged", hours: totals.productiveWorkLoggedHours },
    { field: "Block Work Logged", hours: totals.blockWorkLoggedHours },
    { field: "Meeting Work Logged", hours: totals.meetingWorkLoggedHours },
    { field: "Technical Work Logged", hours: totals.technicalWorkLoggedHours },
    { field: "Version Work Logged", hours: totals.versionWorkLoggedHours },
    { field: "Technical + Version Work Logged", hours: totals.technicalVersionWorkLoggedHours },
    { field: "Non-Productive Work Logged", hours: totals.nonProductiveWorkLoggedHours },
    { field: "Reconciliation Difference", hours: totals.reconciliationDifference }
  ];
  const errors = Math.abs(totals.reconciliationDifference) > TOLERANCE ? [{ code: "WORK_LOG_CATEGORY_RECONCILIATION_DIFF", difference: totals.reconciliationDifference, tolerance: TOLERANCE }] : [];
  return {
    rows,
    totals,
    formula: "Raw - (Productive + Block + Meeting + Technical + Version)",
    tolerance: TOLERANCE,
    errors,
    warnings: buildWorkLogQualityWarnings(managementBreakdown),
    managementBreakdown,
    personBreakdowns
  };
}

function buildDrillDown(context, estimate, workLog, blocked) {
  const now = new Date().toISOString();
  const byPlan = estimate.management.byPlan;
  const breakdown = context.report?.calculatedMetrics?.management?.workLogBreakdown || buildManagementWorkLogBreakdown(context.issues, context.personMappings, context.fieldMappings, context.report?.workCategoryMapping);
  const rawAccuracy = estimate.management.totalEstimate && workLog.totals.managementWorkLogged ? estimate.management.totalEstimate / workLog.totals.managementWorkLogged * 100 : null;
  const productiveEstimated = context.report?.calculatedMetrics?.management?.productiveEstimatedHours ?? sum(context.issues.filter((issue) => breakdown.rows.find((row) => row.issueKey === issue.issueKey)?.workCategory === "productive").map((issue) => (issue.devEstimate || 0) + (issue.testEstimate || 0)));
  const planning = context.report?.calculatedMetrics?.management?.planningDrillDown || {};
  const kpiJson = context.report?.calculatedMetrics?.management?.kpiJson || {};
  return {
    capacityUtilization: drill("Capacity Utilization", "(Planned Dev + Unplanned Dev + Planned Test + Unplanned Test) / Total Available Capacity * 100", byPlan.planned.totalEstimate + byPlan.unplanned.totalEstimate, context.report?.calculatedMetrics?.management?.totalCapacity || null, [...byPlan.planned.issueKeys, ...byPlan.unplanned.issueKeys], ["Carry Over excluded from Capacity Utilization"], now),
    totalPlannedIssueCount: issueDrill("Total Planned Issue Count", "Distinct planned issue keys.", planning.plannedIssueKeys || [], now),
    totalStartedPlannedIssueCount: issueDrill("Total Started Planned Issue Count", "Distinct planned issue keys that reached In Progress or later.", planning.startedPlannedIssueKeys || [], now, kpiJson.startedPlannedIssueCount),
    totalUnplannedIssueCount: issueDrill("Total Unplanned Issue Count", "Distinct unplanned issue keys.", planning.unplannedIssueKeys || [], now),
    totalStartedUnplannedIssueCount: issueDrill("Total Started Unplanned Issue Count", "Distinct unplanned issue keys that reached In Progress or later.", planning.startedUnplannedIssueKeys || [], now, kpiJson.startedUnplannedIssueCount),
    plannedStartRate: rateDrill("Planned Start Rate", "Started Planned Issue Count / Planned Issue Count * 100", planning.plannedIssueKeys || [], planning.startedPlannedIssueKeys || [], now),
    unplannedStartRate: rateDrill("Unplanned Start Rate", "Started Unplanned Issue Count / Unplanned Issue Count * 100", planning.unplannedIssueKeys || [], planning.startedUnplannedIssueKeys || [], now),
    plannedCapacityUtilization: capacityDrill(kpiJson.plannedCapacityUtilization, now),
    unplannedCapacityUtilization: capacityDrill(kpiJson.unplannedCapacityUtilization, now),
    deliveryRate: drill("Delivery Rate", "Done planned/unplanned issues / planned/unplanned issues * 100", context.issues.filter((issue) => ["planned", "unplanned"].includes(issue.planType) && issue.statusCanonical === "done").length, context.issues.filter((issue) => ["planned", "unplanned"].includes(issue.planType)).length, context.issues.filter((issue) => ["planned", "unplanned"].includes(issue.planType)).map((issue) => issue.issueKey), ["Carry Over excluded from Delivery Rate"], now),
    estimationAccuracy: drill("Productive Estimation Accuracy", "Productive Estimated Hours / Productive Work Logged Hours * 100", productiveEstimated, breakdown.totals.productiveWorkLoggedHours, context.issues.map((issue) => issue.issueKey), ["Non-productive work logs excluded from the displayed accuracy denominator and non-productive estimates excluded from numerator"], now, { rawEstimationAccuracy: rawAccuracy, rawFormula: "Raw Estimated Hours / Raw Work Logged Hours * 100", rawEstimatedHours: estimate.management.totalEstimate, rawWorkLoggedHours: workLog.totals.managementWorkLogged, productiveEstimatedHours: productiveEstimated, productiveWorkLoggedHours: breakdown.totals.productiveWorkLoggedHours, workLogBreakdown: breakdown.totals, interpretation: "Displayed accuracy uses productive issue estimate and productive work logged. Raw accuracy remains available here for audit." }),
    blockedTime: drill("Blocked Time", "Sum of Time in block converted from Excel duration to hours", blocked.distribution.total, null, blocked.rows.map((row) => row.issueKey), [], now)
  };
}

function issueDrill(kpiName, formula, rows, timestamp, kpi = {}) {
  const includedIssueKeys = rows.map((row) => row.issueKey);
  return {
    kpiName,
    formula,
    numerator: includedIssueKeys.length,
    denominator: null,
    contributingIssueCount: includedIssueKeys.length,
    includedIssueCount: includedIssueKeys.length,
    includedIssueKeys,
    evaluatedIssueCount: kpi.evaluatedIssueCount ?? includedIssueKeys.length,
    excludedIssueCount: kpi.excludedIssueCount ?? 0,
    exclusionReasons: kpi.exclusionReasons || [],
    rows,
    calculationTimestamp: timestamp,
    calculationVersion: CALCULATION_VERSION
  };
}

function rateDrill(kpiName, formula, evaluatedRows, includedRows, timestamp) {
  const includedIssueKeys = includedRows.map((row) => row.issueKey);
  const excluded = evaluatedRows.filter((row) => !includedIssueKeys.includes(row.issueKey)).map((row) => row.issueKey);
  return {
    kpiName,
    formula,
    numerator: includedRows.length,
    denominator: evaluatedRows.length,
    contributingIssueCount: includedRows.length,
    evaluatedIssueCount: evaluatedRows.length,
    includedIssueCount: includedRows.length,
    includedIssueKeys,
    excludedIssueCount: excluded.length,
    exclusionReasons: excluded.length ? [{ reason: "Never reached In Progress", issueKeys: excluded }] : [],
    rows: includedRows,
    calculationTimestamp: timestamp,
    calculationVersion: CALCULATION_VERSION
  };
}

function capacityDrill(kpi = {}, timestamp) {
  return {
    kpiName: kpi.kpiName || "Capacity Utilization",
    formula: "Actual Productive Work / Capacity * 100",
    numerator: kpi.numerator ?? null,
    denominator: kpi.denominator ?? null,
    contributingIssueCount: kpi.includedIssueKeys?.length || 0,
    evaluatedIssueCount: (kpi.includedIssueKeys?.length || 0) + (kpi.excludedNonProductiveIssueKeys?.length || 0),
    includedIssueCount: kpi.includedIssueKeys?.length || 0,
    includedIssueKeys: kpi.includedIssueKeys || [],
    excludedIssueCount: kpi.excludedNonProductiveIssueKeys?.length || 0,
    exclusionReasons: kpi.excludedNonProductiveIssueKeys?.length ? [{ reason: "Non-productive work excluded", issueKeys: kpi.excludedNonProductiveIssueKeys }] : [],
    capacitySource: kpi.capacitySource || "",
    calculationTimestamp: timestamp,
    calculationVersion: CALCULATION_VERSION
  };
}

function drill(kpiName, formula, numerator, denominator, issueKeys, exclusionReasons, timestamp, extra = {}) {
  return { kpiName, formula, numerator, denominator, contributingIssueCount: issueKeys.length, contributingIssueKeys: issueKeys, excludedIssueCount: 0, exclusionReasons, activeFilters: {}, unitConversionsUsed: ["Excel [h]:mm duration = serial day fraction * 24"], calculationTimestamp: timestamp, calculationVersion: CALCULATION_VERSION, ...extra };
}

function selectManagementWorkLogColumn(context) {
  const headers = Object.keys(context.issues[0]?.raw || {}).filter((key) => !key.startsWith("__"));
  for (const alias of FIELD_ALIASES.totalWorkLogged) {
    const match = headers.find((header) => comparable(header) === comparable(alias));
    if (match) return match;
  }
  return "";
}

function sumPersonWork(issues, mapping) {
  if (!mapping.workLogColumn) return 0;
  return sum(issues.map((issue) => normalizePossibleExcelHours(issue.raw?.[mapping.workLogColumn], getMeta(issue, mapping.workLogColumn)).hours || 0));
}

function personSet(mappings, role) {
  return new Set(mappings.filter((mapping) => mapping.enabled !== false && mapping.jiraName && (mapping.role === role || mapping.role === "both")).map((mapping) => comparable(mapping.jiraName)));
}

function emptyOwnershipTotals() {
  return { mappedDeveloperDevEstimate: 0, unmappedDeveloperDevEstimate: 0, unassignedDevEstimate: 0, mappedQaTestEstimate: 0, unmappedQaTestEstimate: 0, testEstimateWithoutQaOwner: 0 };
}

function rawPlanState(issue, planColumn) {
  if (!planColumn) return { kind: "undefined", originalValueLabel: "(undefined)" };
  const raw = issue.raw?.[planColumn];
  const meta = getMeta(issue, planColumn);
  if (raw === undefined) return { kind: "undefined", originalValueLabel: "(undefined)" };
  if (raw === null) return { kind: "null", originalValueLabel: "(null)" };
  if (meta.formula && normalizeString(raw) === "") return { kind: "formula-empty", originalValueLabel: "(formula empty text)" };
  if (raw === "") return { kind: "empty-string", originalValueLabel: "(empty string)" };
  if (String(raw).trim() === "") return { kind: "whitespace-only", originalValueLabel: "(whitespace)" };
  return { kind: "non-empty", originalValueLabel: normalizeString(raw) };
}

function qaBucket(issues) {
  return { issueCount: issues.length, testEstimate: sum(issues.map((issue) => issue.testEstimate || 0)), issueKeys: issues.map((issue) => issue.issueKey), doneCount: issues.filter((issue) => issue.statusCanonical === "done").length, submittedCount: issues.filter((issue) => issue.firstAutomationTest).length };
}

function getMeta(issue, columnName) {
  return issue.raw?.__cellMeta?.[columnName] || {};
}

function detectUnit(meta, rawValue) {
  const format = String(meta.format || "");
  if (/\[h\]/i.test(format)) return { unit: "excel-duration", label: "Excel duration [h]:mm" };
  if (typeof rawValue === "number" && rawValue > 0 && rawValue < 1) return { unit: "excel-day-fraction", label: "Excel day fraction" };
  if (typeof rawValue === "number") return { unit: "hours-or-serial", label: "Numeric hours/serial duration" };
  if (rawValue instanceof Date) return { unit: "javascript-date", label: "JavaScript Date duration" };
  if (normalizeString(rawValue)) return { unit: "text", label: "Text duration" };
  return { unit: "", label: "blank" };
}

function distribution(values) {
  const sorted = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value)).sort((a, b) => a - b);
  return { count: sorted.length, minimum: sorted[0] || 0, median: percentile(sorted, 0.5), average: average(sorted), p90: percentile(sorted, 0.9), p95: percentile(sorted, 0.95), maximum: sorted.at(-1) || 0, total: sum(sorted) };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function warn(issue, code, message) {
  return { id: `reconciliation-${code}-${issue.issueKey}`, severity: "warning", code, message, issueKey: issue.issueKey };
}
