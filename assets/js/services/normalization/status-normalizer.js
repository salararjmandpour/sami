import { STATUS_MAP } from "../../config/status-mapping.js";
import { STARTED_STATUS_ALIASES } from "../../config/workflow-stage-mapping.js";
import { comparable, looseComparable } from "./string-normalizer.js";

const PLAN_TYPE_ALIASES = {
  planned: ["plan", "planned"],
  unplanned: ["unplan", "unplanned"]
};

const STARTED_STATUS_KEYS = new Set(STARTED_STATUS_ALIASES.map((status) => normalizeStatus(status)).filter(Boolean));

export function normalizeStatus(value) {
  const key = looseComparable(value);
  return STATUS_MAP[key] || (key ? "unknown" : "");
}

export function normalizePlanType(value) {
  const key = looseComparable(value);
  if (!key) return "carry_over";
  if (PLAN_TYPE_ALIASES.planned.includes(key)) return "planned";
  if (PLAN_TYPE_ALIASES.unplanned.includes(key)) return "unplanned";
  return "unknown";
}

export function hasReachedInProgress(issue) {
  const history = normalizeHistory(issue?.statusHistory || issue?.transitionHistory);
  if (history.length) {
    return history.some((status) => STARTED_STATUS_KEYS.has(normalizeStatus(status)));
  }
  if (issue?.firstInProgress) return true;
  return STARTED_STATUS_KEYS.has(normalizeStatus(issue?.status || issue?.statusCanonical || ""));
}

export function startDetectionSource(issue) {
  const history = normalizeHistory(issue?.statusHistory || issue?.transitionHistory);
  if (history.length && history.some((status) => STARTED_STATUS_KEYS.has(normalizeStatus(status)))) return "history";
  if (issue?.firstInProgress) return "first-in-progress";
  if (STARTED_STATUS_KEYS.has(normalizeStatus(issue?.status || issue?.statusCanonical || ""))) return "current-status";
  return "not-started";
}

function normalizeHistory(value) {
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : item?.to || item?.status || item?.name || "").filter(Boolean);
  const text = comparable(value);
  if (!text) return [];
  return text.split(/[>,;|\n\r]+/).map((part) => part.trim()).filter(Boolean);
}
