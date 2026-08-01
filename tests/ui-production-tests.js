import { test, equal, ok } from "./test-helpers.js";
import { applyIssueFilters } from "../assets/js/controllers/filter-controller.js";
import { evaluateGenerateReadiness } from "../assets/js/views/upload-view.js";
import { renderScrumDashboards } from "../assets/js/views/scrum-view.js";
import { renderHistory } from "../assets/js/views/history-view.js";
import { buildDataQualityWorkbookSheets, buildManagementWorkbookSheets, buildReportWorkbookSheets, buildScrumWorkbookSheets } from "../assets/js/services/export-service.js";
import { deleteReport, getReport, resetReportApiProbe, saveReport } from "../assets/js/services/report-storage-service.js";

const issues = [
  { issueKey: "A-1", statusCanonical: "done", planType: "planned", assignee: "Sara", qaOwner: "Ali", created: "2026-01-02" },
  { issueKey: "A-2", statusCanonical: "in_progress", planType: "unplanned", assignee: "Omid", qaOwner: "", created: "2026-01-05" },
  { issueKey: "A-3", statusCanonical: "done", planType: "carry_over", assignee: "Sara", qaOwner: "Sepideh", created: "2026-01-10" }
];

const report = {
  teamName: "Core",
  sprintName: "26.1",
  normalizedData: { issues },
  calculatedMetrics: { people: [
    { name: "Sara", role: "developer" },
    { name: "Ali", role: "qa" },
    { name: "Sepideh", role: "qa" }
  ] }
};

test("Filters: status filter updates issue set", () => {
  equal(applyIssueFilters(report, { status: "done" }).length, 2);
});

test("Filters: plan type filter updates issue set", () => {
  const filtered = applyIssueFilters(report, { planType: "unplanned" });
  equal(filtered.length, 1);
  equal(filtered[0].issueKey, "A-2");
});

test("Filters: person filter checks assignee and QA owner", () => {
  equal(applyIssueFilters(report, { person: "Ali" }).length, 1);
  equal(applyIssueFilters(report, { person: "Sara" }).length, 2);
});

test("Filters: role filter uses mapped person roles", () => {
  equal(applyIssueFilters(report, { role: "qa" }).length, 2);
  equal(applyIssueFilters(report, { role: "developer" }).length, 2);
});

test("Filters: combined status and plan filters intersect", () => {
  const filtered = applyIssueFilters(report, { status: "done", planType: "carry_over" });
  equal(filtered.length, 1);
  equal(filtered[0].issueKey, "A-3");
});

test("Filters: date range respects created date", () => {
  const filtered = applyIssueFilters(report, { dateFrom: "2026-01-04", dateTo: "2026-01-06" });
  equal(filtered.length, 1);
  equal(filtered[0].issueKey, "A-2");
});

test("Filters: team and sprint text filters can exclude a report", () => {
  equal(applyIssueFilters(report, { team: "Other" }).length, 0);
  equal(applyIssueFilters(report, { sprint: "26.1" }).length, 3);
});

test("Upload readiness: disabled until files and mappings exist", () => {
  const oldDocument = globalThis.document;
  globalThis.document = {
    querySelectorAll(selector) {
      if (selector === "[data-field-key]") return [];
      if (selector === "#personMappingTable tbody tr") return [];
      return [];
    }
  };
  try {
    const result = evaluateGenerateReadiness({ jira: {}, capacity: {}, kpi: {} });
    equal(result.ready, false);
    ok(result.reason.includes("نگاشت"));
  } finally {
    globalThis.document = oldDocument;
  }
});

test("Upload readiness: enabled when required mappings and people are valid", () => {
  const oldDocument = globalThis.document;
  globalThis.document = {
    querySelectorAll(selector) {
      if (selector === "[data-field-key]") return [
        { dataset: { required: "true" }, value: "Issue key" },
        { dataset: { required: "true" }, value: "Status" }
      ];
      if (selector === "#personMappingTable tbody tr") return [
        { querySelector: () => ({ checked: true }) }
      ];
      return [];
    }
  };
  try {
    equal(evaluateGenerateReadiness({ jira: {}, capacity: {}, kpi: {} }).ready, true);
  } finally {
    globalThis.document = oldDocument;
  }
});

test("Person dashboards expose new metric drill-down buttons", () => {
  const oldDocument = globalThis.document;
  const target = { innerHTML: "", querySelectorAll: () => [] };
  globalThis.document = {
    getElementById(id) {
      return id === "scrumDashboards" ? target : null;
    }
  };
  try {
    renderScrumDashboards([{
      name: "Dev A",
      role: "developer",
      metrics: {
        plannedIssueCount: { displayValue: "1" },
        startedPlannedIssueCount: { displayValue: "1" },
        unplannedIssueCount: { displayValue: "0" },
        startedUnplannedIssueCount: { displayValue: "0" },
        carryOverWorkLogged: { displayValue: "2h" },
        carryOver: { displayValue: "99h" }
      },
      planningDrillDown: {
        plannedIssueKeys: [{ issueKey: "A-1", planType: "Planned" }],
        startedPlannedIssueKeys: [{ issueKey: "A-1", planType: "Planned" }],
        unplannedIssueKeys: [],
        startedUnplannedIssueKeys: [],
        carryOverLoggedIssueKeys: [{ issueKey: "C-1", planType: "Carry Over" }]
      }
    }]);
    ok(target.innerHTML.includes('data-person-drill="plannedIssueCount"'));
    ok(target.innerHTML.includes('data-person-drill="carryOverWorkLogged"'));
    equal(target.innerHTML.includes(">Carry Over</h3><div class=\"kpi-value\">99h"), false);
    equal(target.innerHTML.includes("carry_over"), false);
  } finally {
    globalThis.document = oldDocument;
  }
});

test("Excel export: report workbook contains Persian summary and issue sheets", () => {
  const sheets = buildReportWorkbookSheets({
    teamName: "تیم محصول",
    sprintName: "26.1",
    createdAt: "2026-01-01T00:00:00.000Z",
    calculationVersion: "1.1.0",
    normalizedData: { issues: [{ issueKey: "A-1", summary: "جزئیات", labels: ["hotfix"], qaReturned: true }] },
    calculatedMetrics: {
      management: { deliveryRate: { displayValue: "90%", value: 90, unit: "%" } },
      people: [{ name: "سارا", role: "developer", metrics: { plannedWork: { displayValue: "4h", value: 4, unit: "h" } } }]
    },
    dataQuality: [{ severity: "warning", code: "sample", message: "نیاز به بررسی" }],
    reconciliation: { reconciliationStatus: "ok" }
  });
  equal(sheets[0].name, "Summary");
  ok(sheets[0].rows.flat().includes("تیم محصول"));
  ok(sheets.find((sheet) => sheet.name === "Issues").rows.flat().includes("جزئیات"));
});

test("Report history view exposes open and Excel export actions", () => {
  const oldDocument = globalThis.document;
  const target = { innerHTML: "" };
  globalThis.document = {
    getElementById(id) {
      return id === "historyList" ? target : null;
    }
  };
  try {
    renderHistory([{ id: "r-1", teamName: "تیم محصول", sprintName: "26.1", createdAt: "2026-01-01T00:00:00.000Z" }]);
    ok(target.innerHTML.includes("باز کردن گزارش"));
    ok(target.innerHTML.includes("خروجی Excel گزارش"));
    ok(target.innerHTML.includes('data-export-report="r-1"'));
  } finally {
    globalThis.document = oldDocument;
  }
});

test("Section Excel exports include filtered context and scoped sheets", () => {
  const filteredReport = {
    id: "r-filtered",
    teamName: "تیم محصول",
    sprintName: "26.1",
    createdAt: "2026-01-01T00:00:00.000Z",
    calculationVersion: "1.1.0",
    normalizedData: { issues: [{ issueKey: "A-1", summary: "جزئیات", labels: [], qaReturned: false }] },
    calculatedMetrics: {
      management: { deliveryRate: { displayValue: "90%", value: 90, unit: "%" } },
      people: [{ name: "سارا", role: "developer", metrics: { plannedWork: { displayValue: "4h", value: 4, unit: "h" } } }]
    },
    dataQuality: [{ severity: "warning", code: "sample", message: "نیاز به بررسی", issueKey: "A-1" }],
    reconciliation: { reconciliationStatus: "warning" }
  };
  const filters = { person: "سارا", status: "done", planType: "planned" };
  const management = buildManagementWorkbookSheets(filteredReport, filters);
  const scrum = buildScrumWorkbookSheets(filteredReport, filters);
  const quality = buildDataQualityWorkbookSheets(filteredReport, filters);
  ok(management.some((sheet) => sheet.name === "Management KPI"));
  ok(scrum.some((sheet) => sheet.name === "People KPI"));
  ok(quality.some((sheet) => sheet.name === "Data Quality"));
  ok(management[0].rows.flat().includes("سارا"));
  ok(quality.find((sheet) => sheet.name === "Data Quality").rows.flat().includes("نیاز به بررسی"));
});

test("Report storage: API availability avoids IndexedDB fallback", async () => {
  const oldFetch = globalThis.fetch;
  const oldIndexedDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET" });
    if (url === "/api/health") return jsonResponse({ ok: true, storage: "postgres" });
    if (url === "/api/reports" && options.method === "POST") return jsonResponse({ report: { id: "r-1" } });
    if (url === "/api/reports/r-1") return jsonResponse(options.method === "DELETE" ? { ok: true } : { report: { id: "r-1", teamName: "تیم" } });
    throw new Error(`unexpected fetch ${url}`);
  };
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, get: () => { throw new Error("IndexedDB fallback should not run"); } });
  resetReportApiProbe();
  try {
    await saveReport({ id: "r-1", teamName: "تیم", createdAt: "2026-01-01T00:00:00.000Z" });
    equal((await getReport("r-1")).teamName, "تیم");
    await deleteReport("r-1");
    equal(calls.filter((call) => call.url === "/api/health").length, 1);
    equal(calls.some((call) => call.url.includes("indexeddb")), false);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldIndexedDb) Object.defineProperty(globalThis, "indexedDB", oldIndexedDb);
    else delete globalThis.indexedDB;
    resetReportApiProbe();
  }
});

function jsonResponse(payload) {
  return { ok: true, status: 200, statusText: "OK", json: async () => payload };
}
