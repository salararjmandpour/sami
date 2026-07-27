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

export function renderReport(report, reports, onOpenReport = () => {}) {
  if (!report) return;
  document.getElementById("managementSubtitle").textContent = `${report.teamName || "بدون تیم"} - ${report.sprintName || "بدون اسپرینت"}`;
  renderFilters(reports, report);
  renderQualitySummary(report);
  renderSourceActions(report);
  renderScrumDashboards(report.calculatedMetrics.people);
  renderQuality(report.dataQuality);
  renderFilteredViews(report);
  document.getElementById("reportFilter")?.addEventListener("change", (event) => {
    onOpenReport(reports.find((candidate) => candidate.id === event.target.value));
  });
  ["teamFilter", "sprintFilter", "filterDateFrom", "filterDateTo", "personFilter", "roleFilter", "statusFilter", "planFilter"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => renderFilteredViews(report));
    document.getElementById(id)?.addEventListener("change", () => renderFilteredViews(report));
  });
  document.getElementById("exportReconciliationBtn")?.addEventListener("click", () => exportJson("jira-kpi-reconciliation.json", report.reconciliation || {}));
}

function renderFilteredViews(report) {
  const filters = readActiveFilters();
  const filtered = applyIssueFilters(report, filters);
  const calculatedMetrics = {
    management: calculateManagementMetrics(filtered, report.normalizedData.capacityPeople, report.mappingSnapshot.personMappings),
    people: calculatePersonDashboards(filtered, report.normalizedData.capacityPeople, report.mappingSnapshot.personMappings)
  };
  const filteredReconciliation = buildReconciliation({
    report: { teamName: report.teamName, sprintName: report.sprintName, calculatedMetrics },
    issues: filtered,
    capacityPeople: report.normalizedData.capacityPeople,
    personMappings: report.mappingSnapshot.personMappings,
    fieldMappings: report.mappingSnapshot.fieldMappings,
    fileMetadata: report.files,
    dataQualityIssues: report.dataQuality
  });
  const filteredReport = { ...report, calculatedMetrics, normalizedData: { ...report.normalizedData, issues: filtered }, reconciliation: filteredReconciliation };
  renderKpiCards(calculatedMetrics.management, filteredReconciliation.drillDown || {}, filteredReport, filters);
  renderCharts(filteredReport);
  renderIssueTable(filtered);
  renderReconciliation(filteredReconciliation);
  document.getElementById("exportIssueCsvBtn")?.addEventListener("click", () => exportCsv("issues.csv", getIssueCsvRows(filtered)));
}
