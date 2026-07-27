import { ratio, sum } from "./time-calculator.js";

export function estimationAccuracy(estimated, workLogged) {
  return ratio(estimated, workLogged);
}

export function timeVariance(issues) {
  return sum(issues.map((issue) => issue.workLogged || 0)) - sum(issues.map((issue) => (issue.devEstimate || 0) + (issue.testEstimate || 0)));
}

