// The translator's library half (css-translate/table.ts) and everything a network-facing launcher loads for its styles
// and modules stay free of the test boundary: netns-first.ts re-runs the process with loopback only, which would cut a
// live launcher off from the real API. The command (../css-translate.ts) keeps the boundary as its first import.
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import * as command from '../css-translate';
import * as library from './table';

const TERM = path.resolve(import.meta.dir, '..');
/** Every file under scripts/term reached from `entry` by relative imports (static, dynamic, re-exports, type-only too). */
function closure(entry: string): string[] {
  const seen = new Set<string>();
  const todo = [path.join(TERM, entry)];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const base = path.resolve(path.dirname(f), m[1]!);
      const hit = [base, base + '.ts', base + '.tsx', base + '.mjs', path.join(base, 'index.ts')].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (hit && hit.startsWith(TERM + path.sep)) todo.push(hit);
    }
  }
  return [...seen].map((f) => path.relative(TERM, f)).sort();
}
const BOUNDARY = ['netns-first.ts', 'netns.ts', 'netns-required.ts', 'test-preload.ts'];

describe('what a launcher that reaches the network loads', () => {
  for (const entry of ['css-translate/table.ts', 'style-table.ts', 'loader.ts', 'resolve.ts', 'dev-route.ts']) {
    test(`${entry}: no file in its imports is the test boundary`, () => {
      const files = closure(entry);
      expect(files).toContain(entry);
      expect(files.filter((f) => BOUNDARY.includes(f))).toEqual([]);
    });
  }
  test('the walk sees the boundary where it is: the command starts with it', () => {
    expect(closure('css-translate.ts')).toContain('netns-first.ts');
    const first = fs.readFileSync(path.join(TERM, 'css-translate.ts'), 'utf8').split('\n').find((l) => l.startsWith('import ')) ?? '';
    expect(first.startsWith(`import './netns-first';`)).toBe(true);
  });
  test('style-table.ts imports the library, not the command', () => {
    const text = fs.readFileSync(path.join(TERM, 'style-table.ts'), 'utf8');
    expect(text).toContain(`from './css-translate/table'`);
    expect(text).not.toMatch(/from '\.\/css-translate'/);
  });
});

describe('the command re-exports the library', () => {
  test('every library name, the same value (importers of ../css-translate keep working)', () => {
    const names = Object.keys(library).sort();
    expect(names).toEqual(expect.arrayContaining(['HUB_SRC', 'buildTable', 'cssModuleSource', 'listModules', 'loadSources', 'loadTable', 'moduleExports', 'styleOf', 'useTable', 'widthClassOf', 'createStyleLookup', 'moduleKey']));
    for (const n of names) expect((command as Record<string, unknown>)[n], n).toBe((library as Record<string, unknown>)[n]);
  });
  test('the library still finds the Hub sources from its new place', () => {
    expect(fs.existsSync(path.join(library.HUB_SRC, 'kit', 'tokens.css'))).toBe(true);
    expect(library.listModules().length).toBeGreaterThan(50);
  });
});
