// a page reaches Ask's agent IO only through the read-only alias @ask/io
// (src/ask/io.ts: data.ts + logic.ts, no React, no components). This scan parses every file under src/pages with
// the TypeScript parser (comments and template literals cannot hide a specifier) and resolves each module name the
// way tsconfig paths and Vite do (@kit, @core, @app, @shell, relative paths, `..` inside an alias included, and
// Vite's root-relative '/src/...', '/@fs/...' and absolute paths). A page that
// reaches src/ask by any name other than exactly @ask/io fails, in sources, tests and mocks alike; so does a
// dynamic import or mock whose module name is computed, which no scan can follow.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..');
const HUB = join(SRC, '..');
const PAGES = join(SRC, 'pages');
const ASK = join(SRC, 'ask');
// tsconfig.json paths (each maps "<alias>" and "<alias>/*" under src/).
const ALIASES: Record<string, string> = { '@kit': 'kit', '@core': 'core', '@app': 'app', '@shell': 'shell' };
const CALLS = new Set(['vi.mock', 'vi.doMock', 'vi.unmock', 'vi.doUnmock', 'vi.importActual', 'vi.importMock', 'require']);

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') out.push(...files(p)); continue; }
    if (/\.(ts|tsx|mts|cts)$/.test(name)) out.push(p);
  }
  return out;
}

/** Every module name the source names (null: a dynamic import or module call whose name is computed). */
function specifiers(text: string, fileName = 'x.tsx'): (string | null)[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: (string | null)[] = [];
  const lit = (n: ts.Node | undefined) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);
  // The callee's dotted name from the tree, so spacing, comments, parentheses, casts, `(0, f)`, `?.` and ['x'] cannot hide it.
  const name = (e: ts.Expression): string | null => {
    if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e) || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e)) return name(e.expression);
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.CommaToken) return name(e.right);
    if (ts.isIdentifier(e)) return e.text;
    if (ts.isPropertyAccessExpression(e)) { const o = name(e.expression); return o === null ? null : `${o}.${e.name.text}`; }
    if (ts.isElementAccessExpression(e)) { const o = name(e.expression), k = lit(e.argumentExpression); return o === null || k === null ? null : `${o}.${k}`; }
    return null;
  };
  const visit = (n: ts.Node): void => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) out.push(lit(n.moduleSpecifier));
    else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) out.push(lit(n.moduleReference.expression));
    else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) out.push(lit(n.argument.literal));
    else if (ts.isCallExpression(n)) {
      const callee = n.expression.kind === ts.SyntaxKind.ImportKeyword ? 'import' : name(n.expression);
      if (callee !== null && (callee === 'import' || CALLS.has(callee))) out.push(lit(n.arguments[0]));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The module name reaches src/ask by some name other than @ask/io (or cannot be followed). */
function wrongAskPath(file: string, spec: string | null): boolean {
  if (spec === null) return true;
  if (spec === '@ask' || spec.startsWith('@ask/')) return spec !== '@ask/io';
  const targets: string[] = [];
  if (spec.startsWith('.')) targets.push(resolve(dirname(file), spec));
  // Vite reads '/x' under its root first, then as a file-system path; '/@fs/x' is the file-system path x.
  if (spec.startsWith('/')) targets.push(resolve(HUB, '.' + spec), resolve(spec), resolve(spec.replace(/^\/@fs(?=\/)/, '')));
  for (const [a, dir] of Object.entries(ALIASES)) if (spec === a || spec.startsWith(a + '/')) targets.push(resolve(SRC, dir, spec.slice(a.length + 1)));
  return targets.some((t) => t === ASK || t.startsWith(ASK + sep));
}

describe('conformance: pages reach src/ask only through @ask/io', () => {
  const f = join(PAGES, 'apps', 'probe.ts');
  it('the rule: @ask/io and unrelated names pass; every other way into src/ask fails', () => {
    for (const ok of ['@ask/io', '@askew', '@askew/x', '@core', '@core/run-open', '@kit', './data', '../board/links', 'react']) expect(wrongAskPath(f, ok), ok).toBe(false);
    for (const ok of ['/src/core/kit', '/node_modules/x']) expect(wrongAskPath(f, ok), ok).toBe(false);
    const bad = ['@ask', '@ask/data', '@ask/io/x', '@ask/io/../engine', '../../ask/engine', '../../ask', '@core/../ask/engine', '@kit/../ask', '@app/../ask/fake', '@shell/../ask/logic', null];
    bad.push('/src/ask/engine', '/src/ask', '/src/pages/../ask/logic', '/@fs' + join(ASK, 'engine'), join(ASK, 'data'));
    for (const b of bad) {
      expect(wrongAskPath(f, b), String(b)).toBe(true);
    }
  });

  it('the parse: comments, template literals, re-exports, mocks, require and computed names are all seen', () => {
    const src = [
      "import { a } from '@ask/io';",
      "export { AskEngine } from '@core/../ask/engine';",
      'export const load = () => import(`../../ask/engine`);',
      "vi.mock(/* fixture */ '../../ask/fake');",
      "const r = require('../../ask/logic');",
      "type T = typeof import('../../ask/data');",
      'const n = "x"; void import(`../../ask/${n}`);',
      "vi.importActual('@askew');",
    ].join('\n');
    expect(specifiers(src)).toEqual(['@ask/io', '@core/../ask/engine', '../../ask/engine', '../../ask/fake', '../../ask/logic', '../../ask/data', null, '@askew']);
    // The callee is read from the tree: spacing, comments, parentheses, ?. and ['name'] do not hide a module call.
    const odd = ["vi .importActual('a1');", "vi /* c */ .mock('a2');", "vi\n.mock('a3');", "(vi).mock('a4');", "vi?.mock('a5');", "vi['mock']('a6');", "vi!.doMock('a7');", "(vi as any).mock('a8');", "(<any>vi).mock('a9');", "(vi satisfies object).mock('a10');", "(0, vi.mock)('a11');", "other.mock('no');"].join('\n');
    expect(specifiers(odd, 'x.ts')).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11']);
    expect(specifiers(src).filter((s) => wrongAskPath(f, s))).toEqual(['@core/../ask/engine', '../../ask/engine', '../../ask/fake', '../../ask/logic', '../../ask/data', null]);
  });

  // Only files that could name src/ask are parsed: ones mentioning "ask", holding any backslash (an escape such as
  // \u0073, \x73, \s or a line continuation could spell it), or holding a call whose module name could be computed
  // or spelled apart (import followed by a comment or "(", require, anything on vi). Parsing all ~900 page files
  // costs seconds a busy host does not have.
  const MAYBE = /ask|\\|\bimport\s*(?:\(|\/[*/])|\brequire\b|\bvi\b/i;
  it('the prefilter keeps every file the parse could flag', () => {
    for (const s of ["typeof import /* c */ ('@core/../a\\u0073k/engine')", "import(`../../a\\x73k`)", 'import // c\n(x)', 'vi .importActual(y)', 'require(z)', "'../../a\\sk/engine'", "'../../as\\\nk/engine'"]) expect(MAYBE.test(s), s).toBe(true);
    expect(MAYBE.test("import { a } from '@core';")).toBe(false);
  });
  it('no page file names src/ask another way', () => {
    const bad: string[] = [];
    for (const file of files(PAGES)) {
      const text = readFileSync(file, 'utf8');
      if (!MAYBE.test(text)) continue;
      for (const s of specifiers(text, file)) {
        if (wrongAskPath(file, s)) bad.push(`${relative(PAGES, file).split(sep).join('/')}: ${s ?? '<computed module name>'}`);
      }
    }
    expect(bad).toEqual([]);
  }, 120_000);
});
