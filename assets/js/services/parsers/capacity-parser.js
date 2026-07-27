import { cleanHeaders } from "../normalization/header-normalizer.js";
import { normalizeString, comparable } from "../normalization/string-normalizer.js";
import { normalizeHours } from "../normalization/unit-normalizer.js";
import { detectFileSignature } from "../../utils/file-signature.js";

const SUMMARY_ALIASES = {
  total: ["کل ظرفیت", "کل ةرفیت", "total capacity", "prepared capacity"],
  technical: ["technical"],
  planned: ["ظرفیت پلن", "ظرفیت پلان", "planned capacity"],
  unplanned: ["ظرفیت آنپلن", "ظرفیت انپلن", "unplanned capacity"]
};

function findSummaryRow(rows, aliases, { fuzzyTotal = false } = {}) {
  return rows.find((row) => {
    const key = comparable(row[0]);
    return aliases.includes(key) || (fuzzyTotal && key.startsWith("کل") && (key.includes("رفیت") || key.includes("ظرفیت")));
  });
}

function splitMergedHeader(parent, offset) {
  const cleaned = normalizeString(parent).replace(/\(.*?\)/g, "");
  const parts = cleaned.split(/[-–،,\/]+/).map(normalizeString).filter(Boolean);
  return parts[offset] || cleaned;
}

function inferredHeader(originalHeaders, columnIndex) {
  const originalHeader = normalizeString(originalHeaders[columnIndex]);
  const previousHeader = normalizeString(originalHeaders[columnIndex - 1]);
  if (originalHeader.includes("-")) return splitMergedHeader(originalHeader, 0);
  if (!originalHeader && previousHeader.includes("-")) return splitMergedHeader(previousHeader, 1);
  return originalHeader;
}

function diagnosticsFor(sheet, sheetName) {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const formulas = Object.entries(sheet)
    .filter(([address, cell]) => address[0] !== "!" && cell.f)
    .map(([address, cell]) => ({ sheetName, address, formula: cell.f, cachedValue: cell.v, format: cell.z || "", text: cell.w || "" }));
  return { rows: range.e.r + 1, columns: range.e.c + 1, merges: sheet["!merges"] || [], formulas };
}

export async function parseCapacityWorkbook(file, arrayBuffer) {
  if (!window.XLSX) throw new Error("کتابخانه SheetJS بارگذاری نشده است.");
  const signature = detectFileSignature(arrayBuffer);
  console.group?.("Capacity Parsing");
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false, cellNF: true, cellFormula: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  const headerIndex = rows.findIndex((row) => row.filter((cell) => normalizeString(cell)).length > 1);
  const originalHeaders = rows[Math.max(headerIndex, 0)] || [];
  const headers = cleanHeaders(originalHeaders);
  const totalRow = findSummaryRow(rows, SUMMARY_ALIASES.total, { fuzzyTotal: true });
  const technicalRow = findSummaryRow(rows, SUMMARY_ALIASES.technical);
  const plannedRow = findSummaryRow(rows, SUMMARY_ALIASES.planned);
  const unplannedRow = findSummaryRow(rows, SUMMARY_ALIASES.unplanned);
  const diagnostics = diagnosticsFor(sheet, sheetName);
  diagnostics.summaryRows = {
    total: totalRow?.[0] || "",
    technical: technicalRow?.[0] || "",
    planned: plannedRow?.[0] || "",
    unplanned: unplannedRow?.[0] || ""
  };
  const people = headers.slice(1).map((header, offset) => {
    const columnIndex = offset + 1;
    const merge = diagnostics.merges.find((m) => m.s.r === headerIndex && columnIndex >= m.s.c && columnIndex <= m.e.c);
    const mergeOffset = merge ? columnIndex - merge.s.c : 0;
    const mergedParent = merge ? normalizeString(originalHeaders[merge.s.c]) : "";
    const originalHeader = normalizeString(originalHeaders[columnIndex]);
    const displayName = merge && mergedParent ? splitMergedHeader(mergedParent, mergeOffset) : inferredHeader(originalHeaders, columnIndex);
    return {
      id: `capacity-col-${columnIndex}`,
      columnIndex,
      originalHeader,
      normalizedHeader: normalizeString(displayName),
      mergedParent,
      capacityName: normalizeString(displayName) || `ستون بدون نام ${columnIndex + 1}`,
      availableCapacity: totalRow ? normalizeHours(totalRow[columnIndex]).hours : null,
      technical: technicalRow ? normalizeHours(technicalRow[columnIndex]).hours : null,
      plannedCapacity: plannedRow ? normalizeHours(plannedRow[columnIndex]).hours : null,
      unplannedCapacity: unplannedRow ? normalizeHours(unplannedRow[columnIndex]).hours : null,
      unresolved: !normalizeString(displayName)
    };
  });
  const result = { fileName: file.name, signature, sheetNames: workbook.SheetNames, selectedSheet: sheetName, headers, originalHeaders, people, rawRows: rows, diagnostics };
  console.log?.({ fileName: file.name, sheetNames: workbook.SheetNames, people: people.length, formulas: diagnostics.formulas.length });
  console.groupEnd?.();
  return result;
}
