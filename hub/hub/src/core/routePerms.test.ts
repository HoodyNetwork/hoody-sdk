// routePerms.ts holds one entry for every base and realm route the Hub declares (read from the source
// with the TypeScript AST, as Toast.calls.test.ts reads toasts), names no route that is not declared, and answers what a
// token lacks as the server's checks do.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { BODY_LEAVES, lackOf, ROUTE_PERMS, routeLeaves } from './routePerms';

const SRC = join(import.meta.dirname, '..');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) { if (d.name !== 'node_modules') out.push(...files(p)); }
    else if (/\.tsx?$/.test(d.name) && !/\.(test|spec)\.tsx?$/.test(d.name) && !p.includes(sep + 'test' + sep)) out.push(p);
  }
  return out;
}

interface Found { label: string; scope: string | null; at: string }

const unwrap = (e: ts.Expression): ts.Expression => (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e) ? unwrap(e.expression) : e);

/** Every defineRoute({...}) of the source: its label and scope (a literal, or one a spread of an object literal
 *  carries: the same file's first, else one exported under that name). */
function declared(): Found[] {
  const parsed = files(SRC).map((f) => ({ f, sf: ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS) }));
  const objectsOf = (sf: ts.SourceFile): Map<string, ts.ObjectLiteralExpression> => {
    const m = new Map<string, ts.ObjectLiteralExpression>();
    const visit = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) { const i = unwrap(n.initializer); if (ts.isObjectLiteralExpression(i)) m.set(n.name.text, i); }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return m;
  };
  const global = new Map<string, { o: ts.ObjectLiteralExpression; sf: ts.SourceFile }>();
  const local = new Map<ts.SourceFile, Map<string, ts.ObjectLiteralExpression>>();
  for (const { sf } of parsed) { const m = objectsOf(sf); local.set(sf, m); for (const [k, o] of m) if (!global.has(k)) global.set(k, { o, sf }); }
  const out: Found[] = [];
  for (const { f, sf } of parsed) {
    if (!sf.text.includes('defineRoute')) continue;
    const lit = (o: ts.ObjectLiteralExpression, osf: ts.SourceFile, k: string, depth = 0): string | null => {
      for (const p of o.properties) {
        if (ts.isPropertyAssignment(p) && p.name.getText(osf) === k && ts.isStringLiteralLike(p.initializer)) return p.initializer.text;
        if (ts.isSpreadAssignment(p) && ts.isIdentifier(p.expression) && depth < 4) {
          const name = p.expression.text;
          const own = local.get(osf)?.get(name);
          const via = own ? { o: own, sf: osf } : global.get(name);
          const v = via ? lit(via.o, via.sf, k, depth + 1) : null;
          if (v) return v;
        }
      }
      return null;
    };
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'defineRoute' && n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])) {
        const o = n.arguments[0];
        const method = lit(o, sf, 'method'), path = lit(o, sf, 'path');
        if (method && path) out.push({ label: method + ' ' + path, scope: lit(o, sf, 'scope'), at: relative(SRC, f) + ':' + (sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1) });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

describe('routePerms.ts covers every declared base and realm route', () => {
  const all = declared();
  it('the scan reads routes (a broken scan cannot pass)', () => {
    expect(all.length).toBeGreaterThan(200);
    expect(all.filter((r) => r.scope === null).map((r) => r.at)).toEqual([]);
  });
  const hoody = all.filter((r) => r.scope === 'base' || r.scope === 'realm');
  it('every base/realm route has an entry', () => {
    expect(hoody.filter((r) => !Object.prototype.hasOwnProperty.call(ROUTE_PERMS, r.label)).map((r) => `${r.label} (${r.at})`)).toEqual([]);
  });
  it('every entry names a declared base/realm route', () => {
    const labels = new Set(hoody.map((r) => r.label));
    expect(Object.keys(ROUTE_PERMS).filter((k) => !labels.has(k))).toEqual([]);
  });
});

describe('lackOf answers as the server checks', () => {
  const held = (...ls: string[]) => (l: string) => ls.includes(l);
  it('one leaf: lacking it names it; holding it sends', () => {
    expect(lackOf('GET', '/bot-urls', '/bot-urls', held(), true)).toBe('resources.bot_urls');
    expect(lackOf('GET', '/bot-urls', '/bot-urls', held('resources.bot_urls'), true)).toBeNull();
  });
  it('all of several leaves: the first one lacking', () => {
    const p = '/computers/c1/snapshots';
    expect(lackOf('POST', '/computers/:id/snapshots', p, held('computers.update'), true)).toBe('computers.features.snapshots');
    expect(lackOf('POST', '/computers/:id/snapshots', p, held('computers.features.snapshots'), true)).toBe('computers.update');
    expect(lackOf('POST', '/computers/:id/snapshots', p, held('computers.update', 'computers.features.snapshots'), true)).toBeNull();
  });
  it('the lifecycle verb picks its leaf; a verb the map lacks needs nothing known here', () => {
    expect(lackOf('POST', '/computers/:id/:op', '/computers/c1/restart', held('computers.actions.start'), true)).toBe('computers.actions.restart');
    expect(lackOf('POST', '/computers/:id/:op', '/computers/c1/resume', held(), true)).toBe('computers.actions.start');
    expect(lackOf('POST', '/computers/:id/:op', '/computers/c1/force-stop', held('computers.actions.stop'), true)).toBeNull();
    expect(lackOf('POST', '/computers/:id/:op', '/computers/c1/other', held(), true)).toBeNull();
  });
  it("'never': no token is served", () => {
    expect(lackOf('GET', '/servers/:id/available-commands', '/servers/s1/available-commands', held('computers.read'), false)).toBe('never');
  });
  it('realm-bound refused outright; an unrestricted token needs its leaf', () => {
    expect(lackOf('GET', '/wallet/balances', '/wallet/balances', held('financial.wallet.read'), true)).toBe('never');
    expect(lackOf('GET', '/wallet/balances', '/wallet/balances', held(), false)).toBe('financial.wallet.read');
    expect(lackOf('GET', '/wallet/balances', '/wallet/balances', held('financial.wallet.read'), false)).toBeNull();
  });
  it('project members: a realm-bound token is refused each write; an unrestricted one needs its own leaf', () => {
    for (const [method, tpl, path, leaf] of [
      ['POST', '/projects/:pid/permissions', '/projects/p1/permissions', 'projects.members.invite'],
      ['PUT', '/projects/:pid/permissions/:mid', '/projects/p1/permissions/m1', 'projects.members.change_roles'],
      ['DELETE', '/projects/:pid/permissions/:mid', '/projects/p1/permissions/m1', 'projects.members.remove'],
    ] as const) {
      expect(lackOf(method, tpl, path, held(leaf), true)).toBe('never');
      expect(lackOf(method, tpl, path, held(), false)).toBe(leaf);
      expect(lackOf(method, tpl, path, held(leaf), false)).toBeNull();
    }
  });
  it('project access rules writes: a realm-bound token is refused each; an unrestricted one needs the rules leaf', () => {
    for (const method of ['PUT', 'DELETE'] as const) {
      const [tpl, path, leaf] = ['/projects/:pid/proxy/permissions', '/projects/p1/proxy/permissions', 'resources.proxy_aliases'] as const;
      expect(lackOf(method, tpl, path, held(leaf), true)).toBe('never');
      expect(lackOf(method, tpl, path, held(), false)).toBe(leaf);
      expect(lackOf(method, tpl, path, held(leaf), false)).toBeNull();
    }
  });
  it('null and unknown routes: nothing lacking', () => {
    expect(lackOf('GET', '/computers', '/computers', held(), true)).toBeNull();
    expect(lackOf('GET', '/not-declared', '/not-declared', held(), true)).toBeNull();
    expect(lackOf('GET', 'constructor', 'constructor', held(), true)).toBeNull();
  });
  it('routeLeaves: every table leaf and the body-checked ones, dotted', () => {
    const ls = routeLeaves();
    for (const l of BODY_LEAVES) expect(ls).toContain(l);
    expect(ls).toContain('computers.actions.restart');
    expect(ls.every((l) => /^[a-z_]+(?:\.[a-z_]+){1,5}$/.test(l))).toBe(true);
  });
});
