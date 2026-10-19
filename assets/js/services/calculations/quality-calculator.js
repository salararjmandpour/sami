import { distinctIssues } from "./issue-identity.js";

export function hotfixCount(issues) {
  return distinctIssues(issues).filter((issue) => (issue.labels || []).includes("hotfix")).length;
}

export function bugfixCount(issues) {
  return distinctIssues(issues).filter((issue) => (issue.labels || []).includes("bugfix")).length;
}

