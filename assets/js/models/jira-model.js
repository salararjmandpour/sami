import { comparable, normalizeString } from "../services/normalization/string-normalizer.js";
import { normalizeNumber } from "../services/normalization/number-normalizer.js";
import { normalizeDate } from "../services/normalization/date-normalizer.js";
import { normalizePossibleExcelHours } from "../services/normalization/unit-normalizer.js";
import { normalizeLabels } from "../services/normalization/label-normalizer.js";
import { normalizePlanType, normalizeStatus } from "../services/normalization/status-normalizer.js";

export function normalizeJiraRows(rows, fieldMap, qaKeys, holidays, workingHoursBetween) {
  const qaSet = new Set([...qaKeys].map(comparable));
  return rows.map((row) => {
    const get = (field) => row[fieldMap[field]] ?? "";
    const meta = (field) => row.__cellMeta?.[fieldMap[field]] || {};
    const issueKey = normalizeString(get("issueKey"));
    const created = normalizeDate(get("created"));
    const firstInProgress = normalizeDate(get("firstInProgress"));
    const doneDate = normalizeDate(get("doneDate"));
    return {
      raw: row,
      issueKey,
      issueKeyComparable: comparable(issueKey),
      issueType: normalizeString(get("issueType")),
      summary: normalizeString(get("summary")),
      status: normalizeString(get("status")),
      statusCanonical: normalizeStatus(get("status")),
      statusHistory: normalizeString(get("statusHistory")),
      transitionHistory: normalizeString(get("statusHistory")),
      assignee: normalizeString(get("assignee")),
      qaOwner: normalizeString(get("qaOwner")),
      planRaw: normalizeString(get("planType")),
      planType: normalizePlanType(get("planType")),
      devEstimate: normalizeNumber(get("devEstimate")),
      testEstimate: normalizeNumber(get("testEstimate")),
      storyPoints: normalizeNumber(get("storyPoints")),
      labels: normalizeLabels(get("labels")),
      workLogged: normalizePossibleExcelHours(get("totalWorkLogged"), meta("totalWorkLogged")).hours,
      blockedHours: normalizePossibleExcelHours(get("blockedTime"), meta("blockedTime")).hours,
      created,
      firstInProgress,
      firstAutomationTest: normalizeDate(get("firstAutomationTest")),
      doneDate,
      leadTimeHours: created && doneDate ? workingHoursBetween(created, doneDate, holidays) : null,
      cycleTimeHours: firstInProgress && doneDate ? workingHoursBetween(firstInProgress, doneDate, holidays) : null,
      qaReturned: qaSet.has(comparable(issueKey))
    };
  }).filter((row) => row.issueKey);
}

export function extractQaKeys(qaRows) {
  const keys = new Set();
  qaRows.forEach((row) => {
    const firstValue = Object.values(row)[0];
    const key = normalizeString(row.Key || row.key || firstValue);
    if (key) keys.add(key);
  });
  return keys;
}
