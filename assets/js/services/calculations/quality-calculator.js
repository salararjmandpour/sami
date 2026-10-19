import { comparable } from "../normalization/string-normalizer.js";
import { distinctIssues } from "./issue-identity.js";

export function hotfixCount(issues) {
  return distinctIssues(issues).filter((issue) => comparable(issue.issueType) === "hotfix" || (issue.labels || []).includes("hotfix")).length;
}

export function bugfixCount(issues) {
  return distinctIssues(issues).filter((issue) => ["bug", "bugfix"].includes(comparable(issue.issueType)) || (issue.labels || []).includes("bugfix") || (issue.labels || []).includes("bug")).length;
}

