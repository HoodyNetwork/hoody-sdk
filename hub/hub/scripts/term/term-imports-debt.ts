// Drop-only maintenance of scripts/lint/term-imports.debt.cjs (the term-import debt): lists the rows
// that are no longer refusals (file gone, import gone, or the import is now allowed) and, with --write, deletes them.
// It never adds a row: a new refusal is an eslint error to fix, not debt.
//   bun scripts/term/term-imports-debt.ts            report stale rows (exit 1 when any)
//   bun scripts/term/term-imports-debt.ts --write    delete them from the debt file
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const HUB = path.resolve(import.meta.dir, '..', '..');
const DEBT = path.join(HUB, 'scripts', 'lint', 'term-imports.debt.cjs');
const req = createRequire(import.meta.url);
const { termImport } = req('../lint/term-imports.cjs') as { termImport(file: string, spec: string): { ok: boolean } | null };
const { ROWS } = req(DEBT) as { ROWS: Array<{ file: string; spec: string; fixBy: string }> };

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Why a row is stale, or null when it is still a live refusal. */
export function staleWhy(r: { file: string; spec: string }): string | null {
  const f = path.join(HUB, 'src', r.file);
  if (!fs.existsSync(f)) return 'file gone';
  if (!new RegExp(`(?:from|import)\\s*\\(?\\s*['"]${esc(r.spec)}['"]`).test(fs.readFileSync(f, 'utf8'))) return 'import gone';
  const v = termImport(f, r.spec);
  return !v || v.ok ? 'no longer refused' : null;
}

if (import.meta.main) {
  const stale = ROWS.map((r) => ({ r, why: staleWhy(r) })).filter((x) => x.why !== null);
  for (const { r, why } of stale) console.log(`${why}: ${r.file} ${r.spec}`);
  console.log(`${stale.length} stale of ${ROWS.length} rows`);
  if (process.argv.includes('--write') && stale.length) {
    const drop = new Set(stale.map(({ r }) => `${r.file}\0${r.spec}`));
    // One row per line in the debt file: delete exactly the lines of the stale rows.
    const out = fs.readFileSync(DEBT, 'utf8').split('\n').filter((line) => {
      const m = /^\s*\{ file: ("[^"]*"), spec: ("[^"]*"), fixBy: /.exec(line);
      return !m || !drop.has(`${JSON.parse(m[1]!)}\0${JSON.parse(m[2]!)}`);
    });
    fs.writeFileSync(DEBT, out.join('\n'));
    const left = (req(DEBT) as { ROWS: unknown[] }).ROWS.length;
    console.log(`wrote ${DEBT}: ${left} rows`);
  } else if (stale.length) process.exitCode = 1;
}
