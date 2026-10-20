import { test, equal, close, ok } from "./test-helpers.js";
import { parseJiraWorkbook } from "../assets/js/services/parsers/jira-parser.js";
import { normalizeJiraRows } from "../assets/js/models/jira-model.js";
import { buildManagementWorkLogBreakdown, buildPersonWorkLogBreakdown, buildPersonWorkLogValueWarnings, buildWorkLogQualityWarnings } from "../assets/js/services/work-log-category-service.js";
import { calculateManagementMetrics, calculatePersonDashboards } from "../assets/js/services/calculations/report-calculator.js";
import { buildReconciliation } from "../assets/js/services/reconciliation-service.js";
import { normalizePossibleExcelHours } from "../assets/js/services/normalization/unit-normalizer.js";
import { buildReportWorkbookSheets, savedReportWorkbookSheets, tableToCsv, workbookFromSheets } from "../assets/js/services/export-service.js";
import { buildQualityReport } from "../assets/js/services/data-quality-service.js";
import { renderQuality } from "../assets/js/views/quality-view.js";
import { getIssueCsvRows } from "../assets/js/views/table-view.js";
import { formatNumber } from "../assets/js/utils/formatters.js";
import { recalculateReportCopy, renderReport } from "../assets/js/controllers/dashboard-controller.js";

function workbook(rows, prepare) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  prepare(sheet);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sprint");
  return XLSX.write(book, { type: "array", bookType: "xlsx" });
}

function issuesFrom(parsed) {
  return normalizeJiraRows(parsed.main.rows, parsed.fieldMap, new Set(), [], () => null);
}

const sourceWorkbook = workbook([
  ["Key", "Status", "Σ Time Spent", "AliLog"],
  ["Z-1", "Done", 0, 0],
  ["B-1", "Done", "", ""],
  ["O-1", "Done", "", ""],
  ["T-1", "Done", "12h", "not-a-number"],
  ["D-1", "Done", 1.5, 2.25],
  ["E-1", "Done", 0.3125, 0.125]
], (sheet) => {
  sheet.C2.z = "[h]:mm";
  sheet.D2.z = "[h]:mm";
  sheet.C3 = { t: "s", v: "", w: "" };
  sheet.D3 = { t: "s", v: "", w: "" };
  delete sheet.C4;
  delete sheet.D4;
  sheet.C7.z = "[h]:mm";
  sheet.D7.z = "[h]:mm";
});

test("Work-log cells keep zero, blank, omitted, rejected text, decimal hours, and Excel duration apart", async () => {
  const parsed = await parseJiraWorkbook({ name: "work-log-source.xlsx" }, sourceWorkbook);
  const rows = Object.fromEntries(parsed.main.rows.map((row) => [row.Key, row]));
  const cell = (key) => rows[key].__cellMeta["Σ Time Spent"];

  equal(rows["Z-1"]["Σ Time Spent"], 0);
  equal(cell("Z-1").type, "n");
  equal(cell("Z-1").format, "[h]:mm");
  equal(cell("Z-1").rawValue, 0);
  equal(cell("Z-1").text, "0:00");

  equal(rows["B-1"]["Σ Time Spent"], "");
  equal(cell("B-1").type, "s");
  equal(cell("B-1").rawValue, "");

  equal(rows["O-1"]["Σ Time Spent"], "");
  equal(cell("O-1").type, "");
  equal(cell("O-1").rawValue, "");

  equal(rows["T-1"]["Σ Time Spent"], "12h");
  equal(cell("T-1").type, "s");
  equal(cell("T-1").rawValue, "12h");

  equal(rows["D-1"]["Σ Time Spent"], 1.5);
  equal(cell("D-1").type, "n");
  equal(cell("D-1").format, "General");

  equal(rows["E-1"]["Σ Time Spent"], 0.3125);
  equal(cell("E-1").type, "n");
  equal(cell("E-1").format, "[h]:mm");
  equal(cell("E-1").text, "7:30");
});

test("Normalized work logs preserve an explicit zero and leave blank, omitted, and rejected text empty", async () => {
  const issues = issuesFrom(await parseJiraWorkbook({ name: "work-log-source.xlsx" }, sourceWorkbook));
  const hours = Object.fromEntries(issues.map((issue) => [issue.issueKey, issue.workLogged]));
  equal(hours["Z-1"], 0);
  equal(hours["B-1"], null);
  equal(hours["O-1"], null);
  equal(hours["T-1"], null);
  equal(hours["D-1"], 1.5);
  equal(hours["E-1"], 7.5);
});

test("A partial work-log column totals the recorded durations", async () => {
  const issues = issuesFrom(await parseJiraWorkbook({ name: "work-log-source.xlsx" }, sourceWorkbook));
  const recorded = issues.map((issue) => issue.workLogged).filter((value) => Number.isFinite(value));
  const handTotal = recorded.reduce((sum, value) => sum + value, 0);
  equal(recorded.includes(0), true);
  close(handTotal, 9);
  const breakdown = buildManagementWorkLogBreakdown(issues, [{ jiraName: "Ali", workLogColumn: "AliLog", enabled: true }]);
  close(breakdown.totals.rawWorkLoggedHours, handTotal);
  const partialWarning = buildWorkLogQualityWarnings(breakdown).find((warning) => warning.code === "Partial Work Logged total");
  ok(partialWarning);
  ok(partialWarning.message.includes("3"));
  ok(partialWarning.message.includes("ممکن است کل واقعی نباشد"));
  const rows = Object.fromEntries(breakdown.rows.map((row) => [row.issueKey, row]));
  equal(rows["Z-1"].rawWorkLoggedHours, 0);
  equal(rows["Z-1"].detectedUnit, "Excel duration [h]:mm");
  equal(rows["Z-1"].rawSourceValue, 0);
  equal(rows["B-1"].rawWorkLoggedHours, null);
  equal(rows["B-1"].detectedUnit, "blank");
  equal(rows["B-1"].rawSourceValue, "");
  equal(rows["O-1"].rawWorkLoggedHours, null);
  equal(rows["O-1"].detectedUnit, "blank");
  equal(rows["O-1"].rawSourceValue, "");
  equal(rows["T-1"].rawWorkLoggedHours, null);
  equal(rows["T-1"].detectedUnit, "Text duration");
  equal(rows["T-1"].rawSourceValue, "12h");
  ok(buildWorkLogQualityWarnings(breakdown).some((warning) => warning.code === "Rejected work-log value" && warning.issueKey === "T-1"));
  close(rows["D-1"].rawWorkLoggedHours, 1.5);
  equal(rows["D-1"].detectedUnit, "Numeric hours/serial duration");
  close(rows["E-1"].rawWorkLoggedHours, 7.5);
  equal(rows["E-1"].detectedUnit, "Excel duration [h]:mm");
});

test("Mapped personal hours total recorded values and do not absorb the team total", async () => {
  const issues = issuesFrom(await parseJiraWorkbook({ name: "work-log-source.xlsx" }, sourceWorkbook));
  const breakdown = buildPersonWorkLogBreakdown(issues, { jiraName: "Ali", workLogColumn: "AliLog", enabled: true });
  close(breakdown.totals.rawWorkLoggedHours, 5.25);
  equal(breakdown.sourceMissing, undefined);
  ok(breakdown.totals.rawWorkLoggedHours !== 9);
});

test("A missing personal work-log column stays unavailable and is not inferred from the team total", async () => {
  const parsed = await parseJiraWorkbook({ name: "missing-column.xlsx" }, workbook([
    ["Key", "Status", "Σ Time Spent"],
    ["M-1", "Done", 0.25]
  ], (sheet) => {
    sheet.C2.z = "[h]:mm";
  }));
  equal(Object.hasOwn(parsed.main.rows[0], "AliLog"), false);
  const issues = issuesFrom(parsed);
  equal(issues[0].workLogged, 6);
  const person = calculatePersonDashboards(issues, [], [{ jiraName: "Ali", role: "developer", workLogColumn: "", enabled: true }])[0];
  equal(person.metrics.rawWorkLogged.value, null);
  equal(person.metrics.rawWorkLogged.displayValue, "N/A");
  equal(person.metrics.rawWorkLogged.status, "unavailable");
  ok(person.metrics.rawWorkLogged.value !== issues[0].workLogged);
});

test("Issue export keeps a recorded zero and does not write an empty work log as zero", async () => {
  const issues = issuesFrom(await parseJiraWorkbook({ name: "work-log-source.xlsx" }, sourceWorkbook));
  const sheet = buildReportWorkbookSheets({
    normalizedData: { issues },
    calculatedMetrics: { management: {}, people: [] },
    dataQuality: [],
    reconciliation: {}
  }).find((item) => item.name === "Issues").rows;
  const column = sheet[0].indexOf("Work Logged");
  const exported = Object.fromEntries(sheet.slice(1).map((row) => [row[0], row[column]]));
  equal(exported["Z-1"], 0);
  equal(exported["B-1"], "");
  equal(exported["O-1"], "");
  equal(exported["T-1"], "");
  equal(exported["D-1"], 1.5);
  equal(exported["E-1"], 7.5);

  const csv = getIssueCsvRows(issues);
  const csvColumn = csv[0].indexOf("Work Logged");
  const csvValues = Object.fromEntries(csv.slice(1).map((row) => [row[0], row[csvColumn]]));
  equal(csvValues["Z-1"], formatNumber(0));
  equal(csvValues["B-1"], "N/A");
  equal(csvValues["O-1"], "N/A");
  equal(csvValues["T-1"], "N/A");
  equal(csvValues["D-1"], formatNumber(1.5));
  equal(csvValues["E-1"], formatNumber(7.5));
  const csvText = tableToCsv(csv);
  ok(csvText.includes(`"${formatNumber(0)}"`));
  ok(csvText.includes('"N/A"'));
  equal(csvText.split("\n").some((line) => line.includes('"B-1"') && line.includes('"0"')), false);

  const bytes = XLSX.write(workbookFromSheets([{ name: "Issues", rows: sheet }]), { type: "array", bookType: "xlsx" });
  const opened = XLSX.read(bytes, { type: "array" });
  const zeroCell = issueWorkLogCell(opened, "Z-1");
  const blankCell = issueWorkLogCell(opened, "B-1");
  equal(zeroCell.t, "n");
  equal(zeroCell.v, 0);
  equal(blankCell?.t === "n", false);
  equal(blankCell?.v === 0, false);
});

test("Saved report snapshots keep stored work-log results when a new calculation is prepared", async () => {
  const issues = issuesFrom(await parseJiraWorkbook({ name: "work-log-source.xlsx" }, sourceWorkbook));
  const stored = {
    id: "historical-report",
    calculationVersion: "1.0.0",
    teamName: "Team",
    sprintName: "Sprint",
    normalizedData: { issues, capacityPeople: [] },
    mappingSnapshot: { personMappings: [], fieldMappings: {} },
    calculatedMetrics: { management: { rawWorkLogged: { value: 42, displayValue: "42" } }, people: [] },
    dataQuality: [],
    reconciliation: {}
  };
  const copy = recalculateReportCopy(stored);
  equal(stored.id, "historical-report");
  equal(stored.calculationVersion, "1.0.0");
  equal(stored.calculatedMetrics.management.rawWorkLogged.value, 42);
  ok(copy.id !== stored.id);
  equal(copy.calculationVersion !== stored.calculationVersion, true);
  const roundTrip = JSON.parse(JSON.stringify(issues.map((issue) => ({ issueKey: issue.issueKey, workLogged: issue.workLogged }))));
  equal(roundTrip.find((issue) => issue.issueKey === "Z-1").workLogged, 0);
  equal(roundTrip.find((issue) => issue.issueKey === "B-1").workLogged, null);
  equal(roundTrip.find((issue) => issue.issueKey === "T-1").workLogged, null);
  close(copy.calculatedMetrics.management.rawWorkLogged.value, 9);
});

test("A column with only an explicit zero stays zero", async () => {
  const issues = issuesFrom(await parseJiraWorkbook({ name: "zero-only.xlsx" }, workbook([
    ["Key", "Status", "Σ Time Spent"],
    ["Z-2", "Done", 0]
  ], (sheet) => {
    sheet.C2.z = "[h]:mm";
  })));
  const metrics = calculateManagementMetrics(issues, [], []);
  equal(metrics.rawWorkLogged.value, 0);
  equal(metrics.rawWorkLogged.status, "ok");
  equal(metrics.rawWorkLogged.displayValue === "N/A", false);
});

test("A column with no recorded hours is unavailable", async () => {
  const blankIssues = issuesFrom(await parseJiraWorkbook({ name: "blank-only.xlsx" }, workbook([
    ["Key", "Status", "Σ Time Spent"],
    ["B-2", "Done", ""],
    ["O-2", "Done", ""]
  ], (sheet) => {
    sheet.C2 = { t: "s", v: "", w: "" };
    delete sheet.C3;
  })));
  const blankMetrics = calculateManagementMetrics(blankIssues, [], []);
  equal(blankMetrics.rawWorkLogged.value, null);
  equal(blankMetrics.rawWorkLogged.displayValue, "N/A");
  equal(blankMetrics.rawWorkLogged.status, "unavailable");
  const rejectedIssues = issuesFrom(await parseJiraWorkbook({ name: "rejected-only.xlsx" }, workbook([
    ["Key", "Status", "Σ Time Spent"],
    ["T-2", "Done", "12h"],
    ["T-3", "Done", "n/a"]
  ], () => {})));
  const rejectedMetrics = calculateManagementMetrics(rejectedIssues, [], []);
  equal(rejectedMetrics.rawWorkLogged.value, null);
  equal(rejectedMetrics.rawWorkLogged.status, "unavailable");
  const breakdown = rejectedMetrics.workLogBreakdown;
  ok(buildWorkLogQualityWarnings(breakdown).some((warning) => warning.code === "Rejected work-log value"));
  ok(buildWorkLogQualityWarnings(breakdown).some((warning) => warning.code === "Work Logged unavailable"));
});

test("An explicit zero mixed with blank cells still totals zero", async () => {
  const issues = issuesFrom(await parseJiraWorkbook({ name: "zero-and-blank.xlsx" }, workbook([
    ["Key", "Status", "Σ Time Spent"],
    ["Z-3", "Done", 0],
    ["B-3", "Done", ""]
  ], (sheet) => {
    sheet.C2.z = "[h]:mm";
    sheet.C3 = { t: "s", v: "", w: "" };
  })));
  equal(calculateManagementMetrics(issues, [], []).rawWorkLogged.value, 0);
});

test("A named missing column and an empty personal mapping are both unavailable", async () => {
  const issues = issuesFrom(await parseJiraWorkbook({ name: "missing-column.xlsx" }, workbook([
    ["Key", "Status", "Σ Time Spent"],
    ["M-1", "Done", 0.25]
  ], (sheet) => {
    sheet.C2.z = "[h]:mm";
  })));
  const people = calculatePersonDashboards(issues, [], [
    { jiraName: "Ali", role: "developer", workLogColumn: "AliLog", enabled: true },
    { jiraName: "Sara", role: "developer", workLogColumn: "", enabled: true }
  ]);
  people.forEach((person) => {
    equal(person.metrics.rawWorkLogged.value, null);
    equal(person.metrics.rawWorkLogged.displayValue, "N/A");
    equal(person.workLogBreakdown.sourceMissing, true);
    ok(person.metrics.rawWorkLogged.value !== issues[0].workLogged);
  });
});

test("Blank and explicit-zero category hours stay distinct", () => {
  const categoryMapping = { block: { labels: ["block"], titlePatterns: [] }, meeting: { labels: [], titlePatterns: [] }, technical: { labels: [], titlePatterns: [] }, version: { labels: [], titlePatterns: [] } };
  const blank = buildManagementWorkLogBreakdown([issueRow("B-9", "", ["block"])], [], {}, categoryMapping);
  equal(blank.rows[0].rawWorkLoggedHours, null);
  equal(blank.rows[0].blockWorkLoggedHours, null);
  equal(blank.totals.rawWorkLoggedHours, null);
  equal(buildWorkLogQualityWarnings(blank).some((warning) => warning.code === "Non-productive issue with no Work Logged"), false);
  const zero = buildManagementWorkLogBreakdown([issueRow("Z-9", 0, ["block"])], [], {}, categoryMapping);
  equal(zero.rows[0].rawWorkLoggedHours, 0);
  equal(zero.rows[0].blockWorkLoggedHours, 0);
  equal(zero.totals.rawWorkLoggedHours, 0);
  ok(buildWorkLogQualityWarnings(zero).some((warning) => warning.code === "Non-productive issue with no Work Logged"));
});

test("Reconciliation totals use recorded hours and leave the personal gap unallocated", async () => {
  const parsed = await parseJiraWorkbook({ name: "work-log-source.xlsx" }, sourceWorkbook);
  const issues = issuesFrom(parsed);
  const reconciliation = buildReconciliation({
    report: { teamName: "Team", sprintName: "Sprint", calculatedMetrics: { management: {}, people: [] } },
    issues,
    personMappings: [{ jiraName: "Ali", role: "developer", workLogColumn: "AliLog", enabled: true }],
    fieldMappings: parsed.fieldMap
  });
  const totals = reconciliation.workLogReconciliation.totals;
  close(totals.managementWorkLogged, 9);
  close(totals.mappedIndividualWorkLogged, 5.25);
  close(totals.residualWorkLogged, 3.75);
  const blankRow = reconciliation.workLogReconciliation.rows.find((row) => row.issueKey === "B-1");
  equal(blankRow.managementTotalWorkLog, null);
  const zeroRow = reconciliation.workLogReconciliation.rows.find((row) => row.issueKey === "Z-1");
  equal(zeroRow.managementTotalWorkLog, 0);
});

test("Sample sprint work-log totals stay on the recorded hours", async () => {
  const response = await fetch("../sample-data/jira.xlsx");
  ok(response.ok);
  const parsed = await parseJiraWorkbook({ name: "jira.xlsx" }, await response.arrayBuffer());
  const issues = issuesFrom(parsed);
  const team = issues.reduce((total, issue) => total + (Number.isFinite(issue.workLogged) ? issue.workLogged : 0), 0);
  const personalColumns = ["Σ Work Logged AmirReza", "Work Logged Omid", "Work Logged mozhdeh", "Work Logged behzad", "Work Today abbas", "Work Logged sepideh", "Work Today Ali"];
  const personal = personalColumns.reduce((total, column) => total + issues.reduce((columnTotal, issue) => {
    const hours = normalizePossibleExcelHours(issue.raw?.[column], issue.raw?.__cellMeta?.[column]).hours;
    return columnTotal + (Number.isFinite(hours) ? hours : 0);
  }, 0), 0);
  close(team, 1559.1333);
  close(personal, 569.9167);
  close(team - personal, 989.2166);
  const mappings = personalColumns.map((column) => ({ jiraName: column, role: "developer", workLogColumn: column, enabled: true }));
  const metrics = calculateManagementMetrics(issues, [], mappings);
  close(metrics.rawWorkLogged.value, 1559.1333);
  const reconciliation = buildReconciliation({
    report: { teamName: "Team", sprintName: parsed.suggestedMainSheet, calculatedMetrics: { management: metrics, people: [] } },
    issues,
    personMappings: mappings,
    fieldMappings: parsed.fieldMap
  });
  close(reconciliation.workLogReconciliation.totals.managementWorkLogged, 1559.1333);
  close(reconciliation.workLogReconciliation.totals.mappedIndividualWorkLogged, 569.9167);
  close(reconciliation.workLogReconciliation.totals.residualWorkLogged, 989.2166);
  equal(reconciliation.workLogReconciliation.totals.classification, "Unallocated / Other Users Work Logged");
});

test("Legacy and new report Excel cells agree with the recalculated dashboard", async () => {
  const blankIssues = issuesFrom(await parseJiraWorkbook({ name: "blank-only.xlsx" }, workbook([
    ["Key", "Status", "Σ Time Spent"],
    ["B-4", "Done", ""],
    ["T-4", "Done", "12h"]
  ], (sheet) => {
    sheet.C2 = { t: "s", v: "", w: "" };
    sheet.C3 = { t: "s", v: "12h", w: "12h" };
  })));
  const legacy = storedReport(blankIssues, { value: 0, displayValue: "۰h", status: "ok" });
  legacy.dataQuality = [{ severity: "warning", code: "Missing person work-log column", message: "Sara: زمان ثبت‌شده فردی صفر می‌ماند" }];
  const blankDashboard = calculateManagementMetrics(blankIssues, [], legacy.mappingSnapshot.personMappings);
  equal(blankDashboard.rawWorkLogged.value, null);
  equal(blankDashboard.rawWorkLogged.displayValue, "N/A");
  const blankWorkbook = readExport(legacy);
  const blankMetric = metricCells(blankWorkbook, "rawWorkLogged");
  equal(blankMetric.display?.v, "N/A");
  equal(Number.isFinite(blankMetric.calculated?.v), false);
  equal(blankMetric.calculated?.v === 0, false);
  equal(legacy.calculatedMetrics.management.rawWorkLogged.value, 0);
  ok(summaryText(blankWorkbook).includes("دوباره محاسبه شده‌اند"));
  ok(!qualityText(blankWorkbook).includes("صفر می‌ماند"));

  const validIssues = issuesFrom(await parseJiraWorkbook({ name: "valid-hours.xlsx" }, workbook([
    ["Key", "Status", "Σ Time Spent"],
    ["D-4", "Done", 4]
  ], (sheet) => {
    sheet.C2.z = "[h]:mm";
  })));
  const current = calculateManagementMetrics(validIssues, [], []);
  const generated = storedReport(validIssues, current.rawWorkLogged);
  generated.calculatedMetrics = { management: current, people: [] };
  const generatedWorkbook = readExport(generated);
  const generatedMetric = metricCells(generatedWorkbook, "rawWorkLogged");
  equal(generatedMetric.display?.v, current.rawWorkLogged.displayValue);
  equal(generatedMetric.calculated?.v, current.rawWorkLogged.value);
  equal(generatedMetric.calculated?.t, "n");

  const stale = storedReport(validIssues, { value: 99, displayValue: "99h", status: "ok" });
  const staleWorkbook = readExport(stale);
  equal(metricCells(staleWorkbook, "rawWorkLogged").calculated?.v, current.rawWorkLogged.value);
  equal(stale.calculatedMetrics.management.rawWorkLogged.value, 99);

  const insufficient = {
    id: "incomplete-report",
    calculationVersion: "1.0.0",
    calculatedMetrics: { management: { rawWorkLogged: { value: 0, displayValue: "۰h", status: "ok" } }, people: [] },
    dataQuality: [],
    reconciliation: {}
  };
  const insufficientWorkbook = readExport(insufficient);
  equal(metricCells(insufficientWorkbook, "rawWorkLogged").calculated?.v, 0);
  ok(summaryText(insufficientWorkbook).includes("برای محاسبه مجدد کافی نیست"));
});

test("An empty personal mapping warns that the KPI is N/A and does not receive team hours", async () => {
  const issues = issuesFrom(await parseJiraWorkbook({ name: "team-only.xlsx" }, workbook([
    ["Key", "Status", "Σ Time Spent"],
    ["M-2", "Done", 0.25]
  ], (sheet) => {
    sheet.C2.z = "[h]:mm";
  })));
  const mappings = [{ jiraName: "Sara", role: "developer", workLogColumn: "", enabled: true }];
  const quality = buildQualityReport({
    jira: { suggestedMainSheet: "Sprint", suggestedQaSheet: "QA", main: { headers: [] } },
    fieldMap: { issueKey: "Key", status: "Status" },
    capacity: { people: [] },
    issues,
    personMappings: mappings
  });
  const warning = quality.find((item) => item.code === "Missing person work-log column");
  ok(warning.message.includes("N/A"));
  ok(warning.message.includes("نگاشت نشده"));
  equal(warning.message.includes("صفر می‌ماند"), false);
  const person = calculatePersonDashboards(issues, [], mappings)[0];
  const team = calculateManagementMetrics(issues, [], mappings);
  equal(person.metrics.rawWorkLogged.displayValue, "N/A");
  equal(person.metrics.rawWorkLogged.value, null);
  close(team.rawWorkLogged.value, 6);
  equal(person.metrics.rawWorkLogged.value === team.rawWorkLogged.value, false);
  const host = document.createElement("div");
  host.id = "qualityReport";
  document.body.append(host);
  try {
    renderQuality(quality.filter((item) => item.code === "Missing person work-log column"));
    ok(host.textContent.includes("N/A"));
    equal(host.textContent.includes("صفر می‌ماند"), false);
  } finally {
    host.remove();
  }
});

test("Work-log population warnings keep zero, missing, rejected, partial, and absent columns distinct", async () => {
  const populated = await population(["Key", "Status", "Σ Time Spent", "AliLog"], [
    ["Z-5", "Done", 0, 0],
    ["B-5", "Done", "", ""],
    ["R-5", "Done", "12h", "0b10"],
    ["D-5", "Done", 2, 3]
  ], (sheet) => {
    sheet.C2.z = "[h]:mm";
    sheet.D2.z = "[h]:mm";
    sheet.C3 = { t: "s", v: "", w: "" };
    sheet.D3 = { t: "s", v: "", w: "" };
  });
  close(populated.metrics.rawWorkLogged.value, 2);
  equal(populated.metrics.rawWorkLogged.value === null, false);
  const managementWarnings = buildWorkLogQualityWarnings(populated.metrics.workLogBreakdown);
  ok(managementWarnings.some((warning) => warning.code === "Partial Work Logged total" && warning.message.includes("ممکن است کل واقعی نباشد")));
  ok(managementWarnings.some((warning) => warning.code === "Rejected work-log value" && warning.message.includes("12h")));
  equal(managementWarnings.some((warning) => warning.code === "Work Logged unavailable"), false);
  equal(managementWarnings.some((warning) => warning.code === "Missing team work-log column"), false);
  const personWarnings = buildPersonWorkLogValueWarnings(populated.issues, [{ jiraName: "Ali", workLogColumn: "AliLog", enabled: true }]);
  ok(personWarnings.some((warning) => warning.code === "Partial Work Logged total"));
  ok(personWarnings.some((warning) => warning.message.includes("0b10")));
  equal(populated.metrics.workLogBreakdown.rows.find((row) => row.issueKey === "Z-5").rawWorkLoggedHours, 0);

  const zeros = await population(["Key", "Status", "Σ Time Spent"], [["Z-6", "Done", 0], ["Z-7", "Done", 0]], (sheet) => {
    sheet.C2.z = "[h]:mm";
    sheet.C3.z = "[h]:mm";
  });
  equal(zeros.metrics.rawWorkLogged.value, 0);
  equal(buildWorkLogQualityWarnings(zeros.metrics.workLogBreakdown).some((warning) => warning.code === "Partial Work Logged total"), false);

  const empty = await population(["Key", "Status", "Σ Time Spent"], [["B-6", "Done", ""], ["R-6", "Done", "12h"]], (sheet) => {
    sheet.C2 = { t: "s", v: "", w: "" };
    sheet.C3 = { t: "s", v: "12h", w: "12h" };
  });
  equal(empty.metrics.rawWorkLogged.value, null);
  equal(empty.metrics.rawWorkLogged.displayValue, "N/A");
  const emptyWarnings = buildWorkLogQualityWarnings(empty.metrics.workLogBreakdown);
  ok(emptyWarnings.some((warning) => warning.code === "Work Logged unavailable"));
  equal(emptyWarnings.some((warning) => warning.code === "Partial Work Logged total"), false);

  const absentPerson = await population(["Key", "Status", "Σ Time Spent"], [["M-6", "Done", 1]], () => {});
  const absentWarnings = buildPersonWorkLogValueWarnings(absentPerson.issues, [{ jiraName: "Ali", workLogColumn: "AliLog", enabled: true }]);
  ok(absentWarnings.some((warning) => warning.code === "Missing person work-log column"));
  equal(absentWarnings.some((warning) => warning.code === "Partial Work Logged total"), false);
  const absentPersonMetrics = calculatePersonDashboards(absentPerson.issues, [], [{ jiraName: "Ali", workLogColumn: "AliLog", enabled: true }])[0];
  equal(absentPersonMetrics.metrics.rawWorkLogged.value, null);
  equal(absentPersonMetrics.metrics.rawWorkLogged.value === absentPerson.metrics.rawWorkLogged.value, false);

  const missingTeam = await population(["Key", "Status", "AliLog"], [["P-6", "Done", 5]], () => {});
  const missingTeamBreakdown = buildManagementWorkLogBreakdown(missingTeam.issues, [{ jiraName: "Ali", workLogColumn: "AliLog", enabled: true }]);
  const missingTeamWarnings = buildWorkLogQualityWarnings(missingTeamBreakdown);
  ok(missingTeamWarnings.some((warning) => warning.code === "Missing team work-log column"));
  equal(missingTeamWarnings.some((warning) => warning.code === "Partial Work Logged total"), false);
  close(missingTeamBreakdown.totals.rawWorkLoggedHours, 5);
  const unmapped = calculatePersonDashboards(missingTeam.issues, [], [
    { jiraName: "Ali", workLogColumn: "AliLog", enabled: true },
    { jiraName: "Sara", workLogColumn: "", enabled: true }
  ]);
  close(unmapped[0].metrics.rawWorkLogged.value, 5);
  equal(unmapped[1].metrics.rawWorkLogged.value, null);
  equal(unmapped[1].metrics.rawWorkLogged.displayValue, "N/A");
});

test("The open report summary and reconciliation JSON follow the recalculated residual", async () => {
  const blank = legacyScreenReport(await blankWorkLogIssues(), 0);
  const zero = legacyScreenReport(await zeroWorkLogIssues(), 99);
  const root = mountReportScreen();
  const blobs = [];
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = (blob) => {
    blobs.push(blob);
    return originalCreate.call(URL, blob);
  };
  try {
    renderReport(blank, [blank], () => {});
    const blankSummary = document.getElementById("qualitySummaryPanel").textContent;
    ok(blankSummary.includes("N/A Work Logged"));
    equal(blankSummary.includes("۰h Work Logged"), false);
    equal(document.querySelector("#managementCards .kpi-card .kpi-value").textContent === "۰h", false);
    ok([...document.querySelectorAll("#managementCards .kpi-card")].some((card) => card.querySelector("h3").textContent === "زمان ثبت‌شده کل" && card.querySelector(".kpi-value").textContent === "N/A"));
    document.getElementById("exportReconciliationBtn").click();
    const blankJson = JSON.parse(await blobs.at(-1).text());
    equal(blankJson.workLogReconciliation.totals.residualWorkLogged, null);
    equal(blankJson.workLogReconciliation.totals.managementWorkLogged, null);
    equal(blank.reconciliation.workLogReconciliation.totals.residualWorkLogged, 0);

    renderReport(zero, [zero], () => {});
    ok(document.getElementById("qualitySummaryPanel").textContent.includes("۰h Work Logged"));
    document.getElementById("exportReconciliationBtn").click();
    const zeroJson = JSON.parse(await blobs.at(-1).text());
    equal(zeroJson.workLogReconciliation.totals.managementWorkLogged, 0);
    equal(zeroJson.workLogReconciliation.totals.residualWorkLogged, 0);
    equal(zero.reconciliation.workLogReconciliation.totals.residualWorkLogged, 99);
  } finally {
    URL.createObjectURL = originalCreate;
    root.remove();
  }
});

function legacyScreenReport(issues, storedResidual) {
  return {
    id: `screen-${storedResidual}`,
    calculationVersion: "1.0.0",
    teamName: "تیم",
    sprintName: "قدیم",
    normalizedData: { issues, capacityPeople: [] },
    mappingSnapshot: { personMappings: [], fieldMappings: {} },
    dataQuality: [],
    reconciliation: {
      reconciliationStatus: "passed",
      workLogReconciliation: { totals: { managementWorkLogged: storedResidual, mappedIndividualWorkLogged: storedResidual, residualWorkLogged: storedResidual }, rows: [] },
      planTypeReconciliation: { rows: [], carryOverIssues: [] },
      estimateReconciliation: { ownershipTotals: {}, rows: [] },
      qaReconciliation: { buckets: { blankQaOwner: { issueCount: 0, issueKeys: [] } }, mappedQaByPlan: [] },
      blockedTimeDistribution: { top20: [] }
    },
    calculatedMetrics: { management: { rawWorkLogged: { value: storedResidual, displayValue: "۰h", status: "ok" } }, people: [] }
  };
}

function mountReportScreen() {
  const root = document.createElement("div");
  root.innerHTML = `
    <p id="managementSubtitle"></p>
    <div id="filters"></div>
    <div id="qualitySummaryPanel"></div>
    <div id="sourceActionsPanel"></div>
    <p id="kpiPublicationNote"></p>
    <div id="managementCards"></div>
    <div id="issueTable"></div>
    <div id="scrumDashboards"></div>
    <div id="qualityReport"></div>
    <button id="exportReconciliationBtn" type="button"></button>
    <div id="reconciliationReport"></div>
    <button id="exportManagementExcelBtn" type="button"></button>
    <button id="exportScrumExcelBtn" type="button"></button>
    <button id="exportDataQualityExcelBtn" type="button"></button>`;
  document.body.append(root);
  return root;
}

async function blankWorkLogIssues() {
  return issuesFrom(await parseJiraWorkbook({ name: "screen-blank.xlsx" }, workbook([
    ["Key", "Status", "Σ Time Spent"],
    ["B-8", "Done", ""]
  ], (sheet) => {
    sheet.C2 = { t: "s", v: "", w: "" };
  })));
}

async function zeroWorkLogIssues() {
  return issuesFrom(await parseJiraWorkbook({ name: "screen-zero.xlsx" }, workbook([
    ["Key", "Status", "Σ Time Spent"],
    ["Z-8", "Done", 0]
  ], (sheet) => {
    sheet.C2.z = "[h]:mm";
  })));
}

function issueWorkLogCell(workbook, issueKey) {
  const worksheet = workbook.Sheets.Issues;
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: null });
  const column = rows[0].indexOf("Work Logged");
  const index = rows.findIndex((row) => row[0] === issueKey);
  return worksheet[XLSX.utils.encode_cell({ r: index, c: column })];
}

function storedReport(issues, rawWorkLogged) {
  return {
    id: "legacy-report",
    calculationVersion: "1.0.0",
    teamName: "تیم",
    sprintName: "قدیم",
    createdAt: "2026-01-01T00:00:00.000Z",
    normalizedData: { issues, capacityPeople: [] },
    mappingSnapshot: { personMappings: [], fieldMappings: {} },
    dataQuality: [],
    reconciliation: { workLogReconciliation: { totals: { residualWorkLogged: 0 } } },
    calculatedMetrics: { management: { rawWorkLogged }, people: [] }
  };
}

function readExport(report) {
  const bytes = XLSX.write(workbookFromSheets(savedReportWorkbookSheets(report)), { type: "array", bookType: "xlsx" });
  return XLSX.read(bytes, { type: "array" });
}

function metricCells(workbook, key) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets["Management KPI"], { header: 1, raw: true, defval: null });
  const index = rows.findIndex((row) => row[1] === key);
  return {
    display: workbook.Sheets["Management KPI"][XLSX.utils.encode_cell({ r: index, c: 2 })],
    calculated: workbook.Sheets["Management KPI"][XLSX.utils.encode_cell({ r: index, c: 3 })]
  };
}

function summaryText(workbook) {
  return XLSX.utils.sheet_to_json(workbook.Sheets.Summary, { header: 1, raw: true }).flat().join(" ");
}

function qualityText(workbook) {
  return XLSX.utils.sheet_to_json(workbook.Sheets["Data Quality"], { header: 1, raw: true }).flat().join(" ");
}

async function population(headers, rows, prepare) {
  const issues = issuesFrom(await parseJiraWorkbook({ name: "population.xlsx" }, workbook([headers, ...rows], prepare)));
  return { issues, metrics: calculateManagementMetrics(issues, [], []) };
}

function issueRow(issueKey, value, labels) {
  return {
    issueKey,
    summary: "Blocked dependency",
    labels,
    planType: "planned",
    raw: { "Σ Time Spent": value, __cellMeta: { "Σ Time Spent": { type: typeof value === "number" ? "n" : "s", format: typeof value === "number" ? "[h]:mm" : "General", rawValue: value } } }
  };
}
