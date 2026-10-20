import { test, equal, close, ok } from "./test-helpers.js";
import { calculateManagementMetrics, calculatePersonDashboards } from "../assets/js/services/calculations/report-calculator.js";
import { totalUniqueCapacity, totalUniqueCapacityField } from "../assets/js/services/calculations/capacity-calculator.js";
import { timeVariance } from "../assets/js/services/calculations/estimation-calculator.js";
import { formatNumber, metric } from "../assets/js/utils/formatters.js";
import { buildReportWorkbookSheets } from "../assets/js/services/export-service.js";
import { buildReconciliation } from "../assets/js/services/reconciliation-service.js";
import { recalculateReportCopy } from "../assets/js/controllers/dashboard-controller.js";

const issues = [
  { issueKeyComparable: "a", planType: "planned", statusCanonical: "done", devEstimate: 4, testEstimate: 2, workLogged: 5, labels: ["hotfix"], firstAutomationTest: "2026-01-01T00:00:00Z", qaReturned: false, leadTimeHours: 9, cycleTimeHours: 8, blockedHours: 1, assignee: "Dev A", qaOwner: "QA A", raw: { "Work A": 5 } },
  { issueKeyComparable: "b", planType: "unplanned", statusCanonical: "code_review", devEstimate: 6, testEstimate: 2, workLogged: 7, labels: ["bugfix"], firstAutomationTest: "2026-01-01T00:00:00Z", qaReturned: true, leadTimeHours: 5, cycleTimeHours: 4, blockedHours: 2, assignee: "Dev A", qaOwner: "QA A", raw: { "Work A": 7 } },
  { issueKeyComparable: "c", planType: "carry_over", statusCanonical: "ready", devEstimate: 10, testEstimate: 3, workLogged: 0, labels: [], firstAutomationTest: null, qaReturned: false, leadTimeHours: null, cycleTimeHours: null, blockedHours: 0, assignee: "Dev A", qaOwner: "QA A", raw: { "Work A": 0 } }
];
const capacity = [{ id: "c1", capacityName: "Dev", availableCapacity: 20 }, { id: "c2", capacityName: "QA", availableCapacity: 10 }];
const mappings = [
  { capacityId: "c1", capacityName: "Dev", jiraName: "Dev A", role: "developer", workLogColumn: "Work A", enabled: true },
  { capacityId: "c2", capacityName: "QA", jiraName: "QA A", role: "qa", workLogColumn: "Work A", enabled: true }
];

test("Management Capacity Utilization uses development estimates and developer capacity", () => {
  const metrics = calculateManagementMetrics(issues, capacity, mappings);
  close(metrics.capacityUtilization.value, 50);
  close(metrics.capacityUtilizationQa.value, 70);
});
test("Delivery Rate Develop", () => equal(calculateManagementMetrics(issues, capacity, mappings).deliveryRateDevelop.value, 100));
test("Delivery Rate", () => equal(calculateManagementMetrics(issues, capacity, mappings).deliveryRate.value, 50));
test("QA Return Rate", () => equal(calculateManagementMetrics(issues, capacity, mappings).qaReturnRate.value, 50));
test("First Pass Rate", () => equal(calculateManagementMetrics(issues, capacity, mappings).firstPassRate.value, 50));
test("Hotfix Count", () => equal(calculateManagementMetrics(issues, capacity, mappings).hotfixCount.value, 1));
test("Bug Fix Count", () => equal(calculateManagementMetrics(issues, capacity, mappings).bugfixCount.value, 1));
test("Estimation Accuracy counts a shared work-log column once", () => equal(calculateManagementMetrics(issues, capacity, mappings).estimationAccuracy.value, 225));
test("Division by zero", () => equal(calculateManagementMetrics([], [], []).capacityUtilization.value, null));
test("Missing Story Points", () => equal(calculateManagementMetrics(issues, capacity, mappings).averageStorySize.value, null));
test("Missing Rework Time", () => equal(calculateManagementMetrics(issues, capacity, mappings).reworkRate.value, null));
test("Developer Capacity Utilization", () => close(calculatePersonDashboards(issues, capacity, mappings)[0].metrics.capacityUtilization.value, 50));
test("QA Capacity Utilization including Carry Over", () => close(calculatePersonDashboards(issues, capacity, mappings)[1].metrics.capacityUtilization.value, 70));

const enhancedCapacity = [{ id: "c1", capacityName: "Dev", availableCapacity: 20, plannedCapacity: 10, unplannedCapacity: 0, capacitySources: { total: "capacity-file", planned: "capacity-file", unplanned: "capacity-file" } }];
const enhancedMappings = [{ capacityId: "c1", capacityName: "Dev", jiraName: "Dev A", role: "developer", workLogColumn: "Dev Work", enabled: true }];
const enhancedIssues = [
  { issueKey: "P-1", issueKeyComparable: "p-1", summary: "Build feature", planType: "planned", status: "In Progress", statusCanonical: "in_progress", devEstimate: 4, testEstimate: 1, assignee: "Dev A", qaOwner: "QA A", labels: [], raw: { "Dev Work": 2 } },
  { issueKey: "P-1", issueKeyComparable: "p-1", summary: "Build feature duplicate", planType: "planned", status: "In Progress", statusCanonical: "in_progress", devEstimate: 4, testEstimate: 1, assignee: "Dev A", qaOwner: "QA A", labels: [], raw: { "Dev Work": 3 } },
  { issueKey: "U-1", issueKeyComparable: "u-1", summary: "Incident", planType: "unplanned", status: "Done", statusCanonical: "done", devEstimate: 2, testEstimate: 0, assignee: "Dev A", qaOwner: "", labels: [], raw: { "Dev Work": 1 } },
  { issueKey: "U-1", issueKeyComparable: "u-1", summary: "Incident second log", planType: "unplanned", status: "Done", statusCanonical: "done", devEstimate: 2, testEstimate: 0, assignee: "Dev A", qaOwner: "", labels: [], raw: { "Dev Work": 4 } },
  { issueKey: "C-1", issueKeyComparable: "c-1", summary: "Carry support", planType: "carry_over", status: "Done", statusCanonical: "done", devEstimate: 8, testEstimate: 0, assignee: "Dev A", qaOwner: "", labels: [], raw: { "Dev Work": 6 } },
  { issueKey: "C-2", issueKeyComparable: "c-2", summary: "Carry no log", planType: "carry_over", status: "Done", statusCanonical: "done", devEstimate: 8, testEstimate: 0, assignee: "Dev A", qaOwner: "", labels: [], raw: { "Dev Work": 0 } },
  { issueKey: "M-1", issueKeyComparable: "m-1", summary: "Team meeting", planType: "planned", status: "Done", statusCanonical: "done", devEstimate: 1, testEstimate: 0, assignee: "Dev A", qaOwner: "", labels: ["meeting"], raw: { "Dev Work": 5 } }
];

test("Planned issue count is distinct despite duplicate rows", () => equal(calculatePersonDashboards(enhancedIssues, enhancedCapacity, enhancedMappings)[0].metrics.plannedIssueCount.value, 2));
test("Unplanned issue count is distinct despite multiple work logs", () => equal(calculatePersonDashboards(enhancedIssues, enhancedCapacity, enhancedMappings)[0].metrics.unplannedIssueCount.value, 1));
test("Carry-over is excluded from developer planned and unplanned counts", () => equal(calculatePersonDashboards(enhancedIssues, enhancedCapacity, enhancedMappings)[0].metrics.plannedIssueCount.value + calculatePersonDashboards(enhancedIssues, enhancedCapacity, enhancedMappings)[0].metrics.unplannedIssueCount.value, 3));
test("Developer carry-over work logged is displayed", () => equal(calculatePersonDashboards(enhancedIssues, enhancedCapacity, enhancedMappings)[0].metrics.carryOverWorkLogged.value, 6));
test("Carry-over with no developer log is excluded from drill-down", () => equal(calculatePersonDashboards(enhancedIssues, enhancedCapacity, enhancedMappings)[0].planningDrillDown.carryOverLoggedIssueKeys.some((row) => row.issueKey === "C-2"), false));
test("Unplanned Capacity Utilization is N/A when capacity is zero", () => equal(calculatePersonDashboards(enhancedIssues, enhancedCapacity, enhancedMappings)[0].metrics.unplannedCapacityUtilization.value, null));
test("Non-productive time is excluded from planned productive work", () => equal(calculatePersonDashboards(enhancedIssues, enhancedCapacity, enhancedMappings)[0].metrics.plannedProductiveWork.value, 5));
test("Team-level distinct issue counts do not double-count duplicates", () => equal(calculateManagementMetrics(enhancedIssues, enhancedCapacity, enhancedMappings).totalPlannedIssueCount.value, 2));
test("Planned Start Rate returns N/A when Planned Issue Count is zero", () => equal(calculateManagementMetrics(enhancedIssues.filter((i) => i.planType !== "planned"), enhancedCapacity, enhancedMappings).plannedStartRate.value, null));
test("QA ownership uses Content Point/QA owner", () => equal(calculatePersonDashboards([{ ...enhancedIssues[0], assignee: "Dev A", qaOwner: "QA B", testEstimate: 3 }], [{ id: "q", capacityName: "QA", availableCapacity: 10, plannedCapacity: 8, unplannedCapacity: 2 }], [{ capacityId: "q", capacityName: "QA", jiraName: "QA B", role: "qa", workLogColumn: "Dev Work", enabled: true }])[0].metrics.plannedIssueCount.value, 1));
test("Duplicate issue rows do not repeat estimate hours", () => {
  const metrics = calculateManagementMetrics(enhancedIssues, enhancedCapacity, enhancedMappings);
  equal(metrics.workMix.planned, 6);
  equal(metrics.plannedWork.hours, 6);
  equal(metrics.plannedWork.value, 25);
  equal(metrics.rawWorkLogged.value, 21);
});
test("Shared work-log column is counted once", () => equal(calculateManagementMetrics(issues, capacity, mappings).rawWorkLogged.value, 12));
test("Blocked time is unavailable when the source column is empty", () => {
  const metrics = calculateManagementMetrics(issues.map((issue) => ({ ...issue, blockedHours: null })), capacity, mappings);
  equal(metrics.blockedTime.value, null);
});
test("Hotfix and bug counts use issue type as well as labels", () => {
  const metrics = calculateManagementMetrics([
    { ...issues[0], issueKey: "H-1", issueKeyComparable: "h-1", issueType: "Hotfix", labels: [] },
    { ...issues[1], issueKey: "B-1", issueKeyComparable: "b-1", issueType: "Bug", labels: [] }
  ], capacity, mappings);
  equal(metrics.hotfixCount.value, 1);
  equal(metrics.bugfixCount.value, 1);
});

const panelCapacity = [
  { id: "capacity-col-1", capacityName: "مسلم", availableCapacity: 110.8, plannedCapacity: 80.64, unplannedCapacity: 10.08 },
  { id: "capacity-col-3", capacityName: "احد", availableCapacity: 141.6, plannedCapacity: 113.28, unplannedCapacity: 14.16 },
  { id: "capacity-col-7", capacityName: "علی", availableCapacity: 133.9, plannedCapacity: 107.12, unplannedCapacity: 13.39 },
  { id: "capacity-col-9", capacityName: "ستون بدون نام 10", availableCapacity: null, unresolved: true },
  { id: "zero", capacityName: "صفر", availableCapacity: 0, plannedCapacity: 0, unplannedCapacity: 0 }
];
const panelIssues = [
  { issueKey: "A-1", assignee: "Ahad Sheibani", qaOwner: "Ali Bahrampour", planType: "planned", devEstimate: 21, testEstimate: 4, statusCanonical: "done", labels: [], raw: {} },
  { issueKey: "M-1", assignee: "Moslem Seydmohamadi", planType: "planned", devEstimate: 5, testEstimate: 0, statusCanonical: "done", labels: [], raw: {} },
  { issueKey: "H-1", assignee: "Hadi Abedi", planType: "planned", devEstimate: 3, testEstimate: 0, statusCanonical: "done", labels: [], raw: {} }
];
const panelMappings = [
  { capacityId: "capacity-col-9", capacityName: "", jiraName: "Ahad Sheibani", role: "developer", workLogColumn: "", enabled: true },
  { capacityId: "capacity-col-1", capacityName: "مسلم", jiraName: "Moslem Seydmohamadi", role: "developer", workLogColumn: "", enabled: true },
  { capacityId: "capacity-col-7", capacityName: "علی", jiraName: "Ali Bahrampour", role: "qa", workLogColumn: "Work Today Ali", enabled: true },
  { capacityName: "", jiraName: "Hadi Abedi", role: "developer", workLogColumn: "", enabled: true },
  { capacityId: "zero", capacityName: "صفر", jiraName: "Zero Person", role: "developer", workLogColumn: "", enabled: true }
];

test("Scrum overall capacity keeps a mapped person when the row has no capacity name", () => {
  const dashboards = calculatePersonDashboards(panelIssues, panelCapacity, panelMappings, {});
  const ahad = dashboards.find((person) => person.name === "Ahad Sheibani");
  const moslem = dashboards.find((person) => person.name === "Moslem Seydmohamadi");
  const ali = dashboards.find((person) => person.name === "Ali Bahrampour");
  const hadi = dashboards.find((person) => person.name === "Hadi Abedi");
  const zero = dashboards.find((person) => person.name === "Zero Person");
  equal(ahad.metrics.totalCapacity.value, 141.6);
  equal(ahad.metrics.availableCapacity.value, 141.6);
  equal(ahad.metrics.plannedCapacity.value, 113.28);
  equal(ahad.metrics.totalCapacity.displayValue === "N/A", false);
  equal(moslem.metrics.totalCapacity.value, 110.8);
  equal(ali.metrics.totalCapacity.value, 133.9);
  equal(ali.role, "qa");
  equal(hadi.metrics.totalCapacity.value, null);
  equal(hadi.metrics.totalCapacity.displayValue, "N/A");
  equal(zero.metrics.totalCapacity.value, 0);
  equal(zero.metrics.totalCapacity.displayValue === "N/A", false);
  const devMappings = panelMappings.filter((mapping) => mapping.role !== "qa" && mapping.jiraName !== "Hadi Abedi" && mapping.jiraName !== "Zero Person");
  const qaMappings = panelMappings.filter((mapping) => mapping.role === "qa");
  close(totalUniqueCapacity(panelCapacity, devMappings), 252.4);
  close(totalUniqueCapacity(panelCapacity, qaMappings), 133.9);
});

test("Team capacity is unavailable when no finite capacity exists", () => {
  const people = [{ id: "a", capacityName: "A", availableCapacity: null, plannedCapacity: null, unplannedCapacity: null }];
  const personMappings = [{ enabled: true, jiraName: "A", capacityName: "A", role: "developer", workLogColumn: "" }];
  equal(totalUniqueCapacityField(people, personMappings, "plannedCapacity"), null);
  const metrics = calculateManagementMetrics([], people, personMappings);
  equal(metrics.totalPlannedCapacity.value, null);
  equal(metrics.totalPlannedCapacity.displayValue, "N/A");
  equal(metrics.totalUnplannedCapacity.value, null);
  equal(metrics.capacityUtilization.value, null);
  equal(metrics.totalCapacity, null);
  const stored = JSON.parse(JSON.stringify(metrics));
  equal(stored.totalCapacity, null);
  equal(stored.totalPlannedCapacity.value, null);
  equal(stored.timeVariance.value, null);
  equal(stored.timeVariance.displayValue, "N/A");
  equal(formatNumber(stored.timeVariance.value), "N/A");
  equal(stored.totalPlannedCapacity.value === 0, false);
  equal(stored.timeVariance.value === 0, false);
});

test("Unavailable values stay null when a saved report is reopened", () => {
  const saved = {
    teamName: "تیم",
    sprintName: "نمونه",
    normalizedData: {
      issues: [{ issueKey: "M-1", issueKeyComparable: "m-1", planType: "planned", statusCanonical: "done", workLogged: null, devEstimate: null, testEstimate: null, labels: [], raw: {} }],
      capacityPeople: [{ id: "a", capacityName: "A", availableCapacity: null, plannedCapacity: null, unplannedCapacity: null }]
    },
    mappingSnapshot: { personMappings: [{ enabled: true, jiraName: "A", capacityName: "A", role: "developer", workLogColumn: "" }], fieldMappings: {} },
    files: {},
    dataQuality: []
  };
  const reopened = JSON.parse(JSON.stringify(recalculateReportCopy(saved)));
  equal(reopened.calculatedMetrics.management.timeVariance.value, null);
  equal(reopened.calculatedMetrics.management.timeVariance.displayValue, "N/A");
  equal(reopened.calculatedMetrics.management.totalPlannedCapacity.value, null);
  equal(reopened.calculatedMetrics.management.totalCapacity, null);
  equal(reopened.id === saved.id, false);
});

test("Team capacity keeps a genuine zero and sums only finite values", () => {
  const people = [
    { id: "a", capacityName: "A", availableCapacity: 10, plannedCapacity: 0, unplannedCapacity: 4 },
    { id: "b", capacityName: "B", availableCapacity: null, plannedCapacity: null, unplannedCapacity: 6 }
  ];
  const personMappings = [
    { enabled: true, jiraName: "A", capacityName: "A", role: "developer", workLogColumn: "" },
    { enabled: true, jiraName: "A", capacityName: "A", role: "developer", workLogColumn: "" },
    { enabled: true, jiraName: "B", capacityName: "B", role: "qa", workLogColumn: "" }
  ];
  equal(totalUniqueCapacity(people, personMappings), 10);
  equal(totalUniqueCapacityField(people, personMappings, "plannedCapacity"), 0);
  close(totalUniqueCapacityField(people, personMappings, "unplannedCapacity"), 10);
  const metrics = calculateManagementMetrics([], people, personMappings);
  equal(metrics.totalPlannedCapacity.value, 0);
  equal(metrics.totalPlannedCapacity.displayValue === "N/A", false);
  equal(metrics.capacityUtilization.value, 0);
  const stored = JSON.parse(JSON.stringify(metrics));
  equal(stored.totalCapacity, 10);
  equal(stored.totalPlannedCapacity.value, 0);
  const reconciliation = buildReconciliation({ report: { calculatedMetrics: { management: metrics } }, issues: [], personMappings: [], fieldMappings: {} });
  equal(reconciliation.drillDown.capacityUtilization.denominator, 10);
  const zeroMetrics = calculateManagementMetrics([], [{ id: "z", capacityName: "Z", availableCapacity: 0, plannedCapacity: 0, unplannedCapacity: 0 }], [{ enabled: true, jiraName: "Z", capacityName: "Z", role: "developer", workLogColumn: "" }]);
  equal(zeroMetrics.totalCapacity, 0);
  equal(JSON.parse(JSON.stringify(zeroMetrics)).totalCapacity, 0);
  const zeroDrill = buildReconciliation({ report: { calculatedMetrics: { management: zeroMetrics } }, issues: [], personMappings: [], fieldMappings: {} });
  equal(zeroDrill.drillDown.capacityUtilization.denominator, 0);
});

test("Non-finite capacity is not stored as zero", () => {
  const people = [{ id: "a", capacityName: "A", availableCapacity: Infinity, plannedCapacity: Infinity, unplannedCapacity: Infinity }];
  const personMappings = [{ enabled: true, jiraName: "A", capacityName: "A", role: "developer", workLogColumn: "" }];
  const metrics = calculateManagementMetrics([], people, personMappings);
  equal(metrics.totalPlannedCapacity.value, null);
  equal(metrics.totalPlannedCapacity.displayValue, "N/A");
  ok(metrics.totalPlannedCapacity.reason.includes("finite"));
  equal(JSON.stringify(metrics.totalPlannedCapacity).includes("Infinity"), false);
});

test("Time variance is null only when both sides are entirely missing", () => {
  equal(timeVariance([{ workLogged: null, devEstimate: null, testEstimate: null }]), null);
  equal(timeVariance([{ workLogged: 0, devEstimate: 0, testEstimate: 0 }]), 0);
  equal(timeVariance([{ workLogged: 0, devEstimate: null, testEstimate: null }]), 0);
  equal(timeVariance([{ workLogged: null, devEstimate: 3, testEstimate: null }]), -3);
  equal(timeVariance([
    { workLogged: 8, devEstimate: 3, testEstimate: 1 },
    { workLogged: null, devEstimate: null, testEstimate: null }
  ]), 4);
  equal(timeVariance([
    { workLogged: 5, devEstimate: null, testEstimate: null },
    { workLogged: null, devEstimate: 2, testEstimate: null }
  ]), 3);
  equal(timeVariance([{ workLogged: 4, devEstimate: 1, testEstimate: null }]), 3);
  equal(Number.isNaN(timeVariance([{ workLogged: Infinity, devEstimate: 1, testEstimate: 0 }])), true);
});

test("Time variance card and export agree for missing and partial inputs", () => {
  const missing = calculateManagementMetrics([
    { issueKey: "M-1", issueKeyComparable: "m-1", planType: "planned", statusCanonical: "done", workLogged: null, devEstimate: null, testEstimate: null, labels: [], raw: {} }
  ], [], []);
  equal(missing.timeVariance.value, null);
  equal(missing.timeVariance.displayValue, "N/A");
  const missingRow = workbookRow(missing, "timeVariance");
  equal(missingRow[2], "N/A");
  equal(missingRow[3], "");

  const partial = calculateManagementMetrics([
    { issueKey: "P-1", issueKeyComparable: "p-1", planType: "planned", statusCanonical: "done", workLogged: 8, devEstimate: 3, testEstimate: 1, labels: [], raw: { "Σ Time Spent": 8 } },
    { issueKey: "P-2", issueKeyComparable: "p-2", planType: "planned", statusCanonical: "done", workLogged: null, devEstimate: null, testEstimate: null, labels: [], raw: {} }
  ], [], []);
  equal(partial.timeVariance.value, 4);
  equal(partial.timeVariance.displayValue, formatNumber(4, "h"));
  const partialRow = workbookRow(partial, "timeVariance");
  equal(partialRow[2], partial.timeVariance.displayValue);
  equal(partialRow[3], 4);
});

test("Non-finite KPI numbers are unavailable rather than displayed", () => {
  equal(formatNumber(Infinity), "N/A");
  equal(formatNumber(-Infinity), "N/A");
  equal(formatNumber(NaN), "N/A");
  equal(formatNumber("Infinity"), "N/A");
  equal(formatNumber(0), "۰");
  equal(metric(0, "h").value, 0);
  equal(metric(0, "h").status, "ok");
  const invalid = metric(Infinity, "%");
  equal(invalid.value, null);
  equal(invalid.displayValue, "N/A");
  equal(Number.isFinite(invalid.value), false);
  ok(invalid.reason.includes("finite"));
  equal(JSON.stringify(invalid).includes("Infinity"), false);
});

test("Planning drill keeps an explicit work-log zero and leaves a missing row empty", () => {
  const zero = calculateManagementMetrics([trackedIssue({ issueKey: "Z-1", workLogged: 0, devEstimate: 0, testEstimate: 0, raw: { "Σ Time Spent": 0 } })], [], []);
  equal(zero.planningDrillDown.plannedIssueKeys[0].productiveWorkLogged, 0);
  equal(zero.planningDrillDown.plannedIssueKeys[0].devEstimate, 0);
  const blank = calculateManagementMetrics([trackedIssue({ raw: { "Σ Time Spent": "" } })], [], []);
  equal(blank.planningDrillDown.plannedIssueKeys[0].productiveWorkLogged, null);
  equal(blank.planningDrillDown.plannedIssueKeys[0].nonProductiveWorkLogged, null);
  const person = calculatePersonDashboards(
    [trackedIssue({ assignee: "Ali", raw: { AliLog: "" } })],
    [],
    [{ jiraName: "Ali", role: "developer", workLogColumn: "AliLog", enabled: true }]
  )[0];
  equal(person.planningDrillDown.plannedIssueKeys[0].productiveWorkLogged, null);
  const recordedZero = calculatePersonDashboards(
    [trackedIssue({ assignee: "Ali", raw: { AliLog: 0 } })],
    [],
    [{ jiraName: "Ali", role: "developer", workLogColumn: "AliLog", enabled: true }]
  )[0];
  equal(recordedZero.planningDrillDown.plannedIssueKeys[0].productiveWorkLogged, 0);
});

test("Blocked-time distribution keeps an explicit zero apart from missing data", () => {
  const missing = blockedDistribution([trackedIssue({})]);
  equal(missing.distribution.total, null);
  equal(missing.distribution.minimum, null);
  equal(missing.distribution.maximum, null);
  equal(missing.distribution.count, 0);
  equal(missing.top20.length, 0);
  const zero = blockedDistribution([trackedIssue({ blockedHours: 0 })]);
  equal(zero.distribution.total, 0);
  equal(zero.distribution.minimum, 0);
  equal(zero.distribution.maximum, 0);
  equal(zero.distribution.average, 0);
  equal(zero.distribution.count, 0);
  const mixed = blockedDistribution([
    trackedIssue({ blockedHours: 0 }),
    trackedIssue({ issueKey: "P-9", blockedHours: 4 })
  ]);
  equal(mixed.distribution.count, 1);
  equal(mixed.distribution.total, 4);
  equal(mixed.top20[0].normalizedHours, 4);
  equal(mixed.top20[0].normalizedHours === 0, false);
});

function trackedIssue(overrides = {}) {
  return {
    issueKey: "B-1",
    summary: "Sample",
    planType: "planned",
    status: "Done",
    statusCanonical: "done",
    assignee: "Dev A",
    qaOwner: "",
    labels: [],
    devEstimate: null,
    testEstimate: null,
    workLogged: null,
    leadTimeHours: null,
    cycleTimeHours: null,
    blockedHours: null,
    raw: {},
    ...overrides
  };
}

function blockedDistribution(issues) {
  return buildReconciliation({
    report: { teamName: "تیم", sprintName: "نمونه", calculatedMetrics: { management: calculateManagementMetrics(issues, [], []), people: [] } },
    issues,
    personMappings: [],
    fieldMappings: {}
  }).blockedTimeDistribution;
}

function workbookRow(management, key) {
  const sheets = buildReportWorkbookSheets({ calculatedMetrics: { management, people: [] }, normalizedData: { issues: [] }, dataQuality: [], reconciliation: {} });
  return sheets.find((sheet) => sheet.name === "Management KPI").rows.find((row) => row[1] === key);
}
