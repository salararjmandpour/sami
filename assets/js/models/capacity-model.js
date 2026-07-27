import { DEFAULT_PERSON_MAPPING } from "../config/person-mapping.js";
import { comparable } from "../services/normalization/string-normalizer.js";

export function buildInitialPersonMappings(capacityPeople, jiraRows, saved = []) {
  const map = new Map();
  [...DEFAULT_PERSON_MAPPING, ...saved].forEach((item) => map.set(comparable(item.capacityName || item.jiraName), { ...item, enabled: item.enabled !== false }));
  capacityPeople.forEach((person) => {
    const key = comparable(person.capacityName);
    if (!map.has(key)) {
      map.set(key, {
        capacityId: person.id,
        capacityName: person.capacityName,
        jiraName: "",
        role: "developer",
        workLogColumn: "",
        enabled: true
      });
    } else {
      map.set(key, { ...map.get(key), capacityId: person.id, capacityName: person.capacityName });
    }
  });
  const jiraNames = new Set();
  jiraRows.forEach((row) => {
    if (row.assignee) jiraNames.add(row.assignee);
    if (row.qaOwner) jiraNames.add(row.qaOwner);
  });
  jiraNames.forEach((name) => {
    if (![...map.values()].some((entry) => comparable(entry.jiraName) === comparable(name))) {
      map.set(`jira:${comparable(name)}`, { capacityName: "", jiraName: name, role: "developer", workLogColumn: "", enabled: true });
    }
  });
  return [...map.values()];
}

export function capacityByMapping(capacityPeople, mappings) {
  const byId = new Map(capacityPeople.map((person) => [person.id, person]));
  const byName = new Map(capacityPeople.map((person) => [comparable(person.capacityName), person]));
  const used = new Set();
  const result = new Map();
  mappings.filter((m) => m.enabled).forEach((mapping) => {
    const person = byId.get(mapping.capacityId) || byName.get(comparable(mapping.capacityName));
    if (!person || used.has(person.id)) return;
    used.add(person.id);
    result.set(comparable(mapping.jiraName || mapping.capacityName), person.availableCapacity);
  });
  return result;
}

