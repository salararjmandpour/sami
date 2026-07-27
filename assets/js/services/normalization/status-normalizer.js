import { STATUS_MAP } from "../../config/status-mapping.js";
import { comparable } from "./string-normalizer.js";

export function normalizeStatus(value) {
  const key = comparable(value);
  return STATUS_MAP[key] || (key ? "unknown" : "");
}

export function normalizePlanType(value) {
  const key = comparable(value);
  if (!key) return "carry_over";
  if (["plan", "planned"].includes(key)) return "planned";
  if (["unplan", "unplanned"].includes(key)) return "unplanned";
  return "unknown";
}

