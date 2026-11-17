// global-inputs.ts: --affected / --changed name the global input that made them select every page.
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { globalChangeWhy, globalInputChanges, hashGlobalInputs } from './global-inputs';

const prev = { 'src/kit/tokens.css': 'a', 'scripts/term/x.json': 'b', '../../bun.lock': 'c' };

test('names the changed, added and removed global inputs', () => {
  const now = { 'src/kit/tokens.css': 'A', '../../bun.lock': 'c', 'src/app/base.css': 'd' };
  expect(globalInputChanges(prev, now)).toEqual(['src/app/base.css (added)', 'src/kit/tokens.css', 'scripts/term/x.json (removed)']);
  expect(globalChangeWhy(prev, now)).toBe('global input changed: src/app/base.css (added), src/kit/tokens.css, scripts/term/x.json (removed)');
});

test('a record with no per-file list says so instead of guessing', () => {
  expect(globalChangeWhy(undefined, prev)).toContain('recorded no per-file list');
});

test('the hash ignores key order and moves with any content', () => {
  expect(hashGlobalInputs({ b: '1', a: '2' })).toBe(hashGlobalInputs({ a: '2', b: '1' }));
  expect(hashGlobalInputs({ a: '2', b: '1' })).not.toBe(hashGlobalInputs({ a: '2', b: '9' }));
});

test('goldens.ts records the per-file map and explains with it; check.ts prints a shared reason once', () => {
  const g = fs.readFileSync(path.join(import.meta.dir, 'goldens.ts'), 'utf8');
  expect(g).toContain('st.globalFiles = gf');
  expect(g).toContain('globalChangeWhy(st.globalFiles, gf)');
  const c = fs.readFileSync(path.join(import.meta.dir, 'check.ts'), 'utf8');
  expect(c).toContain('all because ${one}');
});

// check --changed / --affected widened to every page when ANY scripts/term JSON changed: a gate's own data (the graph
// baseline, kit classes, typecheck debt) is no input of a page run. Only what a page run reads counts.
test('global inputs hold the JSON a page run reads, not a gate\'s own data', async () => {
  const { globalInputFiles, pageRunJson } = await import('./goldens');
  const json = pageRunJson();
  expect(json).toContain('scripts/term/placeholder.allow.json');
  const keys = Object.keys(globalInputFiles());
  for (const gateOnly of ['scripts/term/contract.debt.json', 'scripts/term/graph/baseline.json', 'scripts/term/graph/seams.json', 'scripts/term/kit-classes.json', 'scripts/term/typecheck.allow.json']) {
    expect(json).not.toContain(gateOnly);
    expect(keys).not.toContain(gateOnly);
  }
});
