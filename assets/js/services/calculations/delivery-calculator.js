import { DEVELOPMENT_COMPLETED } from "../../config/status-mapping.js";
import { ratio } from "./time-calculator.js";

export function deliveryRateDevelop(issues) {
  const assigned = issues.filter((issue) => ["planned", "unplanned"].includes(issue.planType));
  const completed = assigned.filter((issue) => DEVELOPMENT_COMPLETED.has(issue.statusCanonical));
  return ratio(completed.length, assigned.length);
}

export function deliveryRate(issues) {
  const assigned = issues.filter((issue) => ["planned", "unplanned"].includes(issue.planType));
  const done = assigned.filter((issue) => issue.statusCanonical === "done");
  return ratio(done.length, assigned.length);
}

