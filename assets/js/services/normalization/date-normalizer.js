import { normalizeDigits } from "./number-normalizer.js";

export function excelSerialToDate(serial) {
  const days = Number(serial);
  if (!Number.isFinite(days)) return null;
  const utcDays = Math.floor(days - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  const fractionalDay = days - Math.floor(days);
  const seconds = Math.round(fractionalDay * 86400);
  dateInfo.setSeconds(dateInfo.getSeconds() + seconds);
  return dateInfo;
}

export function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number") {
    const excel = excelSerialToDate(value);
    return excel ? excel.toISOString() : null;
  }
  const text = normalizeDigits(value).trim();
  if (!text) return null;
  const parsed = new Date(text.replace(/\//g, "-"));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

