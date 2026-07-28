import { comparable } from "../normalization/string-normalizer.js";
import { ratio, sum } from "./time-calculator.js";

export function totalUniqueCapacity(capacityPeople, mappings) {
  return totalUniqueCapacityField(capacityPeople, mappings, "availableCapacity");
}

export function totalUniqueCapacityField(capacityPeople, mappings, field = "availableCapacity") {
  const byName = new Map(capacityPeople.map((p) => [comparable(p.capacityName), p]));
  const byId = new Map(capacityPeople.map((p) => [p.id, p]));
  const used = new Set();
  return mappings.filter((m) => m.enabled).reduce((total, mapping) => {
    const person = byId.get(mapping.capacityId) || byName.get(comparable(mapping.capacityName));
    if (!person || used.has(person.id) || !Number.isFinite(person[field])) return total;
    used.add(person.id);
    return total + person[field];
  }, 0);
}

export function capacityUtilization(workload, capacity) {
  return ratio(workload, capacity);
}

export function personCapacity(capacityPeople, mapping) {
  return personCapacityField(capacityPeople, mapping, "availableCapacity");
}

export function personCapacityField(capacityPeople, mapping, field = "availableCapacity") {
  const person = capacityPeople.find((p) => p.id === mapping.capacityId || comparable(p.capacityName) === comparable(mapping.capacityName));
  return person?.[field] ?? null;
}

export function personCapacityRecord(capacityPeople, mapping) {
  return capacityPeople.find((p) => p.id === mapping.capacityId || comparable(p.capacityName) === comparable(mapping.capacityName)) || null;
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
