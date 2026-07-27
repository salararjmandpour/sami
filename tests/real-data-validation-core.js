import { parseJiraWorkbook } from "../assets/js/services/parsers/jira-parser.js";
import { parseCapacityWorkbook } from "../assets/js/services/parsers/capacity-parser.js";
import { parseKpiDocx } from "../assets/js/services/parsers/kpi-docx-parser.js";
import { extractQaKeys, normalizeJiraRows } from "../assets/js/models/jira-model.js";
import { buildInitialPersonMappings } from "../assets/js/models/capacity-model.js";
import { normalizeKpiConfig } from "../assets/js/models/kpi-model.js";
import { calculateManagementMetrics, calculatePersonDashboards } from "../assets/js/services/calculations/report-calculator.js";
import { buildQualityReport, issue as qualityIssue } from "../assets/js/services/data-quality-service.js";
import { buildReconciliation } from "../assets/js/services/reconciliation-service.js";
import { defaultWorkCategoryMapping } from "../assets/js/services/work-log-category-service.js";
import { workingHoursBetween } from "../assets/js/services/holiday-service.js";
import { DEFAULT_HOLIDAYS } from "../assets/js/config/iran-holidays.js";
import { comparable, normalizeString } from "../assets/js/services/normalization/string-normalizer.js";
import { normalizeNumber } from "../assets/js/services/normalization/number-normalizer.js";
import { normalizePossibleExcelHours } from "../assets/js/services/normalization/unit-normalizer.js";
import { detectFileSignature } from "../assets/js/utils/file-signature.js";
import { sum, average, ratio } from "../assets/js/services/calculations/time-calculator.js";

const FILES = [
  { key: "jira", path: "../sample-data/jira.xlsx", name: "jira.xlsx", extension: "xlsx" },
  { key: "capacity", path: "../sample-data/capacity.xlsx", name: "capacity.xlsx", extension: "xlsx" },
  { key: "kpi", path: "../sample-data/kpi.docx", name: "kpi.docx", extension: "docx" }
];

export async function runRealDataValidation(customLoader) {
  const loadFile = customLoader || browserLoader;
  const loaded = {};
  for (const spec of FILES) loaded[spec.key] = await loadFile(spec);

  const jira = await parseJiraWorkbook(loaded.jira.file, loaded.jira.arrayBuffer);
  const capacity = await parseCapacityWorkbook(loaded.capacity.file, loaded.capacity.arrayBuffer);
  const kpi = await parseKpiDocx(loaded.kpi.file, loaded.kpi.arrayBuffer);
  const qaAnalysis = analyzeQa(jira);
  const issues = normalizeJiraRows(jira.main.rows, jira.fieldMap, qaAnalysis.uniqueKeys, DEFAULT_HOLIDAYS, workingHoursBetween);
  const mappings = buildInitialPersonMappings(capacity.people, issues, []);
  const workCategoryMapping = defaultWorkCategoryMapping();
  const quality = buildQualityReport({ jira, fieldMap: jira.fieldMap, capacity, issues, personMappings: mappings, workCategoryMapping });
  qaAnalysis.unmatchedKeys.forEach((key) => quality.push(qualityIssue("warning", "Unmatched QA Return Key", `QA Return key not found in main Jira dataset: ${key}`)));
  const management = calculateManagementMetrics(issues, capacity.people, mappings, workCategoryMapping);
  const people = calculatePersonDashboards(issues, capacity.people, mappings, workCategoryMapping);
  const report = {
    id: "real-data-validation",
    teamName: "Real Data",
    sprintName: jira.suggestedMainSheet,
    createdAt: new Date().toISOString(),
    calculatedMetrics: { management, people },
    workCategoryMapping
  };
  const reconciliation = buildReconciliation({
    report,
    issues,
    capacityPeople: capacity.people,
    personMappings: mappings,
    fieldMappings: jira.fieldMap,
    fileMetadata: {
      jira: { name: loaded.jira.file.name, size: loaded.jira.arrayBuffer.byteLength },
      capacity: { name: loaded.capacity.file.name, size: loaded.capacity.arrayBuffer.byteLength },
      kpi: { name: loaded.kpi.file.name, size: loaded.kpi.arrayBuffer.byteLength }
    },
    dataQualityIssues: quality
  });
  const checks = buildChecks({ jira, capacity, kpi, issues, mappings, qaAnalysis, quality });
  const details = buildMetricDetails(issues, capacity, mappings, people);
  return {
    generatedAt: new Date().toISOString(),
    files: buildFileDetection(loaded, { jira, capacity, kpi }),
    jira: analyzeJira(jira, issues),
    qaReturn: qaAnalysis,
    capacity: analyzeCapacity(capacity, mappings),
    kpi: analyzeKpi(kpi),
    mappings: mappings.map((m) => ({ capacityName: m.capacityName, jiraName: m.jiraName, role: m.role, workLogColumn: m.workLogColumn, status: m.capacityName && m.jiraName && m.workLogColumn ? "mapped" : "incomplete" })),
    management,
    people,
    metricDetails: details,
    reconciliation,
    workLogBreakdown: management.workLogBreakdown,
    personWorkLogBreakdowns: people.map((person) => ({ person: person.name, role: person.role, ...person.workLogBreakdown })),
    dataQuality: { counts: countBy(quality, "severity"), issues: quality },
    checks
  };
}

async function browserLoader(spec) {
  const response = await fetch(spec.path);
  if (!response.ok) throw new Error(`Cannot load ${spec.path}: HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const file = typeof File !== "undefined" ? new File([arrayBuffer], spec.name) : { name: spec.name, size: arrayBuffer.byteLength };
  return { spec, file, arrayBuffer };
}

function buildFileDetection(loaded, parsed) {
  return Object.fromEntries(Object.entries(loaded).map(([key, item]) => {
    const signature = detectFileSignature(item.arrayBuffer);
    const actual = signature === "zip" ? (key === "kpi" ? "docx/zip" : "xlsx/zip") : signature === "ole" ? "xls/ole" : "unknown";
    const extensionMatches = key === "capacity" ? signature === "zip" : signature === "zip";
    return [key, {
      fileName: item.file.name,
      size: item.arrayBuffer.byteLength,
      signature,
      actualFormat: actual,
      extensionMatches,
      sheets: parsed[key]?.diagnostics?.sheets || (parsed[key]?.selectedSheet ? [{ sheetName: parsed[key].selectedSheet, rows: parsed[key].diagnostics.rows, columns: parsed[key].diagnostics.columns, merges: parsed[key].diagnostics.merges }] : []),
      docxTableCount: parsed[key]?.diagnostics?.tableCount || null
    }];
  }));
}

function analyzeJira(jira, issues) {
  const allRows = jira.main.rows;
  const keys = allRows.map((row) => normalizeString(row[jira.fieldMap.issueKey])).filter(Boolean);
  const keyCounts = countValues(keys.map(comparable));
  return {
    sheetNames: jira.sheetNames,
    suggestedMainSheet: jira.suggestedMainSheet,
    suggestedQaSheet: jira.suggestedQaSheet,
    headers: jira.main.headers,
    originalHeaders: jira.main.originalHeaders,
    fieldMap: jira.fieldMap,
    totalRows: allRows.length,
    issueCount: issues.length,
    uniqueIssueKeys: new Set(keys.map(comparable)).size,
    duplicateIssueKeys: Object.entries(keyCounts).filter(([, count]) => count > 1).length,
    rowsWithoutIssueKeys: allRows.length - keys.length,
    invalidDates: issues.filter((issue) => (issue.doneDate && issue.created && new Date(issue.doneDate) < new Date(issue.created)) || (issue.doneDate && issue.firstInProgress && new Date(issue.doneDate) < new Date(issue.firstInProgress))).length,
    invalidEstimates: issues.filter((issue) => issue.devEstimate === null && issue.testEstimate === null).length,
    originalStatuses: distinct(issues.map((issue) => issue.status)),
    normalizedStatuses: distinct(issues.map((issue) => issue.statusCanonical)),
    originalPlanTypes: distinct(issues.map((issue) => issue.planRaw || "(empty)")),
    normalizedPlanTypes: distinct(issues.map((issue) => issue.planType)),
    labels: distinct(issues.flatMap((issue) => issue.labels)),
    assignees: distinct(issues.map((issue) => issue.assignee).filter(Boolean)),
    qaOwners: distinct(issues.map((issue) => issue.qaOwner).filter(Boolean))
  };
}

function analyzeQa(jira) {
  const rawKeys = jira.qa.rows.map((row) => normalizeString(row[jira.qa.headers.includes("Key") ? "Key" : jira.qa.headers[0]])).filter(Boolean);
  const counts = countValues(rawKeys.map(comparable));
  const uniqueKeys = new Set(rawKeys);
  const mainKeys = new Set(jira.main.rows.map((row) => comparable(row[jira.fieldMap.issueKey])).filter(Boolean));
  const matchedKeys = [...uniqueKeys].filter((key) => mainKeys.has(comparable(key)));
  const unmatchedKeys = [...uniqueKeys].filter((key) => !mainKeys.has(comparable(key)));
  return {
    nonEmptyRows: rawKeys.length,
    uniqueCount: uniqueKeys.size,
    duplicateCount: Object.values(counts).filter((count) => count > 1).length,
    matchedCount: matchedKeys.length,
    unmatchedCount: unmatchedKeys.length,
    matchedKeys,
    unmatchedKeys,
    uniqueKeys: [...uniqueKeys]
  };
}

function analyzeCapacity(capacity, mappings) {
  return {
    sheetNames: capacity.sheetNames,
    selectedSheet: capacity.selectedSheet,
    rows: capacity.diagnostics.rows,
    columns: capacity.diagnostics.columns,
    merges: capacity.diagnostics.merges,
    formulas: capacity.diagnostics.formulas,
    summaryRows: capacity.diagnostics.summaryRows,
    personCount: capacity.people.length,
    people: capacity.people.map((person) => {
      const mapping = mappings.find((m) => comparable(m.capacityName) === comparable(person.capacityName));
      return { ...person, resolvedPerson: mapping?.jiraName || "", role: mapping?.role || "", workLogColumn: mapping?.workLogColumn || "", mappingStatus: mapping?.jiraName ? "mapped" : "unmapped" };
    })
  };
}

function analyzeKpi(kpi) {
  const normalized = normalizeKpiConfig(kpi.kpis);
  return {
    tableCount: kpi.diagnostics.tableCount,
    rowsPerTable: kpi.diagnostics.rowsPerTable,
    headers: kpi.diagnostics.headers,
    definitionCount: kpi.kpis.length,
    definitions: normalized,
    supported: normalized.filter((item) => item.calculationKey !== "unsupported").map((item) => item.name),
    unsupported: normalized.filter((item) => item.calculationKey === "unsupported").map((item) => item.name)
  };
}

function buildMetricDetails(issues, capacity, mappings, people) {
  const planned = issues.filter((i) => i.planType === "planned");
  const unplanned = issues.filter((i) => i.planType === "unplanned");
  const carry = issues.filter((i) => i.planType === "carry_over");
  const assigned = issues.filter((i) => ["planned", "unplanned"].includes(i.planType));
  const submitted = issues.filter((i) => i.firstAutomationTest);
  const qaReturned = issues.filter((i) => i.qaReturned && i.firstAutomationTest);
  const totalCapacity = sumUniqueCapacity(capacity.people, mappings);
  const estimated = sum(issues.map((i) => (i.devEstimate || 0) + (i.testEstimate || 0)));
  const workLogged = sum(issues.map((i) => i.workLogged || 0));
  return {
    management: [
      row("Capacity Utilization", sum([...planned, ...unplanned].map((i) => (i.devEstimate || 0) + (i.testEstimate || 0))), totalCapacity, "%", ratio(sum([...planned, ...unplanned].map((i) => (i.devEstimate || 0) + (i.testEstimate || 0))), totalCapacity), assigned.map((i) => i.issueKey)),
      row("Planned Work", sum(planned.map((i) => (i.devEstimate || 0) + (i.testEstimate || 0))), null, "h", sum(planned.map((i) => (i.devEstimate || 0) + (i.testEstimate || 0))), planned.map((i) => i.issueKey)),
      row("Unplanned Work", sum(unplanned.map((i) => (i.devEstimate || 0) + (i.testEstimate || 0))), null, "h", sum(unplanned.map((i) => (i.devEstimate || 0) + (i.testEstimate || 0))), unplanned.map((i) => i.issueKey)),
      row("Carry Over", sum(carry.map((i) => (i.devEstimate || 0) + (i.testEstimate || 0))), null, "h", sum(carry.map((i) => (i.devEstimate || 0) + (i.testEstimate || 0))), carry.map((i) => i.issueKey)),
      row("Delivery Rate Develop", assigned.filter((i) => ["code_review", "automation_test", "manual_test", "done"].includes(i.statusCanonical)).length, assigned.length, "%", ratio(assigned.filter((i) => ["code_review", "automation_test", "manual_test", "done"].includes(i.statusCanonical)).length, assigned.length), assigned.map((i) => i.issueKey)),
      row("Delivery Rate", assigned.filter((i) => i.statusCanonical === "done").length, assigned.length, "%", ratio(assigned.filter((i) => i.statusCanonical === "done").length, assigned.length), assigned.map((i) => i.issueKey)),
      row("Submitted to QA", submitted.length, null, "count", submitted.length, submitted.map((i) => i.issueKey)),
      row("QA Return Rate", qaReturned.length, submitted.length, "%", ratio(qaReturned.length, submitted.length), qaReturned.map((i) => i.issueKey)),
      row("First Pass Rate", submitted.length - qaReturned.length, submitted.length, "%", ratio(submitted.length - qaReturned.length, submitted.length), submitted.filter((i) => !i.qaReturned).map((i) => i.issueKey)),
      row("Hotfix Count", issues.filter((i) => i.labels.includes("hotfix")).length, null, "count", issues.filter((i) => i.labels.includes("hotfix")).length, issues.filter((i) => i.labels.includes("hotfix")).map((i) => i.issueKey)),
      row("Bug Fix Count", issues.filter((i) => i.labels.includes("bugfix")).length, null, "count", issues.filter((i) => i.labels.includes("bugfix")).length, issues.filter((i) => i.labels.includes("bugfix")).map((i) => i.issueKey)),
      row("Lead Time", sum(issues.map((i) => i.leadTimeHours || 0)), issues.filter((i) => i.leadTimeHours !== null).length, "h avg", average(issues.map((i) => i.leadTimeHours)), issues.filter((i) => i.leadTimeHours !== null).map((i) => i.issueKey)),
      row("Cycle Time", sum(issues.map((i) => i.cycleTimeHours || 0)), issues.filter((i) => i.cycleTimeHours !== null).length, "h avg", average(issues.map((i) => i.cycleTimeHours)), issues.filter((i) => i.cycleTimeHours !== null).map((i) => i.issueKey)),
      row("Blocked Time", sum(issues.map((i) => i.blockedHours || 0)), null, "h", sum(issues.map((i) => i.blockedHours || 0)), issues.filter((i) => i.blockedHours).map((i) => i.issueKey)),
      row("Estimation Accuracy", estimated, workLogged, "%", ratio(estimated, workLogged), issues.map((i) => i.issueKey)),
      row("Time Variance", workLogged - estimated, null, "h", workLogged - estimated, issues.map((i) => i.issueKey))
    ],
    people: people.map((person) => ({ name: person.name, role: person.role, metrics: person.metrics }))
  };
}

function row(kpiName, numerator, denominator, unit, result, issueKeys) {
  return { kpiName, numerator, denominator, result, unit, status: result === null || result === undefined || Number.isNaN(result) ? "unavailable" : "ok", issueKeys };
}

function buildChecks({ jira, capacity, kpi, issues, mappings, qaAnalysis, quality }) {
  return [
    check("Actual Jira sheet name", jira.suggestedMainSheet === "sprint 26.1", jira.suggestedMainSheet),
    check("Actual QA Return sheet detected with trailing space", comparable(jira.suggestedQaSheet) === "qa return", jira.suggestedQaSheet),
    check("Leading FirstInProgress header mapped", jira.fieldMap.firstInProgress === "FirstInProgress", jira.fieldMap.firstInProgress),
    check("Leading Done Date header mapped", jira.fieldMap.doneDate === "Done Date", jira.fieldMap.doneDate),
    check("Contact point mapped", jira.fieldMap.qaOwner === "Contact point", jira.fieldMap.qaOwner),
    check("Capacity actual format is OLE", capacity.signature === "ole", capacity.signature),
    check("Capacity summary row detected", Boolean(capacity.diagnostics.summaryRows.total), capacity.diagnostics.summaryRows.total),
    check("Merged QA capacity columns split", capacity.people.some((p) => comparable(p.capacityName) === comparable("سپیده")) && capacity.people.some((p) => comparable(p.capacityName) === comparable("علی")), capacity.people.map((p) => p.capacityName).join(", ")),
    check("KPI DOCX tables extracted", kpi.diagnostics.tableCount > 0, kpi.diagnostics.tableCount),
    check("QA Return matched keys", qaAnalysis.matchedCount > 0, qaAnalysis.matchedCount),
    check("No critical data-quality errors", !quality.some((item) => item.severity === "error"), countBy(quality, "severity").error || 0),
    check("Mappings include all expected people", mappings.filter((m) => m.capacityName && m.jiraName).length >= 7, mappings.filter((m) => m.capacityName && m.jiraName).length),
    check("Duration conversion produced work logged", sum(issues.map((i) => i.workLogged || 0)) > 0, sum(issues.map((i) => i.workLogged || 0)))
  ];
}

function check(name, pass, actual) {
  return { name, pass: Boolean(pass), actual };
}

function sumUniqueCapacity(people, mappings) {
  const used = new Set();
  return mappings.reduce((total, mapping) => {
    const person = people.find((p) => p.id === mapping.capacityId || comparable(p.capacityName) === comparable(mapping.capacityName));
    if (!person || used.has(person.id)) return total;
    used.add(person.id);
    return total + (person.availableCapacity || 0);
  }, 0);
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function countValues(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function distinct(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))].sort();
}
