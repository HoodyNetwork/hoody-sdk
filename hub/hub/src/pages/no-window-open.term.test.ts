// A page never calls window.open: in the terminal it is a TERM_GLOBAL trap (nothing opens, nothing is said, as
// on the computers row menu showed). The way out of the Hub is the kit's openOutside (kit/states/openOutside.ts),
// which keeps the web's new tab and, in a terminal, opens the host browser or copies and shows the address.
// KNOWN lists files still allowed to call it; the list only shrinks.
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = import.meta.dir;
const KNOWN: readonly string[] = [];

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, out); continue; }
    if (!/\.tsx?$/.test(name) || /\.(test|spec)\.tsx?$/.test(name)) continue;
    out.push(p);
  }
  return out;
}

test('no page source calls window.open (use openOutside from @kit)', () => {
  const hits = walk(ROOT, [])
    .filter((p) => /\bwindow\.open\s*\(/.test(readFileSync(p, 'utf8')))
    .map((p) => relative(ROOT, p))
    .sort();
  expect(hits.filter((h) => !KNOWN.includes(h))).toEqual([]);
});
