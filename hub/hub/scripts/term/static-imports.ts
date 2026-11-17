// static-imports.ts: the static (value) import graph of the runner's own modules, read from source (no evaluation).
// goldens-entry.term.test.ts uses it to refuse an evaluation cycle with a runner entry; goldens.ts uses it to know
// which JSON tables of scripts/term a page run reads (its global inputs): a gate's own data (graph baseline, kit
// classes, typecheck debt) is read by no module a page run loads, so changing it selects no page (check --changed).
import fs from 'node:fs';
import path from 'node:path';

const EXT = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '/index.ts', '/index.tsx'];
/** A relative specifier from `from`, resolved to a file; null for a package or an unresolved path. */
export function resolveRel(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const e of EXT) { const f = base + e; if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; }
  return null;
}
const STATIC = /^\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
const DYNAMIC = /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g;
/** Static value imports of a file (`import type` / `export type` are erased); with `dynamic`, literal `import('./x')` too. */
export function staticImports(file: string, o: { dynamic?: boolean } = {}): string[] {
  const src = fs.readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of src.matchAll(STATIC)) {
    if (/^\s*(?:import|export)\s+type\s/.test(m[0])) continue;
    const r = resolveRel(file, m[1]!);
    if (r) out.push(r);
  }
  if (o.dynamic) for (const m of src.matchAll(DYNAMIC)) { const r = resolveRel(file, m[1]!); if (r) out.push(r); }
  return out;
}
/** The import trail from `start` to `target` (static imports only), or null. */
export function reaches(start: string, target: string): string[] | null {
  const seen = new Set<string>();
  const walk = (f: string, trail: string[]): string[] | null => {
    if (f === target) return trail;
    if (seen.has(f)) return null;
    seen.add(f);
    for (const n of staticImports(f)) { const r = walk(n, [...trail, n]); if (r) return r; }
    return null;
  };
  return walk(start, [start]);
}
/** Every file reachable from `starts` (static and literal dynamic imports) whose path `keep` accepts (default all). */
export function closureOf(starts: readonly string[], keep: (f: string) => boolean = () => true): Set<string> {
  const seen = new Set<string>();
  const todo = [...starts];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f) || !keep(f)) continue;
    seen.add(f);
    for (const n of staticImports(f, { dynamic: true })) todo.push(n);
  }
  return seen;
}
