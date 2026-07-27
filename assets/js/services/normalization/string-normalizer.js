const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;
const PERSIAN_MAP = new Map([
  ["ي", "ی"], ["ك", "ک"], ["ة", "ه"], ["ۀ", "ه"], ["ؤ", "و"], ["إ", "ا"], ["أ", "ا"], ["ٱ", "ا"]
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

