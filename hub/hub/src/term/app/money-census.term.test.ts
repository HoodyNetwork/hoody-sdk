// money-census.term.test.ts: the terminal sends no money (no billing, wallet, top-up, purchase, rent or
// subscription sends). The wire refuses by words and keys (live-wire.ts isMoneyRoute), not by a route list; this
// census walks EVERY route the source declares (defineRoute specs, read from the text) and fails when a money-like
// change on the Hoody API is not refused, when a declared change cannot be read (so it could not be judged), or
// when the rule refuses a change that is not money (a page would break).
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { commerceRoutes } from '../../core/commerce';
import { isChangeCall } from '../../core/routes';
import { isMoneyRoute } from './live-wire';

const SRC = path.resolve(import.meta.dir, '..', '..');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '__snapshots__') out.push(...sources(p)); continue; }
    if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** The text of the bracketed value starting at `open` (which holds `{`, `[` or `(`), without its brackets. */
function bracketed(t: string, open: number): string {
  let depth = 0, q: string | null = null;
  for (let i = open; i < t.length; i++) {
    const c = t[i]!;
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '\'' || c === '"' || c === '`') { q = c; continue; }
    if ('{[('.includes(c)) depth++;
    if ('}])'.includes(c) && --depth === 0) return t.slice(open + 1, i);
  }
  return t.slice(open + 1);
}

/** Top-level comma-separated parts of an object or array body. */
function parts(body: string): string[] {
  const out: string[] = [];
  let depth = 0, q: string | null = null, cur = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (q) { cur += c; if (c === '\\') { cur += body[++i] ?? ''; } else if (c === q) q = null; continue; }
    if (c === '\'' || c === '"' || c === '`') { q = c; cur += c; continue; }
    if ('{[('.includes(c)) depth++;
    if ('}])'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

const STR = /^(['"`])([^'"`$]*)\1$/;
type Val = string | string[] | boolean | undefined | null; // null: present but not readable

interface FileConsts { strings: Map<string, string>; objects: Map<string, string>; arrays: Map<string, string> }
function constsOf(t: string): FileConsts {
  const c: FileConsts = { strings: new Map(), objects: new Map(), arrays: new Map() };
  for (const m of t.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)(?:\s*:[^=\n]+)?\s*=\s*/g)) {
    const at = m.index! + m[0].length;
    const ch = t[at];
    if (ch === '{') c.objects.set(m[1]!, bracketed(t, at));
    else if (ch === '[') c.arrays.set(m[1]!, bracketed(t, at));
    else { const s = /^(['"`])([^'"`$\n]*)\1/.exec(t.slice(at)); if (s) c.strings.set(m[1]!, s[2]!); }
  }
  return c;
}

function fieldsOf(objBody: string, k: FileConsts, depth = 0): Map<string, Val> {
  const out = new Map<string, Val>();
  for (const p of parts(objBody)) {
    if (p.startsWith('...')) {
      const name = p.slice(3).trim();
      const o = k.objects.get(name);
      if (o !== undefined && depth < 3) for (const [f, v] of fieldsOf(o, k, depth + 1)) out.set(f, v);
      else out.set('<spread>', null);
      continue;
    }
    const m = /^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]*)$/.exec(p);
    if (!m) continue;
    out.set(m[1]!, valueOf(m[2]!.trim(), k, depth));
  }
  return out;
}

function valueOf(v: string, k: FileConsts, depth: number): Val {
  const s = STR.exec(v);
  if (s) return s[2]!;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v.startsWith('[')) return arrayOf(bracketed(v, 0), k, depth);
  if (/^[A-Za-z_$][\w$]*$/.test(v)) {
    if (k.strings.has(v)) return k.strings.get(v)!;
    if (k.arrays.has(v) && depth < 3) return arrayOf(k.arrays.get(v)!, k, depth + 1);
  }
  const asConst = /^([\s\S]+?)\s+as\s+const$/.exec(v);
  if (asConst) return valueOf(asConst[1]!.trim(), k, depth);
  return null;
}

function arrayOf(body: string, k: FileConsts, depth: number): string[] | null {
  const out: string[] = [];
  for (const p of parts(body)) {
    const s = STR.exec(p);
    if (s) { out.push(s[2]!); continue; }
    if (p.startsWith('...') && k.arrays.has(p.slice(3).trim()) && depth < 3) {
      const inner = arrayOf(k.arrays.get(p.slice(3).trim())!, k, depth + 1);
      if (!inner) return null;
      out.push(...inner);
      continue;
    }
    return null;
  }
  return out;
}

interface Declared { file: string; method: Val; scope: Val; path: Val; body: Val; change: Val }
function declaredRoutes(): Declared[] {
  const out: Declared[] = [];
  for (const f of sources(SRC)) {
    // Comment lines name defineRoute in prose: blanked (whole-line comments only; code never starts with them).
    const t = fs.readFileSync(f, 'utf8').split('\n').map((l) => (/^\s*(\/\/|\/\*|\*)/.test(l) ? '' : l)).join('\n');
    if (!t.includes('defineRoute')) continue;
    const k = constsOf(t);
    for (const m of t.matchAll(/(?<![.\w])defineRoute(?:<[^()]*?>)?\(/g)) {
      const open = m.index! + m[0].length;
      if (t[open] !== '{') {
        // The declaration itself (routes.ts) and a spec passed by name are read through their const.
        const name = /^\s*([A-Za-z_$][\w$]*)\s*\)/.exec(t.slice(open));
        if (name && k.objects.has(name[1]!)) { push(f, fieldsOf(k.objects.get(name[1]!)!, k)); continue; }
        // The declaration itself: `defineRoute<R, B>(spec: RouteSpec)`.
        if (/^\s*spec\s*:/.test(t.slice(open))) continue;
        out.push({ file: path.relative(SRC, f), method: null, scope: null, path: null, body: null, change: null });
        continue;
      }
      push(f, fieldsOf(bracketed(t, open), k));
    }
  }
  function push(f: string, fl: Map<string, Val>): void {
    const unread = fl.has('<spread>') ? null : undefined;
    out.push({
      file: path.relative(SRC, f),
      method: fl.has('method') ? fl.get('method')! : unread ?? null,
      scope: fl.has('scope') ? fl.get('scope')! : unread ?? null,
      path: fl.has('path') ? fl.get('path')! : unread ?? null,
      body: fl.has('body') ? fl.get('body')! : fl.has('<spread>') ? null : undefined,
      change: fl.has('change') ? fl.get('change')! : undefined,
    });
  }
  return out;
}

// The census's own reading of "money-like": substrings, deliberately wider than the wire's words, so a new money
// word shows up here first. A path or a body key that matches must be refused by the wire.
const MONEY_LIKE_PATH = /wallet|top-?up|reserv|(^|[/-])rent(al)?s?($|[/-])|subscri|extend|extension|renew|purchas|checkout|invoice|(^|[/-])pay(ment)?s?($|[/-])|charge|(^|[/-])buy($|[/-])|billing|credit|(^|[/-])orders?($|[/-])|price|transfer|bonus/i;
const MONEY_LIKE_BODY = /amount|charge|price|cents|plan_id|rental|fee/i;

test('money: every declared money route is refused at the wire', () => {
  const all = declaredRoutes();
  // The scan sees the Hub's routes (a few hundred), commerce's among them.
  expect(all.length).toBeGreaterThan(300);
  const changes = all.filter((r) => typeof r.method === 'string' ? isChangeCall(r.change === true ? { change: true } : {}, r.method) : true);
  // A change the census cannot read (method, scope or path not a literal or a same-file const) cannot be judged.
  // (A computer leg's path may be built: the rule never looks at it, only its scope must be read.)
  const unread = changes.filter((r) => typeof r.scope !== 'string' || ((r.scope === 'base' || r.scope === 'realm') && (typeof r.method !== 'string' || typeof r.path !== 'string')));
  expect(unread.map((r) => `${r.file} ${String(r.method)} ${String(r.scope)} ${String(r.path)}`)).toEqual([]);
  const hoody = changes.filter((r) => r.scope === 'base' || r.scope === 'realm');
  // A body the census cannot read could hold a charge key: such a Hoody change must be refused or read.
  const unreadBody = hoody.filter((r) => r.body === null && !isMoneyRoute(r));
  expect(unreadBody.map((r) => `${r.file} ${String(r.method)} ${String(r.path)}`)).toEqual([]);
  const moneyLike = (r: Declared): boolean => MONEY_LIKE_PATH.test(String(r.path)) || (Array.isArray(r.body) && r.body.some((k) => MONEY_LIKE_BODY.test(k)));
  const leaks = hoody.filter((r) => moneyLike(r) && !isMoneyRoute(r));
  expect(leaks.map((r) => `${r.file} ${String(r.method)} ${String(r.path)} ${JSON.stringify(r.body)}`)).toEqual([]);
  // ...and the rule refuses nothing that is not money (no page change breaks on it).
  const overreach = hoody.filter((r) => isMoneyRoute(r) && !moneyLike(r));
  expect(overreach.map((r) => `${r.file} ${String(r.method)} ${String(r.path)}`)).toEqual([]);
  // The computer legs sell nothing: the rule never applies there.
  for (const r of changes.filter((x) => x.scope === 'kit' || x.scope === 'agent')) expect(isMoneyRoute(r), String(r.path)).toBe(false);
  // Every money change the Hub declares today is among those refused, by the real route objects.
  const money = Object.entries(commerceRoutes).filter(([, r]) => isChangeCall(r, (r as { method: string }).method));
  expect(money.map(([n]) => n).sort()).toEqual(['autoRenewRoute', 'buyRoute', 'checkoutRoute', 'claimRoute', 'invoiceRoute', 'payRoute', 'rentRoute', 'reserveRoute', 'transferRoute', 'upgradeRoute']);
  for (const [n, r] of money) expect(isMoneyRoute(r), n).toBe(true);
  // ...and exactly those: a new Hoody change the rule refuses (a project "transfer", an "order" of items) turns this red,
  // so every new refusal is a deliberate edit here, never a page change that silently stops working.
  const keyOf = (r: { method?: unknown; path?: unknown }): string => `${String(r.method)} ${String(r.path)}`;
  const refusedKeys = [...new Set(hoody.filter((r) => isMoneyRoute(r)).map(keyOf))].sort();
  expect(refusedKeys).toEqual([...new Set(money.map(([, r]) => keyOf(r as { method: string; path: string })))].sort());
  // A money route declared later is refused by the same words and keys (no list to extend).
  for (const r of [
    { method: 'POST', scope: 'base', path: '/rentals/:id/extend', body: ['days'] },
    { method: 'POST', scope: 'realm', path: '/images/:id/purchase', body: [] },
    { method: 'POST', scope: 'base', path: '/ai/credits', body: ['amount'] },
    { method: 'POST', scope: 'base', path: '/things', body: ['max_charge_cents'] },
    { method: 'POST', scope: 'base', path: '/top-up', body: [] },
  ]) expect(isMoneyRoute(r), r.path).toBe(true);
});
