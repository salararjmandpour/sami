import { comparable } from "../services/normalization/string-normalizer.js";

export function readActiveFilters() {
  return {
    team: document.getElementById("teamFilter")?.value || "",
    sprint: document.getElementById("sprintFilter")?.value || "",
    dateFrom: document.getElementById("filterDateFrom")?.value || "",
    dateTo: document.getElementById("filterDateTo")?.value || "",
    person: document.getElementById("personFilter")?.value || "",
    role: document.getElementById("roleFilter")?.value || "",
    status: document.getElementById("statusFilter")?.value || "",
    planType: document.getElementById("planFilter")?.value || ""
  };
}

export function applyIssueFilters(report, filters = readActiveFilters()) {
  let issues = report?.normalizedData?.issues || [];
  if (filters.team && !comparable(report?.teamName || "").includes(comparable(filters.team))) return [];
  if (filters.sprint && !comparable(report?.sprintName || "").includes(comparable(filters.sprint))) return [];
  if (filters.status) issues = issues.filter((issue) => issue.statusCanonical === filters.status);
  if (filters.planType) issues = issues.filter((issue) => issue.planType === filters.planType);
  issues = filterIssuesByCreatedRange(issues, filters.dateFrom, filters.dateTo);
  if (filters.person) {
    const person = comparable(filters.person);
    issues = issues.filter((issue) => comparable(issue.assignee) === person || comparable(issue.qaOwner) === person);
  }
  if (filters.role) {
    const names = new Set((report.calculatedMetrics.people || []).filter((p) => p.role === filters.role).map((p) => comparable(p.name)));
    issues = issues.filter((issue) => names.has(comparable(filters.role === "qa" ? issue.qaOwner : issue.assignee)));
  }
  return issues;
}

export function filterIssuesByCreatedRange(issues, dateFrom, dateTo) {
  return partitionIssuesByCreatedRange(issues, dateFrom, dateTo).included;
}

export function partitionIssuesByCreatedRange(issues, dateFrom, dateTo) {
  const source = issues || [];
  if (!dateFrom && !dateTo) return { included: source, missingCreated: [], outsideRange: [] };
  const included = [];
  const missingCreated = [];
  const outsideRange = [];
  source.forEach((issue) => {
    const created = dateValue(issue?.created);
    if (created === null) {
      missingCreated.push(issue);
      return;
    }
    if ((dateFrom && created < dateValue(dateFrom)) || (dateTo && created > dateValue(dateTo))) {
      outsideRange.push(issue);
      return;
    }
    included.push(issue);
  });
  return { included, missingCreated, outsideRange };
}

function dateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
}
