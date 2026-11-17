// One time per admission turn, no older record adopted by any path
// at all, every write under the store lock converts first, and a live older record's keyBytes never
// blocks the conversion of the others. Also the stale re-read converting without a manual reload.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './changes';
import { holdAttempt } from './attempts';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY, SENDING_HEARTBEAT_MS, SENDING_STALE_MS, setChangeStoreAdapter, underChangeStore, writeChanges, type HoldRef, type StoredChange } from './change-store';
import { snapshot } from './ctx';
import { defineMutation, queryClient } from './query';
import { defineRoute } from './routes';
import { boot, calls, deferred, onFetch, R1, settle } from './test/env';

const spins = async (n = 20): Promise<void> => { for (let i = 0; i < n; i++) await settle(); };
type Rec = StoredChange & { t: number };
const raw = (): Rec[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Rec[];
const rawStr = (): string => localStorage.getItem(CHANGE_STORE_KEY) ?? '';
const put = (list: readonly unknown[]): void => localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
const posts = (): number => calls.filter((c) => c.method !== 'GET').length;
const Q = '\u0000q~';
const SECRET = 'planted-secret-f3m-Zr8';
type V = { n: number; password: string };
const idFor = (scope: string, digest: string, account = C.changeOwner()): string => account + scope + '\u0000' + digest;
/** An older build's record (no format marker) under `scope`, filed under `digest`. */
function older(scope: string, digest: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: idFor(scope, digest), pending: true, key: null, t: 5, inc: 'inc-' + digest.slice(0, 16), nonce: 'n1', at: Date.now(), meta: { base: scope, target: null, realm: null, identity: { n: 1, password: SECRET } }, ...extra };
}
/** Adds records to the store without a storage event (another tab's write this tab has not heard of yet). */
const addQuietly = (...recs: Record<string, unknown>[]): void => put([...raw(), ...recs]);
/** No stored record lacks the marker (attempt records aside), and the planted secret is nowhere. */
function allConverted(): void {
  expect(rawStr()).not.toContain(SECRET);
  expect(raw().filter((r) => !r.id.startsWith(ATTEMPT_PREFIX) && r.fmt !== 1)).toEqual([]);
}

describe('one time per admission turn; older records convert, never adopted', () => {
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : { status: 502, body: {} })); });
  afterEach(() => { setChangeStoreAdapter(null); C.resetChanges(); vi.useRealTimers(); vi.restoreAllMocks(); });
  function keyed(lock: string) {
    const route = defineRoute({ method: 'POST', path: '/f3m/' + lock, scope: 'agent', body: ['n', 'password'], idem: true });
    return defineMutation<V>(route, { input: (v) => ({ body: v }), lock, lockKey: (v) => ({ n: v.n }), proves: () => 'applied', page: 'programs' });
  }
  /** The scope a press of `m` files its record under (realm and computer included), learned from one real press;
   *  the store and memory are emptied after. */
  async function scopeOf(m: ReturnType<typeof keyed>): Promise<string> {
    expect((await m.run({ n: 9, password: 'pw' })).outcome).toBe('pending');
    const id = raw()[0]!.id;
    C.resetChanges();
    put([]);
    return id.slice(C.changeOwner().length, id.lastIndexOf('\u0000'));
  }

  it('m1: a stamp that goes stale between two clock reads of one admission still bars the press (one time per turn)', async () => {
    const m = keyed('f3m.h1');
    const S = await scopeOf(m);
    const base = Date.now();
    put([older(S, 'Dsecret', { pending: false, sending: { tab: 'otherTab', at: base - SENDING_STALE_MS + 1 } })]);
    // From the admission's read on, the clock crosses the stale time at its second reading.
    let armed = false, reads = 0;
    setChangeStoreAdapter({
      read: () => { if (!armed) { armed = true; reads = 0; } return localStorage.getItem(CHANGE_STORE_KEY); },
      write: (t) => { if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t); return true; },
    });
    vi.spyOn(Date, 'now').mockImplementation(() => (armed && ++reads >= 2 ? base + 10 : base));
    const before = posts();
    const r = await m.run({ n: 2, password: SECRET });
    expect(r).toMatchObject({ outcome: 'not_sent', error: { code: 'BUSY' } });
    expect(posts()).toBe(before);
    expect(raw().filter((x) => x.fmt === 1)).toEqual([]); // nothing of this press was stored
  });

  it('m2: an older record that took a send\'s id before its answer is never adopted; it converts', async () => {
    const m = keyed('f3m.h2');
    const S = await scopeOf(m);
    const gate = deferred<void>();
    onFetch(async (c) => { if (c.method === 'GET') return { status: 200, body: { data: [] } }; await gate.p; return { status: 502, body: {} }; });
    const going = m.run({ n: 1, password: 'pw' });
    await spins(2);
    const mine = raw().find((x) => x.id.startsWith(C.changeOwner() + S))!;
    expect(mine.fmt).toBe(1);
    const digest = mine.id.slice(mine.id.lastIndexOf('\u0000') + 1);
    // An older build's tab writes over this send's record (another token, a kept key, an identity with a secret).
    put(raw().map((x) => (x.id === mine.id ? older(S, digest, { pending: true, key: 'K-old', inc: 'inc-old', nonce: 'n-old' }) : x)));
    gate.res();
    expect((await going).outcome).toBe('pending');
    await spins();
    expect(JSON.stringify(C.identityOfLock(S, digest) ?? null)).not.toContain(SECRET);
    expect(C.holdOfLock(S, digest)).not.toBe('inc-old#n-old');
    allConverted();
    expect(raw().some((x) => x.id.startsWith(C.changeOwner() + S + Q))).toBe(true);
  });

  it('m3a: an own outcome write converts an unrelated older record stored meanwhile', async () => {
    const m = keyed('f3m.h3a');
    const gate = deferred<void>();
    onFetch(async (c) => { if (c.method === 'GET') return { status: 200, body: { data: [] } }; await gate.p; return { status: 502, body: {} }; });
    const going = m.run({ n: 1, password: 'pw' });
    await spins(2);
    addQuietly(older('lock:f3m.other', 'Dsecret'));
    gate.res();
    expect((await going).outcome).toBe('pending');
    await spins();
    allConverted();
    expect(C.pendingOf('lock:f3m.other').length).toBe(1); // shown once stored
  });

  it('m3b: a heartbeat converts an unrelated older record that went stale meanwhile', async () => {
    vi.useFakeTimers({ now: 3_000_000, toFake: ['Date', 'setInterval', 'clearInterval'] });
    const m = keyed('f3m.h3b');
    const gate = deferred<void>();
    onFetch(async (c) => { if (c.method === 'GET') return { status: 200, body: { data: [] } }; await gate.p; return { status: 502, body: {} }; });
    const going = m.run({ n: 1, password: 'pw' });
    await spins(2);
    addQuietly(older('lock:f3m.other', 'Dsecret', { pending: false, sending: { tab: 'otherTab', at: Date.now() - SENDING_STALE_MS - 1 } }));
    vi.advanceTimersByTime(SENDING_HEARTBEAT_MS + 1);
    await spins();
    allConverted();
    expect(raw().filter((x) => x.id.includes(Q)).length).toBe(1); // the older hold survives, as an older change
    gate.res();
    await going;
  });

  it('m3c: the sign-out forget converts another account\'s older record instead of copying it', async () => {
    const m = keyed('f3m.h3c');
    expect((await m.run({ n: 1, password: 'pw' })).outcome).toBe('pending');
    addQuietly(older('lock:f3m.other', 'Dsecret', { id: 'acct-other\u0001lock:f3m.other\u0000Dsecret' }));
    const shown: HoldRef[] = C.changeHoldRefs();
    const verdict = await C.forgetAccountChanges(String(snapshot().account), shown, { holdsIn: () => [], drop: () => {} });
    expect(verdict).toBe('done');
    allConverted();
    expect(raw().map((x) => x.id.startsWith('acct-other\u0001lock:f3m.other' + Q))).toEqual([true]);
  });

  it('m3d: an attempt\'s admission converts an older record it would carry', async () => {
    addQuietly(older('lock:f3m.other', 'Dsecret'));
    const r = await holdAttempt('f3m.att', { by: 'f3m:att' });
    expect(r.ok).toBe(true);
    allConverted();
    expect(raw().filter((x) => x.id.includes(Q)).length).toBe(1); // the older hold survives, as an older change
  });

  it('m4: a live older record carrying keyBytes never keeps the others from converting', async () => {
    const live = older('lock:f3m.live', 'Dlive', { pending: false, sending: { tab: 'otherTab', at: Date.now() }, keyBytes: 'kb-older', meta: { base: 'lock:f3m.live', target: null, realm: null } });
    put([live, older('lock:f3m.idle', 'Dsecret')]);
    C.reloadChangesForTests();
    await spins();
    expect(rawStr()).not.toContain(SECRET);
    expect(rawStr()).not.toContain('kb-older');
    expect(raw().some((x) => x.id === live.id)).toBe(true); // the live one stays for its tab
    expect(C.pendingOf('lock:f3m.idle').length).toBe(1);
  });

  it('m6: a write stores what it is given; a store-lock turn converts at its start, and a write of what the turn reads keeps the same id', async () => {
    const rec = older('lock:f3m.lock', 'Dsecret') as unknown as StoredChange;
    expect(writeChanges([rec])).toBe(true);
    expect(rawStr()).toContain(SECRET); // written as given, nothing converted
    let seen = '';
    await underChangeStore(() => { const list = raw(); seen = list[0]!.id; return writeChanges(list); });
    allConverted();
    expect(seen.includes(Q)).toBe(true);
    expect(raw().map((x) => x.id)).toEqual([seen]);
  });
  it('m5: a live stamp\'s re-read converts the record once it goes stale, with no reload', async () => {
    const S = 'lock:f3m.reread';
    // The stamp goes stale 1.5 s on (a wide margin: a loaded run once took past 150 ms to get here, :1076).
    const staleAt = Date.now() + 1500;
    put([older(S, 'Dsecret', { pending: false, sending: { tab: 'otherTab', at: staleAt - SENDING_STALE_MS } })]);
    C.reloadChangesForTests();
    await spins(2);
    if (Date.now() < staleAt) expect(rawStr()).toContain(SECRET);
    // Converted by the stale timer's own re-read, no reload: waited for, not slept a fixed time.
    await vi.waitFor(() => expect(rawStr()).not.toContain(SECRET), { timeout: 4000, interval: 50 });
    await spins();
    expect(raw().map((x) => [x.id.includes(Q), x.pending])).toEqual([[true, true]]);
    expect(C.pendingOf(S).length).toBe(1);
  });
});
