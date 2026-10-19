import { comparable } from "../normalization/string-normalizer.js";

export function distinctIssues(issues) {
  const seen = new Set();
  return (issues || []).filter((issue) => {
    const key = comparable(issue?.issueKey || issue?.issueKeyComparable);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
