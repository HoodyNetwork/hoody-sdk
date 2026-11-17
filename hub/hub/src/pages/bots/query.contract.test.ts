// @vitest-environment node
// The Bots page's query values against the agent's published OpenAPI. The fixtures accept any query, so a value the
// real agent refuses (`tail: 100` where the log wants `tail=true`: 400 "tail must be true" from the real agent) passed every
// other test. Contract, in plain words:
//   - Every `query: { ... }` object literal in data.ts that the scan can tie to a Bots route (the enclosing
//     `api(ROUTES.x, ...)` call, or the read definition whose `route:` is ROUTES.x) is judged against that route's
//     query parameters in the agent's generated spec (its openapi.json):
//       * each key is a published query parameter of that operation;
//       * each literal value fits the parameter's schema: integer = a number literal, boolean = true/false or the
//         strings "true"/"false" (never a number), enum = one of its members, string = a string literal.
//   - A value the scan cannot fold (a variable, a spread, a call) is not judged but is counted, so a scan that quietly
//     stops seeing literals fails the coverage floor below. Routes outside the agent (the Hoody API's own) are not judged.
//   - The agent spec lives next to the agent's source: HUB_AGENT_SPEC overrides the path.
import { providers } from '@core';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';

const SPEC_FILE = monorepoPath(process.env.HUB_AGENT_SPEC, 'hoody-kit', 'hoody-agent', 'internal', 'httpapi', 'openapi.json') ?? '';
const src = readFileSync(new URL('./data.ts', import.meta.url), 'utf8');

interface Schema { type?: string; enum?: unknown[] }
interface Param { name: string; in: string; schema?: Schema; $ref?: string }
interface Spec { paths: Record<string, Record<string, { parameters?: Param[] }>>; components?: { parameters?: Record<string, Param> } }
interface RouteDef { method: string; path: string; scope: string; query: string[] | undefined }

const sf = ts.createSourceFile('data.ts', src, ts.ScriptTarget.Latest, true);
const propName = (p: ts.ObjectLiteralElementLike): string | undefined => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : undefined);
const strOf = (e: ts.Expression | undefined): string | undefined => (e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : undefined);

/** The top-level `const NAME = ['a', 'b'] as const` arrays of data.ts (the query lists the routes spread in). */
function constLists(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      const init = d.initializer && ts.isAsExpression(d.initializer) ? d.initializer.expression : d.initializer;
      if (ts.isIdentifier(d.name) && init && ts.isArrayLiteralExpression(init) && init.elements.every((e) => ts.isStringLiteral(e))) out.set(d.name.text, init.elements.map((e) => (e as ts.StringLiteral).text));
    }
  }
  return out;
}

/** A route's declared `query: [...]` (literals, or spreads of the const lists above); none declared = []; undefined when it cannot be folded. */
function declaredQuery(arg: ts.ObjectLiteralExpression, lists: Map<string, string[]>): string[] | undefined {
  const q = arg.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && propName(p) === 'query');
  if (!q) return [];
  let init: ts.Expression = q.initializer;
  if (ts.isAsExpression(init)) init = init.expression;
  if (ts.isIdentifier(init)) return lists.get(init.text);
  if (!ts.isArrayLiteralExpression(init)) return undefined;
  const out: string[] = [];
  for (const e of init.elements) {
    if (ts.isStringLiteral(e)) out.push(e.text);
    else if (ts.isSpreadElement(e) && ts.isIdentifier(e.expression) && lists.has(e.expression.text)) out.push(...(lists.get(e.expression.text) as string[]));
    else return undefined;
  }
  return out;
}

/** A ROUTES entry that is core's shared provider route (`providers.providerRoutes.x`): judged from core's route object itself. */
function sharedRoute(e: ts.Expression): RouteDef | undefined {
  if (!ts.isPropertyAccessExpression(e) || !ts.isPropertyAccessExpression(e.expression) || e.expression.name.text !== 'providerRoutes') return undefined;
  const base = e.expression.expression;
  if (!ts.isIdentifier(base) || base.text !== 'providers') return undefined;
  const r = (providers.providerRoutes as Record<string, { method: string; path: string; scope: string; query: readonly string[] } | undefined>)[e.name.text];
  return r && { method: r.method, path: r.path, scope: r.scope, query: [...r.query] };
}

/** ROUTES.<name> = defineRoute({ method, path, scope, query }), or core's shared route. */
function routeDefs(): Map<string, RouteDef> {
  const out = new Map<string, RouteDef>();
  const lists = constLists();
  const visit = (n: ts.Node): void => {
    const init = ts.isVariableDeclaration(n) && n.initializer && ts.isAsExpression(n.initializer) ? n.initializer.expression : ts.isVariableDeclaration(n) ? n.initializer : undefined;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'ROUTES' && init && ts.isObjectLiteralExpression(init)) {
      for (const p of init.properties) {
        const name = propName(p);
        const shared = name && ts.isPropertyAssignment(p) ? sharedRoute(p.initializer) : undefined;
        if (name && shared) {
          out.set(name, shared);
          continue;
        }
        if (!name || !ts.isPropertyAssignment(p) || !ts.isCallExpression(p.initializer)) continue;
        const arg = p.initializer.arguments[0];
        if (!arg || !ts.isObjectLiteralExpression(arg)) continue;
        const f: Record<string, string | undefined> = {};
        for (const q of arg.properties) if (ts.isPropertyAssignment(q)) f[propName(q) ?? ''] = strOf(q.initializer);
        if (f.method && f.path && f.scope) out.set(name, { method: f.method, path: f.path, scope: f.scope, query: declaredQuery(arg, lists) });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const routeName = (e: ts.Expression | undefined): string | undefined =>
  e && ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'ROUTES' ? e.name.text : undefined;

/** The ROUTES.x a `query` literal belongs to: the nearest enclosing api(ROUTES.x, ...) call, or object with `route: ROUTES.x`. */
function routeOf(n: ts.Node): string | undefined {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const r = routeName(p.arguments[0]);
      if (r) return r;
    }
    if (ts.isObjectLiteralExpression(p)) {
      for (const q of p.properties) if (ts.isPropertyAssignment(q) && propName(q) === 'route') return routeName(q.initializer);
    }
  }
  return undefined;
}

interface Site { route: string; key: string; value: ts.Expression | undefined }
function sites(): { judged: Site[]; unfolded: string[] } {
  const judged: Site[] = [];
  const unfolded: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAssignment(n) && propName(n) === 'query' && ts.isObjectLiteralExpression(unwrap(n.initializer))) {
      const route = routeOf(n);
      for (const p of (unwrap(n.initializer) as ts.ObjectLiteralExpression).properties) {
        const key = propName(p);
        if (!route) continue;
        if (!key || !ts.isPropertyAssignment(p)) { unfolded.push(route); continue; }
        judged.push({ route, key, value: p.initializer });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { judged, unfolded };
}

const specKey = (r: RouteDef): string => '/api/v1/agent' + (r.path.startsWith('/') ? r.path : '/' + r.path).replace(/:([A-Za-z_]\w*)/g, '{$1}');

function queryParams(spec: Spec, r: RouteDef): Map<string, Schema> | undefined {
  const op = spec.paths[specKey(r)]?.[r.method.toLowerCase()];
  if (!op) return undefined;
  const out = new Map<string, Schema>();
  for (const raw of op.parameters ?? []) {
    const p = raw.$ref ? spec.components?.parameters?.[raw.$ref.split('/').pop() ?? ''] : raw;
    if (p && p.in === 'query') out.set(p.name, p.schema ?? {});
  }
  return out;
}

/** `100 as const`, `(100)`, `x!`, `x satisfies T`: the value underneath. */
function unwrap(e: ts.Expression): ts.Expression {
  let cur = e;
  while (ts.isAsExpression(cur) || ts.isParenthesizedExpression(cur) || ts.isNonNullExpression(cur) || ts.isSatisfiesExpression(cur) || ts.isTypeAssertionExpression(cur)) cur = cur.expression;
  return cur;
}

/** The kind of value the scan can read: a number, string or boolean literal. */
const isLiteral = (e: ts.Expression): boolean => ts.isNumericLiteral(e) || strOf(e) !== undefined || e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword;

/** What is wrong with a literal value for a parameter's schema, or undefined (also for a value the scan cannot fold). */
function wrong(value: ts.Expression | undefined, s: Schema): string | undefined {
  if (!value) return undefined;
  const v = unwrap(value);
  const lit = ts.isNumericLiteral(v) ? { kind: 'number', val: Number(v.text) } : strOf(v) !== undefined ? { kind: 'string', val: strOf(v) as string } : v.kind === ts.SyntaxKind.TrueKeyword || v.kind === ts.SyntaxKind.FalseKeyword ? { kind: 'boolean', val: v.kind === ts.SyntaxKind.TrueKeyword } : null;
  if (!lit) return undefined;
  if (s.enum && !s.enum.includes(lit.val)) return `${JSON.stringify(lit.val)} is not one of ${JSON.stringify(s.enum)}`;
  if (s.type === 'integer' || s.type === 'number') return lit.kind === 'number' && (s.type === 'number' || Number.isInteger(lit.val)) ? undefined : `${JSON.stringify(lit.val)} is not ${s.type === 'integer' ? 'an integer' : 'a number'}`;
  if (s.type === 'boolean') return lit.kind === 'boolean' || (lit.kind === 'string' && (lit.val === 'true' || lit.val === 'false')) ? undefined : `${JSON.stringify(lit.val)} is not a boolean (true or "true")`;
  if (s.type === 'string') return lit.kind === 'string' ? undefined : `${JSON.stringify(lit.val)} is not a string`;
  return undefined;
}

describe.skipIf(!existsSync(SPEC_FILE))('the Bots page asks the agent only what its published spec accepts', () => {
  // Collection runs this callback even when the suite is skipped: a checkout without the agent's spec must not throw here.
  const spec: Spec = existsSync(SPEC_FILE) ? (JSON.parse(readFileSync(SPEC_FILE, 'utf8')) as Spec) : { paths: {} };
  const defs = routeDefs();
  const { judged, unfolded } = sites();
  const agentSites = judged.filter((s) => defs.get(s.route)?.scope === 'agent');

  it('every literal query key and value of an agent route fits that operation', () => {
    const problems: string[] = [];
    for (const s of agentSites) {
      const def = defs.get(s.route) as RouteDef;
      const params = queryParams(spec, def);
      if (!params) { problems.push(`${s.route}: ${def.method} ${specKey(def)} is not in the agent spec`); continue; }
      // The Hub's own transport refuses, unsent, a query key its route does not declare (core ROUTE_QUERY): the agent would accept it, the read never goes.
      if (def.query && !def.query.includes(s.key)) { problems.push(`${s.route}: query "${s.key}" is not in the route's declared query list (${def.query.join(', ') || 'none'}): core refuses the call unsent`); continue; }
      const schema = params.get(s.key);
      if (!schema) { problems.push(`${s.route}: query "${s.key}" is not a published parameter of ${def.method} ${specKey(def)} (${[...params.keys()].join(', ') || 'none'})`); continue; }
      const bad = wrong(s.value, schema);
      if (bad) problems.push(`${s.route}: query "${s.key}": ${bad}`);
    }
    expect(problems).toEqual([]);
  });

  it('the scan sees the reads it is meant to judge (the log tail among them)', () => {
    expect(agentSites.length).toBeGreaterThanOrEqual(10);
    expect(agentSites.some((s) => s.route === 'log' && s.key === 'tail')).toBe(true);
    expect(agentSites.some((s) => s.route === 'log' && s.key === 'before')).toBe(true);
    // The archive is read back with before only: the agent refuses tail on it, and tail with before anywhere
    // (the agent's own rule), so a tail here fails every archive read live.
    expect(agentSites.filter((s) => s.route === 'archive').map((s) => s.key).sort()).toEqual(['before', 'limit']);
    expect(agentSites.some((s) => s.route === 'delegates' && s.key === 'state')).toBe(true);
    // models is core's shared route: still judged against the agent spec.
    expect(agentSites.some((s) => s.route === 'models' && s.key === 'limit')).toBe(true);
  });

  // Not judged, by design: archive.before (the seq the archive page ends before, from the shown page), audioVoices.model (a speech model the person picked), chanSetup.kind (a ChannelKind from the type), delegates.limit (FINISHED_PAGE, a const 10, and CLOSED_PROOF_PAGE, 500), delegates.page (the page asked for, in the finished and the closed proof reads), log.before (the seq of the oldest row shown) and logStream.since (the seq of the newest row shown).
  it('no query property is a spread or a computed key (those would bypass the judging above)', () => {
    expect(unfolded.filter((r) => defs.get(r)?.scope === 'agent')).toEqual([]);
  });

  it('the values the scan cannot read are the known ones (a new one must be judged and added here)', () => {
    const unresolved = agentSites.filter((s) => !s.value || !isLiteral(unwrap(s.value))).map((s) => `${s.route}.${s.key}`).sort();
    expect(unresolved).toEqual(['archive.before', 'audioVoices.model', 'chanSetup.kind', 'delegates.limit', 'delegates.limit', 'delegates.page', 'delegates.page', 'log.before', 'logStream.since']);
  });

  it('what the handlers accept beyond the schema: the log tail is exactly true, and the open list asks for the open delegates', () => {
    const tail = agentSites.filter((s) => s.route === 'log' && s.key === 'tail');
    expect(tail.length).toBeGreaterThan(0);
    for (const t of tail) {
      const v = t.value && unwrap(t.value);
      expect(v && (strOf(v) === 'true' || v.kind === ts.SyntaxKind.TrueKeyword)).toBe(true);
    }
    // The open list (the Work tab and its badge) must not read open and closed together, oldest first, 50 at most (a Bot with more tasks would
    // lose its newest open ones), nor page the open ones: it asks state=open and limit=0 (no pagination; the open ones are in memory).
    expect(agentSites.some((s) => s.route === 'delegates' && s.key === 'state' && s.value && strOf(unwrap(s.value)) === 'open')).toBe(true);
    expect(agentSites.some((s) => s.route === 'delegates' && s.key === 'limit' && s.value && ts.isNumericLiteral(unwrap(s.value)) && (unwrap(s.value) as ts.NumericLiteral).text === '0')).toBe(true);
  });

  it('the routes the page sends queries on declare them (models: limit, delegates: state and limit, log: tail)', () => {
    expect(defs.get('models')?.query).toContain('limit');
    expect(defs.get('delegates')?.query).toEqual(expect.arrayContaining(['state', 'limit']));
    expect(defs.get('log')?.query).toContain('tail');
  });

  it('a wrong value is caught (the scan judges what it reads)', () => {
    const log = queryParams(spec, defs.get('log') as RouteDef);
    const num = ts.factory.createNumericLiteral('100');
    expect(wrong(num, log?.get('tail') ?? {})).toMatch(/not a boolean/);
    expect(wrong(ts.factory.createStringLiteral('true'), log?.get('tail') ?? {})).toBeUndefined();
    expect(wrong(ts.factory.createStringLiteral('x'), queryParams(spec, defs.get('delegates') as RouteDef)?.get('state') ?? {})).toMatch(/not one of/);
    // The shared models route is judged too: a malformed limit is refused.
    const models = queryParams(spec, defs.get('models') as RouteDef);
    expect(models?.get('limit')).toBeDefined();
    expect(wrong(ts.factory.createStringLiteral('bad'), models?.get('limit') ?? {})).toMatch(/not an integer/);
  });
});
