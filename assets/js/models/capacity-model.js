import { DEFAULT_PERSON_MAPPING } from "../config/person-mapping.js";
import { personCapacityRecord } from "../services/calculations/capacity-calculator.js";
import { resolvePersonWorkLogColumn } from "../services/work-log-category-service.js";
import { comparable, looseComparable } from "../services/normalization/string-normalizer.js";

function present(value) {
  return comparable(value) ? value : "";
}

function columnKeysMatch(left, right) {
  if (!comparable(left) || !comparable(right)) return false;
  if (comparable(left) === comparable(right)) return true;
  return looseComparable(left).replace(/\s+/g, "") === looseComparable(right).replace(/\s+/g, "");
}

function mergeIdentity(base, overlay) {
  if (!overlay) return base || null;
  if (!base) return { ...overlay };
  const overlayHasWorkLog = Object.prototype.hasOwnProperty.call(overlay, "workLogColumn");
  return {
    ...base,
    ...overlay,
    capacityName: present(overlay.capacityName) || base.capacityName || "",
    jiraName: present(overlay.jiraName) || base.jiraName || "",
    role: present(overlay.capacityName) ? (overlay.role || base.role || "developer") : (base.role || overlay.role || "developer"),
    workLogColumn: overlayHasWorkLog ? overlay.workLogColumn || "" : (base.workLogColumn || ""),
    enabled: present(overlay.capacityName) && overlay.enabled !== undefined ? overlay.enabled !== false : base.enabled !== false
  };
}

export function buildInitialPersonMappings(capacityPeople, jiraRows, saved = []) {
  const map = new Map();
  const byCapacity = new Map();
  const byJira = new Map();
  const remember = (item) => {
    const capacityKey = comparable(item.capacityName);
    const jiraKey = comparable(item.jiraName);
    if (capacityKey) byCapacity.set(capacityKey, mergeIdentity(byCapacity.get(capacityKey), item));
    if (jiraKey) byJira.set(jiraKey, mergeIdentity(byJira.get(jiraKey), item));
  };
  DEFAULT_PERSON_MAPPING.forEach(remember);
  saved.forEach(remember);
  capacityPeople.forEach((person) => {
    const key = comparable(person.capacityName);
    const fromCapacity = byCapacity.get(key);
    const fromJira = comparable(fromCapacity?.jiraName) ? byJira.get(comparable(fromCapacity.jiraName)) : null;
    const preset = mergeIdentity(fromCapacity, fromJira);
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
  return [...map.values()].map((entry) => {
    const resolved = resolvePersonWorkLogColumn(jiraRows, entry);
    if (!resolved) return entry;
    if (!comparable(entry.workLogColumn)) return { ...entry, workLogColumn: resolved };
    // Keep an explicit mapping only while it still resolves to that same header.
    // Stale presets (e.g. "Work Today Ali" when the file has "Today Ali") are refreshed.
    if (columnKeysMatch(entry.workLogColumn, resolved)) return entry;
    return { ...entry, workLogColumn: resolved };
  });
}

export function capacityByMapping(capacityPeople, mappings) {
  const used = new Set();
  const result = new Map();
  mappings.filter((m) => m.enabled).forEach((mapping) => {
    const person = personCapacityRecord(capacityPeople, mapping);
    if (!person || used.has(person.id)) return;
    used.add(person.id);
    result.set(comparable(mapping.jiraName || mapping.capacityName), person.availableCapacity);
  });
  return result;
}

