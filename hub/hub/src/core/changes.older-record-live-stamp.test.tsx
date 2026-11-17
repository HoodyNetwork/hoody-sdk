// Older records convert at exactly one
// point, the start of every store-lock turn, with one time (turnNow); nothing else converts. So a live older record
// left in place always has its stale re-read armed, one older record keeps one quarantine id however many
// writes a turn makes, a rollback restores and verifies what was stored, a conversion that cannot be
// written refuses the turn, and a scan pins the conversion to that one site.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './changes';
import { holdAttempt } from './attempts';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY, SENDING_STALE_MS, setChangeStoreAdapter, underChangeStore, type StoredChange } from './change-store';
import { snapshot } from './ctx';
import { defineMutation, queryClient } from './query';
import { defineRoute } from './routes';
import { boot, calls, deferred, onFetch, R1, settle } from './test/env';

const spins = async (n = 20): Promise<void> => { for (let i = 0; i < n; i++) await settle(); };
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
type Rec = StoredChange & { t: number };
const raw = (): Rec[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Rec[];
const rawStr = (): string => localStorage.getItem(CHANGE_STORE_KEY) ?? '';
const put = (list: readonly unknown[]): void => localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
const posts = (): number => calls.filter((c) => c.method !== 'GET').length;
const Q = '\u0000q~';
const SECRET = 'planted-secret-f3n-Kq4';
type V = { n: number; password: string };
const idFor = (scope: string, digest: string, account = C.changeOwner()): string => account + scope + '\u0000' + digest;
/** An older build's record (no format marker) under `scope`, filed under `digest`. */
function older(scope: string, digest: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: idFor(scope, digest), pending: true, key: null, t: 5, inc: 'inc-' + digest.slice(0, 16), nonce: 'n1', at: Date.now(), meta: { base: scope, target: null, realm: null, identity: { n: 1, password: SECRET } }, ...extra };
}
/** Adds records to the store without a storage event (another tab's write this tab has not heard of yet). */
const addQuietly = (...recs: Record<string, unknown>[]): void => put([...raw(), ...recs]);
function allConverted(): void {
  expect(rawStr()).not.toContain(SECRET);
  expect(raw().filter((r) => !r.id.startsWith(ATTEMPT_PREFIX) && r.fmt !== 1)).toEqual([]);
}
/** A storage adapter over localStorage that records every quarantine id any write stored, and refuses the next
 *  `reads` reads (unreadable) once a write matching `arm` landed. */
function tracked(arm: (text: string) => boolean, reads: number) {
  const qids = new Set<string>();
  let refuse = 0;
  setChangeStoreAdapter({
    read: () => { if (refuse > 0) { refuse--; throw new Error('read refused'); } return localStorage.getItem(CHANGE_STORE_KEY); },
    write: (t) => {
      if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t);
      for (const r of JSON.parse(t ?? '[]') as Rec[]) if (r.id.includes(Q)) qids.add(r.id);
      if (arm(t ?? "")) refuse = reads;
      return true;
    },
  });
  return { qids: () => [...qids] };
}

describe('older records convert at the start of every store-lock turn', () => {
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : { status: 502, body: {} })); });
  afterEach(() => { setChangeStoreAdapter(null); C.resetChanges(); vi.useRealTimers(); vi.restoreAllMocks(); });
  function keyed(lock: string) {
    const route = defineRoute({ method: 'POST', path: '/f3n/' + lock, scope: 'agent', body: ['n', 'password'], idem: true });
    return defineMutation<V>(route, { input: (v) => ({ body: v }), lock, lockKey: (v) => ({ n: v.n }), proves: () => 'applied', page: 'programs' });
  }
  async function scopeOf(m: ReturnType<typeof keyed>): Promise<string> {
    expect((await m.run({ n: 9, password: 'pw' })).outcome).toBe('pending');
    const id = raw()[0]!.id;
    C.resetChanges();
    put([]);
    return id.slice(C.changeOwner().length, id.lastIndexOf('\u0000'));
  }

  it('n1a: an older record with a live stamp that took a send\'s id converts once its stamp goes stale, with no reload or storage event', async () => {
    const m = keyed('f3n.h1');
    const S = await scopeOf(m);
    const gate = deferred<void>();
    onFetch(async (c) => { if (c.method === 'GET') return { status: 200, body: { data: [] } }; await gate.p; return { status: 502, body: {} }; });
    const going = m.run({ n: 1, password: 'pw' });
    await spins(2);
    const mine = raw().find((x) => x.id.startsWith(C.changeOwner() + S))!;
    const digest = mine.id.slice(mine.id.lastIndexOf('\u0000') + 1);
    // An older build's tab sending it now writes over this send's record: a live stamp, nothing else to convert.
    put(raw().map((x) => (x.id === mine.id ? older(S, digest, { pending: false, key: 'K-old', inc: 'inc-old', nonce: 'n-old', sending: { tab: 'otherTab', at: Date.now() - SENDING_STALE_MS + 3000 } }) : x)));
    gate.res();
    expect((await going).outcome).toBe('pending');
    expect(rawStr()).toContain(SECRET); // live: left in place for its tab
    expect(JSON.stringify(C.identityOfLock(S, digest) ?? null)).not.toContain(SECRET);
    await wait(3300);
    await spins();
    allConverted();
    expect(raw().filter((x) => x.id.startsWith(C.changeOwner() + S + Q)).length).toBe(1);
  });

  it('n1b: any lock turn that leaves a live older record in place arms its stale re-read', async () => {
    addQuietly(older('lock:f3n.live', 'Dsecret', { pending: false, sending: { tab: 'otherTab', at: Date.now() - SENDING_STALE_MS + 3000 } }));
    await underChangeStore(() => 0);
    expect(rawStr()).toContain(SECRET); // live: left in place for its tab
    await wait(3300);
    await spins();
    allConverted();
    expect(C.pendingOf('lock:f3n.live').length).toBe(1);
  });

  it('n2: one older record keeps one quarantine id across an admission\'s writes and its step back in the same turn', async () => {
    addQuietly(older('lock:f3n.other', 'Dsecret'));
    // The attempt's first write lands; its read-back and the step back's read are refused, so the step back writes
    // over the list the admission wrote.
    const t = tracked((text) => text.includes('"admitting"'), 2);
    const r = await holdAttempt('f3n.att', { by: 'f3n:att' });
    expect(r.ok).toBe(false);
    await spins();
    expect(t.qids().length).toBe(1);
    expect(raw().filter((x) => x.id.includes(Q)).map((x) => x.id)).toEqual(t.qids());
    allConverted();
  });

  it('n3a: a forget whose removal is not read back rolls back to what was stored and answers failed, one quarantine id throughout', async () => {
    const m = keyed('f3n.m2a');
    expect((await m.run({ n: 1, password: 'pw' })).outcome).toBe('pending');
    const mineId = raw()[0]!.id;
    addQuietly(older('lock:f3n.other', 'Dsecret', { id: 'acct-other\u0001lock:f3n.other\u0000Dsecret' }));
    const shown = C.changeHoldRefs();
    // The removal write (it no longer holds this account's record) lands; the read that verifies it is refused once.
    const t = tracked((text) => !text.includes(JSON.stringify(mineId).slice(1, -1)), 1);
    const verdict = await C.forgetAccountChanges(String(snapshot().account), shown, { holdsIn: () => [], drop: () => {} });
    expect(verdict).toBe('failed');
    expect(raw().some((x) => x.id === mineId)).toBe(true);
    expect(t.qids().length).toBe(1);
    allConverted();
  });

  it('n3b: an older hold of this account that the warning showed is never reported unknown; nothing is removed and one quarantine stays', async () => {
    const m = keyed('f3n.m2b');
    expect((await m.run({ n: 1, password: 'pw' })).outcome).toBe('pending');
    const mineId = raw()[0]!.id;
    // Its stamp went stale before any re-read (no storage event): the warning reads it from storage as a hold.
    addQuietly(older('lock:f3n.own', 'Dsecret', { pending: false, sending: { tab: 'otherTab', at: Date.now() - SENDING_STALE_MS - 1 } }));
    const shown = C.changeHoldRefs();
    tracked((text) => !text.includes(JSON.stringify(mineId).slice(1, -1)), 1);
    const verdict = await C.forgetAccountChanges(String(snapshot().account), shown, { holdsIn: () => [], drop: () => {} });
    expect(verdict).not.toBe('unknown');
    // The forget's turn converted the shown older record first: what the warning showed is no longer stored as such.
    expect(verdict).toBe('changed');
    expect(raw().some((x) => x.id === mineId)).toBe(true);
    expect(raw().filter((x) => x.id.includes(Q)).length).toBe(1);
    allConverted();
  });

  it('n4: a conversion that cannot be written refuses the turn: nothing of the press is stored and nothing is sent', async () => {
    const m = keyed('f3n.d');
    put([older('lock:f3n.idle', 'Dsecret')]);
    // Every write that would store a converted record is refused; any other write lands.
    setChangeStoreAdapter({
      read: () => localStorage.getItem(CHANGE_STORE_KEY),
      write: (t) => { if (t !== null && t.includes('q~')) return false; if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t); return true; },
    });
    const before = posts();
    const r = await m.run({ n: 1, password: 'pw' });
    expect(r).toMatchObject({ outcome: 'not_sent', error: { code: 'STORE_UNAVAILABLE' } });
    expect(posts()).toBe(before);
    expect(raw().filter((x) => x.fmt === 1)).toEqual([]);
  });

  it('the conversion has one site: converted(is called only inside olderPlan, and writeChanges converts nothing (another test scans the syntax tree)', () => {
    const core = import.meta.dirname;
    const src = readFileSync(join(core, 'changes.ts'), 'utf8');
    const start = src.indexOf('function olderPlan(');
    expect(start).toBeGreaterThan(0);
    // The function closes at the first '}' in column 0 after its start.
    const end = src.indexOf('\n}\n', start);
    expect(end).toBeGreaterThan(start);
    const calls = (name: string): number[] => [...src.matchAll(new RegExp('(?<![\\w.])' + name + '\\(', 'g'))].map((x) => x.index ?? -1)
      .filter((at) => !src.slice(Math.max(0, at - 9), at).endsWith('function '));
    // toConvert is a predicate that builds nothing (loadStored asks it); only converted builds the list.
    for (const name of ['converted']) {
      const at = calls(name);
      expect(at.length).toBeGreaterThan(0);
      expect(at.filter((x) => x < start || x > end)).toEqual([]);
    }
    const store = readFileSync(join(core, 'change-store.ts'), 'utf8');
    const w = store.indexOf('export function writeChanges(');
    const body = store.slice(w, store.indexOf('\n}\n', w));
    expect(body).not.toMatch(/conver/i);
    // Not blind: the turn entry runs the registered conversion.
    const h = store.indexOf('const held = ');
    expect(store.slice(h, store.indexOf('\n  };\n', h))).toMatch(/const convert = turnConversion;[\s\S]*convert\(rd\.list, now\)/);
  });
});
