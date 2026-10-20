import { normalizeNumber } from "./number-normalizer.js";

export function normalizeHours(value, { excelDayFraction = false } = {}) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return { raw: value, hours: (value.getTime() - excelEpoch) / 36e5 };
  }
  const number = normalizeNumber(value);
  if (number === null) return { raw: value, hours: null };
  return { raw: value, hours: excelDayFraction ? number * 24 : number };
}

export function normalizePossibleExcelHours(value, cellMeta = {}) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return normalizeHours(value);
  const number = normalizeNumber(value);
  if (number === null) return { raw: value, hours: null };
  const format = String(cellMeta.format || cellMeta.z || "");
  return { raw: value, hours: isExcelDurationFormat(format) ? number * 24 : number };
}

export function isExcelDurationFormat(format) {
  return /\[h\]|h+:?m+|m+:?s+/i.test(String(format || ""));
}
