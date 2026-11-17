// mutateSource (contract.ts) rewrites a component's READS of one prop to `undefined` (or a flip) for the mutant gate.
// A name in a key position is no read: rewriting it made source that does not parse ("Unexpected )"), and the mutant
// failed as ERROR instead of telling whether a scenario notices the prop (PathField `get value()`, QrImage `{ src: string }`).
import { expect, test } from 'bun:test';
import ts from 'typescript';
import { checkContracts, mutateSource, UNREAD_SIBLING } from './contract';

const SRC = `
import { useImperativeHandle, useState } from 'react';
enum E { value = 1 }
type T = { value: string; src(): void };
export function Field({ value, src }: { value: string; src: string }) {
  const [read] = useState<{ src: string; value: number } | null>(null);
  class K { value = 1; get src() { return 1; } set value(v: number) {} m() { return src; } }
  useImperativeHandle(null, () => ({ get value() { return value; }, src: src, value }));
  const o = { value: 2 }.value;
  const q: T['value'] = value;
  return <input value={value} data-src={src} />;
}
`;

const parses = (code: string): string[] => {
  const sf = ts.createSourceFile('m.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return ((sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
};

for (const prop of ['value', 'src']) {
  test(`a mutant of \`${prop}\` parses and rewrites only its reads`, () => {
    expect(parses(SRC)).toEqual([]);
    const { code, sites } = mutateSource('/x/m.tsx', SRC, 'Field', prop);
    expect(parses(code)).toEqual([]);
    expect(sites).toBeGreaterThan(0);
    // Every key position keeps its name.
    for (const keyText of ['enum E { value = 1 }', 'type T = { value: string; src(): void }', '{ src: string; value: number }', 'class K { value = 1; get src()', 'set value(v: number)', 'get value()', '{ value: 2 }.value', "T['value']"]) {
      expect(code).toContain(keyText);
    }
  });
}

test('the reads of the prop are what changes', () => {
  const { code } = mutateSource('/x/m.tsx', SRC, 'Field', 'value');
  expect(code).toContain('return (undefined as never); }, src: src, value: (undefined as never) }');
  expect(code).toContain('value={(undefined as never)}');
  expect(code).toContain("const q: T['value'] = (undefined as never);");
  const s = mutateSource('/x/m.tsx', SRC, 'Field', 'src').code;
  expect(s).toContain('m() { return (undefined as never); }');
  expect(s).toContain('src: (undefined as never), value }');
});

// Whole-program runs (check --changed / hub:check --page): a sibling the glob listed but the program did not
// read (removed mid-run) once crashed checkContracts (getSourceFile(sibling)! was undefined) and hid every contract result.
test('a sibling the program could not read is one failing report, not a crash', () => {
  const program = ts.createProgram({ rootNames: [], options: { noEmit: true } });
  const gone = { sibling: '/nonexistent-hub/src/x/Gone.term.tsx', web: '/nonexistent-hub/src/x/Gone.tsx' };
  const reports = checkContracts({ program, checker: program.getTypeChecker(), pairs: [gone] } as never);
  expect(reports).toHaveLength(1);
  expect(reports[0]!.errors).toEqual([UNREAD_SIBLING]);
});

// A nested scope that declares the prop's local name again is another binding (SecretField's `let value: ReactNode`
// in a branch was rewritten to `let (undefined as never): ReactNode`: the mutant did not parse).
const SHADOW = `
export function Field({ value, label }: { value: string; label: string }) {
  let out = value;
  if (label) {
    let value: string;
    value = label + '!';
    out = value;
  }
  const list = [1, 2].map((value) => value * 2);
  try { out += list.length; } catch (value) { out = String(value); }
  for (const value of list) out += value;
  return <input value={out} data-v={value} />;
}
`;
for (const mode of ['drop', 'flip'] as const) {
  test(`a shadowing local of the prop is left alone (${mode}); the prop's own reads are rewritten`, () => {
    const { code, sites } = mutateSource('/x/s.tsx', SHADOW, 'Field', 'value', mode);
    expect(parses(code)).toEqual([]);
    expect(sites).toBe(2); // `let out = value` and `data-v={value}`
    expect(code).toContain('let value: string;');
    expect(code).toContain("value = label + '!';");
    expect(code).toContain('.map((value) => value * 2)');
    expect(code).toContain('catch (value) { out = String(value); }');
    expect(code).toContain('for (const value of list) out += value;');
  });
}

// Every mutant the gate can make parses: for each scenario file's components in their terminal sibling, every prop the
// component binds or reads off its props object, dropped and flipped (a superset of what scenarios.ts --mutants mutates).
test('every generated mutant of every scenario component parses', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const src = path.join(import.meta.dir, '..', '..', 'src');
  const scen: string[] = [];
  const walk = (d: string): void => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.scenario.ts')) scen.push(f); } };
  walk(src);
  const bad: string[] = [];
  let made = 0;
  for (const sc of scen) {
    const sib = sc.replace(/\.scenario\.ts$/, '.term.tsx');
    if (!fs.existsSync(sib)) continue;
    const text = fs.readFileSync(sib, 'utf8');
    const sf = ts.createSourceFile(sib, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const comps = [...fs.readFileSync(sc, 'utf8').matchAll(/scenarios\(\s*['"]([A-Za-z0-9_]+)['"]/g)].map((m) => m[1]!);
    for (const comp of comps) {
      const props = new Set<string>();
      const look = (n: ts.Node): void => {
        const fn = ts.isFunctionDeclaration(n) && n.name?.text === comp ? n
          : ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === comp && n.initializer ? n.initializer : null;
        if (fn) {
          const inner = (x: ts.Node): void => {
            if (ts.isFunctionLike(x) && x.parameters[0]) {
              const p0 = x.parameters[0].name;
              if (ts.isObjectBindingPattern(p0)) for (const el of p0.elements) { const k = el.propertyName ?? el.name; if (ts.isIdentifier(k)) props.add(k.text); }
              else if (ts.isIdentifier(p0)) { const o = p0.text; const acc = (y: ts.Node): void => { if (ts.isPropertyAccessExpression(y) && ts.isIdentifier(y.expression) && y.expression.text === o) props.add(y.name.text); ts.forEachChild(y, acc); }; acc(x); }
              return;
            }
            ts.forEachChild(x, inner);
          };
          inner(fn);
        }
        ts.forEachChild(n, look);
      };
      look(sf);
      for (const prop of props) for (const mode of ['drop', 'flip'] as const) {
        const { code, sites } = mutateSource(sib, text, comp, prop, mode);
        if (!sites) continue;
        made++;
        const errs = parses(code);
        if (errs.length) bad.push(`${path.relative(src, sib)} ${comp}.${prop} (${mode}): ${errs[0]}`);
      }
    }
  }
  expect(made).toBeGreaterThan(100);
  expect(bad).toEqual([]);
}, 120_000);
