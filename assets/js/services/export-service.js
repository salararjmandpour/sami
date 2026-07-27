import { downloadText } from "../utils/helpers.js";

export function exportJson(filename, data) {
  downloadText(filename, JSON.stringify(data, null, 2), "application/json");
}

export function tableToCsv(rows) {
  const dangerous = /^[=+\-@]/;
  return rows.map((row) => row.map((cell) => {
    const safe = String(cell ?? "");
    const escaped = dangerous.test(safe) ? `'${safe}` : safe;
    return `"${escaped.replaceAll('"', '""')}"`;
  }).join(",")).join("\n");
}

export function exportCsv(filename, rows) {
  downloadText(filename, tableToCsv(rows), "text/csv;charset=utf-8");
}

