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
  const looksLikeDuration = /\[h\]|h+:?m+|m+:?s+/i.test(format);
  return { raw: value, hours: looksLikeDuration || (number > 0 && number < 1) ? number * 24 : number };
}
