const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;
const PERSIAN_MAP = new Map([
  ["ي", "ی"],
  ["ى", "ی"],
  ["ك", "ک"],
  ["ة", "ه"],
  ["ۀ", "ه"],
  ["ؤ", "و"],
  ["إ", "ا"],
  ["أ", "ا"],
  ["ٱ", "ا"]
]);

export function normalizeString(value) {
  return String(value ?? "")
    .replace(ZERO_WIDTH, "")
    .split("").map((ch) => PERSIAN_MAP.get(ch) || ch).join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function comparable(value) {
  return normalizeString(value).toLocaleLowerCase("fa-IR");
}

export function looseComparable(value) {
  return comparable(value)
    .replace(/[\u0640]/g, "")
    .replace(/[\-_\u2010-\u2015/\\|،,.;:()[\]{}]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
