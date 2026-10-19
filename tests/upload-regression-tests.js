import { test, equal, ok } from "./test-helpers.js";
import { parseJiraWorkbook } from "../assets/js/services/parsers/jira-parser.js";
import { parseCapacityWorkbook } from "../assets/js/services/parsers/capacity-parser.js";
import { parseKpiDocx } from "../assets/js/services/parsers/kpi-docx-parser.js";
import { clearParsedUploads, parseIntoState } from "../assets/js/controllers/upload-controller.js";
import { sameSelection } from "../assets/js/utils/upload-selection.js";
import { applyIssueFilters, filterIssuesByCreatedRange } from "../assets/js/controllers/filter-controller.js";
import { buildInitialPersonMappings } from "../assets/js/models/capacity-model.js";
import { duplicatedSettingsFromReport } from "../assets/js/controllers/history-controller.js";

function workbookBuffer(rows, sheetName = "Sprint") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
}

test("Empty Jira workbook is rejected", async () => {
  let failed = false;
  try {
    await parseJiraWorkbook({ name: "empty.xlsx" }, new ArrayBuffer(0));
  } catch (error) {
    failed = error.message.includes("خالی");
  }
  ok(failed);
});

test("Random bytes are not accepted as a Jira workbook", async () => {
  let failed = false;
  try {
    await parseJiraWorkbook({ name: "bad.xlsx" }, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 0]).buffer);
  } catch (error) {
    failed = error.message.includes("قالب");
  }
  ok(failed);
});

test("Jira workbook without required columns is rejected", async () => {
  let failed = false;
  try {
    await parseJiraWorkbook({ name: "jira.xlsx" }, workbookBuffer([["Summary"], ["کار"]]));
  } catch (error) {
    failed = error.message.includes("کلید");
  }
  ok(failed);
});

test("Jira workbook with headers but no issue rows is rejected", async () => {
  let failed = false;
  try {
    await parseJiraWorkbook({ name: "jira.xlsx" }, workbookBuffer([["Key", "Status"]]));
  } catch (error) {
    failed = error.message.includes("ردیف");
  }
  ok(failed);
});

test("Valid minimal Jira workbook is accepted", async () => {
  const parsed = await parseJiraWorkbook({ name: "jira.xlsx" }, workbookBuffer([["Key", "Status", "Summary"], ["A-1", "Done", "کار"]]));
  equal(parsed.main.rows.length, 1);
  equal(parsed.fieldMap.issueKey, "Key");
});

test("Empty KPI document is rejected", async () => {
  let failed = false;
  try {
    await parseKpiDocx({ name: "empty.docx" }, new ArrayBuffer(0));
  } catch (error) {
    failed = error.message.includes("خالی");
  }
  ok(failed);
});

test("Empty capacity workbook is rejected", async () => {
  let failed = false;
  try {
    await parseCapacityWorkbook({ name: "empty.xlsx" }, new ArrayBuffer(0));
  } catch (error) {
    failed = error.message.includes("خالی");
  }
  ok(failed);
});

test("Capacity workbook without a person column is rejected", async () => {
  let failed = false;
  try {
    await parseCapacityWorkbook({ name: "capacity.xlsx" }, workbookBuffer([["کل ظرفیت"]]));
  } catch (error) {
    failed = /ستون|شیت/.test(error.message);
  }
  ok(failed);
});

test("Failed capacity parse clears previously parsed upload state", async () => {
  const state = { jira: { stale: true }, capacity: { stale: true }, kpi: { stale: true }, parsedSelection: { jira: "old", capacity: "old", kpi: "old" } };
  let failed = false;
  try {
    await parseIntoState(
      state,
      { jira: { name: "jira.xlsx" }, capacity: { name: "capacity.xlsx" }, kpi: { name: "kpi.docx" } },
      { jira: workbookBuffer([["Key", "Status"], ["A-1", "Done"]]), capacity: new Uint8Array([9, 9, 9, 0]).buffer, kpi: new ArrayBuffer(0) },
      { jira: "1", capacity: "2", kpi: "3" }
    );
  } catch {
    failed = true;
  }
  ok(failed);
  equal(state.jira, null);
  equal(state.capacity, null);
  equal(state.kpi, null);
  equal(state.parsedSelection, null);
});

test("Parsed selection must match the current files", () => {
  equal(sameSelection({ jira: "a", capacity: "b", kpi: "c" }, { jira: "a", capacity: "b", kpi: "c" }), true);
  equal(sameSelection({ jira: "a", capacity: "b", kpi: "c" }, { jira: "a", capacity: "changed", kpi: "c" }), false);
  const state = { jira: {}, capacity: {}, kpi: {}, parsedSelection: { jira: "a", capacity: "b", kpi: "c" } };
  clearParsedUploads(state);
  equal(state.parsedSelection, null);
});

test("Date range excludes issues with no created date and issues outside the range", () => {
  const issues = [
    { issueKey: "IN", created: "2026-01-05T00:00:00.000Z" },
    { issueKey: "OUT", created: "2026-02-01T00:00:00.000Z" },
    { issueKey: "MISSING" }
  ];
  const filtered = filterIssuesByCreatedRange(issues, "2026-01-01", "2026-01-31");
  equal(filtered.length, 1);
  equal(filtered[0].issueKey, "IN");
  equal(filterIssuesByCreatedRange(issues, "", "").length, 3);
  equal(applyIssueFilters({ teamName: "Core", normalizedData: { issues } }, { dateFrom: "2026-01-01", dateTo: "2026-01-31" }).length, 1);
});

test("Default people are not added when absent from the capacity file", () => {
  const mappings = buildInitialPersonMappings([{ id: "p1", capacityName: "شخص جدید" }], [], []);
  equal(mappings.length, 1);
  equal(mappings[0].capacityName, "شخص جدید");
  equal(mappings.some((mapping) => mapping.capacityName === "امید"), false);
});

test("Default person mapping still enriches a matching capacity column", () => {
  const mappings = buildInitialPersonMappings([{ id: "p1", capacityName: "امید" }], [], []);
  equal(mappings.length, 1);
  equal(mappings[0].jiraName, "Omid Dehghan");
  equal(mappings[0].role, "developer");
});

test("Copy settings captures report metadata and mappings", () => {
  const settings = duplicatedSettingsFromReport({
    teamName: "تیم محصول",
    sprintName: "26.1",
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
    mappingSnapshot: { fieldMappings: { issueKey: "Key" }, personMappings: [{ jiraName: "Ali" }] }
  });
  equal(settings.metadata.teamName, "تیم محصول");
  equal(settings.metadata.sprintName, "26.1");
  equal(settings.metadata.dateFrom, "2026-01-01");
  equal(settings.mappingSnapshot.personMappings[0].jiraName, "Ali");
});

test("Original sample files remain readable", async () => {
  const [jira, capacity, kpi] = await Promise.all([
    fetch("../sample-data/jira.xlsx").then((response) => response.arrayBuffer()),
    fetch("../sample-data/capacity.xlsx").then((response) => response.arrayBuffer()),
    fetch("../sample-data/kpi.docx").then((response) => response.arrayBuffer())
  ]);
  const parsedJira = await parseJiraWorkbook({ name: "jira.xlsx" }, jira);
  const parsedCapacity = await parseCapacityWorkbook({ name: "capacity.xlsx" }, capacity);
  const parsedKpi = await parseKpiDocx({ name: "kpi.docx" }, kpi);
  equal(parsedJira.suggestedMainSheet, "sprint 26.1");
  ok(parsedCapacity.people.some((person) => person.capacityName === "سپیده"));
  equal(parsedKpi.kpis.length, 18);
});
