import { test, equal, ok } from "./test-helpers.js";
import { applyIssueFilters } from "../assets/js/controllers/filter-controller.js";
import { evaluateGenerateReadiness } from "../assets/js/views/upload-view.js";
import { renderScrumDashboards } from "../assets/js/views/scrum-view.js";
import { renderFilters } from "../assets/js/views/management-view.js";
import { renderCharts, resizeCharts } from "../assets/js/views/chart-view.js";
import { calculatePersonDashboards } from "../assets/js/services/calculations/report-calculator.js";
import { renderHistory } from "../assets/js/views/history-view.js";
import { selectionTokensFromFiles } from "../assets/js/utils/upload-selection.js";
import { buildDataQualityWorkbookSheets, buildManagementWorkbookSheets, buildReportWorkbookSheets, buildScrumWorkbookSheets } from "../assets/js/services/export-service.js";
import { deleteReport, getReport, postgresApiIsConnected, resetReportApiProbe, saveReport, storageSavedMessage } from "../assets/js/services/report-storage-service.js";

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
  const cleanup = mountFixture(fileInputs());
  try {
    const parsedSelection = assignSelectedFiles();
    const unread = evaluateGenerateReadiness({ jira: {}, capacity: {}, kpi: {}, parsedSelection: null });
    equal(unread.ready, false);
    ok(unread.reason.includes("خوانده"));
    const unmapped = evaluateGenerateReadiness({ jira: {}, capacity: {}, kpi: {}, parsedSelection });
    equal(unmapped.ready, false);
    ok(unmapped.reason.includes("نگاشت"));
  } finally {
    cleanup();
  }
});

test("Upload readiness: enabled when required mappings and people are valid", () => {
  const cleanup = mountFixture(`${fileInputs()}
    <input data-field-key="issueKey" data-required="true" value="Issue key">
    <input data-field-key="status" data-required="true" value="Status">
    <table id="personMappingTable"><tbody><tr><td><input data-person-field="enabled" type="checkbox" checked></td></tr></tbody></table>`);
  try {
    const parsedSelection = assignSelectedFiles();
    equal(evaluateGenerateReadiness({ jira: {}, capacity: {}, kpi: {}, parsedSelection }).ready, true);
  } finally {
    cleanup();
  }
});

test("Person dashboards expose new metric drill-down buttons", () => {
  const cleanup = mountFixture(`<div id="scrumDashboards"></div>`);
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
        carryOver: { displayValue: "99h" },
        productiveWorkLogged: { displayValue: "N/A", reason: "ستون Work Log این فرد در فایل Jira وجود ندارد؛ این مقدار ساعت ثبت‌شده نیست." },
        availableCapacity: { displayValue: "۱۱۰٫۸h" }
      },
      planningDrillDown: {
        plannedIssueKeys: [{ issueKey: "A-1", planType: "Planned" }],
        startedPlannedIssueKeys: [{ issueKey: "A-1", planType: "Planned" }],
        unplannedIssueKeys: [],
        startedUnplannedIssueKeys: [],
        carryOverLoggedIssueKeys: [{ issueKey: "C-1", planType: "Carry Over" }]
      }
    }]);
    const target = document.getElementById("scrumDashboards");
    ok(target.innerHTML.includes('data-person-drill="plannedIssueCount"'));
    ok(target.innerHTML.includes('data-person-drill="carryOverWorkLogged"'));
    equal(target.innerHTML.includes(">Carry Over</h3><div class=\"kpi-value\">99h"), false);
    equal(target.innerHTML.includes("carry_over"), false);
    ok(target.innerHTML.includes("Available Capacity"));
    ok(target.innerHTML.includes("kpi-reason"));
    ok(target.innerHTML.includes("Work Log"));
  } finally {
    cleanup();
  }
});

test("Scrum card and Excel export show Ahad's own capacity", () => {
  const capacity = [
    { id: "capacity-col-1", capacityName: "مسلم", availableCapacity: 110.8, plannedCapacity: 80.64, unplannedCapacity: 10.08 },
    { id: "capacity-col-3", capacityName: "احد", availableCapacity: 141.6, plannedCapacity: 113.28, unplannedCapacity: 14.16 },
    { id: "capacity-col-7", capacityName: "علی", availableCapacity: 133.9, plannedCapacity: 107.12, unplannedCapacity: 13.39 }
  ];
  const people = calculatePersonDashboards([
    { issueKey: "A-1", assignee: "Ahad Sheibani", planType: "planned", devEstimate: 21, statusCanonical: "done", labels: [], raw: {} },
    { issueKey: "M-1", assignee: "Moslem Seydmohamadi", planType: "planned", devEstimate: 5, statusCanonical: "done", labels: [], raw: {} }
  ], capacity, [
    { capacityName: "", jiraName: "Ahad Sheibani", role: "developer", enabled: true },
    { capacityId: "capacity-col-1", capacityName: "مسلم", jiraName: "Moslem Seydmohamadi", role: "developer", enabled: true },
    { capacityId: "capacity-col-7", capacityName: "علی", jiraName: "Ali Bahrampour", role: "qa", enabled: true }
  ], {});
  const ahad = people.find((person) => person.name === "Ahad Sheibani");
  const cleanup = mountFixture(`<div id="scrumDashboards"></div>`);
  try {
    renderScrumDashboards(people);
    const card = document.getElementById("scrumDashboards").innerHTML.split("Moslem Seydmohamadi")[0];
    ok(card.includes(`Total Capacity</h3><div class="kpi-value">${ahad.metrics.totalCapacity.displayValue}`));
    equal(ahad.metrics.totalCapacity.displayValue === "N/A", false);
    const sheets = buildScrumWorkbookSheets({ calculatedMetrics: { people }, normalizedData: { issues: [] } });
    const rows = sheets.find((sheet) => sheet.name === "People KPI").rows;
    const ahadTotal = rows.find((row) => row[0] === "Ahad Sheibani" && row[3] === "totalCapacity");
    const moslemTotal = rows.find((row) => row[0] === "Moslem Seydmohamadi" && row[3] === "totalCapacity");
    const aliTotal = rows.find((row) => row[0] === "Ali Bahrampour" && row[3] === "totalCapacity");
    equal(ahadTotal[5], 141.6);
    equal(moslemTotal[5], 110.8);
    equal(aliTotal[5], 133.9);
  } finally {
    cleanup();
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

test("Blocked chart note distinguishes an explicit zero from missing blocked time", () => {
  const cleanup = mountFixture(`<p id="blockedChartNote"></p>`);
  try {
    renderCharts({ calculatedMetrics: { people: [], management: {} }, normalizedData: { issues: [{ issueKey: "Z-1", blockedHours: 0 }] } });
    equal(document.getElementById("blockedChartNote").textContent, "زمان بلاک ثبت‌شده صفر است.");
    renderCharts({ calculatedMetrics: { people: [], management: {} }, normalizedData: { issues: [{ issueKey: "B-1", blockedHours: null }] } });
    equal(document.getElementById("blockedChartNote").textContent, "برای زمان بلاک داده‌ای وجود ندارد.");
  } finally {
    cleanup();
  }
});

test("A saved person absent from the recalculated roster can be selected without a zero card", () => {
  const cleanup = mountFixture(`<div id="filters"></div><div id="scrumDashboards"></div>`);
  try {
    const report = {
      teamName: "Core",
      sprintName: "26.1",
      normalizedData: {
        issues: [{ issueKey: "S-1", assignee: "Sara", qaOwner: "", planType: "planned", statusCanonical: "done", labels: [], workLogged: null, raw: {} }],
        capacityPeople: []
      },
      mappingSnapshot: { personMappings: [], fieldMappings: {} },
      calculatedMetrics: { people: [{ name: "Sara", role: "developer", metrics: { rawWorkLogged: { value: 0, displayValue: "۰h" } } }] }
    };
    renderFilters([report], report);
    ok([...document.querySelectorAll("#personFilter option")].some((option) => option.value === "Sara"));
    const people = calculatePersonDashboards(report.normalizedData.issues, [], []);
    equal(people.length, 0);
    equal(applyIssueFilters(report, { person: "Sara" }).length, 1);
    renderScrumDashboards(people);
    ok(document.getElementById("scrumDashboards").textContent.includes("داشبورد فردی موجود نیست"));
  } finally {
    cleanup();
  }
});

test("Report history view exposes open and Excel export actions", () => {
  const cleanup = mountFixture(`<div id="historyList"></div>`);
  try {
    renderHistory([{ id: "r-1", teamName: "تیم محصول", sprintName: "26.1", createdAt: "2026-01-01T00:00:00.000Z" }]);
    const target = document.getElementById("historyList");
    ok(target.innerHTML.includes("باز کردن گزارش"));
    ok(target.innerHTML.includes("خروجی Excel گزارش"));
    ok(target.innerHTML.includes('data-export-report="r-1"'));
  } finally {
    cleanup();
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
    if (url === "/api/health") return jsonResponse({ ok: true, storage: "postgres", database: "connected" });
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

test("Report storage: a Postgres health response without a database check is not treated as connected", () => {
  equal(postgresApiIsConnected({ ok: true, storage: "postgres" }), false);
  equal(postgresApiIsConnected({ ok: true, storage: "postgres", database: "connected" }), true);
});

test("Report storage: a failed Postgres save is identified as browser-only", async () => {
  const oldFetch = globalThis.fetch;
  const writes = [];
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/health") return jsonResponse({ ok: true, storage: "postgres", database: "connected" });
    if (url === "/api/reports" && options.method === "POST") throw new Error("database unavailable");
    throw new Error(`unexpected fetch ${url}`);
  };
  resetReportApiProbe();
  try {
    const saved = await saveReport({ id: "legacy-1", teamName: "تیم", normalizedData: { issues: [] } }, { put: async (report) => { writes.push(report); } });
    equal(saved.storage, "indexeddb");
    equal(saved.fallback, true);
    equal(writes.length, 1);
    equal(writes[0].normalizedData.issues.length, 0);
    ok(storageSavedMessage(saved).includes("فقط در مرورگر"));
    ok(!storageSavedMessage(saved).includes("در PostgreSQL ذخیره شد."));
  } finally {
    globalThis.fetch = oldFetch;
    resetReportApiProbe();
  }
});

test("Non-finite chart values stay gaps while finite fractions stay numbers", () => {
  const cleanup = mountFixture(`<section id="management" class="page-section active"><div class="chart-grid">
    <div class="chart-panel"><canvas id="capacityChart"></canvas></div>
    <div class="chart-panel"><canvas id="workMixChart"></canvas></div>
    <div class="chart-panel"><canvas id="deliveryChart"></canvas></div>
    <div class="chart-panel"><canvas id="qaChart"></canvas></div>
    <div class="chart-slot"><div class="chart-panel"><canvas id="blockedChart"></canvas></div><p id="blockedChartNote"></p></div>
  </div></section>`);
  try {
    renderCharts({
      calculatedMetrics: {
        people: [
          { name: "A", metrics: { capacityUtilization: { value: Infinity }, deliveryRate: { value: 0 } } },
          { name: "B", metrics: { capacityUtilization: { value: null }, deliveryRate: { value: null } } }
        ],
        management: { workMix: { planned: 0.5, unplanned: Infinity, carry_over: null }, qaReturnRate: { value: NaN }, firstPassRate: { value: 0 } }
      },
      normalizedData: { issues: [{ issueKey: "B-1", blockedHours: Infinity }, { issueKey: "B-2", blockedHours: 2 }] }
    });
    const capacity = window.Chart.getChart(document.getElementById("capacityChart")).data.datasets[0].data;
    equal(capacity[0], null);
    equal(capacity[1], null);
    const delivery = window.Chart.getChart(document.getElementById("deliveryChart")).data.datasets[0].data;
    equal(delivery[0], 0);
    equal(delivery[1], null);
    const mix = window.Chart.getChart(document.getElementById("workMixChart")).data.datasets[0].data;
    equal(mix[0], 0.5);
    equal(mix[1], null);
    equal(mix[2], null);
    const qa = window.Chart.getChart(document.getElementById("qaChart")).data.datasets[0].data;
    equal(qa[0], null);
    equal(qa[1], 0);
    equal(window.Chart.getChart(document.getElementById("blockedChart")).data.datasets[0].data[0], 2);
  } finally {
    cleanup();
  }
});

test("Older person snapshots do not stop the management charts", () => {
  const cleanup = mountFixture(`<section id="management" class="page-section active"><div class="chart-grid">
    <div class="chart-panel"><canvas id="capacityChart"></canvas></div>
    <div class="chart-panel"><canvas id="workMixChart"></canvas></div>
    <div class="chart-panel"><canvas id="deliveryChart"></canvas></div>
    <div class="chart-panel"><canvas id="qaChart"></canvas></div>
    <div class="chart-slot"><div class="chart-panel"><canvas id="blockedChart"></canvas></div><p id="blockedChartNote"></p></div>
  </div></section>`);
  try {
    renderCharts({ calculatedMetrics: { people: [{ name: "Legacy" }], management: {} }, normalizedData: { issues: [] } });
    ["capacityChart", "workMixChart", "deliveryChart", "qaChart", "blockedChart"].forEach((id) => {
      ok(window.Chart.getChart(document.getElementById(id)));
    });
  } finally {
    cleanup();
  }
});

test("Management charts stay bounded after the hidden section is shown", async () => {
  const cleanup = mountFixture(`<section id="management" class="page-section"><div class="chart-grid">
    <div class="chart-panel"><canvas id="capacityChart"></canvas></div>
    <div class="chart-panel"><canvas id="workMixChart"></canvas></div>
    <div class="chart-panel"><canvas id="deliveryChart"></canvas></div>
    <div class="chart-panel"><canvas id="qaChart"></canvas></div>
    <div class="chart-slot"><div class="chart-panel"><canvas id="blockedChart"></canvas></div><p id="blockedChartNote"></p></div>
  </div></section>`);
  try {
    renderCharts({
      calculatedMetrics: {
        people: [{ name: "Ahad Sheibani", metrics: { capacityUtilization: { value: 25.07 }, deliveryRate: { value: 50 } } }],
        management: { workMix: { planned: 414, unplanned: 138, carry_over: 1135 }, qaReturnRate: { value: 42.72 }, firstPassRate: { value: 57.28 } }
      },
      normalizedData: { issues: [{ issueKey: "PCMP-1", blockedHours: 12 }] }
    });
    document.getElementById("management").classList.add("active");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    resizeCharts();
    const canvas = document.getElementById("capacityChart");
    const rect = canvas.getBoundingClientRect();
    ok(rect.width > 200);
    ok(rect.height > 150 && rect.height < 360);
    ok(canvas.width > 0 && canvas.height > 0 && canvas.height < 2000);
    ["workMixChart", "deliveryChart", "qaChart", "blockedChart"].forEach((id) => {
      const box = document.getElementById(id).getBoundingClientRect();
      ok(box.height > 150 && box.height < 360);
    });
  } finally {
    cleanup();
  }
});

function jsonResponse(payload) {
  return { ok: true, status: 200, statusText: "OK", json: async () => payload };
}

function mountFixture(html) {
  const root = document.createElement("div");
  root.dataset.uiTestFixture = "true";
  root.innerHTML = html;
  document.body.append(root);
  return () => root.remove();
}

function fileInputs() {
  return `<input id="jiraFile" type="file"><input id="capacityFile" type="file"><input id="kpiFile" type="file">`;
}

function assignSelectedFiles() {
  const specs = [
    ["jiraFile", "jira.xlsx", "jira"],
    ["capacityFile", "capacity.xlsx", "capacity"],
    ["kpiFile", "kpi.docx", "kpi"]
  ];
  const files = {};
  for (const [id, name, key] of specs) {
    const input = document.getElementById(id);
    const transfer = new DataTransfer();
    transfer.items.add(new File([key], name, { lastModified: 1700000000000 }));
    input.files = transfer.files;
    files[key] = input.files[0];
  }
  return selectionTokensFromFiles(files);
}
