import { FIELD_ALIASES } from "../config/field-aliases.js";
import { WORK_CATEGORY_MAPPING, WORK_CATEGORY_PRIORITY } from "../config/work-category-mapping.js";
import { comparable, normalizeString } from "./normalization/string-normalizer.js";
import { normalizePossibleExcelHours } from "./normalization/unit-normalizer.js";
import { sum } from "./calculations/time-calculator.js";

const TOLERANCE = 0.01;
const CATEGORY_KEYS = ["productive", "block", "meeting", "technical", "version"];

export function defaultWorkCategoryMapping() {
  return structuredCloneSafe(WORK_CATEGORY_MAPPING);
}

export function mergeWorkCategoryMapping(custom = {}) {
  const base = defaultWorkCategoryMapping();
  for (const key of WORK_CATEGORY_PRIORITY) {
    base[key] ||= { labels: [], titlePatterns: [] };
    const customCategory = custom[key] || {};
    base[key].labels = uniqueNormalized([...(base[key].labels || []), ...(customCategory.labels || [])]);
    base[key].titlePatterns = uniqueNormalized([...(base[key].titlePatterns || []), ...(customCategory.titlePatterns || [])]);
  }
  return base;
}

export function classifyIssue(issue, mapping = WORK_CATEGORY_MAPPING) {
  const labelMatches = [];
  const titleMatches = [];
  const labels = (issue.labels || []).map(categoryComparable);
  const title = categoryComparable(issue.summary || "");
  const titleTokens = tokenize(title);
  for (const category of WORK_CATEGORY_PRIORITY) {
    const rules = mapping[category] || {};
    const matchedLabels = (rules.labels || []).filter((alias) => labels.includes(categoryComparable(alias)));
    const matchedTitles = (rules.titlePatterns || []).filter((pattern) => phraseMatches(titleTokens, categoryComparable(pattern)));
    if (matchedLabels.length) labelMatches.push({ category, values: matchedLabels });
    if (matchedTitles.length) titleMatches.push({ category, values: matchedTitles });
  }
  const matchedCategories = uniqueNormalized([...labelMatches, ...titleMatches].map((match) => match.category));
  const selected = WORK_CATEGORY_PRIORITY.find((category) => matchedCategories.includes(category)) || "productive";
  return {
    category: selected,
    matchedCategories,
    matchedBy: [
      ...labelMatches.map((match) => ({ source: "label", category: match.category, values: match.values })),
      ...titleMatches.map((match) => ({ source: "summary", category: match.category, values: match.values }))
    ],
    priority: [...WORK_CATEGORY_PRIORITY, "productive"],
    originalSummary: issue.summary || "",
    originalLabels: issue.labels || []
  };
}

export function buildManagementWorkLogBreakdown(issues, personMappings = [], fieldMappings = {}, categoryMapping = WORK_CATEGORY_MAPPING) {
  const sourceColumn = selectManagementWorkLogColumn(issues, personMappings);
  const rows = issues.map((issue) => {
    if (sourceColumn) return issueBreakdown(issue, sourceColumn, categoryMapping);
    return issueBreakdown({ ...issue, workLogged: sumMappedPersonColumns(issue, personMappings) }, "", categoryMapping);
  });
  return finalizeBreakdown(rows, { sourceColumn, scope: "management" });
}

export function buildPersonWorkLogBreakdown(issues, mapping, categoryMapping = WORK_CATEGORY_MAPPING) {
  const column = mapping?.workLogColumn || "";
  const rows = issues.map((issue) => issueBreakdown(issue, column, categoryMapping)).filter((row) => row.rawWorkLoggedHours !== 0);
  return finalizeBreakdown(rows, { sourceColumn: column, scope: "person", person: mapping?.jiraName || "", role: mapping?.role || "" });
}

export function buildWorkLogQualityWarnings(breakdown) {
  const warnings = [];
  (breakdown?.rows || []).forEach((row) => {
    if (row.matchedCategories.length > 1) {
      warnings.push(dq("warning", "Multiple Work Categories Matched", `${row.issueKey}: matched ${row.matchedCategories.join(", ")}; selected ${row.workCategory} by priority ${row.priority.join(" > ")}`, row));
    }
    if (row.rawProductiveWorkLoggedHours < -TOLERANCE) {
      warnings.push(dq("error", "Negative Productive Work Logged", `${row.issueKey}: raw productive work logged is ${row.rawProductiveWorkLoggedHours}h; dashboard value is safely displayed as 0h`, row));
    }
    if (row.workCategory !== "productive" && row.rawWorkLoggedHours === 0) {
      warnings.push(dq("warning", "Non-productive issue with no Work Logged", `${row.issueKey}: ${row.workCategory} issue has no Work Logged`, row));
    }
    if (row.rawWorkLoggedHours && row.detectedUnit === "Numeric hours/serial duration") {
      warnings.push(dq("warning", "Work Logged value with ambiguous unit", `${row.issueKey}: ${row.sourceColumnUsed} has ambiguous numeric unit`, row));
    }
  });
  if (Math.abs(breakdown?.totals?.reconciliationDifference || 0) > TOLERANCE) {
    warnings.push({ id: crypto.randomUUID(), severity: "error", code: "Work Log reconciliation difference greater than 0.01", message: `Work Log reconciliation difference is ${breakdown.totals.reconciliationDifference}h` });
  }
  return warnings;
}

export function workLogBreakdownForExport(breakdown) {
  const totals = breakdown?.totals || emptyTotals();
  return {
    rawHours: totals.rawWorkLoggedHours,
    productiveHours: totals.productiveWorkLoggedHours,
    blockHours: totals.blockWorkLoggedHours,
    meetingHours: totals.meetingWorkLoggedHours,
    technicalHours: totals.technicalWorkLoggedHours,
    versionHours: totals.versionWorkLoggedHours,
    technicalVersionHours: totals.technicalVersionWorkLoggedHours,
    nonProductiveHours: totals.nonProductiveWorkLoggedHours,
    reconciliationDifference: totals.reconciliationDifference
  };
}

export function selectManagementWorkLogColumn(issues, personMappings = []) {
  const headers = Object.keys(issues[0]?.raw || {}).filter((key) => !key.startsWith("__"));
  for (const alias of FIELD_ALIASES.totalWorkLogged) {
    const match = headers.find((header) => comparable(header) === comparable(alias));
    if (match) return match;
  }
  const mappedColumns = personMappings.map((mapping) => mapping.workLogColumn).filter(Boolean);
  return mappedColumns.length ? "" : "";
}

export function sumMappedPersonColumns(issue, personMappings = []) {
  return sum(personMappings.filter((mapping) => mapping.enabled !== false && mapping.workLogColumn).map((mapping) => {
    const meta = getMeta(issue, mapping.workLogColumn);
    return normalizePossibleExcelHours(issue.raw?.[mapping.workLogColumn], meta).hours || 0;
  }));
}

function issueBreakdown(issue, sourceColumn, categoryMapping) {
  const classification = classifyIssue(issue, categoryMapping);
  const meta = getMeta(issue, sourceColumn);
  const parsed = sourceColumn ? normalizePossibleExcelHours(issue.raw?.[sourceColumn], meta) : { hours: issue.workLogged || 0 };
  const raw = parsed.hours || 0;
  const row = {
    issueKey: issue.issueKey,
    summary: issue.summary,
    assignee: issue.assignee,
    qaOwner: issue.qaOwner,
    status: issue.status,
    planType: issue.planType,
    labels: issue.labels || [],
    workCategory: classification.category,
    matchedCategories: classification.matchedCategories,
    matchedBy: classification.matchedBy,
    priority: classification.priority,
    sourceColumnUsed: sourceColumn || "mapped person columns fallback",
    rawSourceValue: sourceColumn ? issue.raw?.[sourceColumn] : raw,
    detectedUnit: detectUnit(meta, sourceColumn ? issue.raw?.[sourceColumn] : raw),
    rawWorkLoggedHours: raw,
    productiveWorkLoggedHours: classification.category === "productive" ? raw : 0,
    blockWorkLoggedHours: classification.category === "block" ? raw : 0,
    meetingWorkLoggedHours: classification.category === "meeting" ? raw : 0,
    technicalWorkLoggedHours: classification.category === "technical" ? raw : 0,
    versionWorkLoggedHours: classification.category === "version" ? raw : 0
  };
  row.technicalVersionWorkLoggedHours = row.technicalWorkLoggedHours + row.versionWorkLoggedHours;
  row.nonProductiveWorkLoggedHours = row.blockWorkLoggedHours + row.meetingWorkLoggedHours + row.technicalWorkLoggedHours + row.versionWorkLoggedHours;
  row.rawProductiveWorkLoggedHours = row.rawWorkLoggedHours - row.nonProductiveWorkLoggedHours;
  row.safeProductiveWorkLoggedHours = Math.max(0, row.rawProductiveWorkLoggedHours);
  if (classification.category !== "productive") row.productiveWorkLoggedHours = row.safeProductiveWorkLoggedHours;
  return row;
}

function finalizeBreakdown(rows, meta) {
  const totals = rows.reduce((acc, row) => {
    acc.rawWorkLoggedHours += row.rawWorkLoggedHours;
    acc.productiveWorkLoggedHours += row.productiveWorkLoggedHours;
    acc.blockWorkLoggedHours += row.blockWorkLoggedHours;
    acc.meetingWorkLoggedHours += row.meetingWorkLoggedHours;
    acc.technicalWorkLoggedHours += row.technicalWorkLoggedHours;
    acc.versionWorkLoggedHours += row.versionWorkLoggedHours;
    return acc;
  }, emptyTotals());
  totals.technicalVersionWorkLoggedHours = totals.technicalWorkLoggedHours + totals.versionWorkLoggedHours;
  totals.nonProductiveWorkLoggedHours = totals.blockWorkLoggedHours + totals.meetingWorkLoggedHours + totals.technicalWorkLoggedHours + totals.versionWorkLoggedHours;
  totals.reconciliationDifference = totals.rawWorkLoggedHours - (totals.productiveWorkLoggedHours + totals.blockWorkLoggedHours + totals.meetingWorkLoggedHours + totals.technicalWorkLoggedHours + totals.versionWorkLoggedHours);
  return {
    ...meta,
    rows,
    totals,
    categoryIssueKeys: Object.fromEntries(CATEGORY_KEYS.map((category) => [category, rows.filter((row) => row.workCategory === category).map((row) => row.issueKey)])),
    categoryIssueCounts: Object.fromEntries(CATEGORY_KEYS.map((category) => [category, rows.filter((row) => row.workCategory === category).length])),
    tolerance: TOLERANCE
  };
}

function emptyTotals() {
  return {
    rawWorkLoggedHours: 0,
    productiveWorkLoggedHours: 0,
    blockWorkLoggedHours: 0,
    meetingWorkLoggedHours: 0,
    technicalWorkLoggedHours: 0,
    versionWorkLoggedHours: 0,
    technicalVersionWorkLoggedHours: 0,
    nonProductiveWorkLoggedHours: 0,
    reconciliationDifference: 0
  };
}

function phraseMatches(titleTokens, pattern) {
  const patternTokens = tokenize(pattern);
  if (!patternTokens.length) return false;
  for (let i = 0; i <= titleTokens.length - patternTokens.length; i += 1) {
    if (patternTokens.every((token, offset) => tokenMatches(titleTokens[i + offset], token))) return true;
  }
  return false;
}

function tokenMatches(actual, expected) {
  return actual === expected || actual === `${expected}ed` || actual === `${expected}s`;
}

function tokenize(value) {
  return categoryComparable(value).split(" ").filter(Boolean);
}

function categoryComparable(value) {
  return normalizeString(value)
    .replace(/[يى]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fa-IR");
}

function uniqueNormalized(values) {
  return [...new Set(values.map((value) => normalizeString(value)).filter(Boolean))];
}

function getMeta(issue, columnName) {
  return issue.raw?.__cellMeta?.[columnName] || {};
}

function detectUnit(meta, rawValue) {
  const format = String(meta?.format || "");
  if (/\[h\]/i.test(format)) return "Excel duration [h]:mm";
  if (typeof rawValue === "number" && rawValue > 0 && rawValue < 1) return "Excel day fraction";
  if (typeof rawValue === "number") return "Numeric hours/serial duration";
  if (rawValue instanceof Date) return "JavaScript Date duration";
  if (normalizeString(rawValue)) return "Text duration";
  return "blank";
}

function dq(severity, code, message, row) {
  return {
    id: crypto.randomUUID(),
    severity,
    code,
    message,
    issueKey: row.issueKey,
    summary: row.summary,
    matchedCategories: row.matchedCategories,
    selectedCategory: row.workCategory,
    priority: row.priority
  };
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
