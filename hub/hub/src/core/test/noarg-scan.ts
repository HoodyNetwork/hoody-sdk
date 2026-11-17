// The syntax-aware scan behind noarg-recovery.conformance.test.ts.
// A regular expression missed `x.settle?.()`, `x.settle ()`, `x["settle"]()`, destructured calls, `.call/.apply` and
// callback references; this walks the TypeScript syntax tree instead and reports every place a page could reach a
// hook's settle()/dismiss() with no hold:
//   - a call with no arguments, through `.`, `?.`, or `["…"]`, called plainly or with `?.()`: key `recv.settle()`;
//   - any other reference to the method (passed as a callback, stored, `.call`/`.apply`/`.bind`): key `recv.settle`;
//   - a destructuring that takes it out of its object (`const { settle } = hook`, a parameter pattern, an
//     assignment pattern `({ settle } = hook)`, a computed literal key `{ ['settle']: s }`): key `{settle}=init`
//     (init is the destructured expression, `(param)` for a parameter).
// A method named through a const of a literal (`const n = 'dismiss'; hook[n]()`) counts as named. Other dynamic names
// (a computed key from a variable, a string built at run time) are not seen: the scan covers the written forms above,
// not every way JavaScript can reach a property, and receiver classifications stay the hand-kept lists' job.
// A call with arguments passes a hold (tsc checks the overloads) and is not reported, nor are assignments to the
// property and object-literal definitions. `recv` is the receiver's source text without whitespace; a `?.` before
// the method keeps its `?` (`pm?.dismiss()`).
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const NAMES = new Set(['settle', 'dismiss']);
const squash = (s: string): string => s.replace(/\s+/g, '');

/** key → how many times it occurs in `text`. */
export function noArgOccurrencesIn(text: string, fileName = 'x.tsx'): Record<string, number> {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Record<string, number> = {};
  const add = (k: string): void => { out[k] = (out[k] ?? 0) + 1; };
  // `const n = 'dismiss'` (as const, parenthesized): n names the method wherever it is used as a key in this file.
  const consts = new Map<string, string>();
  const collect = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isVariableDeclarationList(n.parent) && (n.parent.flags & ts.NodeFlags.Const)) {
      const v = skipWraps(n.initializer);
      if (ts.isStringLiteralLike(v) && NAMES.has(v.text)) consts.set(n.name.text, v.text);
    }
    ts.forEachChild(n, collect);
  };
  const literal = (e: ts.Expression): string | undefined => {
    const x = skipWraps(e);
    if (ts.isStringLiteralLike(x)) return x.text;
    if (ts.isIdentifier(x)) return consts.get(x.text);
    return undefined;
  };
  const nameOf = (n: ts.Node): string | undefined => {
    if (ts.isPropertyAccessExpression(n)) return n.name.text;
    if (ts.isElementAccessExpression(n)) return literal(n.argumentExpression);
    return undefined;
  };
  const keyName = (k: ts.PropertyName | undefined): string | undefined => {
    if (!k) return undefined;
    if (ts.isIdentifier(k) || ts.isStringLiteralLike(k)) return k.text;
    if (ts.isComputedPropertyName(k)) return literal(k.expression);
    return undefined;
  };
  const recvOf = (n: ts.PropertyAccessExpression | ts.ElementAccessExpression): string =>
    squash(n.expression.getText(sf)) + (n.questionDotToken ? '?' : '');
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
      const name = nameOf(n);
      if (name && NAMES.has(name)) {
        let p: ts.Node = n.parent;
        while (ts.isParenthesizedExpression(p) || ts.isNonNullExpression(p) || ts.isAsExpression(p)) p = p.parent;
        const callee = ts.isCallExpression(p) && skipWraps(p.expression) === n;
        const assigned = ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
        if (callee) { if ((p as ts.CallExpression).arguments.length === 0) add(recvOf(n) + '.' + name + '()'); }
        else if (!assigned) add(recvOf(n) + '.' + name);
      }
    }
    if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent)) {
      const prop = n.propertyName ? keyName(n.propertyName) : ts.isIdentifier(n.name) ? n.name.text : undefined;
      if (prop && NAMES.has(prop)) {
        const holder = n.parent.parent;
        const init = ts.isVariableDeclaration(holder) && holder.initializer ? squash(holder.initializer.getText(sf)) : ts.isParameter(holder) ? '(param)' : '(pattern)';
        add('{' + prop + '}=' + init);
      }
    }
    // An assignment pattern: `({ dismiss } = hook)`, `({ dismiss: d } = hook)`, `({ ['dismiss']: d } = hook)`.
    if (ts.isObjectLiteralExpression(n) && ts.isBinaryExpression(n.parent) && n.parent.left === n && n.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const init = squash(n.parent.right.getText(sf));
      for (const p of n.properties) {
        const prop = ts.isShorthandPropertyAssignment(p) ? p.name.text : ts.isPropertyAssignment(p) ? keyName(p.name) : undefined;
        if (prop && NAMES.has(prop)) add('{' + prop + '}=' + init);
      }
    }
    ts.forEachChild(n, visit);
  };
  const skipWraps = (e: ts.Expression): ts.Expression => {
    let x = e;
    while (ts.isParenthesizedExpression(x) || ts.isNonNullExpression(x) || ts.isAsExpression(x)) x = x.expression;
    return x;
  };
  collect(sf);
  visit(sf);
  return out;
}

/** Non-test .ts/.tsx sources under `dir` (no `test` or `node_modules` directories, no .d.ts). */
export function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'test' && name !== 'node_modules') out.push(...sourcesUnder(p)); continue; }
    if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** file (relative to `pagesDir`, `/`-separated) → key → count, for every page source with an occurrence. */
export function noArgOccurrences(pagesDir: string): Record<string, Record<string, number>> {
  const found: Record<string, Record<string, number>> = {};
  for (const f of sourcesUnder(pagesDir)) {
    const hits = noArgOccurrencesIn(readFileSync(f, 'utf8'), f);
    if (Object.keys(hits).length) found[relative(pagesDir, f).split(sep).join('/')] = hits;
  }
  return found;
}

/** How often `text` names `name`: as an identifier anywhere (an import, a call, `x.name`, `{ name }`) or as a string
 *  element access (`x['name']`). */
export function referencesIn(text: string, name: string, fileName = 'x.ts'): number {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let n = 0;
  const visit = (x: ts.Node): void => {
    if (ts.isIdentifier(x) && x.text === name) n++;
    else if (ts.isStringLiteralLike(x) && x.text === name && ts.isElementAccessExpression(x.parent)) n++;
    ts.forEachChild(x, visit);
  };
  visit(sf);
  return n;
}
