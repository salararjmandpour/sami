import { FIELD_ALIASES } from "../../config/field-aliases.js";
import { buildHeaderMap, cleanHeaders } from "../normalization/header-normalizer.js";
import { normalizeString, comparable } from "../normalization/string-normalizer.js";
import { detectFileSignature } from "../../utils/file-signature.js";

function sheetToObjects(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  if (!rows.length) return { headers: [], originalHeaders: [], rows: [] };
  const originalHeaders = rows[0];
  const headers = cleanHeaders(originalHeaders);
  return {
    headers,
    originalHeaders,
    rows: rows.slice(1)
      .map((row, rowIndex) => ({ row, rowNumber: rowIndex + 2 }))
      .filter(({ row }) => row.some((cell) => normalizeString(cell) !== ""))
      .map(({ row, rowNumber }) => {
        const obj = { __rowNumber: rowNumber, __cellMeta: {} };
        headers.forEach((header, index) => {
          const address = XLSX.utils.encode_cell({ r: rowNumber - 1, c: index });
          const cell = sheet[address] || {};
          obj[header] = row[index] ?? "";
          obj.__cellMeta[header] = {
            address,
            type: cell.t || "",
            format: cell.z || "",
            text: cell.w || "",
            formula: cell.f || "",
            rawValue: cell.v ?? row[index] ?? ""
          };
        });
        return obj;
      })
  };
}

function sheetDiagnostics(workbook) {
  const formulas = [];
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    Object.entries(sheet).forEach(([address, cell]) => {
      if (address[0] !== "!" && cell.f) {
        formulas.push({ sheetName, address, formula: cell.f, cachedValue: cell.v, format: cell.z || "", text: cell.w || "" });
      }
    });
    return { sheetName, rows: range.e.r + 1, columns: range.e.c + 1, merges: sheet["!merges"] || [] };
  });
  return { sheets, formulas };
}

export async function parseJiraWorkbook(file, arrayBuffer) {
  if (!window.XLSX) throw new Error("کتابخانه SheetJS بارگذاری نشده است.");
  const signature = detectFileSignature(arrayBuffer);
  console.group?.("Jira Parsing");
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false, cellNF: true, cellFormula: true });
  const sheetNames = workbook.SheetNames;
  const qaSheet = sheetNames.find((name) => ["qa return", "qa returns", "برگشت qa"].includes(comparable(name)));
  const mainSheet = sheetNames.find((name) => name !== qaSheet) || sheetNames[0];
  const main = sheetToObjects(workbook.Sheets[mainSheet]);
  const qa = qaSheet ? sheetToObjects(workbook.Sheets[qaSheet]) : { headers: [], originalHeaders: [], rows: [] };
  const result = {
    fileName: file.name,
    signature,
    sheetNames,
    suggestedMainSheet: mainSheet,
    suggestedQaSheet: qaSheet || "",
    main,
    qa,
    fieldMap: buildHeaderMap(main.headers, FIELD_ALIASES),
    diagnostics: sheetDiagnostics(workbook)
  };
  console.log?.({ fileName: file.name, sheetNames, suggestedMainSheet: mainSheet, suggestedQaSheet: qaSheet || "", formulas: result.diagnostics.formulas.length });
  console.groupEnd?.();
  return result;
}
