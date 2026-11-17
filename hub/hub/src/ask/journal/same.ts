// same.ts: deep equality of two stored values, key order aside (the door's read-back and the neverLeft removal use it).
/** Deep equality of two entry values, key order aside. */
export function sameValue(a: unknown, b: unknown): boolean {
  return canon(a) === canon(b);
}
function canon(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'undefined';
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
}
