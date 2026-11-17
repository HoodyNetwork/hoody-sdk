// logic.ts BUILTIN_MODULES (the modules "It installs a new package" never counts) is a
// copy of hoody-exec's own list, the modules it never installs. This test reads both lists from
// their sources and fails when they differ, so a module hoody-exec adds or drops is never miscounted in silence. hoody-exec's
// file is read from the monorepo this Hub sits in (HOODY_EXEC_DEPS_FILE overrides); a missing file is a failure, not a skip.
// Outside the monorepo there is no hoody-exec to read, and the comparison is skipped.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { changesOf, imports } from './logic';

const EXEC_FILE = monorepoPath(process.env.HOODY_EXEC_DEPS_FILE, 'hoody-kit', 'hoody-exec', 'src', 'dependency-manager.ts');

/** The names in the one top-level `const BUILTIN_MODULES ... = new Set([ ... ])` of a source, read with the TypeScript parser (so
 *  comments, a commented-out older list and formatting never count). `as const`, `satisfies` and parentheses around the array or
 *  the Set are looked through. Fails closed: no such declaration, more than one, an empty list, a hole, or any element that is
 *  not a plain string literal. */
function listIn(src: string, where: string): string[] {
  const file = ts.createSourceFile(where, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const strip = (e: ts.Expression): ts.Expression => {
    let x = e;
    while (ts.isAsExpression(x) || ts.isSatisfiesExpression(x) || ts.isParenthesizedExpression(x) || ts.isTypeAssertionExpression(x)) x = x.expression;
    return x;
  };
  const decls = file.statements.filter(ts.isVariableStatement).flatMap((v) => [...v.declarationList.declarations])
    .filter((d) => ts.isIdentifier(d.name) && d.name.text === 'BUILTIN_MODULES');
  if (decls.length !== 1) throw new Error(`${decls.length} top-level BUILTIN_MODULES declarations in ${where}, want 1`);
  const init = decls[0]!.initializer && strip(decls[0]!.initializer);
  if (!init || !ts.isNewExpression(init) || !ts.isIdentifier(init.expression) || init.expression.text !== 'Set' || init.arguments?.length !== 1) {
    throw new Error(`BUILTIN_MODULES in ${where} is not new Set([...])`);
  }
  const arr = strip(init.arguments[0]!);
  if (!ts.isArrayLiteralExpression(arr)) throw new Error(`BUILTIN_MODULES in ${where} is not built from an array literal`);
  const names = arr.elements.map((el) => {
    if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) return el.text;
    throw new Error(`BUILTIN_MODULES in ${where} holds a non-string element: ${el.getText(file).slice(0, 80) || ts.SyntaxKind[el.kind]}`);
  });
  if (!names.length) throw new Error(`BUILTIN_MODULES in ${where} is empty`);
  return names;
}

const hub = listIn(readFileSync(join(__dirname, 'logic.ts'), 'utf8'), 'hub/src/pages/scripts/logic.ts');
const exec = EXEC_FILE === null ? [] : listIn(readFileSync(EXEC_FILE, 'utf8'), EXEC_FILE);

describe.skipIf(EXEC_FILE === null)('the Hub\'s built-in module list is hoody-exec\'s', () => {
  it('names exactly the modules hoody-exec never installs', () => {
    const sorted = (a: readonly string[]): string[] => [...new Set(a)].sort();
    expect({ onlyInHub: hub.filter((n) => !exec.includes(n)), onlyInExec: exec.filter((n) => !hub.includes(n)) }).toEqual({ onlyInHub: [], onlyInExec: [] });
    expect(sorted(hub)).toEqual(sorted(exec));
    expect(hub.length).toBeGreaterThan(40);
  });

  it('counts none of hoody-exec\'s built-ins as a new package, by import or by the check\'s installs', () => {
    for (const n of exec) {
      expect(imports(`import x from '${n}';`), n).toEqual([]);
      expect(changesOf(null, `const x = require('${n}');`).find((c) => c.code === 'new_package'), n).toBeUndefined();
      expect(changesOf(null, '', { installs: [n] }).find((c) => c.code === 'new_package'), n).toBeUndefined();
    }
    expect(imports("import z from 'zod';")).toEqual(['zod']);
  });
});

describe('listIn reads only the live declaration', () => {
  const live = "const BUILTIN_MODULES = new Set([\n  'fs', // a comment\n  \"os\",\n]);";
  it('ignores an older list left in a comment, line or block, ahead of the live one', () => {
    expect(listIn("// const BUILTIN_MODULES = new Set(['fs', 'os', 'wasi']);\n" + live, 't')).toEqual(['fs', 'os']);
    expect(listIn("/* const BUILTIN_MODULES = new Set(['wasi']); */\n" + live, 't')).toEqual(['fs', 'os']);
  });
  it('reads every valid spelling of the same list', () => {
    expect(listIn("const BUILTIN_MODULES: ReadonlySet<string> = new Set(['fs', 'os'] as const ) ;", 't')).toEqual(['fs', 'os']);
    expect(listIn("const BUILTIN_MODULES = new Set([`fs`, 'a//b', 'c/*d*/']) satisfies Set<string>;", 't')).toEqual(['fs', 'a//b', 'c/*d*/']);
    expect(listIn("const BUILTIN_MODULES = new Set(['\\u0066s']);", 't')).toEqual(['fs']);
  });
  it('fails closed on a hole, a non-string element, no list, two lists or an empty one', () => {
    expect(() => listIn("const BUILTIN_MODULES = new Set(['fs', , 'os']);", 't')).toThrow(/non-string/);
    expect(() => listIn("const BUILTIN_MODULES = new Set(['fs', ...more]);", 't')).toThrow(/non-string/);
    expect(() => listIn("const BUILTIN_MODULES = new Set(['fs', name]);", 't')).toThrow(/non-string/);
    expect(() => listIn("const OTHER = new Set(['fs']);", 't')).toThrow(/0 top-level/);
    expect(() => listIn(live + '\n' + live.replace('const', 'let'), 't')).toThrow(/2 top-level/);
    expect(() => listIn('const BUILTIN_MODULES = new Set([]);', 't')).toThrow(/empty/);
    expect(() => listIn('const BUILTIN_MODULES = new Set(list);', 't')).toThrow(/array literal/);
  });
});
