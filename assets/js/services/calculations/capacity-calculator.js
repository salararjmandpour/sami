import { DEFAULT_PERSON_MAPPING } from "../../config/person-mapping.js";
import { comparable } from "../normalization/string-normalizer.js";
import { ratio, sum } from "./time-calculator.js";

export function totalUniqueCapacity(capacityPeople, mappings) {
  return totalUniqueCapacityField(capacityPeople, mappings, "availableCapacity");
}

export function totalUniqueCapacityField(capacityPeople, mappings, field = "availableCapacity") {
  const used = new Set();
  let total = 0;
  let found = false;
  let invalid = false;
  for (const mapping of (mappings || []).filter((item) => item.enabled)) {
    const person = personCapacityRecord(capacityPeople, mapping);
    if (!person || used.has(person.id)) continue;
    const value = person[field];
    if (typeof value === "number" && !Number.isFinite(value)) {
      invalid = true;
      continue;
    }
    if (!Number.isFinite(value)) continue;
    used.add(person.id);
    total += value;
    found = true;
  }
  if (invalid) return Number.NaN;
  return found ? total : null;
}

export function capacityUtilization(workload, capacity) {
  return ratio(workload, capacity);
}

export function personCapacity(capacityPeople, mapping) {
  return personCapacityField(capacityPeople, mapping, "availableCapacity");
}

export function personCapacityField(capacityPeople, mapping, field = "availableCapacity") {
  return personCapacityRecord(capacityPeople, mapping)?.[field] ?? null;
}

export function personCapacityRecord(capacityPeople, mapping) {
  const people = capacityPeople || [];
  const explicitName = comparable(mapping?.capacityName);
  if (explicitName) {
    return people.find((person) => comparable(person.capacityName) === explicitName)
      || people.find((person) => mapping?.capacityId && person.id === mapping.capacityId)
      || null;
  }
  const byId = mapping?.capacityId ? people.find((person) => person.id === mapping.capacityId && !person.unresolved) : null;
  if (byId) return byId;
  const presetName = comparable(presetCapacityName(mapping?.jiraName));
  if (!presetName) return null;
  return people.find((person) => comparable(person.capacityName) === presetName) || null;
}

function presetCapacityName(jiraName) {
  if (!comparable(jiraName)) return "";
  const preset = DEFAULT_PERSON_MAPPING.find((item) => item.enabled !== false && comparable(item.jiraName) === comparable(jiraName) && comparable(item.capacityName));
  return preset?.capacityName || "";
}

export function capacityByPersonMetrics(capacityPeople, mappings, issueGroups, includeCarryOverForQa = true) {
  return mappings.filter((m) => m.enabled && m.jiraName).map((mapping) => {
    const issues = issueGroups.get(comparable(mapping.jiraName)) || [];
    const capacity = personCapacity(capacityPeople, mapping);
    const workload = sum(issues.map((issue) => {
      if (mapping.role === "qa") return (issue.planType === "carry_over" && !includeCarryOverForQa) ? 0 : (issue.testEstimate || 0);
      return issue.planType === "carry_over" ? 0 : (issue.devEstimate || 0);
    }));
    return { name: mapping.jiraName, role: mapping.role, capacity, utilization: capacityUtilization(workload, capacity) };
  });
}
