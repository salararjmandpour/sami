import { FIELD_ALIASES } from "../../config/field-aliases.js";
import { REQUIRED_FIELDS } from "../../utils/constants.js";
import { buildHeaderMap, cleanHeaders } from "../normalization/header-normalizer.js";
import { normalizeString, comparable } from "../normalization/string-normalizer.js";
import { assertSpreadsheetBytes } from "../../utils/file-signature.js";

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
  const signature = assertSpreadsheetBytes(arrayBuffer, "فایل Jira");
  console.group?.("Jira Parsing");
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false, cellNF: true, cellFormula: true });
  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) throw new Error("فایل Jira هیچ شیتی ندارد.");
  const qaSheet = sheetNames.find((name) => ["qa return", "qa returns", "برگشت qa"].includes(comparable(name)));
  const mainSheet = sheetNames.find((name) => name !== qaSheet) || sheetNames[0];
  const mainSheetObject = workbook.Sheets[mainSheet];
  if (!mainSheetObject) throw new Error("شیت اصلی Jira خوانده نشد.");
  const main = sheetToObjects(mainSheetObject);
  const qa = qaSheet ? sheetToObjects(workbook.Sheets[qaSheet]) : { headers: [], originalHeaders: [], rows: [] };
  const fieldMap = buildHeaderMap(main.headers, FIELD_ALIASES);
  assertJiraContent(main, fieldMap);
  const result = {
    fileName: file.name,
    signature,
    sheetNames,
    suggestedMainSheet: mainSheet,
    suggestedQaSheet: qaSheet || "",
    main,
    qa,
    fieldMap,
    diagnostics: sheetDiagnostics(workbook)
  };
  console.log?.({ fileName: file.name, sheetNames, suggestedMainSheet: mainSheet, suggestedQaSheet: qaSheet || "", formulas: result.diagnostics.formulas.length });
  console.groupEnd?.();
  return result;
}

function assertJiraContent(main, fieldMap) {
  const missing = REQUIRED_FIELDS.filter((field) => !fieldMap[field]);
  if (missing.length) throw new Error("ستون‌های ضروری Jira، کلید مسئله و وضعیت، پیدا نشد.");
  const usableRows = (main.rows || []).filter((row) => REQUIRED_FIELDS.every((field) => normalizeString(row[fieldMap[field]])));
  if (!usableRows.length) throw new Error("فایل Jira ردیف مسئله با کلید و وضعیت ندارد.");
}
