import { REQUIRED_FIELDS } from "../utils/constants.js";
import { buildBlockedTimeWarnings } from "./reconciliation-service.js";
import { buildManagementWorkLogBreakdown, buildWorkLogQualityWarnings } from "./work-log-category-service.js";
import { startDetectionSource } from "./normalization/status-normalizer.js";

export function buildQualityReport({ jira, fieldMap, capacity, issues, personMappings = [], workCategoryMapping }) {
  const items = [];
  if (!jira?.suggestedMainSheet) items.push(issue("error", "Missing main Jira sheet", "Jira main sheet was not detected."));
  if (!jira?.suggestedQaSheet) items.push(issue("warning", "Missing QA Return sheet", "QA Return sheet was not detected."));
  REQUIRED_FIELDS.forEach((field) => {
    if (!fieldMap?.[field]) items.push(issue("error", "Missing required field", `Required field ${field} is not mapped.`));
  });
  jira?.main?.headers?.forEach((header) => {
    if (!Object.values(fieldMap || {}).includes(header)) items.push(issue("info", "Unknown header", `Unknown header: ${header}`));
  });
  const seen = new Set();
  (issues || []).forEach((row) => {
    if (row.issueKey && seen.has(row.issueKeyComparable)) items.push(issue("warning", "Duplicate Issue Key", `Duplicate Issue Key source row: ${row.issueKey}`));
    seen.add(row.issueKeyComparable);
    if (row.statusCanonical === "unknown") items.push(issue("warning", "Unknown Status", `${row.issueKey}: ${row.status}`));
    if (row.planType === "unknown") items.push(issue("warning", "Unknown Plan Type", `${row.issueKey}: ${row.planRaw}`));
    if (startDetectionSource(row) === "current-status") items.push(issue("warning", "Started status detected only from current status because history was unavailable", `${row.issueKey}: current status is ${row.status}`));
    if (row.workLogged !== null && (!Number.isFinite(row.workLogged) || row.workLogged < 0)) items.push(issue("warning", "Invalid work-log value", `${row.issueKey}: Work Logged is ${row.workLogged}`));
    if (row.doneDate && row.created && new Date(row.doneDate) < new Date(row.created)) items.push(issue("warning", "Invalid date order", `${row.issueKey}: Done Date is earlier than Created.`));
    if (row.doneDate && row.firstInProgress && new Date(row.doneDate) < new Date(row.firstInProgress)) items.push(issue("warning", "Invalid date order", `${row.issueKey}: Done Date is earlier than FirstInProgress.`));
  });
  (capacity?.people || []).forEach((person) => {
    if (person.unresolved) items.push(issue("warning", "Merged or unnamed capacity columns", `Capacity column ${person.columnIndex + 1} has no resolved person name.`));
    if (person.availableCapacity === null) items.push(issue("warning", "Missing capacity", `${person.capacityName}: total capacity is missing.`));
    if (person.capacitySources?.planned === "fallback-80-percent") items.push(issue("warning", "Planned Capacity missing and fallback applied", `${person.capacityName}: Planned Capacity = Total Capacity * 80%`));
    if (person.capacitySources?.unplanned === "fallback-20-percent") items.push(issue("warning", "Unplanned Capacity missing and fallback applied", `${person.capacityName}: Unplanned Capacity = Total Capacity * 20%`));
    if (person.capacitySources?.total === "missing") items.push(issue("warning", "Total Capacity missing", `${person.capacityName}: Total Capacity is missing`));
    if ([person.availableCapacity, person.plannedCapacity, person.unplannedCapacity].some((value) => value !== null && value !== undefined && (!Number.isFinite(value) || value < 0))) items.push(issue("warning", "Invalid or negative capacity", `${person.capacityName}: capacity contains invalid or negative values`));
    if (Number.isFinite(person.availableCapacity) && Number.isFinite(person.plannedCapacity) && Number.isFinite(person.unplannedCapacity) && Math.abs(person.plannedCapacity + person.unplannedCapacity - person.availableCapacity) > 0.01) items.push(issue("warning", "Planned Capacity plus Unplanned Capacity differs materially from Total Capacity", `${person.capacityName}: planned + unplanned = ${person.plannedCapacity + person.unplannedCapacity}, total = ${person.availableCapacity}`));
  });
  const hasPersonWorkColumns = personMappings.some((mapping) => mapping.workLogColumn);
  if (!hasPersonWorkColumns && (issues || []).some((row) => row.planType === "carry_over" && row.workLogged > 0)) {
    items.push(issue("warning", "Carry-over issue has issue-level Work Logged but no per-person work-log allocation", "Developer carry-over logged time cannot be allocated without mapped person work-log columns."));
  }
  items.push(...buildBlockedTimeWarnings(issues || []));
  const workLogBreakdown = buildManagementWorkLogBreakdown(issues || [], personMappings, fieldMap, workCategoryMapping);
  items.push(...buildWorkLogQualityWarnings(workLogBreakdown));
  return items;
}

export function issue(severity, code, message) {
  return { id: crypto.randomUUID(), severity, code, message };
}
