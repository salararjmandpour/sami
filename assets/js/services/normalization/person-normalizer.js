import { comparable } from "./string-normalizer.js";

export function samePerson(a, b) {
  return comparable(a) === comparable(b);
}

export function findPersonMapping(mappings, jiraName, role) {
  return mappings.find((mapping) => mapping.enabled && (!role || mapping.role === role || mapping.role === "both") && samePerson(mapping.jiraName, jiraName));
}

