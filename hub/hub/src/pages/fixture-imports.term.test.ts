// Live page modules reach fixtures only through core's seam (pageFixtures, fixtureComputer), never by importing the
// fixture engine app/fixtures.ts: the terminal ship build refuses any fixture module as an input (TERM_FIXTURE_INPUT,
// scripts/term/build.ts). Fixture-only files (pages/*/fixtures.ts and the like, scripts/term/build/plugin.ts isDevOnly)
// may import it.
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { isDevOnly } from '../../scripts/term/build/plugin';

const HUB = path.resolve(import.meta.dir, '..', '..');
const PAGES = path.join(HUB, 'src', 'pages');
const ENGINE = /\bfrom\s+['"](?:@app\/fixtures|(?:\.\.\/)+app\/fixtures)['"]|\bimport\(\s*['"]@app\/fixtures['"]\s*\)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.[cm]?tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const REL_IMPORT = /\b(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

function resolveRel(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, ...['.ts', '.tsx', '.mts'].map((x) => base + x), ...['index.ts', 'index.tsx'].map((x) => path.join(base, x))]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

const PAGE_ENTRY = /\/src\/pages\/[^/]+\/page\.ts$/;

/** Modules on the fixture side: dev-only by name, or imported only by fixture-side modules (relative imports across
 *  `files`, every hub/src module). Entries stay live: a module nothing imports, and every pages/<id>/page.ts (app/pages.ts
 *  finds them by glob, so a test importing one does not make it fixture-side). */
export function fixtureSide(files: readonly string[]): Set<string> {
  const importers = new Map<string, Set<string>>();
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(REL_IMPORT)) {
      const to = resolveRel(f, m[1]!);
      if (to) (importers.get(to) ?? importers.set(to, new Set()).get(to)!).add(f);
    }
  }
  const side = new Set(files.filter((f) => isDevOnly(path.relative(HUB, f))));
  for (let grew = true; grew;) {
    grew = false;
    for (const f of files) {
      const by = importers.get(f);
      if (!side.has(f) && !PAGE_ENTRY.test(f) && by && by.size && [...by].every((i) => side.has(i))) { side.add(f); grew = true; }
    }
  }
  return side;
}

export function liveFixtureEngineImports(): string[] {
  const files = walk(PAGES);
  const side = fixtureSide(walk(path.join(HUB, 'src')));
  return files.filter((f) => !side.has(f) && ENGINE.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(HUB, f)).sort();
}

describe('page modules and the fixture engine', () => {
  test('the pattern catches the forms a page used', () => {
    expect(ENGINE.test("import { fixtureSource } from '@app/fixtures';")).toBe(true);
    expect(ENGINE.test("import { x } from '../../app/fixtures';")).toBe(true);
    expect(ENGINE.test("import { pageFixtures } from '@core';")).toBe(false);
  });
  test('pages/*/fixtures.ts counts as fixture-only', () => {
    expect(isDevOnly('src/pages/billing/fixtures.ts')).toBe(true);
    expect(isDevOnly('src/pages/billing/data.ts')).toBe(false);
  });
  test('a module only fixtures import is fixture-side; one a live module imports is not', () => {
    const side = fixtureSide(walk(path.join(HUB, 'src')));
    expect(side.has(path.join(PAGES, 'notes', 'fixtureApi.ts'))).toBe(true);
    expect(side.has(path.join(PAGES, 'billing', 'data.ts'))).toBe(false);
  });
  test('no live page module imports app/fixtures (use pageFixtures from @core)', () => {
    expect(liveFixtureEngineImports()).toEqual([]);
  });
});
