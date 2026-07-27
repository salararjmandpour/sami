export function average(values) {
  const valid = values.filter((value) => value !== null && value !== undefined && !Number.isNaN(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

export function ratio(numerator, denominator) {
  if (!denominator) return null;
  return numerator / denominator * 100;
}

