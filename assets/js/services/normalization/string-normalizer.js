const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;
const MOJIBAKE_HINT = /[\u00D8\u00D9\u00DB\u00DA\u00C3\u00C2\u00CE][\s\S]*[\u00D8\u00D9\u00DB\u00DA\u00C3\u00C2\u00CE]|\u00E2\u20AC|\u00E2\u20AC\u201C|\u00E2\u2020|\u00C3\u017D|\u00C2\u00A3|\u00CE\u00A3/;
const WINDOWS_1252_BYTES = new Map([
  ["\u20AC", 0x80], ["\u201A", 0x82], ["\u0192", 0x83], ["\u201E", 0x84], ["\u2026", 0x85],
  ["\u2020", 0x86], ["\u2021", 0x87], ["\u02C6", 0x88], ["\u2030", 0x89], ["\u0160", 0x8A],
  ["\u2039", 0x8B], ["\u0152", 0x8C], ["\u017D", 0x8E], ["\u2018", 0x91], ["\u2019", 0x92],
  ["\u201C", 0x93], ["\u201D", 0x94], ["\u2022", 0x95], ["\u2013", 0x96], ["\u2014", 0x97],
  ["\u02DC", 0x98], ["\u2122", 0x99], ["\u0161", 0x9A], ["\u203A", 0x9B], ["\u0153", 0x9C],
  ["\u017E", 0x9E], ["\u0178", 0x9F]
]);
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
  return repairMojibake(String(value ?? ""))
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

export function repairMojibake(value) {
  let text = String(value ?? "");
  for (let i = 0; i < 2; i += 1) {
    if (!MOJIBAKE_HINT.test(text)) return text;
    const repaired = decodeWindows1252Utf8(text);
    if (!looksMoreReadable(repaired, text) && !(repaired !== text && MOJIBAKE_HINT.test(repaired))) return text;
    text = repaired;
  }
  return text;
}

function decodeWindows1252Utf8(text) {
  const bytes = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (WINDOWS_1252_BYTES.has(ch)) bytes.push(WINDOWS_1252_BYTES.get(ch));
    else if (code <= 0xFF) bytes.push(code);
    else return text;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return text;
  }
}

function looksMoreReadable(candidate, original) {
  const persianScore = (candidate.match(/[\u0600-\u06FF]/g) || []).length;
  const originalPersianScore = (original.match(/[\u0600-\u06FF]/g) || []).length;
  const sigmaScore = (candidate.match(/Σ/g) || []).length;
  const originalSigmaScore = (original.match(/Σ/g) || []).length;
  return persianScore > originalPersianScore || sigmaScore > originalSigmaScore;
}
