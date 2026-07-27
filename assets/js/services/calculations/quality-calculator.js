export function hotfixCount(issues) {
  return issues.filter((issue) => issue.labels.includes("hotfix")).length;
}

export function bugfixCount(issues) {
  return issues.filter((issue) => issue.labels.includes("bugfix")).length;
}

