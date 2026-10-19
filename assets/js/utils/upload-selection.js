const FILE_FIELDS = [
  ["jiraFile", "jira"],
  ["capacityFile", "capacity"],
  ["kpiFile", "kpi"]
];

export function fileSelectionToken(file) {
  if (!file) return "";
  return [file.name, file.size, file.lastModified].join("\u0000");
}

export function selectionTokensFromFiles(files = {}) {
  return {
    jira: fileSelectionToken(files.jira),
    capacity: fileSelectionToken(files.capacity),
    kpi: fileSelectionToken(files.kpi)
  };
}

export function sameSelection(left, right) {
  return Boolean(left?.jira && left?.capacity && left?.kpi && right?.jira && right?.capacity && right?.kpi
    && left.jira === right.jira && left.capacity === right.capacity && left.kpi === right.kpi);
}

export function readSelectedFiles() {
  return Object.fromEntries(FILE_FIELDS.map(([id, key]) => [key, document.getElementById(id)?.files?.[0]]));
}

export function readSelectionTokens() {
  return selectionTokensFromFiles(readSelectedFiles());
}
