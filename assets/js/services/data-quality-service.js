import { REQUIRED_FIELDS } from "../utils/constants.js";
import { buildBlockedTimeWarnings } from "./reconciliation-service.js";
import { buildManagementWorkLogBreakdown, buildWorkLogQualityWarnings } from "./work-log-category-service.js";

export function buildQualityReport({ jira, fieldMap, capacity, issues, personMappings = [], workCategoryMapping }) {
  const items = [];
  if (!jira?.suggestedMainSheet) items.push(issue("error", "Missing main Jira sheet", "شیت اصلی Jira پیدا نشد."));
  if (!jira?.suggestedQaSheet) items.push(issue("warning", "Missing QA Return sheet", "شیت QA Return پیدا نشد."));
  REQUIRED_FIELDS.forEach((field) => {
    if (!fieldMap?.[field]) items.push(issue("error", "Missing required field", `فیلد ضروری ${field} نگاشت نشده است.`));
  });
  jira?.main?.headers?.forEach((header) => {
    if (!Object.values(fieldMap || {}).includes(header)) items.push(issue("info", "Unknown header", `ستون ناشناخته: ${header}`));
  });
  const seen = new Set();
  (issues || []).forEach((row) => {
    if (row.issueKey && seen.has(row.issueKeyComparable)) items.push(issue("warning", "Duplicate Issue Key", `کلید تکراری: ${row.issueKey}`));
    seen.add(row.issueKeyComparable);
    if (row.statusCanonical === "unknown") items.push(issue("warning", "Unknown Status", `${row.issueKey}: ${row.status}`));
    if (row.planType === "unknown") items.push(issue("warning", "Unknown Plan Type", `${row.issueKey}: ${row.planRaw}`));
    if (row.doneDate && row.created && new Date(row.doneDate) < new Date(row.created)) items.push(issue("warning", "Invalid date order", `${row.issueKey}: Done Date زودتر از Created است.`));
    if (row.doneDate && row.firstInProgress && new Date(row.doneDate) < new Date(row.firstInProgress)) items.push(issue("warning", "Invalid date order", `${row.issueKey}: Done Date زودتر از FirstInProgress است.`));
  });
  (capacity?.people || []).forEach((person) => {
    if (person.unresolved) items.push(issue("warning", "Merged or unnamed capacity columns", `ستون ظرفیت ${person.columnIndex + 1} نام مشخص ندارد.`));
    if (person.availableCapacity === null) items.push(issue("warning", "Missing capacity", `${person.capacityName}: ظرفیت آماده پیدا نشد.`));
  });
  items.push(...buildBlockedTimeWarnings(issues || []));
  const workLogBreakdown = buildManagementWorkLogBreakdown(issues || [], personMappings, fieldMap, workCategoryMapping);
  items.push(...buildWorkLogQualityWarnings(workLogBreakdown));
  return items;
}

export function issue(severity, code, message) {
  return { id: crypto.randomUUID(), severity, code, message };
}
