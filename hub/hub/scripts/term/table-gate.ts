// Table gate of the page goldens (goldens.ts): the kit table check (src/term/prim/TableCheck.ts `tableFaults`) on every
// frame the page gate draws (not the `-no-origin` duplicates), judged against the page's own allowance file
// (term-golden/allowance.json) under the list key `tableFaults`, rows `<cols>x<rows>|<kind>`:
//
//   - a fault whose size+kind has no row FAILS (rule `table-<kind>`, naming page, size, case, screen row, what is wrong);
//   - a row whose size+kind no longer happens FAILS too (`table-allowance-stale`) on a run that drew every case;
//   - `--update` drops gone rows with the other lists (shrink-only) and never adds one. The first rows of a page are a
//     reviewed hand edit, or `bun scripts/term/table-gate.ts --seed <goldens --json file>` once (pages with no
//     `tableFaults` key only).
// Fix the table instead of listing it: the kinds are documented in TableCheck.ts and src/term/docs/prims.md.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import path from 'node:path';
import { HUB } from './resolve';

export interface TableProblem { file: string; rule: string; message: string; fix: string }
/** One table fault seen on a frame. */
export interface TableHit { cols: number; rows: number; kind: string; case: string; path: string; detail: string }

/** An allowance row: size and kind (the page is the file's). */
export const tableKey = (cols: number, rows: number, kind: string): string => `${cols}x${rows}|${kind}`;
const ROW = /^\d+x\d+\|table-[a-z-]+$/;

export const TABLE_FIX: Record<string, string> = {
  'table-misaligned': 'A body cell does not start where its header does: a fault of the DataTable column plan (src/kit/data/DataTable.term.tsx); report it with the page and size.',
  'table-actions-clipped': 'The row actions are past what the table shows: let the columns before them give way (meta priority, a narrower width) so the actions stay on screen (src/kit/data/DataTable.term.tsx plans it).',
  'table-ellipsis': 'Words cut with "..." or a "…" before their end: cut at the end with one "…" (prim Text truncate, ClipText, ClipRow).',
  'table-wrap-cut': 'A cell text wraps onto lines the cell does not show: make it one line cut with "…" (prim Text truncate, ClipText, or ClipRow for an element cell).',
  'table-cut-unmarked': 'A cell text is clipped at its edge with no "…": cut it with one "…" (prim Text truncate, ClipText, or ClipRow for an element cell).',
  'table-no-gap': 'Two cells\' words touch: a cell is cut with "…" at its column width, which leaves the column gap (src/kit/data/DataTable.term.tsx column plan; an element cell keeps its parts inside its box).',
};

/**
 * One page's table problems. `allowed`: the page allowance's `tableFaults`. `complete`: every case was drawn (no crash),
 * so a row that did not happen is stale; `update`: the run shrinks the list itself, so stale rows are not problems.
 */
export function tableProblems(page: string, file: string, hits: readonly TableHit[], allowed: readonly string[], o: { complete: boolean; update: boolean }): { problems: TableProblem[]; seen: string[] } {
  const problems: TableProblem[] = [];
  const bad = allowed.filter((r) => !ROW.test(r));
  if (bad.length) problems.push({ file, rule: 'table-allowance-malformed', message: `page "${page}" tableFaults rows must read "<cols>x<rows>|table-<kind>": ${bad.slice(0, 3).join(', ')}`, fix: 'Correct the rows (scripts/term/table-gate.ts).' });
  const first = new Map<string, TableHit>();
  for (const h of hits) { const k = tableKey(h.cols, h.rows, h.kind); if (!first.has(k)) first.set(k, h); }
  const allow = new Set(allowed);
  for (const [k, h] of first) {
    if (allow.has(k)) continue;
    problems.push({ file, rule: h.kind, message: `"${page}" at ${h.cols}x${h.rows}, case "${h.case}": ${h.path}: ${h.detail}`, fix: TABLE_FIX[h.kind] ?? 'Fix the table (src/term/prim/TableCheck.ts names each kind).' });
  }
  if (o.complete && !o.update) {
    for (const k of allowed) if (!first.has(k) && ROW.test(k)) problems.push({ file, rule: 'table-allowance-stale', message: `page "${page}": allowed table fault no longer happens: ${k}`, fix: `\`bun scripts/term/check.ts --page ${page} --update\` drops it (the list only shrinks).` });
  }
  return { problems, seen: [...first.keys()] };
}

// CLI: bun scripts/term/table-gate.ts --seed <goldens --json file>
// Writes `tableFaults` into each page allowance that has no such key yet (the first rows), never into one that has it.
if (import.meta.main) {
  const i = process.argv.indexOf('--seed');
  const src = i >= 0 ? process.argv[i + 1] : undefined;
  if (!src) { process.stderr.write('usage: bun scripts/term/table-gate.ts --seed <goldens --json file>\n'); process.exit(2); }
  const run = JSON.parse(fs.readFileSync(src, 'utf8')) as { results: Array<{ page: string; tableSeen?: string[] }> };
  let n = 0;
  for (const r of run.results) {
    const f = path.join(HUB, 'src', 'pages', r.page, 'term-golden', 'allowance.json');
    if (!fs.existsSync(f)) { process.stdout.write(`skip ${r.page}: no allowance file\n`); continue; }
    const a = JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, unknown>;
    if (Array.isArray(a.tableFaults)) { process.stdout.write(`skip ${r.page}: tableFaults already set\n`); continue; }
    a.tableFaults = [...new Set(r.tableSeen ?? [])].sort();
    const { untranslatable, ...rest } = a;
    fs.writeFileSync(f, JSON.stringify({ ...rest, untranslatable }, null, 2) + '\n');
    n += (a.tableFaults as string[]).length;
    process.stdout.write(`${r.page}: ${(a.tableFaults as string[]).length} rows\n`);
  }
  process.stdout.write(`seeded ${n} rows\n`);
}
