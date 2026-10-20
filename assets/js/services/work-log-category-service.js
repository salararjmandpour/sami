import { FIELD_ALIASES } from "../config/field-aliases.js";
import { WORK_CATEGORY_MAPPING, WORK_CATEGORY_PRIORITY } from "../config/work-category-mapping.js";
import { comparable, looseComparable, normalizeString } from "./normalization/string-normalizer.js";
import { isExcelDurationFormat, normalizePossibleExcelHours } from "./normalization/unit-normalizer.js";

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
  const column = resolvePersonWorkLogColumn(issues, mapping);
  const identity = { sourceColumn: column || mapping?.workLogColumn || "", scope: "person", person: mapping?.jiraName || "", role: mapping?.role || "" };
  if (!column) {
    return finalizeBreakdown([], { ...identity, sourceMissing: true });
  }
  const rows = issues.map((issue) => issueBreakdown(issue, column, categoryMapping));
  return finalizeBreakdown(rows, identity);
}

export function resolvePersonWorkLogColumn(issues, mapping = {}) {
  const headers = issueHeaders(issues);
  if (!headers.length) return "";
  const configured = normalizeString(mapping?.workLogColumn || "");
  if (configured) {
    const exact = headers.find((header) => header === configured);
    if (exact) return exact;
    const configuredKey = compactHeader(configured);
    const loose = headers.find((header) => compactHeader(header) === configuredKey);
    if (loose) return loose;
  }
  return detectPersonWorkLogColumn(headers, mapping);
}

export function buildWorkLogQualityWarnings(breakdown) {
  const warnings = [];
  (breakdown?.rows || []).forEach((row) => {
    if (row.matchedCategories.length > 1) {
      warnings.push(dq("warning", "Multiple Work Categories Matched", `${row.issueKey}: matched ${row.matchedCategories.join(", ")}; selected ${row.workCategory} by priority ${row.priority.join(" > ")}`, row));
    }
    if (Number.isFinite(row.rawProductiveWorkLoggedHours) && row.rawProductiveWorkLoggedHours < -TOLERANCE) {
      warnings.push(dq("error", "Negative Productive Work Logged", `${row.issueKey}: raw productive work logged is ${row.rawProductiveWorkLoggedHours}h; dashboard value is safely displayed as 0h`, row));
    }
    if (row.hoursState === "rejected") {
      warnings.push(dq("warning", "Rejected work-log value", `${row.issueKey}: ${row.sourceColumnUsed} contains ${JSON.stringify(row.rawSourceValue)}, which is not a valid hour value`, row));
    }
    if (row.workCategory !== "productive" && row.rawWorkLoggedHours === 0) {
      warnings.push(dq("warning", "Non-productive issue with no Work Logged", `${row.issueKey}: ${row.workCategory} issue has an explicit zero Work Logged`, row));
    }
    if (Number.isFinite(row.rawWorkLoggedHours) && row.rawWorkLoggedHours !== 0 && row.detectedUnit === "Numeric hours/serial duration") {
      warnings.push(dq("warning", "Work Logged value with ambiguous unit", `${row.issueKey}: ${row.sourceColumnUsed} has ambiguous numeric unit`, row));
    }
  });
  if (Number.isFinite(breakdown?.totals?.reconciliationDifference) && Math.abs(breakdown.totals.reconciliationDifference) > TOLERANCE) {
    warnings.push({ id: crypto.randomUUID(), severity: "error", code: "Work Log reconciliation difference greater than 0.01", message: `Work Log reconciliation difference is ${breakdown.totals.reconciliationDifference}h` });
  }
  if (breakdown?.scope === "management" && !breakdown.sourceColumn && (breakdown?.rows || []).length) {
    warnings.push({ id: crypto.randomUUID(), severity: "warning", code: "Missing team work-log column", message: "ستون مجموع Work Log تیم در فایل وجود ندارد. این وضعیت با یک ستون موجود ولی ناقص فرق دارد و ساعت تیم به فرد بدون نگاشت داده نمی‌شود." });
  } else {
    const population = countHourStates(breakdown?.rows || []);
    if (population.recorded > 0 && population.blank + population.rejected > 0 && Number.isFinite(breakdown?.totals?.rawWorkLoggedHours)) {
      warnings.push({ id: crypto.randomUUID(), severity: "warning", code: "Partial Work Logged total", message: partialWorkLogMessage(population) });
    }
  }
  if (!breakdown?.sourceMissing && (breakdown?.rows || []).length && !Number.isFinite(breakdown?.totals?.rawWorkLoggedHours)) {
    warnings.push({ id: crypto.randomUUID(), severity: "warning", code: "Work Logged unavailable", message: "No recorded work-log hours were found. Blank and rejected cells were not published as zero." });
  }
  return warnings;
}

export function buildPersonWorkLogValueWarnings(issues, personMappings = []) {
  const warnings = [];
  personMappings.filter((mapping) => mapping.enabled !== false && mapping.jiraName).forEach((mapping) => {
    const column = resolvePersonWorkLogColumn(issues, mapping);
    if (!column) {
      if (normalizeString(mapping.workLogColumn)) {
        warnings.push({ id: crypto.randomUUID(), severity: "warning", code: "Missing person work-log column", message: `${mapping.jiraName}: ستون ${mapping.workLogColumn} در فایل Jira وجود ندارد. زمان ثبت‌شده این فرد N/A است و از جمع تیم پر نمی‌شود.` });
      }
      return;
    }
    const population = { recorded: 0, blank: 0, rejected: 0 };
    (issues || []).forEach((issue) => {
      const rawValue = issue.raw?.[column];
      const hours = finiteHours(normalizePossibleExcelHours(rawValue, getMeta(issue, column)).hours);
      if (hours !== null) {
        population.recorded += 1;
        return;
      }
      if (normalizeString(rawValue)) {
        population.rejected += 1;
        warnings.push({ id: crypto.randomUUID(), severity: "warning", code: "Rejected work-log value", issueKey: issue.issueKey, message: `${issue.issueKey}: ${column} contains ${JSON.stringify(rawValue)}, which is not a valid hour value` });
        return;
      }
      population.blank += 1;
    });
    if ((issues || []).length && population.recorded === 0) {
      warnings.push({ id: crypto.randomUUID(), severity: "warning", code: "Work Logged unavailable", message: `${mapping.jiraName}: ستون ${column} ساعت ثبت‌شده قابل جمع ندارد. سلول خالی یا نامعتبر صفر حساب نشده است.` });
    } else if (population.recorded > 0 && population.blank + population.rejected > 0) {
      warnings.push({ id: crypto.randomUUID(), severity: "warning", code: "Partial Work Logged total", message: `${mapping.jiraName}: ${partialWorkLogMessage(population)}` });
    }
  });
  return warnings;
}

export function workLogBreakdownForExport(breakdown) {
  const totals = breakdown?.totals || emptyTotals();
  if (breakdown?.sourceMissing) {
    return {
      rawHours: null,
      productiveHours: null,
      blockHours: null,
      meetingHours: null,
      technicalHours: null,
      versionHours: null,
      technicalVersionHours: null,
      nonProductiveHours: null,
      reconciliationDifference: null
    };
  }
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
  const seen = new Set();
  const hours = [];
  personMappings.filter((mapping) => mapping.enabled !== false).forEach((mapping) => {
    const resolved = resolvePersonWorkLogColumn([issue], mapping);
    if (!resolved) return;
    const column = comparable(resolved);
    if (seen.has(column)) return;
    seen.add(column);
    hours.push(finiteHours(normalizePossibleExcelHours(issue.raw?.[resolved], getMeta(issue, resolved)).hours));
  });
  return sumRecorded(hours);
}

function issueBreakdown(issue, sourceColumn, categoryMapping) {
  const classification = classifyIssue(issue, categoryMapping);
  const meta = getMeta(issue, sourceColumn);
  const sourceValue = sourceColumn ? issue.raw?.[sourceColumn] : issue.workLogged;
  const parsedHours = sourceColumn ? normalizePossibleExcelHours(sourceValue, meta).hours : finiteHours(issue.workLogged);
  const raw = finiteHours(parsedHours);
  const categoryHours = (category) => {
    if (raw === null) return null;
    return classification.category === category ? raw : 0;
  };
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
    rawSourceValue: sourceValue ?? null,
    detectedUnit: detectUnit(meta, sourceValue),
    hoursState: raw === null ? (normalizeString(sourceValue) ? "rejected" : "blank") : "recorded",
    rawWorkLoggedHours: raw,
    productiveWorkLoggedHours: categoryHours("productive"),
    blockWorkLoggedHours: categoryHours("block"),
    meetingWorkLoggedHours: categoryHours("meeting"),
    technicalWorkLoggedHours: categoryHours("technical"),
    versionWorkLoggedHours: categoryHours("version")
  };
  if (raw === null) {
    row.technicalVersionWorkLoggedHours = null;
    row.nonProductiveWorkLoggedHours = null;
    row.rawProductiveWorkLoggedHours = null;
    row.safeProductiveWorkLoggedHours = null;
    return row;
  }
  row.technicalVersionWorkLoggedHours = row.technicalWorkLoggedHours + row.versionWorkLoggedHours;
  row.nonProductiveWorkLoggedHours = row.blockWorkLoggedHours + row.meetingWorkLoggedHours + row.technicalWorkLoggedHours + row.versionWorkLoggedHours;
  row.rawProductiveWorkLoggedHours = row.rawWorkLoggedHours - row.nonProductiveWorkLoggedHours;
  row.safeProductiveWorkLoggedHours = Math.max(0, row.rawProductiveWorkLoggedHours);
  if (classification.category !== "productive") row.productiveWorkLoggedHours = row.safeProductiveWorkLoggedHours;
  return row;
}

function finalizeBreakdown(rows, meta) {
  const totals = rows.length ? {
    rawWorkLoggedHours: sumRecorded(rows.map((row) => row.rawWorkLoggedHours)),
    productiveWorkLoggedHours: sumRecorded(rows.map((row) => row.productiveWorkLoggedHours)),
    blockWorkLoggedHours: sumRecorded(rows.map((row) => row.blockWorkLoggedHours)),
    meetingWorkLoggedHours: sumRecorded(rows.map((row) => row.meetingWorkLoggedHours)),
    technicalWorkLoggedHours: sumRecorded(rows.map((row) => row.technicalWorkLoggedHours)),
    versionWorkLoggedHours: sumRecorded(rows.map((row) => row.versionWorkLoggedHours))
  } : emptyTotals();
  if (!Number.isFinite(totals.rawWorkLoggedHours)) {
    totals.technicalVersionWorkLoggedHours = null;
    totals.nonProductiveWorkLoggedHours = null;
    totals.reconciliationDifference = null;
  } else {
    totals.technicalVersionWorkLoggedHours = totals.technicalWorkLoggedHours + totals.versionWorkLoggedHours;
    totals.nonProductiveWorkLoggedHours = totals.blockWorkLoggedHours + totals.meetingWorkLoggedHours + totals.technicalWorkLoggedHours + totals.versionWorkLoggedHours;
    totals.reconciliationDifference = totals.rawWorkLoggedHours - (totals.productiveWorkLoggedHours + totals.blockWorkLoggedHours + totals.meetingWorkLoggedHours + totals.technicalWorkLoggedHours + totals.versionWorkLoggedHours);
  }
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

function countHourStates(rows) {
  return rows.reduce((population, row) => {
    if (row.hoursState === "recorded") population.recorded += 1;
    else if (row.hoursState === "rejected") population.rejected += 1;
    else population.blank += 1;
    return population;
  }, { recorded: 0, blank: 0, rejected: 0 });
}

function partialWorkLogMessage(population) {
  return `جمع Work Log فقط ${population.recorded} مقدار عددی ثبت‌شده را شامل می‌شود. ${population.blank} سلول خالی و ${population.rejected} مقدار نامعتبر صفر حساب نشده‌اند. این جمع ممکن است کل واقعی نباشد.`;
}

function finiteHours(value) {
  return Number.isFinite(value) ? value : null;
}

function sumRecorded(values) {
  let total = 0;
  let seen = false;
  values.forEach((value) => {
    if (!Number.isFinite(value)) return;
    total += value;
    seen = true;
  });
  return seen ? total : null;
}

function issueHeaders(issues) {
  const headers = new Set();
  (issues || []).forEach((issue) => {
    Object.keys(issue?.raw || {}).forEach((key) => {
      if (!key.startsWith("__")) headers.add(key);
    });
  });
  return [...headers];
}

function detectPersonWorkLogColumn(headers, mapping = {}) {
  const tokens = personNameTokens(mapping);
  if (!tokens.length) return "";
  const teamTotals = new Set((FIELD_ALIASES.totalWorkLogged || []).map((alias) => comparable(alias)));
  const candidates = headers.filter((header) => {
    const key = comparable(header);
    if (teamTotals.has(key)) return false;
    return isPersonalWorkLogHeader(key);
  });
  let best = "";
  let bestScore = 0;
  candidates.forEach((header) => {
    const key = comparable(header);
    const matched = tokens.filter((token) => key.includes(token));
    if (!matched.length) return;
    const score = matched.reduce((total, token) => total + token.length, 0) * 10 + matched.length;
    if (score > bestScore) {
      bestScore = score;
      best = header;
    }
  });
  return best;
}

function personNameTokens(mapping = {}) {
  return [...new Set([mapping.jiraName, mapping.capacityName]
    .flatMap((value) => comparable(value).split(/[^a-z0-9\u0600-\u06ff]+/))
    .map((token) => token.trim())
    .filter((token) => token.length >= 3))];
}

function isPersonalWorkLogHeader(comparableHeader) {
  return /work\s*logged|work\s*today|worklogged|worktoday|log\s*time|زمان\s*کار|ورک\s*لاگ/.test(comparableHeader);
}

function compactHeader(value) {
  return looseComparable(value).replace(/\s+/g, "");
}

function getMeta(issue, columnName) {
  return issue.raw?.__cellMeta?.[columnName] || {};
}

function detectUnit(meta, rawValue) {
  const format = String(meta?.format || meta?.z || "");
  if (/\[h\]/i.test(format)) return "Excel duration [h]:mm";
  if (isExcelDurationFormat(format)) return "Excel duration";
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
