import { cleanHeaders } from "../normalization/header-normalizer.js";
import { CAPACITY_COLUMN_ALIASES } from "../../config/capacity-column-mapping.js";
import { normalizeString, comparable, looseComparable } from "../normalization/string-normalizer.js";
import { normalizeHours } from "../normalization/unit-normalizer.js";
import { detectFileSignature } from "../../utils/file-signature.js";

const LEGACY_SUMMARY_ALIASES = {
  total: ["Ú©Ù„ Ø¸Ø±ÙÛŒØª", "Ú©Ù„ Ø©Ø±ÙÛŒØª", "total capacity", "prepared capacity"],
  technical: ["technical"],
  planned: ["Ø¸Ø±ÙÛŒØª Ù¾Ù„Ù†", "Ø¸Ø±ÙÛŒØª Ù¾Ù„Ø§Ù†", "planned capacity"],
  unplanned: ["Ø¸Ø±ÙÛŒØª Ø¢Ù†Ù¾Ù„Ù†", "Ø¸Ø±ÙÛŒØª Ø§Ù†Ù¾Ù„Ù†", "unplanned capacity"]
};

function findSummaryRow(rows, canonical, { fuzzyTotal = false } = {}) {
  const aliases = [...(LEGACY_SUMMARY_ALIASES[canonical] || []), ...(CAPACITY_COLUMN_ALIASES[canonical] || [])];
  const comparableAliases = aliases.map(comparable);
  const looseAliases = aliases.map(looseComparable);
  return rows.find((row) => {
    const key = comparable(row[0]);
    const looseKey = looseComparable(row[0]);
    return comparableAliases.includes(key)
      || looseAliases.includes(looseKey)
      || (fuzzyTotal && key.startsWith("Ú©Ù„") && (key.includes("Ø±ÙÛŒØª") || key.includes("Ø¸Ø±ÙÛŒØª")))
      || (fuzzyTotal && looseKey.startsWith("کل") && looseKey.includes("ظرفیت"));
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
  if (!window.XLSX) throw new Error("Ú©ØªØ§Ø¨Ø®Ø§Ù†Ù‡ SheetJS Ø¨Ø§Ø±Ú¯Ø°Ø§Ø±ÛŒ Ù†Ø´Ø¯Ù‡ Ø§Ø³Øª.");
  const signature = detectFileSignature(arrayBuffer);
  console.group?.("Capacity Parsing");
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false, cellNF: true, cellFormula: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  const headerIndex = rows.findIndex((row) => row.filter((cell) => normalizeString(cell)).length > 1);
  const originalHeaders = rows[Math.max(headerIndex, 0)] || [];
  const headers = cleanHeaders(originalHeaders);
  const totalRow = findSummaryRow(rows, "total", { fuzzyTotal: true });
  const technicalRow = findSummaryRow(rows, "technical");
  const plannedRow = findSummaryRow(rows, "planned");
  const unplannedRow = findSummaryRow(rows, "unplanned");
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
    const total = totalRow ? normalizeHours(totalRow[columnIndex]).hours : null;
    const planned = plannedRow ? normalizeHours(plannedRow[columnIndex]).hours : null;
    const unplanned = unplannedRow ? normalizeHours(unplannedRow[columnIndex]).hours : null;
    return withCapacityFallbacks({
      id: `capacity-col-${columnIndex}`,
      columnIndex,
      originalHeader,
      normalizedHeader: normalizeString(displayName),
      mergedParent,
      capacityName: normalizeString(displayName) || `Ø³ØªÙˆÙ† Ø¨Ø¯ÙˆÙ† Ù†Ø§Ù… ${columnIndex + 1}`,
      availableCapacity: total,
      technical: technicalRow ? normalizeHours(technicalRow[columnIndex]).hours : null,
      plannedCapacity: planned,
      unplannedCapacity: unplanned,
      capacitySources: {
        total: total === null ? "missing" : "capacity-file",
        planned: planned === null ? "" : "capacity-file",
        unplanned: unplanned === null ? "" : "capacity-file"
      },
      unresolved: !normalizeString(displayName)
    });
  });
  const result = { fileName: file.name, signature, sheetNames: workbook.SheetNames, selectedSheet: sheetName, headers, originalHeaders, people, rawRows: rows, diagnostics };
  console.log?.({ fileName: file.name, sheetNames: workbook.SheetNames, people: people.length, formulas: diagnostics.formulas.length });
  console.groupEnd?.();
  return result;
}

export function withCapacityFallbacks(person) {
  const total = person.availableCapacity;
  const plannedMissing = person.plannedCapacity === null || person.plannedCapacity === undefined || Number.isNaN(person.plannedCapacity);
  const unplannedMissing = person.unplannedCapacity === null || person.unplannedCapacity === undefined || Number.isNaN(person.unplannedCapacity);
  return {
    ...person,
    plannedCapacity: plannedMissing && Number.isFinite(total) ? total * 0.8 : person.plannedCapacity,
    unplannedCapacity: unplannedMissing && Number.isFinite(total) ? total * 0.2 : person.unplannedCapacity,
    capacitySources: {
      total: person.capacitySources?.total || (Number.isFinite(total) ? "capacity-file" : "missing"),
      planned: plannedMissing ? (Number.isFinite(total) ? "fallback-80-percent" : "missing") : (person.capacitySources?.planned || "capacity-file"),
      unplanned: unplannedMissing ? (Number.isFinite(total) ? "fallback-20-percent" : "missing") : (person.capacitySources?.unplanned || "capacity-file")
    }
  };
}
