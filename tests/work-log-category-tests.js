import { test, equal, close, ok } from "./test-helpers.js";
import { CALCULATION_VERSION } from "../assets/js/utils/constants.js";
import { classifyIssue, buildManagementWorkLogBreakdown, buildPersonWorkLogBreakdown, buildWorkLogQualityWarnings, resolvePersonWorkLogColumn, workLogBreakdownForExport } from "../assets/js/services/work-log-category-service.js";
import { calculateManagementMetrics, calculatePersonDashboards } from "../assets/js/services/calculations/report-calculator.js";
import { createReport } from "../assets/js/models/report-model.js";
import { getIssueCsvRows } from "../assets/js/views/table-view.js";
const mapping = {
  block: { labels: ["block", "بلاک"], titlePatterns: ["block", "بلاک"] },
  meeting: { labels: ["meeting", "جلسه"], titlePatterns: ["meeting", "جلسه"] },
  technical: { labels: ["technical", "تکنیکال"], titlePatterns: ["technical", "تکنیکال"] },
  version: { labels: ["version"], titlePatterns: ["version", "release", "نسخه"] }
};

function issue(overrides = {}) {
  return {
    issueKey: overrides.issueKey || "T-1",
    summary: overrides.summary || "Build feature",
    labels: overrides.labels || [],
    raw: { "Σ Time Spent": overrides.raw ?? 10, AliLog: overrides.ali ?? 0, SaraLog: overrides.sara ?? 0, "Fix Version/s": overrides.fixVersion || "" },
    workLogged: overrides.raw ?? 10,
    blockedHours: overrides.blockedHours ?? 999,
    devEstimate: overrides.devEstimate ?? 8,
    testEstimate: overrides.testEstimate ?? 2,
    assignee: overrides.assignee || "Ali",
    qaOwner: overrides.qaOwner || "Sara",
    statusCanonical: overrides.statusCanonical || "done",
    status: overrides.status || "Done",
    planType: overrides.planType || "planned"
  };
}

function personLogIssue(overrides = {}) {
  const hours = overrides.hours ?? 0;
  const teamHours = overrides.teamHours ?? 40;
  return {
    ...issue(overrides),
    workLogged: teamHours,
    raw: {
      "Σ Time Spent": teamHours,
      "Work Logged Ali": hours,
      "Fix Version/s": ""
    }
  };
}

test("Work category: normal issue is productive", () => {
  equal(classifyIssue(issue(), mapping).category, "productive");
});

test("Work category: Block label classifies as block", () => {
  equal(classifyIssue(issue({ labels: ["block"] }), mapping).category, "block");
});

test("Work category: Block title classifies as block", () => {
  equal(classifyIssue(issue({ summary: "Blocked dependency" }), mapping).category, "block");
});

test("Work category: Meeting label classifies as meeting", () => {
  equal(classifyIssue(issue({ labels: ["meeting"] }), mapping).category, "meeting");
});

test("Work category: Meeting title classifies as meeting", () => {
  equal(classifyIssue(issue({ summary: "جلسه تیم" }), mapping).category, "meeting");
});

test("Work category: Technical label classifies as technical", () => {
  equal(classifyIssue(issue({ labels: ["technical"] }), mapping).category, "technical");
});

test("Work category: Version title classifies as version", () => {
  equal(classifyIssue(issue({ summary: "release version update" }), mapping).category, "version");
});

test("Work category: Fix Version alone does not classify as version", () => {
  equal(classifyIssue(issue({ fixVersion: "1.2.3" }), mapping).category, "productive");
});

test("Work category: classification is case-insensitive", () => {
  equal(classifyIssue(issue({ labels: ["BLOCK"] }), mapping).category, "block");
});

test("Work category: Persian and Arabic normalization works", () => {
  equal(classifyIssue(issue({ summary: "جلسه با ي عربی" }), mapping).category, "meeting");
});

test("Work category: multiple matches follow priority", () => {
  equal(classifyIssue(issue({ labels: ["meeting", "block"] }), mapping).category, "block");
});

test("Work category: multiple matches create warning", () => {
  const breakdown = buildManagementWorkLogBreakdown([issue({ labels: ["meeting", "block"] })], [], {}, mapping);
  ok(buildWorkLogQualityWarnings(breakdown).some((warning) => warning.code === "Multiple Work Categories Matched"));
});

test("Work logs: raw reconciliation succeeds", () => {
  const breakdown = buildManagementWorkLogBreakdown([issue({ raw: 8 }), issue({ raw: 2, labels: ["meeting"] })], [], {}, mapping);
  close(breakdown.totals.reconciliationDifference, 0);
});

test("Work logs: block time is subtracted from productive work logged", () => {
  const b = buildManagementWorkLogBreakdown([issue({ raw: 4, labels: ["block"] })], [], {}, mapping);
  close(b.totals.productiveWorkLoggedHours, 0);
  close(b.totals.blockWorkLoggedHours, 4);
});

test("Work logs: meeting time is subtracted from productive work logged", () => {
  const b = buildManagementWorkLogBreakdown([issue({ raw: 4, labels: ["meeting"] })], [], {}, mapping);
  close(b.totals.productiveWorkLoggedHours, 0);
  close(b.totals.meetingWorkLoggedHours, 4);
});

test("Work logs: technical time is subtracted from productive work logged", () => {
  const b = buildManagementWorkLogBreakdown([issue({ raw: 4, labels: ["technical"] })], [], {}, mapping);
  close(b.totals.technicalWorkLoggedHours, 4);
});

test("Work logs: version time is subtracted from productive work logged", () => {
  const b = buildManagementWorkLogBreakdown([issue({ raw: 4, summary: "version release" })], [], {}, mapping);
  close(b.totals.versionWorkLoggedHours, 4);
});

test("Work logs: Technical + Version equals Technical plus Version", () => {
  const b = buildManagementWorkLogBreakdown([issue({ raw: 4, labels: ["technical"] }), issue({ raw: 3, summary: "version release" })], [], {}, mapping);
  close(b.totals.technicalVersionWorkLoggedHours, 7);
});

test("Work logs: Technical + Version is not double-counted in reconciliation", () => {
  const b = buildManagementWorkLogBreakdown([issue({ raw: 4, labels: ["technical"] }), issue({ raw: 3, summary: "version release" })], [], {}, mapping);
  close(b.totals.reconciliationDifference, 0);
});

test("Work logs: Time in block does not affect Block Work Logged", () => {
  const b = buildManagementWorkLogBreakdown([issue({ raw: 10, blockedHours: 999 })], [], {}, mapping);
  close(b.totals.blockWorkLoggedHours, 0);
  close(b.totals.productiveWorkLoggedHours, 10);
});

test("Work logs: management uses selected total Work Log source", () => {
  const b = buildManagementWorkLogBreakdown([issue({ raw: 9, ali: 2 })], [{ jiraName: "Ali", workLogColumn: "AliLog", enabled: true }], {}, mapping);
  close(b.totals.rawWorkLoggedHours, 9);
});

test("Work logs: individual categorization uses mapped person column", () => {
  const b = buildPersonWorkLogBreakdown([issue({ raw: 9, ali: 2, labels: ["meeting"] })], { jiraName: "Ali", workLogColumn: "AliLog", enabled: true }, mapping);
  close(b.totals.rawWorkLoggedHours, 2);
  close(b.totals.meetingWorkLoggedHours, 2);
});

test("Work logs: a missing personal column does not become zero planned work", () => {
  const person = calculatePersonDashboards(
    [issue({ issueKey: "A-1", raw: 9, assignee: "Ahad", planType: "planned" })],
    [{ id: "c1", capacityName: "احد", availableCapacity: 100, plannedCapacity: 80, unplannedCapacity: 20 }],
    [{ jiraName: "Ahad", capacityName: "احد", capacityId: "c1", role: "developer", workLogColumn: "", enabled: true }],
    mapping
  )[0];
  equal(person.metrics.rawWorkLogged.value, null);
  equal(person.metrics.plannedProductiveWork.value, null);
  equal(person.metrics.plannedProductiveWork.status, "unavailable");
  equal(person.metrics.unplannedProductiveWork.value, null);
  equal(person.metrics.plannedCapacityUtilization.value, null);
  equal(person.metrics.unplannedCapacityUtilization.value, null);
  equal(person.metrics.plannedIssueCount.value, 1);
  equal(person.metrics.totalCapacity.value, 100);
});

test("Work logs: comparable column names still resolve to recorded hours", () => {
  const rows = [personLogIssue({ issueKey: "C-1", hours: 6, assignee: "Ali Reza", planType: "planned" })];
  equal(resolvePersonWorkLogColumn(rows, { jiraName: "Ali Reza", workLogColumn: "work logged ali" }), "Work Logged Ali");
  const person = calculatePersonDashboards(
    rows,
    [{ id: "c1", capacityName: "Ali", availableCapacity: 40, plannedCapacity: 32, unplannedCapacity: 8 }],
    [{ jiraName: "Ali Reza", capacityName: "Ali", capacityId: "c1", role: "developer", workLogColumn: "work logged ali", enabled: true }],
    mapping
  )[0];
  equal(person.metrics.rawWorkLogged.value, 6);
  equal(person.metrics.plannedProductiveWork.value, 6);
  equal(person.metrics.plannedCapacityUtilization.value, 18.75);
  equal(person.metrics.productiveWorkLogged.displayValue === "N/A", false);
});

test("Work logs: empty mapping auto-detects a personal column and does not use team total", () => {
  const rows = [personLogIssue({ issueKey: "D-1", hours: 7, teamHours: 40, assignee: "Ali Reza", planType: "planned" })];
  equal(resolvePersonWorkLogColumn(rows, { jiraName: "Ali Reza", workLogColumn: "" }), "Work Logged Ali");
  const person = calculatePersonDashboards(
    rows,
    [{ id: "c1", capacityName: "Ali", availableCapacity: 40, plannedCapacity: 32, unplannedCapacity: 8 }],
    [{ jiraName: "Ali Reza", capacityName: "Ali", capacityId: "c1", role: "developer", workLogColumn: "", enabled: true }],
    mapping
  )[0];
  equal(person.workLogBreakdown.sourceMissing, undefined);
  equal(person.metrics.rawWorkLogged.value, 7);
  equal(person.metrics.rawWorkLogged.value === 40, false);
  equal(person.metrics.plannedProductiveWork.value, 7);
  equal(person.metrics.productiveWorkLogged.value, 7);
  equal(person.metrics.nonProductiveWorkLogged.value, 0);
});

test("Work logs: hyphenated personal headers resolve and team totals stay unused", () => {
  const rows = [{
    issueKey: "H-1",
    issueKeyComparable: "h-1",
    summary: "Feature",
    labels: [],
    assignee: "Moslem Seydmohamadi",
    qaOwner: "",
    planType: "planned",
    statusCanonical: "done",
    status: "Done",
    firstInProgress: "2026-01-26T00:00:00.000Z",
    raw: { "Σ Time Spent": 99, "Work-Logged Moslem": 7 }
  }, {
    issueKey: "H-2",
    issueKeyComparable: "h-2",
    summary: "Follow-up",
    labels: [],
    assignee: "Moslem Seydmohamadi",
    qaOwner: "",
    planType: "unplanned",
    statusCanonical: "done",
    status: "Done",
    firstInProgress: "2026-10-07T00:00:00.000Z",
    raw: { "Σ Time Spent": 99, "Work-Logged Moslem": 3 }
  }];
  const mappingRow = { jiraName: "Moslem Seydmohamadi", capacityName: "مسلم", role: "developer", workLogColumn: "", enabled: true };
  equal(resolvePersonWorkLogColumn(rows, mappingRow), "Work-Logged Moslem");
  equal(resolvePersonWorkLogColumn([{ raw: { "Σ Time Spent": 99, "Time Spent": 40 } }], mappingRow), "");
  const person = calculatePersonDashboards(rows, [], [mappingRow], mapping)[0];
  equal(person.metrics.productiveWorkLogged.value, 10);
  equal(person.metrics.productiveWorkLogged.displayValue === "N/A", false);
  equal(person.metrics.productiveWorkLogged.publication.calculationPeriod.from, "2026-01-26");
  equal(person.metrics.productiveWorkLogged.publication.calculationPeriod.to, "2026-10-07");
  equal(person.workLogBreakdown.sourceColumn, "Work-Logged Moslem");
  equal(person.metrics.rawWorkLogged.value === 99, false);
});

test("Work logs: Logged/Today personal headers from alternate Jira export schema resolve", () => {
  const rows = [{
    issueKey: "L-1",
    issueKeyComparable: "l-1",
    summary: "Build",
    labels: [],
    assignee: "Moslem Seydmohamadi",
    qaOwner: "Ali Bahrampour",
    planType: "planned",
    statusCanonical: "done",
    status: "Done",
    firstInProgress: "2026-01-26T00:00:00.000Z",
    raw: {
      "Σ Time Spent": 40,
      "Logged moslem": 5,
      "Logged ahad": 0,
      "logged ava": 0,
      "Logged Elham": 0,
      "Logged edrise": 0,
      "Logged kianoush": 0,
      "Today Ali": 2
    }
  }, {
    issueKey: "L-2",
    issueKeyComparable: "l-2",
    summary: "QA review",
    labels: [],
    assignee: "Edris Poursadeghi",
    qaOwner: "Ali Bahrampour",
    planType: "unplanned",
    statusCanonical: "done",
    status: "Done",
    firstInProgress: "2026-10-07T00:00:00.000Z",
    raw: {
      "Σ Time Spent": 40,
      "Logged moslem": 0,
      "Logged edrise": 3,
      "Today Ali": 1
    }
  }];
  equal(resolvePersonWorkLogColumn(rows, { jiraName: "Moslem Seydmohamadi", capacityName: "مسلم", workLogColumn: "" }), "Logged moslem");
  equal(resolvePersonWorkLogColumn(rows, { jiraName: "Edris Poursadeghi", capacityName: "ادریس", workLogColumn: "" }), "Logged edrise");
  equal(resolvePersonWorkLogColumn(rows, { jiraName: "Ali Bahrampour", capacityName: "علی", role: "qa", workLogColumn: "Work Today Ali" }), "Today Ali");
  equal(resolvePersonWorkLogColumn(rows, { jiraName: "Hadi Abedi", workLogColumn: "" }), "");

  const moslem = calculatePersonDashboards(rows, [], [{ jiraName: "Moslem Seydmohamadi", capacityName: "مسلم", role: "developer", workLogColumn: "", enabled: true }], mapping)[0];
  equal(moslem.workLogBreakdown.sourceMissing, undefined);
  equal(moslem.workLogBreakdown.sourceColumn, "Logged moslem");
  equal(moslem.metrics.productiveWorkLogged.value, 5);
  equal(moslem.metrics.rawWorkLogged.value === 40, false);

  const ali = calculatePersonDashboards(rows, [], [{ jiraName: "Ali Bahrampour", capacityName: "علی", role: "qa", workLogColumn: "Work Today Ali", enabled: true }], mapping)[0];
  equal(ali.workLogBreakdown.sourceColumn, "Today Ali");
  equal(ali.metrics.productiveWorkLogged.value, 3);
  equal(ali.metrics.productiveWorkLogged.displayValue === "N/A", false);
});

test("Screenshot regression: capacity and counts stay available when personal work logs are missing", () => {
  const planned = Array.from({ length: 12 }, (_, index) => issue({
    issueKey: `P-${index + 1}`,
    raw: 5,
    ali: "",
    assignee: "Ghost Dev",
    planType: "planned",
    status: "In Progress",
    statusCanonical: "in_progress",
    firstInProgress: "2026-01-01"
  }));
  const unplanned = Array.from({ length: 13 }, (_, index) => issue({
    issueKey: `U-${index + 1}`,
    raw: 5,
    ali: "",
    assignee: "Ghost Dev",
    planType: "unplanned",
    status: "In Progress",
    statusCanonical: "in_progress",
    firstInProgress: "2026-01-01"
  }));
  const person = calculatePersonDashboards(
    [...planned, ...unplanned],
    [{ id: "g1", capacityName: "Ghost", availableCapacity: 110.8, plannedCapacity: 80.64, unplannedCapacity: 20.16 }],
    [{ jiraName: "Ghost Dev", capacityName: "Ghost", capacityId: "g1", role: "developer", workLogColumn: "", enabled: true }],
    mapping
  )[0];
  equal(person.metrics.totalCapacity.value, 110.8);
  equal(person.metrics.plannedCapacity.value, 80.64);
  equal(person.metrics.unplannedCapacity.value, 20.16);
  equal(person.metrics.availableCapacity.value, 110.8);
  equal(person.metrics.plannedIssueCount.value, 12);
  equal(person.metrics.startedPlannedIssueCount.value, 12);
  equal(person.metrics.unplannedIssueCount.value, 13);
  equal(person.metrics.startedUnplannedIssueCount.value, 13);
  equal(person.metrics.plannedProductiveWork.displayValue, "N/A");
  equal(person.metrics.unplannedProductiveWork.displayValue, "N/A");
  equal(person.metrics.plannedCapacityUtilization.displayValue, "N/A");
  equal(person.metrics.unplannedCapacityUtilization.displayValue, "N/A");
  equal(person.metrics.productiveWorkLogged.displayValue, "N/A");
  equal(person.metrics.nonProductiveWorkLogged.displayValue, "N/A");
  equal(person.metrics.carryOverWorkLogged.displayValue, "N/A");
  ok(person.metrics.productiveWorkLogged.reason.includes("Work Log"));
});

test("Work logs: a genuine zero in a mapped column stays zero", () => {
  const person = calculatePersonDashboards(
    [issue({ issueKey: "Z-1", raw: 40, ali: 0, assignee: "Ali", planType: "planned", devEstimate: 4 })],
    [{ id: "c1", capacityName: "Ali", availableCapacity: 10, plannedCapacity: 10, unplannedCapacity: 0 }],
    [{ jiraName: "Ali", capacityName: "Ali", capacityId: "c1", role: "developer", workLogColumn: "AliLog", enabled: true }],
    mapping
  )[0];
  equal(person.metrics.rawWorkLogged.value, 0);
  equal(person.metrics.plannedProductiveWork.value, 0);
  equal(person.metrics.plannedCapacityUtilization.value, 0);
  equal(person.metrics.capacityUtilization.value, 40);
});

test("Work logs: a person without a work-log column does not receive the team total", () => {
  const breakdown = buildPersonWorkLogBreakdown([issue({ raw: 9 })], { jiraName: "Ahad", workLogColumn: "", enabled: true }, mapping);
  equal(breakdown.totals.rawWorkLoggedHours, 0);
  equal(breakdown.sourceMissing, true);
  equal(workLogBreakdownForExport(breakdown).rawHours, null);
  const person = calculatePersonDashboards([issue({ issueKey: "A-1", raw: 9, assignee: "Ahad" })], [], [{ jiraName: "Ahad", role: "developer", workLogColumn: "", enabled: true }], mapping)[0];
  equal(person.metrics.rawWorkLogged.value, null);
  equal(person.metrics.rawWorkLogged.displayValue, "N/A");
  ok(person.metrics.rawWorkLogged.reason.includes("Work Log"));
});

test("Work logs: another person's log is not assigned to current person", () => {
  const b = buildPersonWorkLogBreakdown([issue({ ali: 2, sara: 5 })], { jiraName: "Ali", workLogColumn: "AliLog", enabled: true }, mapping);
  close(b.totals.rawWorkLoggedHours, 2);
});

test("Accuracy: Productive Estimation Accuracy uses productive estimate and productive Work Logged", () => {
  const issues = [issue({ issueKey: "P-1", raw: 10, devEstimate: 20, testEstimate: 0 }), issue({ issueKey: "M-1", labels: ["meeting"], raw: 5, devEstimate: 100, testEstimate: 0 })];
  const m = calculateManagementMetrics(issues, [], [], mapping);
  close(m.estimationAccuracy.value, 200);
});

test("Accuracy: raw Estimation Accuracy remains available", () => {
  const m = calculateManagementMetrics([issue({ raw: 10, devEstimate: 20, testEstimate: 0 })], [], [], mapping);
  close(m.estimationAccuracy.rawEstimationAccuracy, 200);
});

test("Capacity Utilization remains unchanged", () => {
  const issues = [issue({ raw: 10, labels: ["meeting"], devEstimate: 20, testEstimate: 0 })];
  const before = calculateManagementMetrics(issues, [{ id: "1", availableCapacity: 40 }], [{ capacityId: "1", jiraName: "Ali", enabled: true }], mapping).capacityUtilization.value;
  close(before, 50);
});

test("Delivery Rate remains unchanged", () => {
  const issues = [issue({ labels: ["meeting"], statusCanonical: "done" })];
  close(calculateManagementMetrics(issues, [], [], mapping).deliveryRate.value, 100);
});

test("Versioning: old saved reports preserve calculation version", () => {
  const oldReport = { calculationVersion: "1.0.0", calculatedMetrics: {} };
  equal(oldReport.calculationVersion, "1.0.0");
});

test("Versioning: new report stores updated calculation version", () => {
  const report = createReport({ metadata: {}, files: { jira: {}, capacity: {}, kpi: {} }, normalizedData: {}, calculatedMetrics: { management: {}, people: [] }, mappingSnapshot: {}, dataQuality: [], kpiConfig: [] });
  equal(report.calculationVersion, CALCULATION_VERSION);
});

test("Exports: JSON export object contains new fields", () => {
  const b = buildManagementWorkLogBreakdown([issue({ raw: 4, labels: ["block"] })], [], {}, mapping);
  equal(Object.hasOwn(workLogBreakdownForExport(b), "productiveHours"), true);
});

test("Exports: CSV issue rows contain new work-log fields", () => {
  const b = buildManagementWorkLogBreakdown([issue({ raw: 4, labels: ["block"] })], [], {}, mapping);
  const row = issue({ raw: 4, labels: ["block"] });
  row.workLogCategoryBreakdown = b.rows[0];
  const [header, exported] = getIssueCsvRows([row]);
  ok(header.includes("Work Category"));
  ok(header.includes("Technical + Version Work Logged"));
  equal(exported[0], "T-1");
  equal(exported[1], "Build feature");
  equal(exported[6], "block");
  equal(exported[10], "۴");
});
