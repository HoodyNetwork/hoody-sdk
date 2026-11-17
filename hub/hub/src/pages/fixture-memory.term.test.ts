// A fixture module that remembers (module-level `let`, an empty Map/Set/array, an exported knob object) must be
// forgettable: one process draws many sessions (the golden runner, a test file with several renders), and a fake
// server that keeps the last session's writes draws the next one wrong (notifications: an acknowledged notice stayed
// acknowledged in the next shot). The rule: a page's fixtures.ts with memory exports `resetFixtureServer`, which the
// terminal fixture boot calls for every page (app/fixtures.ts resetFixtureServers); a fixture file beside it with memory
// exports a `reset…` function that another fixture file of the page names.
// Not seen here: memory kept in a closure inside a rules factory, and objects changed in place.
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const PAGES = import.meta.dir;
const MEMORY = /^(?:export )?let \w|^(?:export )?const \w+(?:: [^=]+)? = (?:new (?:Map|Set|WeakMap)(?:<.*>)?\(\)|\[\];?$)|^export const \w+(?:: [^=]+)? = \{ ?\w+: (?:false|true|null|-?\d+|Infinity)\b/m;

/** Files whose module memory needs no reset, each with the reason. */
const EXEMPT: Record<string, string> = {
  'ai/fixtures.ts': 'state7k is a memo of a constant catalogue',
  'ai/knowledge/skills/fixtures.ts': 'stamp only makes install times that never repeat',
  'logs/fixtures.ts': 'reads7kOnce and models7kItems are memos of a constant catalogue',
  'logs/fixtureApiSeam.ts': 'the installed factory, set once at load',
  'notes/fixtureApiSeam.ts': 'the installed factory, set once at load',
  'tunnels/fixtures.ts': 'closed empties itself at the first read of each session (req.n === 1)',
  'files/ro.fixtures.ts': 'findAsked is reset by files/fixtures.ts resetFixtureServer',
};

function fixtureFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) fixtureFiles(p, out);
    else if (/\.ts$/.test(name) && !/\.(test|spec)\./.test(name) && (/fixture/i.test(name) || name === 'world.ts')) out.push(p);
  }
  return out;
}

test('a fixture module with memory has a reset the boot reaches', () => {
  const files = fixtureFiles(PAGES);
  expect(files.length).toBeGreaterThan(40);
  const text = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
  const bad: string[] = [];
  const stale = new Set(Object.keys(EXEMPT));
  for (const [f, src] of text) {
    const rel = path.relative(PAGES, f);
    const remembers = MEMORY.test(src);
    if (rel in EXEMPT) {
      if (remembers) stale.delete(rel);
      continue;
    }
    if (!remembers) continue;
    const page = rel.split(path.sep)[0]!;
    if (rel === path.join(page, 'fixtures.ts')) {
      if (!/^export function resetFixtureServer\(\): void/m.test(src)) bad.push(`${rel}: has module memory and no exported resetFixtureServer()`);
      continue;
    }
    const names = [...src.matchAll(/^export function (reset\w*)\(/gm)].map((m) => m[1]!);
    const used = names.some((n) => [...text].some(([g, other]) => g !== f && path.relative(PAGES, g).startsWith(page + path.sep) && new RegExp(`\\b${n}\\b`).test(other)));
    if (!used) bad.push(`${rel}: has module memory and no exported reset… function that another fixture file of ${page} names`);
  }
  for (const rel of stale) bad.push(`${rel}: listed in EXEMPT but holds no module memory any more (remove the row)`);
  expect(bad).toEqual([]);
});

test('the boot reset calls each page reset by that one name', () => {
  const app = readFileSync(path.join(PAGES, '..', 'app', 'fixtures.ts'), 'utf8');
  expect(app).toContain('resetFixtureServer?.()');
});
