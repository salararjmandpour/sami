import { test, equal, close } from "./test-helpers.js";
import { calculateManagementMetrics, calculatePersonDashboards } from "../assets/js/services/calculations/report-calculator.js";

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

test("Management Capacity Utilization", () => close(calculateManagementMetrics(issues, capacity, mappings).capacityUtilization.value, 46.666));
test("Delivery Rate Develop", () => equal(calculateManagementMetrics(issues, capacity, mappings).deliveryRateDevelop.value, 100));
test("Delivery Rate", () => equal(calculateManagementMetrics(issues, capacity, mappings).deliveryRate.value, 50));
test("QA Return Rate", () => equal(calculateManagementMetrics(issues, capacity, mappings).qaReturnRate.value, 50));
test("First Pass Rate", () => equal(calculateManagementMetrics(issues, capacity, mappings).firstPassRate.value, 50));
test("Hotfix Count", () => equal(calculateManagementMetrics(issues, capacity, mappings).hotfixCount.value, 1));
test("Bug Fix Count", () => equal(calculateManagementMetrics(issues, capacity, mappings).bugfixCount.value, 1));
test("Estimation Accuracy", () => close(calculateManagementMetrics(issues, capacity, mappings).estimationAccuracy.value, 112.5));
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
