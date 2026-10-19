import { test, equal, close, ok } from "./test-helpers.js";
import { calculateManagementMetrics } from "../assets/js/services/calculations/report-calculator.js";
import { recalculateReportCopy } from "../assets/js/controllers/dashboard-controller.js";
import { capacityPeriodFromRows, isLegacyPublicationSnapshot, LEGACY_PUBLICATION_STATUS } from "../assets/js/services/kpi-publication.js";
import { renderKpiCards } from "../assets/js/views/management-view.js";
import { buildReportWorkbookSheets } from "../assets/js/services/export-service.js";

const issues = [
  { issueKey: "P-1", issueKeyComparable: "p-1", planType: "planned", status: "Done", statusCanonical: "done", devEstimate: 4, testEstimate: 10, workLogged: 8, assignee: "Dev A", qaOwner: "", labels: [], firstInProgress: "2026-01-26T00:00:00.000Z", raw: { "Total Work": 8 } },
  { issueKey: "U-1", issueKeyComparable: "u-1", planType: "unplanned", status: "Closed", statusCanonical: "done", devEstimate: 2, testEstimate: 4, workLogged: 6, assignee: "Dev A", qaOwner: "QA A", labels: ["meeting"], firstInProgress: "2026-10-07T00:00:00.000Z", raw: { "Total Work": 6 } },
  { issueKey: "C-1", issueKeyComparable: "c-1", planType: "carry_over", status: "Ready", statusCanonical: "ready", devEstimate: 8, testEstimate: 20, workLogged: 3, assignee: "Dev A", qaOwner: "", labels: [], raw: { "Total Work": 3 } }
];
const capacity = [
  { id: "d", capacityName: "Dev", availableCapacity: 20, capacityPeriod: { from: "1405/06/17", to: "1405/07/13", dayCount: 20, source: "ردیف‌های روزانه فایل ظرفیت" } },
  { id: "q", capacityName: "QA", availableCapacity: 10, capacityPeriod: { from: "1405/06/17", to: "1405/07/13", dayCount: 20, source: "ردیف‌های روزانه فایل ظرفیت" } }
];
const mappings = [
  { capacityId: "d", capacityName: "Dev", jiraName: "Dev A", role: "developer", workLogColumn: "Total Work", enabled: true },
  { capacityId: "q", capacityName: "QA", jiraName: "QA A", role: "qa", workLogColumn: "Total Work", enabled: true }
];

function metrics() {
  return calculateManagementMetrics(issues, capacity, mappings);
}

test("KPI publication keeps the calculated QA utilization and withholds official approval", () => {
  const qa = metrics().capacityUtilizationQa;
  close(qa.value, 340);
  equal(qa.publication.definitionStatus, "requires_decision");
  equal(qa.publication.officialValue, null);
  equal(qa.publication.calculatedValue, qa.value);
  equal(qa.publication.evidence || qa.publication.alternatives.find((item) => item.id === "blankContactTestHours").value, 30);
  ok(qa.publication.assumption.includes("Contact point"));
  equal(qa.publication.capacityPeriod.from, "1405/06/17");
  equal(qa.publication.calculationPeriod.from, "2026-01-26");
});

test("Estimation accuracy keeps the productive result and records the literal document alternative", () => {
  const accuracy = metrics().estimationAccuracy;
  equal(accuracy.publication.definitionStatus, "requires_decision");
  equal(accuracy.publication.officialValue, null);
  equal(accuracy.publication.calculatedValue, accuracy.value);
  ok(accuracy.publication.assumption.includes("productive"));
  ok(Number.isFinite(accuracy.publication.alternatives.find((item) => item.id === "literalDocument").value));
  ok(accuracy.publication.alternatives.find((item) => item.id === "literalDocument").value !== accuracy.value);
});

test("Planned and unplanned shares record the without-carry-over alternative", () => {
  const result = metrics();
  equal(result.plannedWork.publication.definitionStatus, "requires_decision");
  equal(result.unplannedWork.publication.definitionStatus, "requires_decision");
  equal(result.plannedWork.publication.officialValue, null);
  close(result.plannedWork.publication.alternatives[0].value, 70);
  close(result.unplannedWork.publication.alternatives[0].value, 30);
  ok(result.plannedWork.publication.assumption.includes("carry-over"));
});

test("Delivery rate keeps Closed inside the calculated value and records Done-only", () => {
  const delivery = metrics().deliveryRate;
  equal(delivery.value, 100);
  equal(delivery.publication.definitionStatus, "requires_decision");
  equal(delivery.publication.officialValue, null);
  equal(delivery.publication.alternatives.find((item) => item.id === "doneOnly").value, 50);
  ok(delivery.publication.assumption.includes("Closed"));
});

test("Unavailable metrics stay N/A and are not marked as calculated zeroes", () => {
  const blocked = metrics().blockedTime;
  equal(blocked.value, null);
  equal(blocked.displayValue, "N/A");
  equal(blocked.publication.definitionStatus, "unavailable");
  equal(blocked.publication.officialValue, null);
  equal(blocked.publication.calculatedValue, null);
});

test("A confirmed KPI can carry an official value equal to its calculated value", () => {
  const delivery = metrics().deliveryRateDevelop;
  equal(delivery.publication.definitionStatus, "confirmed");
  equal(delivery.publication.officialValue, delivery.value);
});

test("Capacity period reads the dated daily rows and ignores summary labels", () => {
  const period = capacityPeriodFromRows([
    ["1405/07/13", 3],
    ["1405/06/17", 7],
    ["کل ظرفیت", 10]
  ]);
  equal(period.from, "1405/06/17");
  equal(period.to, "1405/07/13");
  equal(period.dayCount, 2);
});

test("Dashboard cards keep the calculated value and show definition approval in the help area", () => {
  const host = document.createElement("div");
  host.innerHTML = `<p id="kpiPublicationNote"></p><div id="managementCards"></div>`;
  document.body.append(host);
  try {
    renderKpiCards(metrics());
    const card = [...document.querySelectorAll(".kpi-card")].find((item) => item.textContent.includes("بهره‌برداری ظرفیت QA"));
    ok(card.querySelector(".kpi-value").textContent !== "N/A");
    ok(card.querySelector(".kpi-value").textContent !== "۰");
    ok(card.textContent.includes("نیازمند تأیید تعریف"));
    ok(card.querySelector("details").textContent.includes("Contact point"));
    ok(card.querySelector("details").textContent.includes("h"));
    const blocked = [...document.querySelectorAll(".kpi-card")].find((item) => item.querySelector("h3")?.textContent === "زمان بلاک");
    equal(blocked.querySelector(".kpi-value").textContent, "N/A");
    ok(!blocked.textContent.includes("نیازمند تأیید تعریف"));
  } finally {
    host.remove();
  }
});

test("A stored report without publication metadata is marked legacy and keeps its source fields", () => {
  const stored = {
    id: "old-report",
    teamName: "تیم قبلی",
    sprintName: "قدیم",
    files: { jira: "panel.xls" },
    normalizedData: { issues, capacityPeople: capacity },
    mappingSnapshot: { personMappings: mappings, fieldMappings: { issueKey: "Key" } },
    workCategoryMapping: {},
    dataQuality: [],
    calculatedMetrics: { management: { deliveryRate: { displayValue: "90%", value: 90, unit: "%" } }, people: [] }
  };
  equal(isLegacyPublicationSnapshot(stored), true);
  const sheets = buildReportWorkbookSheets(stored);
  ok(sheets[0].rows.flat().includes(LEGACY_PUBLICATION_STATUS));
  const delivery = sheets.find((sheet) => sheet.name === "Management KPI").rows.find((row) => row[1] === "deliveryRate");
  equal(delivery[4], "");
  equal(delivery[5], LEGACY_PUBLICATION_STATUS);
  const copy = recalculateReportCopy(stored);
  equal(copy.id === stored.id, false);
  equal(copy.normalizedData, stored.normalizedData);
  equal(copy.mappingSnapshot, stored.mappingSnapshot);
  equal(copy.files.jira, "panel.xls");
  equal(isLegacyPublicationSnapshot(copy), false);
  equal(stored.calculatedMetrics.management.deliveryRate.publication, undefined);
});

test("Excel export carries definition status and does not invent an official value", () => {
  const sheets = buildReportWorkbookSheets({
    calculatedMetrics: { management: metrics(), people: [] },
    normalizedData: { issues: [] },
    dataQuality: [],
    reconciliation: {}
  });
  const rows = sheets.find((sheet) => sheet.name === "Management KPI").rows;
  const qa = rows.find((row) => row[1] === "capacityUtilizationQa");
  equal(qa[5], "نیازمند تأیید تعریف");
  equal(qa[4], "");
  ok(String(qa[8]).includes("Contact point"));
  const blocked = rows.find((row) => row[1] === "blockedTime");
  equal(blocked[5], "داده منبع موجود نیست");
});
