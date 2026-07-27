export function validateJsonArray(value, name) {
  if (!Array.isArray(value)) throw new Error(`${name} باید یک آرایه JSON باشد.`);
  return value;
}

