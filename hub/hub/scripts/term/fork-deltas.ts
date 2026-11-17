// Load-time edits of third-party packages the terminal Hub still needs. None touches OpenTUI: the engine's changes are
// the patch series (hub/vendor/opentui/patches/, src/term/docs/fork.md) built into the vendored 0.8.4-hoody.N
// packages, which tests, dev and the ship bundle all load as installed. What remains edits TanStack only:
//   - libDomJsx: TanStack Router's own DOM JSX goes through the compat runtime (by syntax: import specifiers only);
//   - historyBlockers: navigation blockers run without a DOM (to be merged with src/term/app/history.ts).
// Each throws TERM_FORK_DELTA when the package changed shape (never a silent no-op).
import ts from 'typescript';

const fail = (id: string, file: string, what: string): never => {
  throw new Error(`TERM_FORK_DELTA ${id}: ${what} not found in ${file}; the package changed shape: update scripts/term/fork-deltas.ts`);
};

/** TanStack Router's isServer switch, forced to the client build (Bun's export conditions pick the server one, which
 *  renders nothing after the first pass). Not an OpenTUI delta: no patch, it stays in the loader. */
export const TANSTACK_IS_SERVER = /@tanstack\/router-core\/dist\/esm\/isServer\/(server|development)\.js$/;

/** Libraries that draw raw DOM tags themselves (TanStack Router's default error / not-found components: `<div>`,
 *  `<strong>`, `<pre>`): their JSX goes through the compat runtime, so an error screen draws instead of crashing the
 *  host ("strong must be created inside of a text node"). Loader shim.
 *  By syntax: only the module specifiers of import / export declarations are replaced. */
export const LIB_DOM_JSX = /@tanstack\/react-router\/dist\/esm\/[^/]+\.js$/;
export function libDomJsx(src: string, runtime: string): string {
  return editSpecifiers(src, (spec) => {
    const m = /^react\/jsx-(dev-)?runtime$/.exec(spec);
    return m ? runtime.replace(/jsx-runtime\.ts$/, m[1] ? 'jsx-dev-runtime.ts' : 'jsx-runtime.ts') : null;
  });
}

/** TanStack History runs navigation blockers only `if (typeof document !== "undefined" && blockers?.length ...)`: in
 *  a terminal every blocker (kit LeaveGuard, Drawer.shared's useBlocker) is skipped, so leaving a page with unsaved
 *  work does not ask. The `typeof document` test inside `tryNavigation` becomes `true`, by syntax;
 *  exactly one such test must exist (else TERM_FORK_DELTA). Not an OpenTUI patch: a loader/bundler edit with no off
 *  switch (one configuration for every run). */
export const TANSTACK_HISTORY = /@tanstack\/history\/dist\/esm\/index\.js$/;
export function historyBlockers(src: string, file = 'history'): string {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const hits: ts.Node[] = [];
  const inTry = (n: ts.Node): boolean => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && p.name.text === 'tryNavigation') return true;
    return false;
  };
  const visit = (n: ts.Node): void => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
      && ts.isTypeOfExpression(n.left) && ts.isIdentifier(n.left.expression) && n.left.expression.text === 'document'
      && ts.isStringLiteral(n.right) && n.right.text === 'undefined' && inTry(n)) hits.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (hits.length !== 1) throw new Error(`TERM_FORK_DELTA: history-blockers: expected one \`typeof document !== "undefined"\` in tryNavigation of ${file}, found ${hits.length}`);
  const h = hits[0]!;
  return src.slice(0, h.getStart(sf)) + 'true' + src.slice(h.end);
}

/** Replaces the module specifiers of static import / export declarations and literal import() calls (by syntax). */
export function editSpecifiers(src: string, to: (spec: string) => string | null): string {
  const sf = ts.createSourceFile('m.js', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits: { start: number; end: number; text: string }[] = [];
  const put = (lit: ts.StringLiteralLike): void => { const t = to(lit.text); if (t !== null && t !== lit.text) edits.push({ start: lit.getStart(sf), end: lit.end, text: JSON.stringify(t) }); };
  const visit = (n: ts.Node): void => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) put(n.moduleSpecifier);
    else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) put(n.arguments[0]);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}
