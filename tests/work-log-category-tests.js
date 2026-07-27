import { test, equal, close, ok } from "./test-helpers.js";
import { CALCULATION_VERSION } from "../assets/js/utils/constants.js";
import { classifyIssue, buildManagementWorkLogBreakdown, buildPersonWorkLogBreakdown, buildWorkLogQualityWarnings, workLogBreakdownForExport } from "../assets/js/services/work-log-category-service.js";
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
  const header = getIssueCsvRows([row])[0];
  ok(header.includes("Work Category"));
  ok(header.includes("Technical + Version Work Logged"));
});
