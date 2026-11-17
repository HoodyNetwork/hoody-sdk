// Every session create goes through ONE gate, ask/data.ts gatedCreate (protocol 3 and
// computer_binding, read now; otherwise nothing is sent and the create stays pending). A create path written by
// hand could skip the version check, so this scan makes another path impossible to add quietly:
//   1. a route that POSTs /sessions on the agent is declared only in the files listed in ROUTE_FILES;
//   2. every `api(<a create route>, ...)` call sits inside a `gatedCreate(...)` call (any depth), in every non-test source file;
//   3. the listed declaration files each hold exactly the create routes they are known to hold (a new one is a new path).
// It parses with the TypeScript parser (comments and strings cannot hide a call). What it cannot follow: a create route passed
// through a variable to a helper (`api(r, ...)` with `r` a parameter); that is why rule 1 limits where such a route can be made.
// The scan checks itself first (SELF), so a rule that stopped seeing its target fails here by name.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..');
/** Where a POST /sessions agent route may be declared, and the member names that hold one there. */
const ROUTE_FILES: Record<string, string[]> = {
  'ask/data.ts': ['create', 'attach'],
  'pages/ai/settings/rules/routes.ts': ['create'],
  'pages/scripts/routes.ts': ['sessionCreate'],
};
/** The dotted names a create route is called by in the files that send it. */
const RAW = new Set(['sessionRoutes.create', 'R.sessionCreate', 'leaseRoutes.create', 'askRoutes.create', 'A.routes.create', 'sessionCreate']);
/** `routes.create` is every page's own create (billing, keys, support...); it is Ask's session create only in ask/ and in a file that imports @ask/io. */
const AMBIGUOUS = 'routes.create';

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') out.push(...files(p)); continue; }
    if (/\.(ts|tsx|mts|cts)$/.test(name) && !/\.test\.|\.spec\./.test(name) && !/(^|[\\/])testing\.ts$/.test(p)) out.push(p);
  }
  return out;
}

function dotted(e: ts.Expression): string | null {
  if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e)) return dotted(e.expression);
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) { const o = dotted(e.expression); return o === null ? null : `${o}.${e.name.text}`; }
  return null;
}
const lit = (n: ts.Node | undefined): string | null => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);

interface Scan { ungated: string[]; declared: string[] }
export function scan(text: string, file = 'x.ts', rel = ''): Scan {
  const askFile = rel.startsWith('ask/') || /from '@ask\/io'/.test(text) || rel === '';
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const ungated: string[] = [], declared: string[] = [];
  const visit = (n: ts.Node, inGate: boolean): void => {
    let gate = inGate;
    if (ts.isCallExpression(n)) {
      const callee = dotted(n.expression);
      if (callee === 'gatedCreate' || (callee !== null && callee.endsWith('.gatedCreate'))) gate = true;
      else if (callee === 'api' && n.arguments[0]) {
        const first = dotted(n.arguments[0]);
        if (first !== null && (RAW.has(first) || (first === AMBIGUOUS && askFile)) && !inGate) ungated.push(first);
      } else if (callee === 'defineRoute' && n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])) {
        const props = new Map<string, string | null>();
        for (const p of n.arguments[0].properties) if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) props.set(p.name.text, lit(p.initializer));
        if (props.get('method') === 'POST' && props.get('path') === '/sessions' && props.get('scope') === 'agent') {
          const owner = n.parent && ts.isPropertyAssignment(n.parent) && (ts.isIdentifier(n.parent.name) || ts.isStringLiteral(n.parent.name)) ? n.parent.name.text : '?';
          declared.push(owner);
        }
      }
    }
    ts.forEachChild(n, (c) => visit(c, gate));
  };
  visit(sf, false);
  return { ungated, declared };
}

describe('create gate: the scan sees what it is for (SELF)', () => {
  it('flags an api() call of a create route outside gatedCreate, and passes one inside (any depth)', () => {
    expect(scan(`await api(R.sessionCreate, { body });`).ungated).toEqual(['R.sessionCreate']);
    expect(scan(`await api(sessionRoutes.create, { body });`).ungated).toEqual(['sessionRoutes.create']);
    expect(scan(`const f = () => api(routes.create, o);`).ungated).toEqual(['routes.create']);
    expect(scan(`await gatedCreate(() => api(versionRoute, o), () => api(R.sessionCreate, { body }));`).ungated).toEqual([]);
    expect(scan(`await A.gatedCreate(read, async () => { const x = 1; return await api(routes.create, o); });`).ungated).toEqual([]);
    expect(scan(`await api((R as any).sessionCreate, o);`).ungated, 'a cast does not hide it').toEqual(['R.sessionCreate']);
    expect(scan(`// api(R.sessionCreate, o)\nconst s = "api(R.sessionCreate, o)";`).ungated, 'comments and strings are not calls').toEqual([]);
  });
  it('routes.create counts only in ask/ files and files importing @ask/io (another page has a create of its own)', () => {
    expect(scan(`await api(routes.create, o);`, 'pages/support/data.ts', 'pages/support/data.ts').ungated).toEqual([]);
    expect(scan(`import { x } from '@ask/io';\nawait api(routes.create, o);`, 'pages/x/data.ts', 'pages/x/data.ts').ungated).toEqual(['routes.create']);
    expect(scan(`await api(routes.create, o);`, 'ask/engine.ts', 'ask/engine.ts').ungated).toEqual(['routes.create']);
  });
  it('sees a POST /sessions agent route declaration and its member name', () => {
    expect(scan(`export const r = { make: defineRoute({ method: 'POST', path: '/sessions', scope: 'agent', idem: true }) };`).declared).toEqual(['make']);
    expect(scan(`defineRoute({ method: 'GET', path: '/sessions', scope: 'agent' });`).declared).toEqual([]);
    expect(scan(`defineRoute({ method: 'POST', path: '/sessions/:sid/turns', scope: 'agent' });`).declared).toEqual([]);
  });
});

describe('create gate: no session create is sent outside gatedCreate', () => {
  const all = files(SRC).map((p) => ({ rel: relative(SRC, p).split(sep).join('/'), s: scan(readFileSync(p, 'utf8'), p, relative(SRC, p).split(sep).join('/')) }));
  it('scans the whole source tree', () => { expect(all.length).toBeGreaterThan(500); });
  it('every api() call of a create route is inside gatedCreate', () => {
    expect(all.filter((f) => f.s.ungated.length).map((f) => `${f.rel}: ${f.s.ungated.join(', ')}`)).toEqual([]);
  });
  it('a POST /sessions agent route is declared only where the gate knows it', () => {
    const where = all.filter((f) => f.s.declared.length).map((f) => `${f.rel}: ${f.s.declared.sort().join(',')}`).sort();
    expect(where).toEqual(Object.entries(ROUTE_FILES).map(([f, m]) => `${f}: ${[...m].sort().join(',')}`).sort());
  });
  it('the three sending files each call gatedCreate (the gate is there, not only the routes)', () => {
    for (const f of ['ask/data.ts', 'pages/ai/settings/rules/Session.ts', 'pages/scripts/writer.ts']) {
      expect(readFileSync(join(SRC, f), 'utf8'), f).toMatch(/\bgatedCreate\(/);
    }
  });
});
