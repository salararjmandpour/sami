import { repairMojibake } from "./string-normalizer.js";

const DIGITS = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9"
};

export function normalizeDigits(value) {
  return repairMojibake(String(value ?? "")).replace(/[۰-۹٠-٩]/g, (d) => DIGITS[d] || d);
}

export function normalizeNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = normalizeDigits(value).replace(/,/g, "").trim();
  if (normalized === "") return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}
