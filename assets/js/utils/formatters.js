export function formatNumber(value, suffix = "") {
  if (value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))) return "N/A";
  if (typeof value === "string" && /^[+-]?(?:infinity|nan)$/i.test(value.trim())) return "N/A";
  return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

export function formatPercent(value) {
  return formatNumber(value, "%");
}

export function formatDate(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("fa-IR");
}

export function metric(value, suffix = "", reason = "", extra = {}) {
  const invalid = typeof value === "number" && !Number.isFinite(value);
  const unavailable = invalid || value === null || value === undefined;
  return {
    value: unavailable ? null : value,
    displayValue: unavailable ? "N/A" : formatNumber(value, suffix),
    status: unavailable ? "unavailable" : "ok",
    reason: unavailable ? (reason || (invalid ? "The calculation did not produce a finite number." : "Required data is missing.")) : "",
    unit: suffix,
    ...extra
  };
}
