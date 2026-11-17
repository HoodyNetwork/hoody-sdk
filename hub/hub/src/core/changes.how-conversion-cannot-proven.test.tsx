// A turn whose conversion cannot be
// stored (refused, or a throw with no readable proof) runs nothing, but it no longer drops the stale re-read of
// another tab's live older record. Its exit runs a read-only arm: it reads, never writes or converts, and keeps at
// most one timer, at the earliest live older stamp still stored or this tab's earliest remembered `away` stamp
// (plus a retry when the turn's live stamp went away); with none of these it arms nothing, so a persistent
// refusal cannot loop. The conversion-site scan reads the syntax tree: any spelling of a converted() call outside
// olderPlan, or olderPlan used anywhere but as setTurnConversion's first argument, fails it (a call deferred inside
// olderPlan, in an arrow or function expression).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './changes';
import { CHANGE_STORE_KEY, SENDING_STALE_MS, setChangeStoreAdapter, underChangeStore, type StoredChange } from './change-store';
import { defineMutation, queryClient } from './query';
import { defineRoute } from './routes';
import { boot, calls, onFetch, R1, settle } from './test/env';

const spins = async (n = 20): Promise<void> => { for (let i = 0; i < n; i++) await settle(); };
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const raw = (): StoredChange[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as StoredChange[];
const rawStr = (): string => localStorage.getItem(CHANGE_STORE_KEY) ?? '';
const put = (list: readonly unknown[]): void => localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
const SECRET = 'planted-secret-f3o-Zr8';
const idFor = (scope: string, digest: string): string => C.changeOwner() + scope + '\u0000' + digest;
function older(scope: string, digest: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: idFor(scope, digest), pending: true, key: null, t: 5, inc: 'inc-' + digest, nonce: 'n1', at: Date.now(), meta: { base: scope, target: null, realm: null, identity: { n: 1, password: SECRET } }, ...extra };
}
/** Another tab's live older record (its stamp goes stale in `ms`), carrying an older build's keyBytes, so the turn
 *  must write (strip the bytes) while leaving the record in place; plus an idle older hold to convert. */
function liveAndIdle(ms: number): void {
  put([
    older('lock:f3o.live', 'Dlive', { pending: false, keyBytes: 'kb-old', sending: { tab: 'otherTab', at: Date.now() - SENDING_STALE_MS + ms } }),
    older('lock:f3o.idle', 'Didle'),
  ]);
}
/** A storage adapter over localStorage: `write` decides per write attempt (counted); `readFail` makes the next n reads throw. */
function adapter(write: (n: number) => 'ok' | 'refuse' | 'land-throw' | 'throw') {
  let writes = 0, readFail = 0;
  setChangeStoreAdapter({
    read: () => { if (readFail > 0) { readFail--; throw new Error('read refused'); } return localStorage.getItem(CHANGE_STORE_KEY); },
    write: (t) => {
      const how = write(++writes);
      if (how === 'refuse') return false;
      if (how === 'throw') throw new Error('write threw');
      if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t);
      if (how === 'land-throw') { readFail = 1; throw new Error('write landed, then threw'); }
      return true;
    },
  });
  return { writes: () => writes };
}

describe('a conversion that cannot be stored', () => {
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); onFetch(() => ({ status: 200, body: { data: [] } })); });
  afterEach(() => { setChangeStoreAdapter(null); C.resetChanges(); vi.useRealTimers(); vi.restoreAllMocks(); });

  for (const how of ['refuse', 'throw', 'land-throw'] as const) {
    it(`o1 (${how}): a conversion that cannot be proven stored still arms the live older record's stale re-read; once stale, both older holds convert and show, with no other event`, async () => {
      liveAndIdle(3000);
      adapter((n) => (n === 1 ? how : 'ok'));
      await expect(underChangeStore(() => 0)).rejects.toThrow();
      await wait(3300);
      await spins();
      expect(rawStr()).not.toContain(SECRET);
      expect(raw().filter((r) => r.fmt !== 1)).toEqual([]);
      expect(C.pendingOf('lock:f3o.live').length).toBe(1);
      expect(C.pendingOf('lock:f3o.idle').length).toBe(1);
    });
  }

  it('o2: a persistent refusal causes no loop and no write: a long fake-clock run makes at most two attempts and leaves no timer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    liveAndIdle(3000);
    const before = rawStr();
    const a = adapter(() => 'refuse');
    await expect(underChangeStore(() => 0)).rejects.toThrow();
    for (let i = 0; i < 120; i++) await vi.advanceTimersByTimeAsync(60_000); // two hours
    // The refused turn, then one more at the stamp's expiry (its load queues a conversion turn, refused again, whose
    // arm finds no live stamp left), plus that load's keyBytes scrub (one more turn, refused too, whose
    // arm finds nothing live either): nothing after that.
    expect(a.writes()).toBeLessThanOrEqual(3);
    expect(rawStr()).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('o2b: with no live older record, a refused conversion arms nothing at all', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    put([older('lock:f3o.idle', 'Didle')]);
    const a = adapter(() => 'refuse');
    await expect(underChangeStore(() => 0)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(a.writes()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('o3: the conversion-site scan reads the syntax tree: converted( only inside olderPlan, olderPlan only as the turn\'s registered conversion, writeChanges converts nothing', () => {
    const core = import.meta.dirname;
    const file = ts.createSourceFile('changes.ts', readFileSync(join(core, 'changes.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
    const enclosing = (n: ts.Node): string | undefined => {
      for (let p: ts.Node | undefined = n.parent; p; p = p.parent) if (ts.isFunctionDeclaration(p) && p.name) return p.name.text;
      return undefined;
    };
    const convertedCalls: string[] = [], olderPlanUses: string[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isIdentifier(n) && !(ts.isFunctionDeclaration(n.parent) && n.parent.name === n)) {
        if (n.text === 'converted') convertedCalls.push((ts.isCallExpression(n.parent) && n.parent.expression === n ? 'call ' : 'ref ') + (enclosing(n) ?? '<top>'));
        if (n.text === 'olderPlan') {
          const p = n.parent;
          const asTurnArg = ts.isCallExpression(p) && p.arguments[0] === n && ts.isIdentifier(p.expression) && p.expression.text === 'setTurnConversion';
          olderPlanUses.push(asTurnArg ? 'setTurnConversion' : 'other in ' + (enclosing(n) ?? '<top>'));
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(file);
    expect(convertedCalls.length).toBeGreaterThan(0);
    expect([...new Set(convertedCalls)]).toEqual(['call olderPlan']);
    expect(olderPlanUses).toEqual(['setTurnConversion']);
    const store = readFileSync(join(core, 'change-store.ts'), 'utf8');
    const w = store.indexOf('export function writeChanges(');
    expect(store.slice(w, store.indexOf('\n}\n', w))).not.toMatch(/conver/i);
    const h = store.indexOf('const held = ');
    expect(store.slice(h, store.indexOf('\n  };\n', h))).toMatch(/const convert = turnConversion;[\s\S]*convert\(rd\.list, now\)/);
  });

  it('o4: an old unmarked hold under the full-vars id of a definition that now has a lockKey is re-id\'d, and refuses a press under the new lockKey id with no POST sent', async () => {
    type V = { n: number; password: string };
    const route = defineRoute({ method: 'POST', path: '/f3o/rekey', scope: 'agent', body: ['n', 'password'], idem: true });
    // The same change before and after it had a lockKey: the base build filed it under the digest of the whole variables.
    const was = defineMutation<V>(route, { input: (v) => ({ body: v }), lock: 'f3o.rekey', proves: () => 'applied', page: 'programs' });
    const m = defineMutation<V>(route, { input: (v) => ({ body: v }), lock: 'f3o.rekey', lockKey: (v) => ({ n: v.n }), proves: () => 'applied', page: 'programs' });
    onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : { status: 502, body: {} }));
    const split = (id: string): [string, string] => [id.slice(C.changeOwner().length, id.lastIndexOf('\u0000')), id.slice(id.lastIndexOf('\u0000') + 1)];
    /** The id one press of `d` files its hold under (the press is pending, then everything is cleared). */
    const pressId = async (d: typeof m, v: V): Promise<[string, string]> => {
      expect((await d.run(v)).outcome).toBe('pending');
      const ids = raw().map((x) => x.id);
      expect(ids.length).toBe(1);
      C.resetChanges();
      put([]);
      return split(ids[0]!);
    };
    const [scopeOld, fullVars] = await pressId(was, { n: 1, password: 'pw' });
    const [scope, keyed] = await pressId(m, { n: 1, password: 'pw' });
    const [, keyedOtherPw] = await pressId(m, { n: 1, password: 'another' });
    const [, keyedOtherN] = await pressId(m, { n: 2, password: 'pw' });
    // One scope; the lockKey digest is the identity's (the password does not move it, n does), not the variables'.
    expect(scopeOld).toBe(scope);
    expect(keyed).not.toBe(fullVars);
    expect(keyedOtherPw).toBe(keyed);
    expect(keyedOtherN).not.toBe(keyed);
    // The base build's pending record, unmarked, under the full-variables digest (a short inc: older() derives one
    // from the digest, too long for a stored record).
    put([older(scope, fullVars, { inc: 'inc-base' })]);
    const posts = (): number => calls.filter((c) => c.method !== 'GET').length;
    const before = posts();
    const r = await m.run({ n: 1, password: 'pw' });
    expect(r.outcome).toBe('not_sent');
    expect(['READ_BACK_FIRST', 'HELD_BY_OTHER']).toContain((r as { error?: { code?: string } }).error?.code);
    expect(posts()).toBe(before);
    expect(rawStr()).not.toContain(SECRET);
    expect(raw().filter((x) => x.id.startsWith(C.changeOwner() + scope + '\u0000q~')).length).toBe(1);
    expect(raw().some((x) => x.id === idFor(scope, fullVars) || x.id === idFor(scope, keyed))).toBe(false);
    expect(C.isPending(scope, keyed)).toBe(false);
  });
});
