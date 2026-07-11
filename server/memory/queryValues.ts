export function readQueryStringArray(value: unknown) {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return [...new Set(
    values
      .flatMap((item) => (typeof item === 'string' ? item.split(',') : []))
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

export function readQueryBoolean(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === true || candidate === 'true' || candidate === '1';
}
