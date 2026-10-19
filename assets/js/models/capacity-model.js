import { DEFAULT_PERSON_MAPPING } from "../config/person-mapping.js";
import { comparable } from "../services/normalization/string-normalizer.js";

export function buildInitialPersonMappings(capacityPeople, jiraRows, saved = []) {
  const map = new Map();
  const presets = new Map();
  DEFAULT_PERSON_MAPPING.forEach((item) => {
    const key = comparable(item.capacityName || item.jiraName);
    if (key) presets.set(key, item);
  });
  saved.forEach((item) => {
    const key = comparable(item.capacityName || item.jiraName);
    if (key) presets.set(key, item);
  });
  capacityPeople.forEach((person) => {
    const key = comparable(person.capacityName);
    const preset = presets.get(key);
    map.set(key, preset ? {
      ...preset,
      capacityId: person.id,
      capacityName: person.capacityName,
      enabled: preset.enabled !== false
    } : {
      capacityId: person.id,
      capacityName: person.capacityName,
      jiraName: "",
      role: "developer",
      workLogColumn: "",
      enabled: true
    });
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

