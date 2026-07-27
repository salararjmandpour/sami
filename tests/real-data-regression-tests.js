import { test, equal, ok } from "./test-helpers.js";
import { runRealDataValidation } from "./real-data-validation-core.js";

let resultPromise;
function realData() {
  resultPromise ||= runRealDataValidation(window.__realDataLoader);
  return resultPromise;
}

test("Real data Jira sheet names", async () => {
  const result = await realData();
  equal(result.jira.suggestedMainSheet, "sprint 26.1");
  equal(result.jira.suggestedQaSheet, "QA Return ");
});

test("Real data Jira headers include leading-space fields after cleaning", async () => {
  const result = await realData();
  equal(result.jira.fieldMap.firstInProgress, "FirstInProgress");
  equal(result.jira.fieldMap.doneDate, "Done Date");
});

test("Real data QA Return matching", async () => {
  const result = await realData();
  equal(result.qaReturn.uniqueCount, 10);
  equal(result.qaReturn.matchedCount, 7);
  equal(result.qaReturn.unmatchedCount, 3);
});

test("Real data capacity binary format", async () => {
  const result = await realData();
  equal(result.files.capacity.signature, "ole");
  equal(result.files.capacity.extensionMatches, false);
});

test("Real data capacity summary rows", async () => {
  const result = await realData();
  ok(result.capacity.summaryRows.total);
  ok(result.capacity.summaryRows.technical);
  ok(result.capacity.summaryRows.planned);
  ok(result.capacity.summaryRows.unplanned);
});

test("Real data merged QA capacity columns split", async () => {
  const result = await realData();
  ok(result.capacity.people.some((person) => person.capacityName === "سپیده"));
  ok(result.capacity.people.some((person) => person.capacityName === "علی"));
});

test("Real data KPI DOCX table extraction", async () => {
  const result = await realData();
  equal(result.kpi.tableCount, 2);
  equal(result.kpi.definitionCount, 18);
});

test("Real data person mappings", async () => {
  const result = await realData();
  equal(result.mappings.filter((mapping) => mapping.status === "mapped").length, 7);
});

test("Real data status values", async () => {
  const result = await realData();
  ok(result.jira.normalizedStatuses.includes("done"));
});

test("Real data label values", async () => {
  const result = await realData();
  ok(result.jira.labels.includes("hotfix"));
  ok(result.jira.labels.includes("bugfix"));
});

test("Real data Work Log unit formats", async () => {
  const result = await realData();
  ok(result.metricDetails.management.find((metric) => metric.kpiName === "Estimation Accuracy").denominator > 1000);
});

test("Real data date formats", async () => {
  const result = await realData();
  ok(result.metricDetails.management.find((metric) => metric.kpiName === "Lead Time").denominator > 0);
});

test("Real data Story Point availability", async () => {
  const result = await realData();
  equal(result.management.averageStorySize.value, null);
});
