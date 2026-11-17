// Every older build's record converts.
// A changes record without the format marker (CHANGE_FMT) is an older build's whatever its base, metadata or account;
// it is never adopted into memory, never replayed, and converts only under the store lock as part of a write: held,
// to an older change under a fresh random id (no key, no identity); unheld, removed; being sent in another tab (a
// live stamp), left in place, refusing its scope BUSY. Any other format value makes the store corrupt. A press's
// bytes are hashed only when its send runs.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './changes';
import { CHANGE_STORE_KEY, readChangesState, setChangeStoreAdapter, type StoredChange } from './change-store';
import { defineMutation, queryClient, varsDigest } from './query';
import { defineRoute } from './routes';
import { coreSource } from './source';
import { boot, calls, onFetch, R1, settle } from './test/env';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const spins = async (n = 20): Promise<void> => { for (let i = 0; i < n; i++) await settle(); };
type Rec = StoredChange & { t: number };
const raw = (): Rec[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Rec[];
const rawStr = (): string => localStorage.getItem(CHANGE_STORE_KEY) ?? '';
const put = (list: readonly unknown[]): void => localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
const posts = (): number => calls.filter((c) => c.method !== 'GET').length;
const Q = '\u0000q~';
const SECRET = 'planted-secret-f3l-Wq4';
type V = { n: number; password: string };
const idFor = (scope: string, digest: string, account = C.changeOwner()): string => account + scope + '\u0000' + digest;
/** An older build's record (no format marker) under `scope`, filed under `digest`. */
function older(scope: string, digest: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: idFor(scope, digest), pending: true, key: null, t: 5, inc: 'inc-' + digest.slice(0, 16), nonce: 'n1', at: Date.now(), meta: { base: scope, target: null, realm: null, identity: { n: 1, password: SECRET } }, ...extra };
}
const plainMeta = (base: string): C.ChangeMeta => ({ base, target: null, realm: null } as C.ChangeMeta);
async function storeLockHeld(): Promise<() => void> {
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  void navigator.locks.request('hub_changes', () => gate);
  await settle();
  return open;
}
/** Writes refused while `fail()` says so. */
function refusingStore(fail: () => boolean): void {
  setChangeStoreAdapter({ read: () => localStorage.getItem(CHANGE_STORE_KEY), write: (t) => { if (fail()) return false; if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t); return true; } });
}

describe('older records convert; their keys are never replayed', () => {
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : { status: 502, body: {} })); });
  afterEach(() => { cleanup(); setChangeStoreAdapter(null); C.resetChanges(); vi.restoreAllMocks(); });
  function keyed(lock: string) {
    const route = defineRoute({ method: 'POST', path: '/f3l/' + lock, scope: 'agent', body: ['n', 'password'], idem: true });
    return defineMutation<V>(route, { input: (v) => ({ body: v }), lock, lockKey: (v) => ({ n: v.n }), proves: () => 'applied', page: 'programs' });
  }

  it('l1: an older record\'s kept key is never replayed, even after a refused admission; nothing older is ever stored marked', async () => {
    const S = 'lock:f3l.h1';
    put([older(S, 'Dsecret', { pending: false, key: 'K1' })]);
    C.reloadChangesForTests();
    await spins();
    let failing = true;
    refusingStore(() => failing);
    expect(((await C.guarded(S, 'Dsecret', async () => ({ outcome: 'pending' as const }), plainMeta(S), 'other-bytes')) as { code?: string }).code).toBe('STORE_UNAVAILABLE');
    failing = false;
    const keys: (string | undefined)[] = [];
    await C.guarded(S, 'Dsecret', async (k) => { keys.push(k); return { outcome: 'pending' as const }; }, plainMeta(S));
    await spins();
    expect(keys).toEqual([undefined]);
    expect(raw().every((x) => x.key !== 'K1')).toBe(true);
    expect(raw().every((x) => x.fmt === 1)).toBe(true);
  });
  it('l2: a press of an older pending record\'s own id converts it first and is refused; its key is never sent', async () => {
    const S = 'lock:f3l.h2';
    put([older(S, 'Dsecret', { key: 'K1' })]);
    C.reloadChangesForTests();
    await spins();
    const keys: (string | undefined)[] = [];
    const r = (await C.guarded(S, 'Dsecret', async (k) => { keys.push(k); return { outcome: 'pending' as const }; }, plainMeta(S))) as { outcome: string; code?: string };
    expect([r.outcome, r.code]).toEqual(['not_sent', 'READ_BACK_FIRST']);
    expect(keys).toEqual([]);
    expect(rawStr()).not.toContain('Dsecret');
    expect(rawStr()).not.toContain('K1');
  });
  it('l3: an older record whose metadata names another base converts by its own record, whatever its base', async () => {
    const S = 'lock:f3l.h3';
    put([older(S, 'Dsecret', { meta: { base: 'lock:f3l.other', target: null, realm: null } })]);
    C.reloadChangesForTests();
    await spins();
    expect(rawStr()).not.toContain('Dsecret');
    expect(raw().map((x) => [x.id.startsWith(idFor(S, 'q~')), x.meta?.base, x.pending])).toEqual([[true, 'lock:f3l.other', true]]);
  });
  it('another account\'s older record converts too (a write of this account carries it otherwise)', async () => {
    const S = 'lock:f3l.h3b';
    const other = 'acct-other\u0001';
    put([{ ...older(S, 'Dsecret'), id: idFor(S, 'Dsecret', other), meta: undefined }]);
    C.reloadChangesForTests();
    await spins();
    expect(rawStr()).not.toContain('Dsecret');
    expect(raw().map((x) => [x.id.startsWith(other + S + Q), x.pending, x.key, x.meta])).toEqual([[true, true, null, { base: S, target: null, realm: null }]]);
  });
  it('a record with another format value makes the store corrupt: nothing is admitted', async () => {
    const m = keyed('f3l.h4');
    put([older('lock:f3l.h4', 'Dsecret', { fmt: 0 })]);
    expect(readChangesState().state).toBe('corrupt');
    C.reloadChangesForTests();
    await spins();
    const before = posts();
    expect(await m.run({ n: 1, password: SECRET })).toMatchObject({ outcome: 'not_sent', error: { code: 'STORE_UNAVAILABLE' } });
    expect(posts()).toBe(before);
  });
  it('l5: with a corrupt store, memory never holds an older record\'s lock or identity', async () => {
    const S = 'lock:f3l.h5';
    put([older(S, 'Dsecret'), { ...older(S, 'Dbad'), inc: 5 }]);
    expect(readChangesState().state).toBe('corrupt');
    C.reloadChangesForTests();
    await spins();
    expect(C.identityOfLock(S, 'Dsecret')).toBeUndefined();
    expect(C.pendingOf(S)).toEqual([]);
  });
  it('l6: nothing older is shown before its conversion is stored; a refused conversion shows nothing and admits nothing; once stored, its Dismiss frees it', async () => {
    const S = 'lock:f3l.m5';
    let failing = false;
    refusingStore(() => failing);
    const open = await storeLockHeld();
    put([older(S, 'Dsecret')]);
    C.reloadChangesForTests();
    await spins();
    expect(C.pendingOf(S)).toEqual([]);
    failing = true;
    open();
    await spins();
    expect(C.pendingOf(S)).toEqual([]);
    expect(((await C.guarded(S, 'Dnew', async () => ({ outcome: 'pending' as const }), plainMeta(S))) as { code?: string }).code).toBe('STORE_UNAVAILABLE');
    failing = false;
    C.reloadChangesForTests();
    await spins();
    const [q] = C.pendingOf(S);
    expect(C.quarantinedDigest(q!.digest)).toBe(true);
    expect(raw().map((x) => x.id)).toEqual([idFor(S, q!.digest)]);
    expect(await C.release(q!.scope, q!.digest, C.holdOfLock(q!.scope, q!.digest) as string,{ warned: true })).toBe(true);
    await spins();
    expect(raw()).toEqual([]);
  });
  it('l7: two older records of one scope at one version, without tokens, stay two older changes under ids of neither', async () => {
    const S = 'lock:f3l.m6';
    const bare = (d: string) => { const { inc: _i, nonce: _n, ...r } = older(S, d); void _i; void _n; return r; };
    put([bare('Da'), bare('Db')]);
    C.reloadChangesForTests();
    await spins();
    const ids = raw().map((x) => x.id);
    expect(ids.length).toBe(2);
    expect(ids.every((id) => id.startsWith(idFor(S, 'q~')) && !id.endsWith('v5'))).toBe(true);
    expect(new Set(raw().map((x) => x.inc)).size).toBe(2);
    expect(C.pendingOf(S).length).toBe(2);
  });
  it('l8: a new hold admitted without metadata carries the format marker and is never converted', async () => {
    // A private lock: a shared lock's send must carry metadata (NOT_WIRED, changes.sending.test.ts).
    const sc = 'l:f3l.raw@' + R1 + '#x';
    expect((await C.guarded(sc, 'd3', async () => ({ outcome: 'pending' as const }))) as { outcome: string }).toMatchObject({ outcome: 'pending' });
    const [r] = raw();
    expect([r!.fmt, r!.meta]).toEqual([1, undefined]);
    C.reloadChangesForTests();
    await spins();
    expect(raw().map((x) => x.id)).toEqual([r!.id]);
  });
  it('l8b: this build\'s record keeps its format marker through a reload and a release write', async () => {
    const m = keyed('f3l.keep');
    expect((await m.run({ n: 1, password: SECRET })).outcome).toBe('pending');
    C.reloadChangesForTests();
    const [c] = C.pendingOf('lock:f3l.keep');
    expect(await C.release(c!.scope, c!.digest, C.holdOfLock(c!.scope, c!.digest) as string)).toBe(true);
    await spins();
    expect(raw().map((x) => [x.pending, x.key !== null, x.fmt])).toEqual([[false, true, 1]]);
  });
  it('l9: an older record carrying an identity converts too; the keyed press sends nothing', async () => {
    const m = keyed('f3l.ident');
    expect((await m.run({ n: 1, password: SECRET })).outcome).toBe('pending');
    const { fmt: _f, ...rec } = raw()[0]!;
    void _f;
    expect(rec.meta!.identity).toEqual({ n: 1 });
    const digest = await varsDigest({ n: 1, password: SECRET });
    put([{ ...rec, id: rec.id.slice(0, rec.id.lastIndexOf('\u0000') + 1) + digest }]);
    C.reloadChangesForTests();
    await spins();
    expect(rawStr()).not.toContain(digest);
    expect(raw().map((x) => [x.id.includes(Q), 'identity' in x.meta!])).toEqual([[true, false]]);
    const before = posts();
    expect((await m.run({ n: 1, password: SECRET })).outcome).toBe('not_sent');
    expect(posts()).toBe(before);
  });
  it('a sender\'s warned Dismiss of its shown older change frees it', async () => {
    const lock = 'f3l.dis';
    const route = defineRoute({ method: 'POST', path: '/f3l/dis/plain', scope: 'agent', body: ['n'], idem: true });
    const plain = defineMutation<{ n: number }>(route, { input: (v) => ({ body: v }), lock, page: 'programs' });
    const { result } = renderHook(() => plain.use(), { wrapper: wrap });
    await act(async () => { expect((await result.current.run({ n: 1 })).outcome).toBe('pending'); await spins(); });
    const { fmt: _f, ...mine } = raw()[0]!;
    void _f;
    put([mine]);
    C.reloadChangesForTests();
    await act(async () => { await spins(); });
    const [row] = result.current.held();
    expect(row).toBeDefined();
    let freed = false;
    await act(async () => { freed = await result.current.dismissHeld(row!); });
    expect(freed).toBe(true);
    await act(async () => { await spins(); });
    expect(raw()).toEqual([]);
    expect(C.pendingOf('lock:' + lock)).toEqual([]);
  });
  it('a press refused before its send (onMutate throws) never queues its variables for hashing', async () => {
    const subtle = globalThis.crypto.subtle;
    const orig = subtle.digest.bind(subtle);
    const seen: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let first = true;
    vi.spyOn(subtle, 'digest').mockImplementation(async (alg: AlgorithmIdentifier, data: BufferSource) => {
      seen.push(new TextDecoder().decode(data as ArrayBuffer));
      if (first) { first = false; await gate; }
      return orig(alg, data);
    });
    const r = defineRoute<unknown, { code: string }>({ method: 'POST', path: '/f3l/pre', scope: 'agent', body: ['code'], secret: ['code'] });
    const src = coreSource('f3l-pre', { reads: {}, changes: { go: { route: r, lock: 'f3l.pre', lockKey: () => 'k', input: (v: { code: string }) => ({ body: v }) } } });
    const defaults = queryClient.getDefaultOptions();
    let last!: { mutateAsync: (v: { code: string }) => Promise<unknown> };
    function Probe() { last = src.useMutation<unknown, { code: string }>('go') as never; return null; }
    queryClient.setDefaultOptions({ ...defaults, mutations: { ...defaults.mutations, onMutate: () => { throw new Error('boom'); } } });
    const view = render(<Probe />, { wrapper: wrap });
    const earlier = varsDigest('earlier-held');
    await spins(5);
    let how = '';
    await act(async () => { how = await last.mutateAsync({ code: SECRET }).then(() => 'ok', () => 'rejected'); });
    expect(how).toBe('rejected');
    expect(posts()).toBe(0);
    view.unmount();
    queryClient.getMutationCache().clear();
    queryClient.setDefaultOptions(defaults);
    await release();
    await earlier;
    await spins();
    expect(seen.some((s) => s.includes(SECRET))).toBe(false);
  });
});
