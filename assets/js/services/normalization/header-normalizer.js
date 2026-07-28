import { looseComparable, normalizeString } from "./string-normalizer.js";

export function buildHeaderMap(headers, aliases) {
  const normalizedHeaders = headers.map((header) => ({ original: header, key: looseComparable(header) }));
  const result = {};
  Object.entries(aliases).forEach(([canonical, names]) => {
    const match = names.map(looseComparable).map((alias) => normalizedHeaders.find((header) => header.key === alias)).find(Boolean);
    if (match) result[canonical] = match.original;
  });
  return result;
}

export function cleanHeaders(headers) {
  return headers.map((header, index) => normalizeString(header || `__blank_${index + 1}`));
}
