// A run never writes into another tree through a linked node_modules. The live proof is
// `bun scripts/term/nm-write-guard.ts` (a narrow web run + the page gate, then an mtime scan); this file pins its parts
// without writing outside the repo: the outside test, the cache defaults, --configLoader runner, and the scan itself.
import { afterAll, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { cacheBase, nodeModulesOutside, viteArgs } from '../lib';
import { changedUnder } from './nm-write-guard';

const TMP = path.join(import.meta.dir, '..', '..', '.term-cache', 'tmp', `nm-guard-${process.pid}`);
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('node_modules linked from outside the repo moves every cache default into hub/.term-cache', () => {
  const other = path.join(TMP, 'other', 'node_modules');
  const copy = path.join(TMP, 'copy');
  const own = path.join(TMP, 'own');
  fs.mkdirSync(other, { recursive: true });
  fs.mkdirSync(path.join(copy, 'hub'), { recursive: true });
  fs.mkdirSync(path.join(own, 'node_modules'), { recursive: true });
  fs.symlinkSync(other, path.join(copy, 'node_modules'));
  expect(nodeModulesOutside(copy)).toBe(true);
  expect(nodeModulesOutside(own)).toBe(false);
  expect(cacheBase('.cache/hub-work', copy)).toBe(path.join(copy, 'hub', '.term-cache', 'cache/hub-work'));
  expect(cacheBase('.vite-hub-build', copy)).toBe(path.join(copy, 'hub', '.term-cache', 'vite-hub-build'));
  expect(cacheBase('.cache/hub-work', own)).toBe(path.join(own, 'node_modules', '.cache/hub-work'));
});

test('the real tree: node_modules is outside, so the work dir default is in the copy', () => {
  const api = path.resolve(import.meta.dir, '..', '..', '..');
  if (!nodeModulesOutside(api)) return;
  expect(cacheBase('.cache/hub-work', api).startsWith(path.join(api, 'hub', '.term-cache'))).toBe(true);
  // vite.config.mts and both Playwright configs carry the same check (no import of lib.ts there).
  for (const f of ['vite.config.mts', 'playwright.config.ts', 'playwright.shots.config.ts']) {
    expect(fs.readFileSync(path.join(api, 'hub', f), 'utf8')).toContain(".term-cache");
  }
});

test('vite and vitest always load their config in process (--configLoader runner); other tools untouched', () => {
  expect(viteArgs('/x/node_modules/vitest/vitest.mjs', ['run', '--config', 'c', 'f.test.ts'])).toEqual(['run', '--configLoader', 'runner', '--config', 'c', 'f.test.ts']);
  expect(viteArgs('/x/node_modules/vite/bin/vite.js', ['build', '--config', 'c'])).toEqual(['build', '--configLoader', 'runner', '--config', 'c']);
  expect(viteArgs('/x/node_modules/vite/bin/vite.js', ['--config', 'c', '--port', '1'])).toEqual(['--configLoader', 'runner', '--config', 'c', '--port', '1']);
  expect(viteArgs('/x/node_modules/vitest/vitest.mjs', ['run', '--configLoader=bundle'])).toEqual(['run', '--configLoader=bundle']);
  expect(viteArgs('/x/node_modules/eslint/bin/eslint.js', ['src'])).toEqual(['src']);
  const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dir, '..', '..', '..', 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  for (const [k, v] of Object.entries(pkg.scripts)) if (/^hub:/.test(k) && /vitest\.mjs|vite\.js/.test(v)) expect(`${k}: ${v}`).toContain('--configLoader runner');
});

test('the scan names a file written under a cache dir after the start, and nothing older', () => {
  const nm = path.join(TMP, 'scan', 'node_modules');
  fs.mkdirSync(path.join(nm, '.vite-temp'), { recursive: true });
  fs.mkdirSync(path.join(nm, 'pkg'), { recursive: true });
  const old = Date.now() / 1000 - 3600;
  for (const p of [nm, path.join(nm, '.vite-temp'), path.join(nm, 'pkg')]) fs.utimesSync(p, old, old);
  const since = Date.now() - 1000;
  expect(changedUnder(nm, since)).toEqual([]);
  fs.writeFileSync(path.join(nm, '.vite-temp', 'vite.config.mts.timestamp-1.mjs'), 'x');
  const hits = changedUnder(nm, since);
  expect(hits).toContain(path.join(nm, '.vite-temp', 'vite.config.mts.timestamp-1.mjs'));
  fs.mkdirSync(path.join(nm, '.cache', 'hub-work'), { recursive: true });
  expect(changedUnder(nm, since)).toContain(path.join(nm, '.cache', 'hub-work'));
});
