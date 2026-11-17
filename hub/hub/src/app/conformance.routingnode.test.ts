// A computer's address is https://<project>-<computer>-<program>-<n>.<NODE>.<proxy
// domain>, and NODE is the flat `server_name` (the parent routing host, for a computer on a subserver too). The nested
// `server.name` is the subserver's own display name, a host the proxy does not serve: it is display text and never
// enters an address, a Target or an identity (core/hosts.ts routingNode is the one reader of the node).
//
// This scan parses every non-test source file under src and counts each read of the nested server's `name`: `x.server.name`,
// `x.server?.name`, `x['server'].name`, `obj(x.server).name` (any helper call around the server), and `.name` of a
// variable the file bound from such a server read (`const sv = obj(c?.server)`). A read is allowed only in a file below
// that SHOWS the name (a label, a search text, a grouping fallback), at most that many times; rows only shrink, and a
// stale row fails. Adding a read anywhere else fails: use routingNode(row), or show the name through a display helper.
//
// Two more shapes fail the same scan: a `server_name:` whose value is a computer's NAME (`server_name: c.name`, `server_name: name`: what
// the Ask code once did, building agent hosts from names like sunny-red-lemur), and a synthetic Target made by a cast
// (`{ ... } as unknown as Target`: build it with ask/engine.ts targetOf, or from a real row with routingNode). The cast rows below
// only shrink.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');

/** hub/src-relative file -> how many display reads of the nested server name it may hold. */
const DISPLAY: Readonly<Record<string, number>> = {
  // A server row of a list of servers or rentals (the server is the row; its name is what the row shows), not a computer's node.
  'pages/computers/data.ts': 1,
  'pages/computers/parts/ServerDetail.logic.ts': 1,
  'pages/billing/logic.ts': 2,
  // The plan chip names the free server a computer is on (a label).
  'core/commerce.ts': 1,
  // the AI allowance table labels each AI server's row with its name (a label, never a route).
  'pages/ai/data.ts': 1,
  // A computer's server as the Computers list shows it: the grouping fallback, the label, the search text (display only).
  'pages/computers/logic.ts': 2,
  'pages/computers/parts/ComputersList.tsx': 1,
  'pages/computers/parts/ExitIp.pure.ts': 1,
  // The Bots picker row's place line (computerOf.server, shown as "city · server").
  'pages/bots/data.ts': 1,
  // The kit gallery's sample table row.
  'kit/gallery/table.tsx': 1,
  // A list row's region line (containerRowOf: region.server, shown as the place); the row's Target is chooseComputer's flat server_name.
  'core/computer.ts': 1,
  // The create drawer's summary names the chosen server (a label).
  'pages/computers/parts/create/Summary.tsx': 1,
};

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') out.push(...files(p)); continue; }
    if (/\.(ts|tsx|mts|cts)$/.test(name) && !/\.(test|spec)\.(ts|tsx|mts|cts)$/.test(name)) out.push(p);
  }
  return out;
}

const unwrap = (e: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e) || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e) ? unwrap(e.expression) : e;

/** `x.server`, `x?.server` or `x['server']`. */
function isServerAccess(e: ts.Expression): boolean {
  const u = unwrap(e);
  if (ts.isPropertyAccessExpression(u)) return u.name.text === 'server';
  if (ts.isElementAccessExpression(u)) return ts.isStringLiteralLike(u.argumentExpression) && u.argumentExpression.text === 'server';
  return false;
}

/** The nested server itself: a server access, a call around one (`obj(c.server)`), or one with a fallback (`c.server ?? {}`). */
function isServerValue(e: ts.Expression): boolean {
  const u = unwrap(e);
  if (isServerAccess(u)) return true;
  if (ts.isCallExpression(u)) return u.arguments.some((a) => isServerValue(a));
  if (ts.isBinaryExpression(u) && (u.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || u.operatorToken.kind === ts.SyntaxKind.BarBarToken)) return isServerValue(u.left);
  return false;
}

/** Every read of the nested server's `name` in the source: its line numbers. */
export function nestedServerNameReads(text: string, fileName = 'x.tsx'): number[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  // A variable bound from a server read counts only inside the block (or file) that declares it.
  const bound: { name: string; scope: ts.Node }[] = [];
  const scopeOf = (n: ts.Node): ts.Node => {
    let scope: ts.Node = n.parent;
    while (scope.parent && !ts.isBlock(scope) && !ts.isSourceFile(scope) && !ts.isModuleBlock(scope) && !ts.isCaseClause(scope)) scope = scope.parent;
    return scope;
  };
  const collect = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && isServerValue(n.initializer)) bound.push({ name: n.name.text, scope: scopeOf(n) });
    // `const { server } = c` / `const { server: sv } = c`: the local is the nested server.
    if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && n.initializer) {
      for (const b of n.name.elements) {
        const key = (b.propertyName ?? b.name).getText(sf).replace(/^['"]|['"]$/g, '');
        if (key === 'server' && ts.isIdentifier(b.name)) bound.push({ name: b.name.text, scope: scopeOf(n) });
      }
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const inScope = (id: ts.Identifier): boolean =>
    bound.some((b) => {
      if (b.name !== id.text) return false;
      for (let p: ts.Node | undefined = id; p; p = p.parent) if (p === b.scope) return true;
      return false;
    });
  const hits: number[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const ofServer = (e: ts.Expression): boolean => { const o = unwrap(e); return isServerValue(o) || (ts.isIdentifier(o) && inScope(o)); };
  const visit = (n: ts.Node): void => {
    // `server.name`, `server['name']`, and `const { name } = server` (any binding of the `name` key).
    if (ts.isPropertyAccessExpression(n) && n.name.text === 'name' && ofServer(n.expression)) hits.push(at(n));
    else if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) && n.argumentExpression.text === 'name' && ofServer(n.expression)) hits.push(at(n));
    else if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && n.initializer && ofServer(n.initializer)
      && n.name.elements.some((b) => ((b.propertyName ?? b.name) as ts.Node).getText(sf).replace(/^['"]|['"]$/g, '') === 'name')) hits.push(at(n));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

/** Lines of `server_name: <a name>` (a property or identifier called `name`) and of `as Target` casts of an object (any `as ... Target`). */
export function syntheticTargetShapes(text: string, fileName = 'x.tsx'): { named: number[]; casts: number[] } {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const named: number[] = [], casts: number[] = [];
  const line = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const isNameRead = (v: ts.Expression): boolean =>
    (ts.isPropertyAccessExpression(v) && v.name.text === 'name') || (ts.isElementAccessExpression(v) && ts.isStringLiteralLike(v.argumentExpression) && v.argumentExpression.text === 'name');
  // A variable bound from a `.name` read (`const node = c.name`), anywhere in the file: handing it to server_name is the same shape.
  const aliases = new Set<string>();
  const collect = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && isNameRead(unwrap(n.initializer))) aliases.add(n.name.text);
    // `const { name: node } = c`: the local holds a name.
    if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name)) {
      for (const b of n.name.elements) if (ts.isIdentifier(b.name) && (b.propertyName ?? b.name).getText(sf).replace(/^['"]|['"]$/g, '') === 'name') aliases.add(b.name.text);
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAssignment(n) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) && n.name.text === 'server_name') {
      const v = unwrap(n.initializer);
      if (isNameRead(v) || (ts.isIdentifier(v) && (v.text === 'name' || aliases.has(v.text)))) named.push(line(n));
    } else if (ts.isShorthandPropertyAssignment(n) && n.name.text === 'server_name') {
      // `{ server_name }` takes a variable called server_name: fine.
    }
    if (ts.isAsExpression(n) && ts.isTypeReferenceNode(n.type) && n.type.typeName.getText(sf) === 'Target' && ts.isAsExpression(n.expression)) casts.push(line(n));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { named, casts };
}

/** hub/src-relative file -> how many `server_name: <name>` lines it may hold: a SERVER's own name, not a computer's (fixture data). */
const NAMED: Readonly<Record<string, number>> = {
  'core/world.ts': 1, // the fixture world's server row: server_name is the server's name (flat == nested here)
};

/** hub/src-relative file -> how many `as unknown as Target` casts it may hold (a test helper that stands in for a computer). */
const CASTS: Readonly<Record<string, number>> = {
  'pages/apps/github/testing.ts': 1,
};

describe('the Target shapes detector', () => {
  it.each([
    ['const t = { container: { id, server_name: c.name } };', 1, 0],
    ['const t = { container: { id, server_name: name } };', 1, 0],
    ['const t = { container: { id, server_name: (c as X).name } };', 1, 0],
    ['const t = { container: { id, server_name: node } };', 0, 0],
    ["const t = { container: { id, server_name: c['name'] } };", 1, 0],
    ['const node = c.name; const t = { container: { id, server_name: node } };', 1, 0],
    ["const node = c['name']; const t = { container: { id, server_name: node } };", 1, 0],
    ['const node = routingNode(c); const t = { container: { id, server_name: node } };', 0, 0],
    ['const { name: node } = c; const t = { container: { id, server_name: node } };', 1, 0],
    ['const { id: node } = c; const t = { container: { id, server_name: node } };', 0, 0],
    ['const t = { container: { id, server_name: c.server_name } };', 0, 0],
    ['const t = { project: p } as unknown as Target;', 0, 1],
    ['const t = x as Target;', 0, 0],
    ['const t = { project: p } as Target;', 0, 0],
  ])('%s: %i named, %i cast', (code, named, casts) => {
    const r = syntheticTargetShapes(`function f(c: any) { ${code} }`);
    expect(r.named).toHaveLength(named);
    expect(r.casts).toHaveLength(casts);
  });
});

describe('the detector', () => {
  it.each([
    ['c.server.name', 1],
    ['c.server?.name', 1],
    ["c['server'].name", 1],
    ['c?.server?.name', 1],
    ['obj(c.server).name', 1],
    ['obj(c?.server)?.name', 1],
    ['rec(c.server).name', 1],
    ['(c as { server?: { name?: string } }).server?.name', 1],
    ['const sv = obj(c.server); const n = sv.name;', 1],
    ['const sv = c.server ?? {}; const n = sv.name;', 1],
    ['const sv = c.server; return [sv?.name, sv.name];', 2],
    ['{ const sv = c.server; } const g = (sv: any) => sv.name;', 0],
    ['x.server_name', 0],
    ['c.name', 0],
    ['c.server.city', 0],
    ['const sv = c.other; sv.name', 0],
    ['const server = routingNode(c)', 0],
    ["c.server['name']", 1],
    ["c?.server?.['name']", 1],
    ['const { name } = c.server;', 1],
    ['const { name: n } = obj(c.server);', 1],
    ["const { 'name': n } = c.server ?? {};", 1],
    ['const { city } = c.server;', 0],
    ['const { name } = c;', 0],
    ["const sv = c.server; const n = sv['name'];", 1],
    ['const { server } = c; const n = server.name;', 1],
    ['const { server: sv } = c; const n = sv?.name;', 1],
    ['const { project } = c; const n = project.name;', 0],
  ])('%s: %i read(s)', (code, n) => {
    expect(nestedServerNameReads(`function f(c: any) { ${code} }`)).toHaveLength(n);
  });
});

describe('the subserver display name never routes', () => {
  const found = new Map<string, number[]>();
  for (const f of files(SRC)) {
    const rel = relative(SRC, f).split(sep).join('/');
    const hits = nestedServerNameReads(readFileSync(f, 'utf8'), f);
    if (hits.length) found.set(rel, hits);
  }

  it('reads the nested server name only where it is shown, and no more often than the row allows', () => {
    const over = [...found].filter(([f, h]) => h.length > (DISPLAY[f] ?? 0)).map(([f, h]) => `${f}:${h.join(',')} (allowed ${DISPLAY[f] ?? 0})`);
    expect(over, 'use routingNode(row) for an address, a Target or an identity; show the slice name through a display helper').toEqual([]);
  });

  const shapes = new Map<string, { named: number[]; casts: number[] }>();
  for (const f of files(SRC)) {
    const rel = relative(SRC, f).split(sep).join('/');
    const r = syntheticTargetShapes(readFileSync(f, 'utf8'), f);
    if (r.named.length || r.casts.length) shapes.set(rel, r);
  }

  it('builds no server_name from a computer name', () => {
    const over = [...shapes].filter(([f, r]) => r.named.length > (NAMED[f] ?? 0)).map(([f, r]) => `${f}:${r.named.join(',')} (allowed ${NAMED[f] ?? 0})`);
    expect(over, 'a Target\'s server_name is the routing node (routingNode(row), or targetOf(project, id, server) in ask), never a computer\'s name').toEqual([]);
    const stale = Object.entries(NAMED).filter(([f, n]) => (shapes.get(f)?.named.length ?? 0) < n).map(([f]) => f);
    expect(stale).toEqual([]);
  });

  it('casts no synthetic Target, beyond the rows allowed', () => {
    const over = [...shapes].filter(([f, r]) => r.casts.length > (CASTS[f] ?? 0)).map(([f, r]) => `${f}:${r.casts.join(',')} (allowed ${CASTS[f] ?? 0})`);
    expect(over, 'build a Target with ask/engine.ts targetOf (or from a real row with routingNode), never a cast').toEqual([]);
    const stale = Object.entries(CASTS).filter(([f, n]) => (shapes.get(f)?.casts.length ?? 0) < n).map(([f, n]) => `${f} allows ${n}, has ${shapes.get(f)?.casts.length ?? 0}`);
    expect(stale).toEqual([]);
  });

  it('keeps no row for a read that is gone', () => {
    const stale = Object.entries(DISPLAY).filter(([f, n]) => (found.get(f)?.length ?? 0) < n).map(([f, n]) => `${f} allows ${n}, has ${found.get(f)?.length ?? 0}`);
    expect(stale).toEqual([]);
  });
});
