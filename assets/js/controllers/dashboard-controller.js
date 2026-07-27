import { renderKpiCards, renderFilters, renderQualitySummary, renderSourceActions } from "../views/management-view.js";
import { renderCharts } from "../views/chart-view.js";
import { getIssueCsvRows, renderIssueTable } from "../views/table-view.js";
import { renderScrumDashboards } from "../views/scrum-view.js";
import { renderQuality } from "../views/quality-view.js";
import { renderReconciliation } from "../views/reconciliation-view.js";
import { applyIssueFilters, readActiveFilters } from "./filter-controller.js";
import { calculateManagementMetrics, calculatePersonDashboards } from "../services/calculations/report-calculator.js";
import { buildReconciliation } from "../services/reconciliation-service.js";
import { exportCsv, exportJson } from "../services/export-service.js";
import { dbPut } from "../services/indexeddb-service.js";
import { CALCULATION_VERSION } from "../utils/constants.js";

export function renderReport(report, reports, onOpenReport = () => {}) {
  if (!report) return;
  document.getElementById("managementSubtitle").textContent = `${report.teamName || "بدون تیم"} - ${report.sprintName || "بدون اسپرینت"}`;
  renderFilters(reports, report);
  renderQualitySummary(report);
  renderSourceActions(report);
  renderScrumDashboards(report.calculatedMetrics.people);
  renderQuality(report.dataQuality);
  renderFilteredViews(report);
  document.getElementById("recalculateReportBtn")?.addEventListener("click", async () => {
    if (!confirm(`گزارش با نسخه ${CALCULATION_VERSION} دوباره محاسبه شود؟ گزارش قبلی تغییر نمی‌کند.`)) return;
    const recalculated = recalculateReportCopy(report);
    await dbPut("reports", recalculated);
    await dbPut("metricResults", { id: recalculated.id, calculatedMetrics: recalculated.calculatedMetrics, calculationVersion: recalculated.calculationVersion });
    onOpenReport(recalculated);
  });
  document.getElementById("reportFilter")?.addEventListener("change", (event) => {
    onOpenReport(reports.find((candidate) => candidate.id === event.target.value));
  });
  ["teamFilter", "sprintFilter", "filterDateFrom", "filterDateTo", "personFilter", "roleFilter", "statusFilter", "planFilter"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => renderFilteredViews(report));
    document.getElementById(id)?.addEventListener("change", () => renderFilteredViews(report));
  });
  document.getElementById("exportReconciliationBtn")?.addEventListener("click", () => exportJson("jira-kpi-reconciliation.json", report.reconciliation || {}));
}

function recalculateReportCopy(report) {
  const management = calculateManagementMetrics(report.normalizedData.issues, report.normalizedData.capacityPeople, report.mappingSnapshot.personMappings, report.workCategoryMapping);
  const people = calculatePersonDashboards(report.normalizedData.issues, report.normalizedData.capacityPeople, report.mappingSnapshot.personMappings, report.workCategoryMapping);
  const calculatedMetrics = { management, people };
  const reconciliation = buildReconciliation({
    report: { teamName: report.teamName, sprintName: report.sprintName, calculatedMetrics, workCategoryMapping: report.workCategoryMapping },
    issues: report.normalizedData.issues,
    capacityPeople: report.normalizedData.capacityPeople,
    personMappings: report.mappingSnapshot.personMappings,
    fieldMappings: report.mappingSnapshot.fieldMappings,
    fileMetadata: report.files,
    dataQualityIssues: report.dataQuality
  });
  return {
    ...report,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    calculationVersion: CALCULATION_VERSION,
    calculatedMetrics,
    reconciliation,
    workLogBreakdown: management.workLogBreakdown,
    personWorkLogBreakdowns: people.map((person) => ({ person: person.name, role: person.role, ...person.workLogBreakdown }))
  };
}

function renderFilteredViews(report) {
  const filters = readActiveFilters();
  const filtered = applyIssueFilters(report, filters);
  const calculatedMetrics = {
    management: calculateManagementMetrics(filtered, report.normalizedData.capacityPeople, report.mappingSnapshot.personMappings, report.workCategoryMapping),
    people: calculatePersonDashboards(filtered, report.normalizedData.capacityPeople, report.mappingSnapshot.personMappings, report.workCategoryMapping)
  };
  const filteredReconciliation = buildReconciliation({
    report: { teamName: report.teamName, sprintName: report.sprintName, calculatedMetrics, workCategoryMapping: report.workCategoryMapping },
    issues: filtered,
    capacityPeople: report.normalizedData.capacityPeople,
    personMappings: report.mappingSnapshot.personMappings,
    fieldMappings: report.mappingSnapshot.fieldMappings,
    fileMetadata: report.files,
    dataQualityIssues: report.dataQuality
  });
  const filteredReport = { ...report, calculatedMetrics, normalizedData: { ...report.normalizedData, issues: filtered }, reconciliation: filteredReconciliation };
  attachIssueWorkLogBreakdown(filtered, calculatedMetrics.management.workLogBreakdown);
  renderKpiCards(calculatedMetrics.management, filteredReconciliation.drillDown || {}, filteredReport, filters);
  renderCharts(filteredReport);
  renderIssueTable(filtered);
  renderReconciliation(filteredReconciliation);
  document.getElementById("exportIssueCsvBtn")?.addEventListener("click", () => exportCsv("issues.csv", getIssueCsvRows(filtered)));
}

function attachIssueWorkLogBreakdown(issues, breakdown) {
  const rows = new Map((breakdown?.rows || []).map((row) => [row.issueKey, row]));
  issues.forEach((issue) => {
    issue.workLogCategoryBreakdown = rows.get(issue.issueKey) || null;
  });
}
