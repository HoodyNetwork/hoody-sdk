// What bare '@core' names in each web mode (vite.modes.ts, used by vite.config.mts): the fixture barrel only where fixtures
// run, the web barrel (index.ts) in a production build. The web barrel offers every name the web Hub's barrel offered
// (core-barrel.web-names.json); its fixture-free part, index.live.ts, is what the terminal ship build names '@core'.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { coreBarrelFor, hubFixturesFor } from '../../vite.modes';
import WEB_NAMES from './core-barrel.web-names.json';

const HUB = path.join(__dirname, '..', '..');
const LIVE_EXPORTS = fs.readFileSync(path.join(HUB, 'src/core/index.live.ts'), 'utf8');

/** The names a barrel exports (values and types), following its `export * from './x'` into core's own files. */
function exportedNames(file: string, seen = new Set<string>()): Set<string> {
  const out = new Set<string>();
  if (seen.has(file)) return out;
  seen.add(file);
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      const spec = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : '';
      if (!st.exportClause) {
        if (spec.startsWith('./')) for (const n of exportedNames(path.join(path.dirname(file), spec + '.ts'), seen)) out.add(n);
      } else if (ts.isNamespaceExport(st.exportClause)) out.add(st.exportClause.name.text);
      else for (const e of st.exportClause.elements) out.add(e.name.text);
    } else if (ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) { if (ts.isIdentifier(d.name)) out.add(d.name.text); }
      else {
        const nm = (st as { name?: ts.Identifier }).name;
        if (nm) out.add(nm.text);
      }
    }
  }
  return out;
}

describe('@core by mode', () => {
  it.each([
    ['build', 'production', false],
    ['build', 'fixtures', true],
    ['serve', 'development', true],
    ['serve', 'test', true],
    ['build', 'test', true],
  ] as const)('%s --mode %s: fixtures %s', (command, mode, want) => {
    expect(hubFixturesFor(command, mode)).toBe(want);
    expect(coreBarrelFor(HUB, want)).toBe(path.join(HUB, want ? 'src/core/index.fixtures.ts' : 'src/core/index.ts'));
  });

  it('vite.config.mts takes both from vite.modes.ts', () => {
    const cfg = fs.readFileSync(path.join(HUB, 'vite.config.mts'), 'utf8');
    expect(cfg).toContain('const fixtures = hubFixturesFor(command, mode);');
    expect(cfg).toContain("{ find: /^@core$/, replacement: coreBarrelFor(HUB, fixtures) },");
  });

  it('the web barrel offers every name the web Hub barrel offered', () => {
    const have = exportedNames(path.join(HUB, 'src/core/index.ts'));
    expect((WEB_NAMES as string[]).filter((n) => !have.has(n))).toEqual([]);
  });

  it('the live barrel (the terminal ship build\'s @core) offers no fixture name and imports no fixture module', () => {
    expect(LIVE_EXPORTS).not.toMatch(/from '\.\/(world|fixtures|fixture-boot|run-open\/fixtureKits)'/);
    for (const name of ['fixtureWorld', 'bootFixtureCore', 'WORLD_NOW', 'lifecycleFixtures', 'coreFixtures', 'runOpenFixture', 'fixtureSession'])
      expect(LIVE_EXPORTS).not.toMatch(new RegExp(`\\b${name}\\b`));
  });
});
