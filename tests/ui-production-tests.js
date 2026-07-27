import { test, equal, ok } from "./test-helpers.js";
import { applyIssueFilters } from "../assets/js/controllers/filter-controller.js";
import { evaluateGenerateReadiness } from "../assets/js/views/upload-view.js";

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
