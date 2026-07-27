import { ratio } from "./time-calculator.js";

export function qaMetrics(issues) {
  const submittedKeys = new Set(issues.filter((issue) => issue.firstAutomationTest).map((issue) => issue.issueKeyComparable));
  const returnedKeys = new Set(issues.filter((issue) => issue.qaReturned && submittedKeys.has(issue.issueKeyComparable)).map((issue) => issue.issueKeyComparable));
  const submitted = submittedKeys.size;
  const returned = returnedKeys.size;
  return {
    submitted,
    returned,
    qaReturnRate: ratio(returned, submitted),
    firstPassRate: ratio(submitted - returned, submitted)
  };
}

