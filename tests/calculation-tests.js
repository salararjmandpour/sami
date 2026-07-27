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
test("Estimation Accuracy", () => close(calculateManagementMetrics(issues, capacity, mappings).estimationAccuracy.value, 225));
test("Division by zero", () => equal(calculateManagementMetrics([], [], []).capacityUtilization.value, null));
test("Missing Story Points", () => equal(calculateManagementMetrics(issues, capacity, mappings).averageStorySize.value, null));
test("Missing Rework Time", () => equal(calculateManagementMetrics(issues, capacity, mappings).reworkRate.value, null));
test("Developer Capacity Utilization", () => close(calculatePersonDashboards(issues, capacity, mappings)[0].metrics.capacityUtilization.value, 50));
test("QA Capacity Utilization including Carry Over", () => close(calculatePersonDashboards(issues, capacity, mappings)[1].metrics.capacityUtilization.value, 70));

