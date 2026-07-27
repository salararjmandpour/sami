export function test(name, fn) {
  window.__tests ||= [];
  window.__tests.push({ name, fn });
}

export function equal(actual, expected) {
  if (actual !== expected) throw new Error(`expected ${expected}, got ${actual}`);
}

export function close(actual, expected, tolerance = 0.01) {
  if (Math.abs(actual - expected) > tolerance) throw new Error(`expected ${expected}, got ${actual}`);
}

export function ok(value) {
  if (!value) throw new Error("expected truthy value");
}

