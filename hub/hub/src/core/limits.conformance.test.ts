// @vitest-environment node
// Hub reads against the published list limits (Notes and Scripts asked GET /computers
// for limit 200, the API allows 100, so the list answered 422 every time).
//
// Contract, in plain words:
//   - Every Hub read of a list that sends a literal limit, page, offset or count must stay within the `maximum` the
//     published openapi.json gives that path and parameter: the Hoody API's own (its openapi.json in the
//     monorepo, or HUB_API_OPENAPI) and the kits' (HUB_LIMITS_KITS, default: the kits in the monorepo; the agent's generated spec
//     included). The agent publishes no `maximum` (it clamps in code and says so in prose), so its reads are not
//     judged here; the kits that do publish one (notes, exec, cron, files, ...) are.
//   - What is scanned: every non-test source under src/ (a TypeScript AST scan, not text matching):
//       A. `limit: N` (also `page`, `offset`, `count`; the shorthand `{ limit }` too) in an object literal, N a number or a
//          const the scan can fold (an identifier, `OBJ.key`, `*`, `+`, `-`, Math.min, clamp(x, lo, hi) = hi, a spread of a
//          const object). The route is the nearest `route: X` property, or call argument X, that resolves to a defineRoute
//          (data files: `reads`; `R.x` through `import { routes as R }` or `import * as R`; a const path), or, for a call
//          like boardSend(kit, 'GET', '/api/v1/notes/' + id + '/nodes', { query }), the GET path written in the call.
//       B. `['limit', N]` pairs in a function that builds a path string such as '/events?' + qs(pairs).
//       C. `?limit=N` written inside a path string, a template or a `+` chain ('/projects?page=1&limit=1').
//     A B or C site is judged as a GET of its path, whatever the call's method.
//   - A site whose route or path the specs do not list, or whose parameter has no published maximum, is not judged. A
//     LIMIT or COUNT whose value cannot be folded on a judged route FAILS: write the number as a literal or a const the scan
//     can read. A page or offset is a loop variable by design and may vary.
//   - The scan has gaps (a query object built apart from its call, a route alias, a helper that returns the query, two
//     consts of one name in different functions: the scan takes the one it finds). The net under them: every `limit` the
//     scan could not tie to a route or path must be named in UNROUTED below with the reason it is safe, so a new one is a
//     decision in review, not a silent hole.
//   - The scan reports what it judged (coverage floors below) so a scan that silently stops seeing reads fails too.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from './test/monorepo';

const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!../**/*.spec.ts', '!../**/fixtures.ts', '!../**/fixtures.*.ts', '!../**/fake-kit.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

type Spec = { paths: Record<string, Record<string, { parameters?: unknown[] }>>; components?: { parameters?: Record<string, unknown> } };
type Param = 'limit' | 'page' | 'offset' | 'count';
const PARAMS: readonly string[] = ['limit', 'page', 'offset', 'count'];
/** `count` is a page size on one kit read (notes records); elsewhere it is an ordinary word, so it is only read on a resolved route. */
const ROUTED_ONLY: readonly string[] = ['count'];

/** '/api/v1/projects/{id}/computers/' and '/projects/:id/computers' are one path. */
const normalise = (p: string): string => {
  let s = p.replace(/\?.*$/, '').replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '{}').replace(/\{[^}]*\}/g, '{}').replace(/\/+$/, '');
  if (!s.startsWith('/api/v1')) s = '/api/v1' + s;
  return s;
};

/** The spec key of a GET read: agent routes live under /api/v1/agent, kit and Hoody API paths already carry /api/v1. */
const specKey = (path: string, scope: string | null): string => 'GET ' + normalise(scope === 'agent' ? '/api/v1/agent' + (path.startsWith('/') ? path : '/' + path) : path);

/** `maximum` of each limit/page/offset/count query parameter, by 'METHOD normalised-path' (paths are unique across the API and the kits). */
function maxima(specs: readonly Spec[]): Map<string, Partial<Record<Param, number | null>>> {
  const out = new Map<string, Partial<Record<Param, number | null>>>();
  for (const spec of specs) addMaxima(out, spec);
  return out;
}

function addMaxima(out: Map<string, Partial<Record<Param, number | null>>>, spec: Spec): void {
  const refs = spec.components?.parameters ?? {};
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      for (const raw of op?.parameters ?? []) {
        const ref = (raw as { $ref?: string }).$ref;
        const prm = (ref ? refs[ref.split('/').pop() as string] : raw) as { in?: string; name?: string; schema?: { maximum?: number } } | undefined;
        if (!prm || prm.in !== 'query' || !PARAMS.includes(prm.name as string)) continue;
        const key = method.toUpperCase() + ' ' + normalise(path);
        const row = out.get(key) ?? {};
        row[prm.name as Param] = typeof prm.schema?.maximum === 'number' ? prm.schema.maximum : null;
        out.set(key, row);
      }
    }
  }
}

/** `key` is the spec key of the read ('GET /api/v1/computers'), null when the site's route is not a GET; `routed` says a route or a path was found. */
interface Site { file: string; line: number; param: Param; value: number | null; key: string | null; routed: boolean; how: string }
interface Scan { sites: Site[]; problems: string[]; judged: Site[]; unrouted: string[] }

type Decl = { e: ts.Expression; file: string };
type RouteInfo = { path: string | null; scope: string | null; method: string | null };
type Env = {
  /** every const-like declaration at any depth, with the file it was written in: a name declared twice in a file is ambiguous, so unreadable */
  consts: Map<string, Decl[]>;
  routes: Map<string, RouteInfo[]>;
  /** file -> local name -> the glob key of the file a relative import names */
  imports: Map<string, Map<string, string>>;
  /** file -> local name -> the name it has in the target ('routes as R' -> R: 'routes'; '* as R' -> R: '' (the module itself)) */
  imported: Map<string, Map<string, string>>;
  files: ReadonlySet<string>;
};

const name = (n: ts.PropertyName | undefined): string | null => (n && (ts.isIdentifier(n) || ts.isStringLiteralLike(n)) ? n.text : null);
const isFreeze = (x: ts.Expression): x is ts.CallExpression =>
  ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && ts.isIdentifier(x.expression.expression) && x.expression.expression.text === 'Object' && x.expression.name.text === 'freeze' && x.arguments.length === 1;
const unwrap = (e: ts.Expression): ts.Expression => {
  let x = e;
  for (;;) {
    if (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isNonNullExpression(x) || ts.isSatisfiesExpression(x) || ts.isTypeAssertionExpression(x)) x = x.expression;
    else if (isFreeze(x)) x = x.arguments[0] as ts.Expression;
    else return x;
  }
};
/** 'src/…' for a file key of the glob (keys are relative to src/core). */
const rel = (f: string): string => (f.startsWith('./') ? 'src/core/' + f.slice(2) : f.replace(/^\.\.\//, 'src/'));
const lineOf = (sf: ts.SourceFile, n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

function topConsts(sf: ts.SourceFile, file: string, env: Env): void {
  const add = (key: string, e: ts.Expression) => { const l = env.consts.get(key) ?? []; l.push({ e, file }); env.consts.set(key, l); };
  const visit = (n: ts.Node): void => {
    // Any depth: a local `const SIZE` beside a top-level one makes the name ambiguous (unreadable), never silently the outer value.
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      add(file + '#' + n.name.text, n.initializer);
      add(n.name.text, n.initializer);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

function defineRoutes(sf: ts.SourceFile, file: string, env: Env): void {
  const put = (key: string, info: { path: string | null; scope: string | null; method: string | null }) => {
    for (const k of [file + '#' + key, key]) { const l = env.routes.get(k) ?? []; l.push(info); env.routes.set(k, l); }
  };
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'defineRoute') {
      const arg = n.arguments.find(ts.isObjectLiteralExpression);
      const prop = (k: string): string | null => {
        const p = arg?.properties.find((q): q is ts.PropertyAssignment => ts.isPropertyAssignment(q) && name(q.name) === k);
        const v = p ? strOf(p.initializer, file, env) : null; // a literal, or a const / template the scan can read
        return v === null || v === '{}' ? null : v;
      };
      const info = { path: prop('path'), scope: prop('scope'), method: prop('method') };
      const parent = n.parent;
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) put(parent.name.text, info);
      else if (ts.isPropertyAssignment(parent) && name(parent.name)) {
        put(name(parent.name) as string, info);
        const obj = parent.parent;
        // `const routes = { list: defineRoute(...) } as const` (or Object.freeze({...})): the key is routes.list
        let up: ts.Node = obj;
        while (up.parent && (ts.isAsExpression(up.parent) || ts.isParenthesizedExpression(up.parent) || ts.isSatisfiesExpression(up.parent) || (ts.isCallExpression(up.parent) && isFreeze(up.parent)))) up = up.parent;
        if (ts.isObjectLiteralExpression(obj) && ts.isVariableDeclaration(up.parent) && ts.isIdentifier(up.parent.name)) put(up.parent.name.text + '.' + name(parent.name), info);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

/** A relative import's target among the scanned files ('./routes' -> '../pages/x/routes.ts'). */
function resolveImport(from: string, spec: string, files: ReadonlySet<string>): string | undefined {
  if (!spec.startsWith('.')) return undefined;
  const parts = from.split('/').slice(0, -1);
  for (const seg of spec.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  let base = parts.join('/');
  if (from.startsWith('./') && !base.startsWith('.')) base = './' + base;
  for (const c of [base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx']) if (files.has(c)) return c;
  return undefined;
}

function topImports(sf: ts.SourceFile, file: string, env: Env): void {
  const m = new Map<string, string>();
  const orig = new Map<string, string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !st.importClause?.namedBindings) continue;
    const target = resolveImport(file, st.moduleSpecifier.text, env.files);
    if (!target) continue;
    const nb = st.importClause.namedBindings;
    if (ts.isNamespaceImport(nb)) { m.set(nb.name.text, target); orig.set(nb.name.text, ''); continue; }
    for (const e of nb.elements) { m.set(e.name.text, target); orig.set(e.name.text, (e.propertyName ?? e.name).text); }
  }
  env.imports.set(file, m);
  env.imported.set(file, orig);
}

/** The one declaration `key` names from `file`: its own, the file it imports the first segment from, or a name no other file declares. */
function pickIn<T>(m: Map<string, T[]>, env: Env, file: string, key: string): T | undefined {
  const local = m.get(file + '#' + key);
  const first = key.split('.')[0] as string;
  const from = env.imports.get(file)?.get(first);
  // The name is imported and also declared in this file (say inside a function): which one a use means depends on scope, so it is unreadable.
  if (local && from) return undefined;
  if (local && local.length === 1) return local[0];
  if (local && local.length > 1) return undefined;
  const was = env.imported.get(file)?.get(first) ?? first; // the name the target gives it
  const inTarget = was === '' ? key.slice(first.length + 1) : was + key.slice(first.length);
  const imported = from ? m.get(from + '#' + inTarget) : undefined;
  if (imported && imported.length === 1) return imported[0];
  const all = m.get(key);
  return all && all.length === 1 ? all[0] : undefined;
}

/** True when the expression is text in JavaScript (a string or template, or a + with one, or a const that is): `+` on it concatenates. */
function isStringy(e: ts.Expression, file: string, env: Env, depth = 0): boolean {
  if (depth > 12) return false;
  const x = unwrap(e);
  if (ts.isStringLiteralLike(x) || ts.isTemplateExpression(x)) return true;
  if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken) return isStringy(x.left, file, env, depth + 1) || isStringy(x.right, file, env, depth + 1);
  if (ts.isIdentifier(x)) { const d = pickIn(env.consts, env, file, x.text); return d ? isStringy(d.e, d.file, env, depth + 1) : false; }
  if (ts.isConditionalExpression(x)) return isStringy(x.whenTrue, file, env, depth + 1) || isStringy(x.whenFalse, file, env, depth + 1);
  if (ts.isPropertyAccessExpression(x)) {
    const base = unwrap(x.expression);
    const obj = ts.isIdentifier(base) ? pickIn(env.consts, env, file, base.text) : undefined;
    const o = obj ? unwrap(obj.e) : undefined;
    if (!obj || !o || !ts.isObjectLiteralExpression(o)) return false;
    return o.properties.some((p) => ts.isPropertyAssignment(p) && name(p.name) === x.name.text && isStringy(p.initializer, obj.file, env, depth + 1));
  }
  return false;
}

function fold(e: ts.Expression | undefined, file: string, env: Env, depth = 0): number | undefined {
  if (!e || depth > 12) return undefined;
  const x = unwrap(e);
  if (ts.isNumericLiteral(x)) return Number(x.text.replace(/_/g, ''));
  if (ts.isStringLiteralLike(x) && /^\d+$/.test(x.text)) return Number(x.text); // query values may be written as strings
  if (ts.isIdentifier(x)) { const d = pickIn(env.consts, env, file, x.text); return d ? fold(d.e, d.file, env, depth + 1) : undefined; }
  if (ts.isPropertyAccessExpression(x)) {
    const base = unwrap(x.expression);
    const obj = ts.isIdentifier(base) ? pickIn(env.consts, env, file, base.text) : undefined;
    return obj ? foldProp(obj.e, x.name.text, obj.file, env, depth + 1) : undefined;
  }
  if (ts.isBinaryExpression(x)) {
    // '10' + '1' is the string '101', not 11: a sum with a string operand is not a number
    if (x.operatorToken.kind === ts.SyntaxKind.PlusToken && (isStringy(x.left, file, env) || isStringy(x.right, file, env))) return undefined;
    const a = fold(x.left, file, env, depth + 1), b = fold(x.right, file, env, depth + 1);
    if (a === undefined || b === undefined) return undefined;
    switch (x.operatorToken.kind) {
      case ts.SyntaxKind.AsteriskToken: return a * b;
      case ts.SyntaxKind.PlusToken: return a + b;
      case ts.SyntaxKind.MinusToken: return a - b;
      default: return undefined;
    }
  }
  if (ts.isConditionalExpression(x)) {
    const a = fold(x.whenTrue, file, env, depth + 1), b = fold(x.whenFalse, file, env, depth + 1);
    return a === undefined || b === undefined ? undefined : Math.max(a, b);
  }
  if (ts.isCallExpression(x)) {
    const callee = x.expression;
    if (ts.isIdentifier(callee) && callee.text === 'clamp' && x.arguments.length === 3) return fold(x.arguments[2], file, env, depth + 1);
    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'Math' && callee.name.text === 'min') {
      const vs = x.arguments.map((a) => fold(a, file, env, depth + 1)).filter((v): v is number => v !== undefined);
      return vs.length ? Math.min(...vs) : undefined;
    }
  }
  return undefined;
}

function foldProp(obj: ts.Expression | undefined, key: string, file: string, env: Env, depth: number): number | undefined {
  if (!obj || depth > 12) return undefined;
  const o = unwrap(obj);
  if (ts.isIdentifier(o)) { const d = pickIn(env.consts, env, file, o.text); return foldProp(d?.e, key, d?.file ?? file, env, depth + 1); }
  if (!ts.isObjectLiteralExpression(o)) return undefined;
  let found: number | undefined;
  for (const p of o.properties) {
    if (ts.isPropertyAssignment(p) && name(p.name) === key) found = fold(p.initializer, file, env, depth + 1);
    else if (ts.isShorthandPropertyAssignment(p) && p.name.text === key) found = fold(p.name, file, env, depth + 1);
    else if (ts.isSpreadAssignment(p)) { const v = foldProp(p.expression, key, file, env, depth + 1); if (v !== undefined) found = v; }
  }
  return found;
}

/** `key` of the object `obj` names: a defineRoute written inside it, or a route const it lists (shorthand or `key: other`). */
function routeProp(obj: ts.Expression, key: string, file: string, env: Env, depth: number): RouteInfo | undefined {
  const o = unwrap(obj);
  if (depth > 12) return undefined;
  if (ts.isIdentifier(o)) {
    const direct = pickIn(env.routes, env, file, o.text + '.' + key);
    if (direct) return direct;
    const init = pickIn(env.consts, env, file, o.text);
    return init ? routeProp(init.e, key, init.file, env, depth + 1) : undefined;
  }
  // commerce.commerceRoutes: the object is the const named by the last segment
  if (ts.isPropertyAccessExpression(o)) {
    const chain = dotted(o);
    // R.routes through `import * as R`: the object is read in the file it is declared in, never a local of the same name
    if (chain && env.imports.get(file)?.has(chain.split('.')[0] as string)) {
      const init = pickIn(env.consts, env, file, chain);
      return init ? routeProp(init.e, key, init.file, env, depth + 1) : undefined;
    }
    return routeProp(o.name, key, file, env, depth + 1);
  }
  if (!ts.isObjectLiteralExpression(o)) return undefined;
  for (const p of o.properties) {
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === key) return pickIn(env.routes, env, file, key);
    if (ts.isPropertyAssignment(p) && name(p.name) === key) {
      const v = unwrap(p.initializer);
      return ts.isIdentifier(v) ? pickIn(env.routes, env, file, v.text) : undefined;
    }
  }
  return undefined;
}

/** The route a call argument or `route:` value names: 'containersRoute', 'routes.list', 'R.subsListRoute'. */
/** 'A.b.c' for a chain of plain identifiers, else null. */
function dotted(x: ts.Expression): string | null {
  const u = unwrap(x);
  if (ts.isIdentifier(u)) return u.text;
  if (ts.isPropertyAccessExpression(u)) { const l = dotted(u.expression); return l === null ? null : l + '.' + u.name.text; }
  return null;
}

function routeOf(e: ts.Expression, file: string, env: Env): RouteInfo | undefined {
  const x = unwrap(e);
  if (ts.isIdentifier(x)) return pickIn(env.routes, env, file, x.text);
  if (ts.isPropertyAccessExpression(x)) {
    // R.routes.l through `import * as R`: the whole chain names the route in the imported file
    const chain = dotted(x);
    const direct = chain ? pickIn(env.routes, env, file, chain) : undefined;
    return direct ?? routeProp(x.expression, x.name.text, file, env, 0);
  }
  return undefined;
}

function nearestRoute(n: ts.Node, file: string, env: Env): RouteInfo | undefined {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if (ts.isObjectLiteralExpression(p)) {
      const r = p.properties.find((q): q is ts.PropertyAssignment => ts.isPropertyAssignment(q) && name(q.name) === 'route');
      const v = r && routeOf(r.initializer, file, env);
      if (v) return v;
    }
    if (ts.isCallExpression(p)) {
      for (const a of p.arguments) { const v = routeOf(a, file, env); if (v) return v; }
    }
    if (ts.isSourceFile(p)) break;
  }
  return undefined;
}

/**
 * The text of a path expression: string and template literals, `a + b` chains, a const string or number folded in;
 * anything else is '{}' (an id). Null when the expression is not a '/...' path at all.
 */
function strOf(e: ts.Node, file: string, env: Env, depth = 0): string | null {
  if (depth > 8) return '{}';
  const x = ts.isExpression(e) ? unwrap(e) : e;
  if (ts.isStringLiteralLike(x)) return x.text;
  if (ts.isTemplateExpression(x)) {
    let out = x.head.text;
    for (const sp of x.templateSpans) out += (strOf(sp.expression, file, env, depth + 1) ?? '{}') + sp.literal.text;
    return out;
  }
  if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = strOf(x.left, file, env, depth + 1), r = strOf(x.right, file, env, depth + 1);
    return l === null || r === null ? null : l + r;
  }
  if (ts.isNumericLiteral(x)) return String(Number(x.text.replace(/_/g, '')));
  if (ts.isIdentifier(x)) {
    const d = pickIn(env.consts, env, file, x.text);
    if (!d) return '{}';
    if (!isStringy(d.e, d.file, env)) { const v = fold(d.e, d.file, env, depth + 1); if (v !== undefined) return String(v); }
    return strOf(d.e, d.file, env, depth + 1);
  }
  return '{}';
}
const pathOf = (e: ts.Node, file: string, env: Env): string | null => {
  if (!(ts.isStringLiteralLike(e) || ts.isTemplateExpression(e) || (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken))) return null;
  if (ts.isBinaryExpression(e.parent) && e.parent.operatorToken.kind === ts.SyntaxKind.PlusToken) return null; // only the whole chain
  const s = strOf(e, file, env);
  return s !== null && s.startsWith('/') ? s : null;
};

/** The first '/path?...' string inside the function that holds a ['limit', n] pair (a path builder). */
function builtPath(n: ts.Node, file: string, env: Env): string | null {
  let fn: ts.Node | undefined = n.parent;
  while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
  let found: string | null = null;
  const visit = (c: ts.Node): void => {
    if (found) return;
    const s = pathOf(c, file, env);
    if (s && s.includes('?')) found = s;
    else ts.forEachChild(c, visit);
  };
  if (fn) visit(fn);
  return found;
}

/** A call that carries a 'GET' string and a '/api/...' path expression (the Board's boardSend(kit, 'GET', '/api/v1/notes/...' + id, {query})). */
function callPath(n: ts.Node, file: string, env: Env): string | null {
  for (let p: ts.Node | undefined = n.parent; p && !ts.isSourceFile(p); p = p.parent) {
    if (!ts.isCallExpression(p)) continue;
    const get = p.arguments.some((a) => ts.isStringLiteralLike(a) && a.text === 'GET');
    const path = p.arguments.map((a) => pathOf(a, file, env)).find((v) => v !== null && v.startsWith('/api/'));
    if (get && path) return path as string;
  }
  return null;
}

function scan(files: Record<string, string>, specs: readonly Spec[]): Scan {
  const limits = maxima(specs);
  const env: Env = { consts: new Map(), routes: new Map(), imports: new Map(), imported: new Map(), files: new Set(Object.keys(files)) };
  const parsed = Object.entries(files).map(([file, text]) => {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    topConsts(sf, file, env);
    topImports(sf, file, env);
    return { file, sf };
  });
  for (const { file, sf } of parsed) defineRoutes(sf, file, env); // after every const is known: a route's path may be a const
  const sites: Site[] = [];
  for (const { file, sf } of parsed) {
    const visit = (n: ts.Node): void => {
      // A. limit: N, or the shorthand `{ limit }`, in an object literal (a route's query)
      const prop = ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n) ? n : null;
      const key = prop ? name(prop.name) : null;
      if (prop && key && PARAMS.includes(key) && ts.isObjectLiteralExpression(n.parent)) {
        const value = fold(ts.isPropertyAssignment(prop) ? prop.initializer : prop.name, file, env) ?? null;
        const r = nearestRoute(n, file, env);
        const cp = r ? null : callPath(n, file, env);
        if (r) sites.push({ file, line: lineOf(sf, n), param: key as Param, value, key: r.method === 'GET' && r.path !== null ? specKey(r.path, r.scope) : null, routed: !(r.method === 'GET' && r.path === null), how: 'route' });
        else if (cp) sites.push({ file, line: lineOf(sf, n), param: key as Param, value, key: specKey(cp, null), routed: true, how: 'call' });
        else if (!ROUTED_ONLY.includes(key)) sites.push({ file, line: lineOf(sf, n), param: key as Param, value, key: null, routed: false, how: 'object' });
      }
      // B. ['limit', N] pairs next to a path string
      if (ts.isArrayLiteralExpression(n) && n.elements.length === 2) {
        const k = n.elements[0] as ts.Expression;
        if (ts.isStringLiteralLike(k) && PARAMS.includes(k.text)) {
          const p = builtPath(n, file, env);
          if (p) sites.push({ file, line: lineOf(sf, n), param: k.text as Param, value: fold(n.elements[1], file, env) ?? null, key: specKey(p, null), routed: true, how: 'pair' });
        }
      }
      // C. limit=N written inside a path string (a template or a `+` chain too: a const folds, an id is unreadable)
      const s = pathOf(n, file, env);
      if (s && s.includes('?')) {
        for (const m of s.matchAll(/[?&](limit|page|offset|count)=([^&#]*)/g)) {
          sites.push({ file, line: lineOf(sf, n), param: m[1] as Param, value: /^\d+$/.test(m[2] as string) ? Number(m[2]) : null, key: specKey(s, null), routed: true, how: 'string' });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  const problems: string[] = [];
  const judged: Site[] = [];
  for (const s of sites) {
    if (s.key === null) continue;
    const row = limits.get(s.key);
    if (!row || !(s.param in row)) continue; // not a path of the API or a kit, or the spec lists no such parameter
    const max = row[s.param];
    if (max === null || max === undefined) continue; // the spec publishes no maximum
    judged.push(s);
    const where = `${rel(s.file)}:${s.line}`;
    // A page or offset is a loop variable by design; only a limit (or a count) must be readable.
    if (s.value === null && s.param !== 'limit' && s.param !== 'count') continue;
    if (s.value === null) problems.push(`${where}: ${s.param} on ${s.key} cannot be read by the scan (maximum ${max}); write it as a number or a const`);
    else if (s.value > max) problems.push(`${where}: ${s.param} ${s.value} on ${s.key} is over the API maximum ${max}`);
  }
  // page and offset are state in every pager; only a limit is sent as a size, so only a limit needs a route
  const unrouted = sites.filter((s) => !s.routed && s.param === 'limit').map((s) => `${rel(s.file)}:${s.line} limit=${s.value ?? '?'}`);
  return { sites, problems, judged, unrouted };
}

// The Hoody API's published spec is read from the monorepo this Hub sits in (HUB_API_OPENAPI names another file).
// Outside the monorepo there is no spec and the tests that need it are skipped; inside it a missing file fails.
const SPEC_AT = monorepoPath(process.env.HUB_API_OPENAPI, 'hoody-api', 'openapi.json');
const spec = (SPEC_AT === null ? { paths: {} } : JSON.parse(readFileSync(SPEC_AT, 'utf8'))) as Spec;

/** The kits' own specs (the agent's generated one, the others' top-level file). Override the folder with HUB_LIMITS_KITS. */
/** The kits whose requests the guard must always see; a missing one would leave them unguarded while a count still looked fine. */
const REQUIRED_KITS = ['hoody-agent', 'hoody-cron', 'hoody-exec', 'hoody-notes'];
function missingKits(loaded: readonly { name: string }[]): string[] {
  return REQUIRED_KITS.filter((k) => !loaded.some((x) => x.name === k));
}
/** The scan's unrouted limits, grouped by file and sorted by value: the shape UNROUTED is compared in. */
function unroutedByFile(list: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const u of list) {
    const m = /^(\S+):\d+ (limit)=(.*)$/.exec(u) as RegExpExecArray;
    (out[`${m[1]} ${m[2]}`] ??= []).push(m[3] as string);
  }
  for (const v of Object.values(out)) v.sort();
  return out;
}
const KIT_ROOT = monorepoPath(process.env.HUB_LIMITS_KITS, 'hoody-kit') ?? '';
function kitSpecs(): { name: string; spec: Spec }[] {
  if (!existsSync(KIT_ROOT)) return [];
  const out: { name: string; spec: Spec }[] = [];
  for (const d of readdirSync(KIT_ROOT).filter((x) => x.startsWith('hoody-')).sort()) {
    const file = ['internal/httpapi/openapi.json', 'openapi.json'].map((f) => join(KIT_ROOT, d, f)).find((f) => existsSync(f));
    if (file) out.push({ name: d, spec: JSON.parse(readFileSync(file, 'utf8')) as Spec });
  }
  return out;
}
const kits = kitSpecs();

// A limit the scan cannot tie to a route, with the values it is safe at ('?' = held in a variable the scan cannot read).
// The values are the claim: a changed number fails this test, so the reason below has to be checked again.
const UNROUTED: Record<string, string[]> = {
  // page0(): RES.page for GET /reservations, maximum 200 (the same RES.page is judged at the walk's own read)
  'src/core/commerce.ts limit': ['200'],
  // the Usage tab's page size, handed to core/agent usageApi.session (the route is out of the scan's reach): GET /sessions/{id}/usage takes 1 to 5000, 1000 is within it
  'src/kit/agent/useUsage.ts limit': ['1000'],
  // the Relations read, through memory.graph (its route is in data.ts, handed the limit in a read object): GRAPH_CHUNK 500 at first, and
  // Read more adds GRAPH_CHUNK up to GRAPH_MAX 5000, the agent's cap; GET /memory/graph publishes no maximum
  'src/pages/ai/knowledge/memory/Relations.tsx limit': ['?', '?'],
  // the models read's route is core's shared providers.providerRoutes.models, out of the scan's reach; GET /models publishes no maximum
  'src/pages/bots/data.ts limit': ['500'],
  // Open with's launcher probe: the Apps page's run search through data.ts searchRoute (an alias the scan cannot follow);
  // GET /api/v1/run/search publishes no maximum, and 20 is below the 50 the Apps page's own (routed) search sends
  'src/pages/apps/launch/openWith/probes.ts limit': ['20'],
  // page sizes handed to the path builders of logs/rules.ts, which clamp each to its maximum (events 500, activity 100, scripts 100, agent logs 500); '?' are PageMeta echoes
  'src/pages/logs/controller.ts limit': ['100', '100', '200', '200', '?', '?', '?'],
  // the builders' own callers and readPage results (the size is clamped inside changesPath/accountPath/scriptsPath/helperPath); '?' send nothing
  'src/pages/logs/rules.ts limit': ['500', '500', '?', '?', '?', '?'],
  // call('runs' | name) by route name: PAGE = 200, the cron runs and entries maximum is 200
  'src/pages/schedules/live.ts limit': ['200', '200'],
  // speechUsageLine's display numbers (today's text-to-speech and transcription allowances), not a request
  'src/pages/bots/logic.ts limit': ['?', '?'],
  // the ListParams handed to supportTable's 'list' read (LIST_LIMIT 20, COUNT_LIMIT 50); its input clamps every size to
  // PAGE_MAX 50, the GET /support/tickets maximum, which the scan judges there. The terminal pure split moved the list
  // hook (LIST_LIMIT) into data.pure.ts; the count hook (COUNT_LIMIT) stayed in data.ts.
  'src/pages/support/data.pure.ts limit': ['20'],
  'src/pages/support/data.ts limit': ['50'],
  // quotaRefusal's `limit` is which daily support limit refused a send (a field of the answer), not a request
  'src/pages/support/logic.ts limit': ['?'],
  // an i18n value (the store's size limit in MB), not a request
  'src/pages/vault/view.tsx limit': ['?'],
};

describe.skipIf(SPEC_AT === null)('Hub list reads stay within the API maximums (openapi.json)', () => {
  const result = scan(sources, [...kits.map((k) => k.spec), spec]);

  it('no read sends a limit, page, offset or count above the published maximum', () => {
    expect(result.problems).toEqual([]);
  });

  it('the scan still sees the reads it exists to judge', () => {
    const files = new Set(result.judged.map((s) => rel(s.file)));
    // Market's limited read (reservations) moved into core/commerce.ts, which is listed here, so market/data.ts has none of its own;
    // home/data.ts sends no limit of its own now.
    for (const f of ['pages/billing/data.ts', 'pages/billing/parts/FreeBadge.data.pure.ts', 'pages/computers/data.ts', 'pages/notes/data.ts', 'pages/scripts/data.ts', 'core/commerce.ts', 'core/setup.ts', 'core/notifications.ts', 'pages/logs/rules.ts', 'core/realm.ts'].map((x) => 'src/' + x))
      expect([f, files.has(f)]).toEqual([f, true]);
    expect(result.judged.length).toBeGreaterThanOrEqual(20);
  });

  // The kit specs live outside this repo: a machine without that folder shows skipped tests, never a silent pass.
  it.skipIf(!existsSync(KIT_ROOT))('the kit specs load (the agent and at least the notes, exec and cron kits)', () => {
    // Named, not counted: a missing kit would leave its requests unguarded while the count still looked fine.
    expect(missingKits(kits)).toEqual([]);
    expect(kits.length).toBeGreaterThanOrEqual(10);
  });

  it.skipIf(!existsSync(KIT_ROOT))('the kit reads are judged too (notes, exec, cron, agent)', () => {
    const files = new Set(result.judged.map((s) => rel(s.file)));
    for (const f of ['pages/notes/coreApi.ts', 'pages/board/notesPages.ts', 'pages/schedules/data.ts', 'pages/scripts/data.ts'].map((x) => 'src/' + x))
      expect([f, files.has(f)]).toEqual([f, true]);
  });

  // The net under every gap the scan cannot see (a helper that builds the query, an alias, a spread): a limit
  // literal that no route or path could be tied to must be named here, with the reason it is safe.
  it('every limit the scan could not tie to a route is named in UNROUTED, with the values it is safe at', () => {
    expect(unroutedByFile(result.unrouted), result.unrouted.join('\n')).toEqual(UNROUTED);
  });
});

describe('the scan itself', () => {
  it('UNROUTED is compared by file and by the sorted values, so a changed value is a difference', () => {
    expect(unroutedByFile(['src/a.ts:3 limit=200', 'src/a.ts:9 limit=100', 'src/b.ts:1 limit=?'])).toEqual({ 'src/a.ts limit': ['100', '200'], 'src/b.ts limit': ['?'] });
    expect(unroutedByFile(['src/a.ts:3 limit=201'])).not.toEqual({ 'src/a.ts limit': ['200'] });
  });
  it('a kit missing from the loaded set is named', () => {
    expect(missingKits([{ name: 'hoody-agent' }, { name: 'hoody-cron' }, { name: 'hoody-exec' }, { name: 'hoody-notes' }, { name: 'hoody-x' }])).toEqual([]);
    expect(missingKits([{ name: 'hoody-agent' }, { name: 'hoody-notes' }])).toEqual(['hoody-cron', 'hoody-exec']);
  });
  const tiny: Spec = {
    paths: {
      '/api/v1/computers/': { get: { parameters: [{ in: 'query', name: 'limit', schema: { maximum: 100 } }, { in: 'query', name: 'page', schema: {} }] } },
      '/api/v1/projects/{id}/computers': { get: { parameters: [{ $ref: '#/components/parameters/Lim' }] } },
      '/api/v1/events': { get: { parameters: [{ in: 'query', name: 'limit', schema: { maximum: 500 } }, { in: 'query', name: 'offset', schema: { maximum: 1000 } }] } },
      '/api/v1/agent/things': { get: { parameters: [{ in: 'query', name: 'limit', schema: { maximum: 50 } }] } },
      '/api/v1/notes/x/{id}/nodes': { get: { parameters: [{ in: 'query', name: 'limit', schema: { maximum: 100 } }] } },
      '/api/v1/records': { get: { parameters: [{ in: 'query', name: 'count', schema: { maximum: 100 } }] } },
    },
    components: { parameters: { Lim: { in: 'query', name: 'limit', schema: { maximum: 50 } } } },
  };
  const hdr = "declare const defineRoute: any; const clamp = (a: number, b: number, c: number) => a;\n";
  const run = (body: string) => scan({ '../pages/x/data.ts': hdr + body }, [tiny]).problems;
  const list = "const list = defineRoute({ method: 'GET', path: '/computers', scope: 'realm', query: ['limit', 'page'] });\n";

  it('judges a read in a data file (route: X), in a call (api(X, ...)) and through a const object with a spread', () => {
    expect(run(list + "export const a = { r: { route: list, input: () => ({ query: { limit: 200 } }) } };")).toHaveLength(1);
    expect(run(list + "api(list, { query: { page: 1, limit: 101 } });")).toHaveLength(1);
    expect(run(list + "const D = { page: 300 }; const P = { ...D }; api(list, { query: { limit: P.page } });")).toHaveLength(1);
    expect(run(list + "const SIZE = 2 * 60; api(list, { query: { limit: SIZE } });")).toHaveLength(1);
  });
  it('accepts a value at or under the maximum, and a limit with no published maximum or on another scope', () => {
    expect(run(list + "api(list, { query: { limit: 100 } });")).toEqual([]);
    expect(run(list + "api(list, { query: { page: 99999 } });")).toEqual([]);
    expect(run("const k = defineRoute({ method: 'GET', path: '/computers', scope: 'agent' }); api(k, { query: { limit: 500 } });")).toEqual([]);
    expect(run("const k = defineRoute({ method: 'POST', path: '/computers', scope: 'realm' }); api(k, { query: { limit: 500 } });")).toEqual([]);
  });
  it('reads :id paths, $ref parameters and routes held in an object const (routes.list)', () => {
    expect(run("const routes = { l: defineRoute({ method: 'GET', path: '/projects/:id/computers', scope: 'base' }) }; call(routes.l, { query: { limit: 51 } });")).toHaveLength(1);
    expect(run("const routes = { l: defineRoute({ method: 'GET', path: '/projects/:id/computers', scope: 'base' }) }; call(routes.l, { query: { limit: 50 } });")).toEqual([]);
  });
  it('judges path builders: a [limit, n] pair next to a path string, with clamp as its cap, and limit= inside a path', () => {
    expect(run("export function p(n: number) { const pairs = [['limit', clamp(n, 1, 501)]]; return '/events?' + pairs; }")).toHaveLength(1);
    expect(run("export function p(n: number) { const pairs = [['limit', clamp(n, 1, 500)], ['offset', clamp(n, 0, 1001)]]; return '/events?' + pairs; }")).toHaveLength(1);
    expect(run("export const q = '/computers?page=1&limit=101';")).toHaveLength(1);
    expect(run("export const q = '/computers?page=1&limit=100';")).toEqual([]);
  });
  it('fails a limit it cannot read on a judged route, so a gap is never silent; a page or offset may vary', () => {
    expect(run(list + "declare const n: number; api(list, { query: { page: n } });")).toEqual([]);
    expect(run(list + "declare const n: number; api(list, { query: { limit: n } });")).toEqual([expect.stringContaining('cannot be read')]);
  });

  it('judges kit and agent routes, the GET path written in a call, shorthand, const paths and imported routes', () => {
    expect(run("const k = defineRoute({ method: 'GET', path: '/api/v1/notes/x/:id/nodes', scope: 'kit', kit: 'notes', index: 1 }); api(k, { query: { limit: 101 } });")).toHaveLength(1);
    expect(run("const k = defineRoute({ method: 'GET', path: '/things', scope: 'agent' }); api(k, { query: { limit: 51 } });")).toHaveLength(1);
    expect(run("const k = defineRoute({ method: 'GET', path: '/things', scope: 'agent' }); api(k, { query: { limit: 50 } });")).toEqual([]);
    expect(run("boardSend({ kit: 'notes' }, 'GET', '/api/v1/notes/x/' + id + '/nodes', { query: { limit: 101 } });")).toHaveLength(1);
    expect(run("boardSend({ kit: 'notes' }, 'GET', '/api/v1/notes/x/' + id + '/nodes', { query: { limit: 100 } });")).toEqual([]);
    expect(run(list + "const limit = 200; api(list, { query: { limit } });")).toHaveLength(1);
    expect(run("const PATH = '/computers'; const r = defineRoute({ method: 'GET', scope: 'realm', path: PATH }); api(r, { query: { limit: 200 } });")).toHaveLength(1);
    const r = "export const routes = { l: defineRoute({ method: 'GET', path: '/computers', scope: 'realm' }) }; export const m = defineRoute({ method: 'GET', path: '/computers', scope: 'realm' });";
    expect(scan({ '../pages/x/routes.ts': hdr + r, '../pages/x/data.ts': "import { routes as R } from './routes'; api(R.l, { query: { limit: 200 } });" }, [tiny]).problems).toHaveLength(1);
    expect(scan({ '../pages/x/routes.ts': hdr + r, '../pages/x/data.ts': "import * as R from './routes'; api(R.m, { query: { limit: 200 } });" }, [tiny]).problems).toHaveLength(1);
    expect(run(list + "api(list, { query: { count: 100 } });")).toEqual([]);
    expect(run("const c = defineRoute({ method: 'GET', path: '/records', scope: 'realm' }); api(c, { query: { count: 101 } });")).toHaveLength(1);
  });
  it('reads a limit written in a template or with a string sum as a request would send it, and survives an unresolved spread', () => {
    expect(run("const LIMIT = 200; transport.hoody('GET', `/computers?limit=${LIMIT}`, null, {});")).toHaveLength(1);
    expect(run("const LIMIT = 100; transport.hoody('GET', `/computers?limit=${LIMIT}`, null, {});")).toEqual([]);
    expect(run("export const q = '/computers?limit=2e2';")).toEqual([expect.stringContaining('cannot be read')]);
    expect(run(list + "api(list, { query: { limit: '10' + '1' } });")).toEqual([expect.stringContaining('cannot be read')]);
    expect(run(list + "declare const external: object; const Q = { ...external }; api(list, { query: { limit: Q.limit } });")).toEqual([expect.stringContaining('cannot be read')]);
  });
  it('lists a limit it cannot tie to a route (the UNROUTED net), but not a routed one, a page, or a count', () => {
    const un = (body: string) => scan({ '../pages/x/data.ts': hdr + body }, [tiny]).unrouted;
    expect(un("const Q = { limit: 200 };")).toHaveLength(1);
    expect(un(list + "api(list, { query: { limit: 20 } });")).toEqual([]);
    expect(un("const Q = { page: 3 }; t('a', { count: 14 });")).toEqual([]);
  });

  it('treats a name declared twice in a file as unreadable, and reads a const where it was written, not where it is imported', () => {
    expect(run(list + "const SIZE = 100; function f() { const SIZE = 200; api(list, { query: { limit: SIZE } }); }")).toEqual([expect.stringContaining('cannot be read')]);
    const vals = "const OTHER = 200; export const SIZE = OTHER;";
    expect(scan({ '../pages/x/values.ts': vals, '../pages/x/data.ts': hdr + list + "import { SIZE as N } from './values'; const OTHER = 100; api(list, { query: { limit: N } });" }, [tiny]).problems).toEqual([expect.stringContaining('limit 200 on GET')]);
    expect(scan({ '../pages/x/values.ts': "export const SIZE = 200;", '../pages/x/data.ts': hdr + list + "import { SIZE as N } from './values'; api(list, { query: { limit: N } });" }, [tiny]).problems).toEqual([expect.stringContaining('over the API maximum 100')]);
  });
  it('does not add string constants as numbers, and follows a route path through const aliases and concatenation', () => {
    expect(run(list + "const A = '10'; const B = '1'; api(list, { query: { limit: A + B } });")).toEqual([expect.stringContaining('cannot be read')]);
    expect(run("const PATH = '/com' + 'puters'; const r = defineRoute({ method: 'GET', scope: 'realm', path: PATH }); api(r, { query: { limit: 200 } });")).toHaveLength(1);
    expect(run("const BASE = '/computers'; const PATH = BASE; const r = defineRoute({ method: 'GET', scope: 'realm', path: PATH }); api(r, { query: { limit: 200 } });")).toHaveLength(1);
  });
  it('an imported name that a function also declares is unreadable; string properties and conditionals do not add as numbers; a namespace route object may reference a separate route const', () => {
    const vals = "export const SIZE = 101;";
    expect(scan({ '../pages/x/values.ts': vals, '../pages/x/data.ts': hdr + list + "import { SIZE as REVIEW_SIZE } from './values'; function unused() { const REVIEW_SIZE = 5; return REVIEW_SIZE; } api(list, { query: { limit: REVIEW_SIZE } });" }, [tiny]).problems).toEqual([expect.stringContaining('cannot be read')]);
    expect(run(list + "const V = { a: '10', b: '1' }; api(list, { query: { limit: V.a + V.b } });")).toEqual([expect.stringContaining('cannot be read')]);
    expect(run(list + "const A = true ? '10' : '10'; api(list, { query: { limit: A + 1 } });")).toEqual([expect.stringContaining('cannot be read')]);
    expect(run(list + "const V = { a: 60, b: 41 }; api(list, { query: { limit: V.a + V.b } });")).toEqual([expect.stringContaining('limit 101 on GET')]);
    const r = "const reviewGet = defineRoute({ method: 'GET', scope: 'realm', path: '/computers' }); export const routes = { l: reviewGet };";
    const use = "import * as R from './routes'; const routes = { l: defineRoute({ method: 'POST', path: '/computers', scope: 'realm' }) }; api(R.routes.l, { query: { limit: 200 } });";
    expect(scan({ '../pages/x/routes.ts': hdr + r, '../pages/x/data.ts': hdr + use }, [tiny]).problems).toHaveLength(1);
  });
  it('lists a GET route whose path it cannot read, so it is never silently skipped', () => {
    const un = (body: string) => scan({ '../pages/x/data.ts': hdr + body }, [tiny]).unrouted;
    expect(un("declare const P: string; const r = defineRoute({ method: 'GET', scope: 'realm', path: P }); api(r, { query: { limit: 3 } });")).toEqual([expect.stringContaining('limit=3')]);
    expect(un("declare const P: string; const r = defineRoute({ method: 'POST', scope: 'realm', path: P }); api(r, { query: { limit: 3 } });")).toEqual([]);
  });
  it('judges count in a path builder and in a path string, and reaches a route through a nested namespace chain', () => {
    expect(run("export const q = '/records?count=101';")).toHaveLength(1);
    expect(run("export function p() { const pairs = [['count', 101]]; return '/records?' + pairs; }")).toHaveLength(1);
    const r = "export const routes = { l: defineRoute({ method: 'GET', path: '/computers', scope: 'realm' }) };";
    const use = "import * as R from './routes'; const routes = { l: defineRoute({ method: 'POST', path: '/computers', scope: 'realm' }) }; api(R.routes.l, { query: { limit: 200 } });";
    expect(scan({ '../pages/x/routes.ts': hdr + r, '../pages/x/data.ts': hdr + use }, [tiny]).problems).toHaveLength(1);
  });
});
