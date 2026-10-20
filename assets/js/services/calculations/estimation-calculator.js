import { ratio } from "./time-calculator.js";

export function estimationAccuracy(estimated, workLogged) {
  return ratio(estimated, workLogged);
}

export function timeVariance(issues) {
  let sawLogged = false;
  let sawEstimated = false;
  let logged = 0;
  let estimated = 0;
  for (const issue of issues || []) {
    const work = readVarianceComponent(issue?.workLogged);
    const dev = readVarianceComponent(issue?.devEstimate);
    const test = readVarianceComponent(issue?.testEstimate);
    if (work === "invalid" || dev === "invalid" || test === "invalid") return Number.NaN;
    if (work !== "missing") {
      sawLogged = true;
      logged += work;
    }
    if (dev !== "missing" || test !== "missing") {
      sawEstimated = true;
      estimated += (dev === "missing" ? 0 : dev) + (test === "missing" ? 0 : test);
    }
  }
  if (!sawLogged && !sawEstimated) return null;
  return logged - estimated;
}

function readVarianceComponent(value) {
  if (value === null || value === undefined) return "missing";
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "number") return "invalid";
  return "missing";
}

