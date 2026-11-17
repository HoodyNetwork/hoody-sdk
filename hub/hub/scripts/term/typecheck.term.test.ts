import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { programOf } from './contract';
import { TermResolver } from './resolve';
import { applyTypecheckAllow, checkTerm, readTypecheckAllow } from './typecheck';

/** A minimal hub whose tsconfig is the SDK's shape (the merge keeps it): no terminal aliases, '@core' -> the live barrel. */
function sdkShapedHub(): string {
  const hub = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-hub-'));
  const w = (rel: string, text: string): void => { fs.mkdirSync(path.dirname(path.join(hub, rel)), { recursive: true }); fs.writeFileSync(path.join(hub, rel), text); };
  w('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, jsx: 'react-jsx', paths: { '@core': ['./src/core/index.ts'], '@core/*': ['./src/core/*'] } }, include: ['src'] }));
  w('src/core/index.ts', 'export const live = 1;\n');
  w('src/core/index.fixtures.ts', "export * from './index';\nexport const fixtureOnly = 2;\n");
  w('src/term/prim/page.ts', 'export type PrimPage = { id: string };\n');
  w('src/term/prim/kit.ts', 'export const kitValue = 3;\n');
  w('src/pages/a.term.tsx', 'export {};\n');
  w('scripts/term/x.term.test.ts', "import type { PrimPage } from '@term/prim';\nimport { kitValue } from '@term/kit';\nimport { fixtureOnly } from '@core';\nexport const v: PrimPage = { id: String(kitValue + fixtureOnly) };\n");
  return hub;
}

const d = (file: string, code: string) => ({ file, line: 3, code, message: 'm' });

describe('typecheck allowlist', () => {
  test('drops a matching file + code whatever the line, keeps others', () => {
    const allow = [{ file: 'a.ts', code: 'TS1', why: 'lib clash for test' }];
    const out = applyTypecheckAllow([d('a.ts', 'TS1'), d('a.ts', 'TS2'), d('b.ts', 'TS1')], allow);
    expect(out.map((x) => `${x.file}:${x.code}`)).toEqual(['a.ts:TS2', 'b.ts:TS1']);
  });
  test('an entry that matches nothing fails as stale', () => {
    const out = applyTypecheckAllow([], [{ file: 'a.ts', code: 'TS1', why: 'lib clash for test' }]);
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe('TERM_TYPECHECK_ALLOW_STALE');
  });
  test('the committed list is well formed', () => {
    expect(readTypecheckAllow(path.join(import.meta.dir, 'typecheck.allow.json')).length).toBeLessThanOrEqual(2);
  });
});

describe('the terminal aliases do not come from the web tsconfig', () => {
  test('resolver: @term/prim, @term/kit and the fixture @core resolve under an SDK-shaped tsconfig', () => {
    const hub = sdkShapedHub();
    try {
      const from = path.join(hub, 'src/pages/a.term.tsx');
      const file = (r: { kind: string; path?: string | null }): string | undefined => (r.kind === 'file' ? path.relative(fs.realpathSync(hub), r.path!) : r.kind);
      const fixture = new TermResolver({ hub, fixtures: true });
      expect(file(fixture.resolveWeb('@term/prim', from))).toBe('src/term/prim/page.ts');
      expect(file(fixture.resolveWeb('@term/kit', from))).toBe('src/term/prim/kit.ts');
      expect(file(fixture.resolveWeb('@core', from))).toBe('src/core/index.fixtures.ts');
      expect(file(new TermResolver({ hub }).resolveWeb('@core', from))).toBe('src/core/index.ts');
    } finally { fs.rmSync(hub, { recursive: true, force: true }); }
  });
  test('typecheck: a scripts/term test importing them checks clean under an SDK-shaped tsconfig', () => {
    const hub = sdkShapedHub();
    try {
      // The type libraries (vite/client, react) come from the real hub's packages.
      fs.symlinkSync(path.resolve(path.dirname(require.resolve('typescript/package.json')), '..'), path.join(hub, 'node_modules'));
      const r = checkTerm({ resolver: new TermResolver({ hub, fixtures: true }), roots: [path.join(hub, 'scripts/term/x.term.test.ts')] });
      expect(r.diagnostics.filter((d) => d.file === 'scripts/term/x.term.test.ts')).toEqual([]);
    } finally { fs.rmSync(hub, { recursive: true, force: true }); }
  }, 60_000);
  test('contract: a sibling importing them reads clean in the contract program under an SDK-shaped tsconfig', () => {
    const hub = sdkShapedHub();
    try {
      fs.writeFileSync(path.join(hub, 'src/pages/b.ts'), 'export const b = 1;\n');
      fs.writeFileSync(path.join(hub, 'src/pages/b.term.ts'), "import type { PrimPage } from '@term/prim';\nimport { kitValue } from '@term/kit';\nimport { fixtureOnly } from '@core';\nexport const b = 1;\nexport const v: PrimPage = { id: String(kitValue + fixtureOnly) };\n");
      const P = programOf([], hub);
      expect(P.pairs.map((p) => path.basename(p.sibling))).toEqual(['b.term.ts']);
      const sf = P.program.getSourceFile(P.pairs[0]!.sibling)!;
      const msgs = P.program.getSemanticDiagnostics(sf).map((d) => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
      expect(msgs).toEqual([]);
    } finally { fs.rmSync(hub, { recursive: true, force: true }); }
  }, 60_000);
});
