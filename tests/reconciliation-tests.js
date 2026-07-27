import { test, equal, close, ok } from "./test-helpers.js";
import { runRealDataValidation } from "./real-data-validation-core.js";
import { normalizeNumber } from "../assets/js/services/normalization/number-normalizer.js";
import { normalizePlanType } from "../assets/js/services/normalization/status-normalizer.js";

let resultPromise;
function data() {
  resultPromise ||= runRealDataValidation(window.__realDataLoader);
  return resultPromise;
}

test("Reconciliation: management estimate equals all ownership buckets", async () => {
  const r = (await data()).reconciliation.estimateReconciliation;
  close(r.management.totalEstimate, r.ownershipTotal, 0.01);
});

test("Reconciliation: planned work", async () => {
  const r = (await data()).reconciliation;
  equal(r.estimateReconciliation.management.byPlan.planned.totalEstimate, 139);
  equal(r.estimateReconciliation.rows.find((row) => row.planType === "planned" && row.ownership === "No QA Owner").testEstimate, 21);
});

test("Reconciliation: unplanned work", async () => {
  const r = (await data()).reconciliation;
  equal(r.estimateReconciliation.management.byPlan.unplanned.totalEstimate, 5);
  equal(r.estimateReconciliation.rows.find((row) => row.planType === "unplanned" && row.ownership === "No QA Owner").testEstimate, 1);
});

test("Reconciliation: carry over work", async () => {
  const r = (await data()).reconciliation;
  equal(r.estimateReconciliation.management.byPlan.carry_over.totalEstimate, 873);
  equal(r.planTypeReconciliation.rows.find((row) => row.normalizedValue === "carry_over").issueCount, 110);
});

test("Reconciliation: management work log source priority", async () => {
  const r = (await data()).reconciliation;
  equal(r.workLogReconciliation.sourceColumn, "Σ Time Spent");
});

test("Reconciliation: management work log residual calculation", async () => {
  const r = (await data()).reconciliation.workLogReconciliation.totals;
  close(r.managementWorkLogged - r.mappedIndividualWorkLogged, r.residualWorkLogged, 0.01);
});

test("Reconciliation: unallocated work log classification", async () => {
  const r = (await data()).reconciliation.workLogReconciliation.totals;
  equal(r.classification, "Unallocated / Other Users Work Logged");
});

test("Reconciliation: mapped developer totals", async () => {
  const r = (await data()).reconciliation.estimateReconciliation.ownershipTotals;
  equal(r.mappedDeveloperDevEstimate, 822);
});

test("Reconciliation: mapped QA totals", async () => {
  const r = (await data()).reconciliation.estimateReconciliation.ownershipTotals;
  equal(r.mappedQaTestEstimate, 165);
});

test("Reconciliation: test estimate without QA owner", async () => {
  const r = (await data()).reconciliation.estimateReconciliation.ownershipTotals;
  equal(r.testEstimateWithoutQaOwner, 30);
});

test("Reconciliation: blocked time raw-to-hour conversion", async () => {
  const top = (await data()).reconciliation.blockedTimeDistribution.top20[0];
  equal(top.issueKey, "PODCM-3527");
  close(top.normalizedHours, 6393.389166666668, 0.01);
});

test("Reconciliation: blocked time distribution", async () => {
  const d = (await data()).reconciliation.blockedTimeDistribution.distribution;
  equal(d.count, 12);
  close(d.total, 6702.215833333335, 0.01);
});

test("Reconciliation: blocked time greater than threshold warning", async () => {
  const warnings = (await data()).reconciliation.blockedTimeDistribution.warnings;
  ok(warnings.some((warning) => warning.code === "Blocked Time > 500 working hours" && warning.issueKey === "PODCM-3527"));
});

test("Reconciliation: cycle time not exceeding lead time for valid source dates", async () => {
  const r = (await data()).reconciliation.timeReconciliation;
  equal(r.cycleGreaterThanLead.length, 0);
});

test("Reconciliation: KPI drill-down details", async () => {
  const drill = (await data()).reconciliation.drillDown.estimationAccuracy;
  ok(drill.formula.includes("Estimated Hours"));
  ok(drill.contributingIssueCount > 0);
});

test("Reconciliation: null values not becoming zero", () => {
  equal(normalizeNumber(""), null);
});

test("Reconciliation: unknown plan type remains unknown", () => {
  equal(normalizePlanType("Surprise Plan"), "unknown");
});

test("Reconciliation: tolerance is 0.01 hours", async () => {
  const r = (await data()).reconciliation.estimateReconciliation;
  close(r.difference, 0, r.tolerance);
  equal(r.tolerance, 0.01);
});
