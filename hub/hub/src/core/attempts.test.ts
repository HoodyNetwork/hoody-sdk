// attempts.ts: a held send without an idempotency key, cross-tab and across a reload, freed only by its sender;
// admitted only when durable (written and read back under the cross-tab lock).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIT_STALE_MS, attemptFor, attemptHoldRefs, attemptHoldRefsIn, attemptsAuthPurge, dropAttemptIds, heldAttempts, heldAttemptsAnyAccount, holdAttempt, MAX_ATTEMPTS, resetAttempts, subscribeAttempts } from './attempts';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY, SENDING_HEARTBEAT_MS, SENDING_STALE_MS, newChangeStoreTabForTests, readChanges, readChangesState, setChangeStoreAdapter, writeChanges, type StoredChange } from './change-store';
import { forgetAccountChanges } from './changes';
import { bump, setIdentity, startLoggingOut } from './ctx';
import { clearAuthTokens } from './session';
import { boot, R1, settle, UID } from './test/env';
import { removeTestLocks } from './test/locks';

const meta = { before: ['k1', 'k2'], alias: 'ci', scope: 'read', startedAt: 1 };
const held = async (lock = 'keys:create', by = 'keys:create') => {
  const r = await holdAttempt(lock, { by, meta, realm: R1 });
  if (!r.ok) throw new Error('not held: ' + r.code);
  return r.hold;
};
/** Another tab (or this one after a reload): its memory is empty, storage is shared. */
const reload = () => { resetAttempts(); newChangeStoreTabForTests(); };
const OTHER_ACCT = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const foreignHold = (acct: string, n: number): StoredChange => ({
  id: ATTEMPT_PREFIX + acct + '\u0001keys:create' + n + '\u0000' + 'f'.repeat(32), pending: true, key: 'hub-x', at: 1, t: 1 + n,
  meta: { base: 'keys:create' + n, target: null, realm: null, identity: null, by: 'keys:create' },
});
const plain = (store: { text: string | null }, o: { write?: (t: string | null) => boolean; read?: () => string | null } = {}) => ({
  read: o.read ?? (() => store.text),
  write: o.write ?? ((t: string | null) => { store.text = t; return true; }),
});

beforeEach(() => { boot({ realm: R1 }); });
afterEach(() => { vi.useRealTimers(); setChangeStoreAdapter(null); resetAttempts(); localStorage.clear(); removeTestLocks(); });

describe('attempts: hold before the send, refuse a second one, list for every page', () => {
  it('a hold is listed with its metadata, incarnation, key and in flight; a second hold of the lock is refused (HELD, not sent)', async () => {
    const h = await held();
    expect(h.incarnation).toMatch(/^[0-9a-f]{32}$/);
    expect(h.key).toMatch(/^hub-/);
    expect(heldAttempts('keys:create')).toMatchObject([{ id: h.id, incarnation: h.incarnation, key: h.key, lock: 'keys:create', by: 'keys:create', meta, realm: R1, inFlight: 'here', persisted: true }]);
    expect(await holdAttempt('keys:create', { by: 'keys:create', meta })).toMatchObject({ ok: false, code: 'HELD', notSent: true, held: { id: h.id } });
    expect((await holdAttempt('keys:copy:k1', { by: 'keys:copy', meta })).ok).toBe(true);
    expect(heldAttempts()).toHaveLength(2);
  });
  it('each hold of a lock is its own incarnation with its own key (never reused after a release)', async () => {
    const a = await held();
    a.release();
    await Promise.resolve(); await Promise.resolve();
    const b = await held();
    expect(b.incarnation).not.toBe(a.incarnation);
    expect(b.key).not.toBe(a.key);
  });
  it('survives a reload and is seen (and refused) by another tab; only the sender gets a handle back', async () => {
    const h = await held();
    reload();
    expect(heldAttempts('keys:create').map((a) => a.id)).toEqual([h.id]);
    expect(await holdAttempt('keys:create', { by: 'keys:create' })).toMatchObject({ ok: false, code: 'HELD' });
    expect(attemptFor(h.id, 'home')).toBeNull();
    const back = attemptFor(h.id, 'keys:create')!;
    expect(back.incarnation).toBe(h.incarnation);
    back.release();
    await vi.waitFor(() => expect(heldAttempts()).toEqual([]));
    expect((await holdAttempt('keys:create', { by: 'keys:create' })).ok).toBe(true);
  });
  it('sent() ends "in flight" but keeps the hold; a tab that died mid-send reads as held, not in flight, past the stale window, and subscribers hear it turn stale', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const h = await held();
    h.sent();
    await vi.waitFor(() => expect(heldAttempts('keys:create')).toMatchObject([{ inFlight: false }]));
    const k = await held('keys:copy:k9', 'keys:copy');
    reload(); // that tab died: no more beats
    expect(heldAttempts('keys:copy:k9')).toMatchObject([{ id: k.id, inFlight: 'elsewhere' }]);
    let heard = 0;
    const off = subscribeAttempts(() => { heard++; });
    try {
      await vi.advanceTimersByTimeAsync(SENDING_STALE_MS + 1000);
      expect(heard).toBeGreaterThan(0);
      expect(heldAttempts('keys:copy:k9')).toMatchObject([{ id: k.id, inFlight: false }]);
      expect(await holdAttempt('keys:copy:k9', { by: 'keys:copy' })).toMatchObject({ ok: false, code: 'HELD' });
    } finally { off(); }
  });
  it('a live sender renews its stamp, so a slow send never reads as a dead tab\'s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await held();
    await vi.advanceTimersByTimeAsync(SENDING_STALE_MS + SENDING_HEARTBEAT_MS);
    expect(heldAttempts()).toMatchObject([{ inFlight: 'here' }]);
  });
  it('dismiss needs the confirmation; freed by the sender in another tab, this tab drops its copy', async () => {
    const h = await held();
    expect(h.dismiss(false as never)).toBe(false);
    expect(heldAttempts()).toHaveLength(1);
    const id = h.id;
    reload();
    expect(attemptFor(id, 'keys:create')!.dismiss(true)).toBe(true);
    await vi.waitFor(() => expect(readChanges()!.some((r) => r.id === id)).toBe(false));
    expect(heldAttempts()).toEqual([]);
  });
});

describe('attempts-b: only a durable hold is admitted (write, read back, step back)', () => {
  it('a refused write, then an unreadable verify, then a reload: not held, not sent, and nothing comes back', async () => {
    const store = { text: null as string | null };
    let reads = 0;
    // The locked read works; the write is refused; the read-back throws.
    setChangeStoreAdapter(plain(store, { write: () => false, read: () => { reads++; if (reads > 1) throw new Error('blocked'); return store.text; } }));
    const r = await holdAttempt('keys:create', { by: 'keys:create', meta });
    expect(r).toEqual({ ok: false, code: 'NOT_DURABLE', notSent: true });
    expect(heldAttempts()).toEqual([]);
    setChangeStoreAdapter(plain(store));
    reload();
    expect(heldAttempts()).toEqual([]);
    expect(store.text).toBeNull();
    expect((await holdAttempt('keys:create', { by: 'keys:create' })).ok).toBe(true);
  });
  it('a write that lands but does not read back steps back: its own record is removed (the rest stays), nothing is held', async () => {
    const store = { text: JSON.stringify([foreignHold(OTHER_ACCT, 1)]) as string | null };
    const before = store.text;
    let reads = 0;
    setChangeStoreAdapter(plain(store, { read: () => { reads++; if (reads === 2) throw new Error('blocked'); return store.text; } }));
    expect(await holdAttempt('keys:create', { by: 'keys:create', meta })).toMatchObject({ ok: false, code: 'NOT_DURABLE', notSent: true });
    expect(JSON.parse(store.text!)).toEqual(JSON.parse(before!));
    expect(heldAttempts()).toEqual([]);
  });
  it('a refused write with a readable verify: not held (the record is not in storage)', async () => {
    const store = { text: null as string | null };
    setChangeStoreAdapter(plain(store, { write: () => false }));
    expect(await holdAttempt('keys:create', { by: 'keys:create' })).toMatchObject({ ok: false, code: 'NOT_DURABLE' });
    expect(heldAttempts()).toEqual([]);
  });
  it('unreadable storage, or a browser without the cross-tab lock: refused not sent, nothing written', async () => {
    let writes = 0;
    setChangeStoreAdapter({ read() { throw new Error('blocked'); }, write: () => { writes++; return false; } });
    expect(await holdAttempt('keys:create', { by: 'keys:create' })).toEqual({ ok: false, code: 'NOT_DURABLE', notSent: true });
    expect(writes).toBe(0);
    setChangeStoreAdapter(null);
    removeTestLocks();
    expect(await holdAttempt('keys:create', { by: 'keys:create' })).toEqual({ ok: false, code: 'NOT_DURABLE', notSent: true });
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBeNull();
  });
  it('attempts-d: a lock request that throws refuses not sent: nothing read, nothing written, nothing held', async () => {
    let reads = 0, writes = 0;
    setChangeStoreAdapter({ read: () => { reads++; return null; }, write: () => { writes++; return true; } });
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: () => { throw new Error('SecurityError'); } } });
    expect(await holdAttempt('keys:create', { by: 'keys:create' })).toEqual({ ok: false, code: 'NOT_DURABLE', notSent: true });
    expect({ reads, writes }).toEqual({ reads: 0, writes: 0 });
    expect(heldAttempts()).toEqual([]);
  });
  it('bytes this layout cannot read never free a hold: known holds stay listed, no new hold is admitted', async () => {
    const h = await held();
    localStorage.setItem(CHANGE_STORE_KEY, '{not json');
    expect(readChangesState().state).toBe('corrupt');
    expect(heldAttempts().map((a) => a.id)).toEqual([h.id]);
    expect(heldAttemptsAnyAccount()).toBe(1);
    expect(await holdAttempt('keys:create', { by: 'keys:create' })).toMatchObject({ ok: false, code: 'NOT_DURABLE' });
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe('{not json');
    // A held attempt record that does not validate: the store is corrupt, the hold this tab knows stays listed, and
    // no write (an admission, a beat, a sign-out drop) goes over the record that did not read.
    const bad = JSON.stringify([{ id: ATTEMPT_PREFIX + UID + '\u0001keys:create\u0000x', pending: 'yes', t: 1 }]);
    localStorage.setItem(CHANGE_STORE_KEY, bad);
    expect(readChangesState().state).toBe('corrupt');
    expect(heldAttempts().map((a) => a.id)).toEqual([h.id]);
    expect(await holdAttempt('keys:copy', { by: 'keys:copy' })).toMatchObject({ ok: false, code: 'NOT_DURABLE' });
    h.release();
    await settle();
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(bad);
  });
  it('metadata too large for a stored record is refused up front (never held only to be dropped)', async () => {
    expect(await holdAttempt('keys:create', { by: 'keys:create', meta: { before: Array.from({ length: 2000 }, (_, i) => 'key-' + i) } })).toEqual({ ok: false, code: 'TOO_LARGE', notSent: true });
    expect(heldAttempts()).toEqual([]);
  });
});

describe('attempts-c: a refused admission steps back by its own record only, and an unsent one is cleaned up', () => {
  const rival = (): StoredChange => ({
    id: ATTEMPT_PREFIX + UID + '\u0001keys:create\u0000' + 'b'.repeat(32), pending: true, key: 'hub-b', at: 1, t: 5,
    meta: { base: 'keys:create', target: null, realm: null, identity: null, by: 'keys:create' },
  });
  // Another writer that does not take the store lock (any client of the key): the step-back removes only its own record.
  it('another writer lands between this read and its write: its hold stays, this one is refused unsent', async () => {
    const store = { text: null as string | null };
    let writes = 0;
    // Tab B read the same empty store and writes its own hold right after this tab's first write lands.
    setChangeStoreAdapter(plain(store, { write: (t: string | null) => { writes++; store.text = t; if (writes === 1) store.text = JSON.stringify([rival()]); return true; } }));
    expect(await holdAttempt('keys:create', { by: 'keys:create', meta })).toMatchObject({ ok: false, notSent: true });
    expect(JSON.parse(store.text!).map((r: StoredChange) => r.id)).toEqual([rival().id]);
    setChangeStoreAdapter(null);
  });
  it('the same with both records read back: the rival lock holder wins (HELD), this one removes only its own', async () => {
    const store = { text: null as string | null };
    let writes = 0;
    setChangeStoreAdapter(plain(store, { write: (t: string | null) => { writes++; store.text = t; if (writes === 1) store.text = JSON.stringify([...JSON.parse(t!), rival()]); return true; } }));
    expect(await holdAttempt('keys:create', { by: 'keys:create', meta })).toMatchObject({ ok: false, code: 'HELD', notSent: true, held: { id: rival().id } });
    expect(JSON.parse(store.text!).map((r: StoredChange) => r.id)).toEqual([rival().id]);
  });
  it('a read-back that finds corrupt bytes refuses and writes nothing over them', async () => {
    const store = { text: null as string | null };
    let writes = 0;
    setChangeStoreAdapter(plain(store, { write: (t: string | null) => { writes++; store.text = writes === 1 ? '{not json' : t; return true; } }));
    expect(await holdAttempt('keys:create', { by: 'keys:create', meta })).toEqual({ ok: false, code: 'NOT_DURABLE', notSent: true });
    expect(writes).toBe(1);
    expect(store.text).toBe('{not json');
  });
  it('the step-back cannot be done: never held; this tab cleans it up once storage recovers', async () => {
    const store = { text: null as string | null };
    let reads = 0, writes = 0;
    // The first write lands; then storage cannot be read and refuses every write (the step-back too).
    setChangeStoreAdapter(plain(store, {
      read: () => { reads++; if (reads > 1) throw new Error('blocked'); return store.text; },
      write: (t) => { writes++; if (writes > 1) return false; store.text = t; return true; },
    }));
    expect(await holdAttempt('keys:create', { by: 'keys:create', meta })).toEqual({ ok: false, code: 'NOT_DURABLE', notSent: true });
    expect(JSON.parse(store.text!)).toHaveLength(1); // its own record, still marked admitting
    setChangeStoreAdapter(plain(store));
    expect(heldAttempts()).toEqual([]);
    await vi.waitFor(() => expect(store.text).toBeNull());
    expect((await holdAttempt('keys:create', { by: 'keys:create' })).ok).toBe(true);
  });
  it('...and after a reload, its admitting mark ages out: listed held only inside the window, then removed by the next write', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    const store = { text: null as string | null };
    let reads = 0, writes = 0;
    setChangeStoreAdapter(plain(store, {
      read: () => { reads++; if (reads > 1) throw new Error('blocked'); return store.text; },
      write: (t) => { writes++; if (writes > 1) return false; store.text = t; return true; },
    }));
    expect(await holdAttempt('keys:create', { by: 'keys:create', meta })).toMatchObject({ ok: false, code: 'NOT_DURABLE' });
    setChangeStoreAdapter(plain(store));
    reload();
    // Inside the window an admission may still be running in some tab: it counts as held.
    expect(heldAttempts()).toHaveLength(1);
    expect(await holdAttempt('keys:create', { by: 'keys:create' })).toMatchObject({ ok: false, code: 'HELD' });
    vi.advanceTimersByTime(ADMIT_STALE_MS);
    expect(heldAttempts()).toEqual([]);
    expect(heldAttemptsAnyAccount()).toBe(0);
    const h = await held();
    expect(JSON.parse(store.text!).map((r: StoredChange) => r.id)).toEqual([h.id]);
  });
  it('an empty string in storage is corrupt, not an empty store: known holds stay listed, no new hold, nothing written', async () => {
    const h = await held();
    localStorage.setItem(CHANGE_STORE_KEY, '');
    expect(readChangesState()).toEqual({ state: 'corrupt', list: [] });
    expect(heldAttempts().map((a) => a.id)).toEqual([h.id]);
    expect(heldAttemptsAnyAccount()).toBe(1);
    expect(await holdAttempt('keys:copy', { by: 'keys:copy' })).toMatchObject({ ok: false, code: 'NOT_DURABLE' });
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe('');
  });
});

describe('the admitting mark until a clean read-back, its age-out heard, refused cleanups, no unlocked write', () => {
  const marked = (at: number): StoredChange => ({
    id: ATTEMPT_PREFIX + UID + '\u0001keys:create\u0000' + 'e'.repeat(32), pending: true, key: 'hub-e', at, t: at, admitting: at,
    sending: { tab: 'gone', at }, meta: { base: 'keys:create', target: null, realm: null, identity: null, by: 'keys:create' },
  });
  it('a confirm that landed but could not be read back steps back over the list it wrote: after a reload nothing is held', async () => {
    const other = foreignHold(OTHER_ACCT, 1);
    const store = { text: JSON.stringify([other]) as string | null };
    let reads = 0;
    // Read under the lock and the first read-back work; the confirm's read-back and every read after it throw.
    setChangeStoreAdapter(plain(store, { read: () => { reads++; if (reads > 2) throw new Error('blocked'); return store.text; } }));
    expect(await holdAttempt('keys:create', { by: 'keys:create', meta })).toEqual({ ok: false, code: 'NOT_DURABLE', notSent: true });
    setChangeStoreAdapter(plain(store));
    reload();
    expect(heldAttempts()).toEqual([]);
    expect(JSON.parse(store.text!).map((r: StoredChange) => r.id)).toEqual([other.id]);
    expect((await holdAttempt('keys:create', { by: 'keys:create' })).ok).toBe(true);
  });
  it('a refused confirm write keeps the mark stored: after a reload it holds only inside the window', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    const store = { text: null as string | null };
    let writes = 0;
    // The marked write lands; the confirm and the step-back are refused.
    setChangeStoreAdapter(plain(store, { write: (t) => { writes++; if (writes > 1) return false; store.text = t; return true; } }));
    expect(await holdAttempt('keys:create', { by: 'keys:create', meta })).toEqual({ ok: false, code: 'NOT_DURABLE', notSent: true });
    expect(JSON.parse(store.text!)[0].admitting).toEqual(expect.any(Number));
    setChangeStoreAdapter(plain(store));
    reload();
    expect(heldAttempts()).toHaveLength(1);
    vi.advanceTimersByTime(ADMIT_STALE_MS);
    expect(heldAttempts()).toEqual([]);
  });
  it('a record still marked admitting turns unsent at ADMIT_STALE_MS and subscribers are told then', async () => {
    vi.useFakeTimers({ now: 50_000 });
    writeChanges([marked(50_000)]);
    reload();
    expect(heldAttempts()).toHaveLength(1);
    let heard = 0;
    const off = subscribeAttempts(() => { heard++; });
    try {
      await vi.advanceTimersByTimeAsync(ADMIT_STALE_MS + 100);
      expect(heard).toBeGreaterThan(0);
      expect(heldAttempts()).toEqual([]);
    } finally { off(); }
  });
  it('a cleanup the browser refuses tells nobody (no re-read, no retry loop); once storage takes it, subscribers hear', async () => {
    const store = { text: JSON.stringify([marked(1)]) as string | null };
    let writes = 0;
    setChangeStoreAdapter(plain(store, { write: () => { writes++; return false; } }));
    reload();
    let heard = 0;
    const off = subscribeAttempts(() => { heard++; heldAttempts(); });
    try {
      expect(heldAttempts()).toEqual([]);
      await settle();
      expect(writes).toBe(1);
      expect(heard).toBe(0);
      setChangeStoreAdapter(plain(store));
      expect(heldAttempts()).toEqual([]);
      await vi.waitFor(() => expect(store.text).toBeNull());
      expect(heard).toBeGreaterThan(0);
    } finally { off(); }
  });
  it('a freed hold is not listed while its removal waits for the store lock; a removal that is refused lists it again', async () => {
    const h = await held();
    h.release();
    expect(heldAttempts()).toEqual([]);
    expect(heldAttemptsAnyAccount()).toBe(0);
    await vi.waitFor(() => expect(readChanges()).toEqual([]));
    const k = await held();
    setChangeStoreAdapter({ read: () => localStorage.getItem(CHANGE_STORE_KEY), write: () => false });
    k.release();
    expect(heldAttempts()).toEqual([]);
    await vi.waitFor(() => expect(heldAttempts().map((a) => a.id)).toEqual([k.id]));
  });
  it('without navigator.locks no free, beat or sent writes the store: the hold stays stored (another tab\'s new hold can never be written away)', async () => {
    const h = await held();
    const k = await held('keys:copy:k1', 'keys:copy');
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    removeTestLocks();
    let writes = 0;
    setChangeStoreAdapter({ read: () => localStorage.getItem(CHANGE_STORE_KEY), write: () => { writes++; return true; } });
    h.release();
    k.sent();
    attemptsAuthPurge({ reason: 'signout', uid: UID });
    await settle();
    expect(writes).toBe(0);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    // Freed here, so this tab dropped it; storage still holds it, so it shows again (never freed by accident).
    expect(heldAttempts().map((a) => a.id).sort()).toEqual([h.id, k.id].sort());
  });
});

describe('attempts-b: per account caps, the store cap, sign-out', () => {
  it(`${MAX_ATTEMPTS} holds per account, then FULL; another account's holds do not count`, async () => {
    writeChanges(Array.from({ length: 70 }, (_, i) => foreignHold(OTHER_ACCT, i)));
    for (let i = 0; i < MAX_ATTEMPTS; i++) await held('keys:copy:k' + i, 'keys:copy');
    expect(await holdAttempt('keys:copy:last', { by: 'keys:copy' })).toEqual({ ok: false, code: 'FULL', notSent: true });
    expect(heldAttempts()).toHaveLength(MAX_ATTEMPTS);
    expect(heldAttemptsAnyAccount()).toBe(MAX_ATTEMPTS + 70);
  });
  it('the store cap never pushes a hold out (that would free it), however many change records come after', async () => {
    const h = await held();
    const list = readChanges()!;
    writeChanges([...list, ...Array.from({ length: 80 }, (_, i) => ({ id: UID + '\u0001lock:x\u0000d' + i, pending: false, key: null, t: Date.now() + 1000 + i }))]);
    expect(readChanges()!.some((r) => r.id === h.id)).toBe(true);
    expect(readChanges()!.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX))).toHaveLength(64);
    expect(heldAttempts().map((a) => a.id)).toEqual([h.id]);
  });
  it('another account sees none of it; an account round trip keeps it', async () => {
    const h = await held();
    setIdentity({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', banned: false });
    expect(heldAttempts()).toEqual([]);
    expect(attemptFor(h.id, 'keys:create')).toBeNull();
    setIdentity({ id: UID, banned: false });
    expect(heldAttempts().map((a) => a.id)).toEqual([h.id]);
  });
  it('a sign-out purge removes no stored hold, the leaving account\'s included; it drops this tab\'s copy of an answered one and keeps the beat of a send still out', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const h = await held(); // still out: its beat runs
    const k = await held('keys:copy:k1', 'keys:copy');
    k.sent(); // answered (unknown): pending, no beat
    await settle();
    const list = readChanges()!;
    writeChanges([...list, foreignHold(OTHER_ACCT, 1)]);
    expect(heldAttemptsAnyAccount()).toBe(3);
    const rec = () => readChanges()!.find((r) => r.id === h.id);
    const first = rec()?.t;
    attemptsAuthPurge({ reason: 'signout', uid: UID });
    await settle();
    vi.advanceTimersByTime(SENDING_HEARTBEAT_MS * 3); // the beat of the send still out keeps renewing its stamp
    await settle();
    expect(rec()?.sending).toBeDefined();
    expect(rec()?.t).not.toBe(first);
    expect(readChanges()!.map((r) => r.id).sort()).toEqual([h.id, k.id, foreignHold(OTHER_ACCT, 1).id].sort());
    expect(heldAttemptsAnyAccount()).toBe(3);
    // Unreadable storage counts this tab's copies: the send still out only (the answered one's copy was dropped).
    setChangeStoreAdapter({ read: () => { throw new Error('unreadable'); }, write: () => false });
    expect(heldAttemptsAnyAccount()).toBe(1);
    setChangeStoreAdapter(null);
    // Still stored: both show (read-only, from storage) while the account is shown.
    expect(heldAttempts().map((a) => a.id).sort()).toEqual([h.id, k.id].sort());
  });
  it('a sent() whose write lands after the sign-out purge dropped this tab\'s copy does not put it back', async () => {
    const h = await held();
    h.sent(); // its beat ends now; its write lands after the purge below
    attemptsAuthPurge({ reason: 'signout', uid: UID });
    await settle();
    expect(readChanges()!.find((r) => r.id === h.id)?.sending).toBeUndefined(); // the answer settled the stored record
    setChangeStoreAdapter({ read: () => { throw new Error('unreadable'); }, write: () => false });
    expect(heldAttemptsAnyAccount()).toBe(0); // unreadable storage counts this tab's copies: none
  });
  it('a heartbeat queued before sent() and the purge, landing after both, does not put the dropped copy back', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const h = await held(); // still out: its beat runs
    await settle();
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    void (navigator as unknown as { locks: { request: (n: string, cb: () => Promise<void>) => Promise<void> } }).locks.request('hub_changes', () => gate);
    vi.advanceTimersByTime(SENDING_HEARTBEAT_MS + 1); // the beat's restamp queues behind the held store lock
    h.sent(); // the beat stops, the answer's write queues after the restamp
    attemptsAuthPurge({ reason: 'signout', uid: UID }); // no beat runs now: this tab's copy is dropped
    open();
    await settle(); await settle();
    expect(readChanges()!.find((r) => r.id === h.id)?.sending).toBeUndefined(); // the answer settled the stored record
    setChangeStoreAdapter({ read: () => { throw new Error('unreadable'); }, write: () => false });
    expect(heldAttemptsAnyAccount()).toBe(0); // neither write put the copy back
  });
  it('the sign-out\'s hold test (attemptHoldRefsIn) is the warning\'s (attemptHoldRefs) on the stored truth', async () => {
    const h = await held();
    const k = await held('keys:copy:k1', 'keys:copy');
    const now = Date.now();
    const fresh = { ...foreignHold(UID, 1), admitting: now - 1 };
    const stale = { ...foreignHold(UID, 2), admitting: now - ADMIT_STALE_MS };
    writeChanges([...readChanges()!, fresh, stale, foreignHold(OTHER_ACCT, 3)]);
    const ref = (id: string, live = false) => ({ id, token: id.slice(id.lastIndexOf('\u0000') + 1), ...(live ? { sending: true } : {}) });
    const all = [ref(h.id, true), ref(k.id, true), ref(fresh.id)]; // h and k: sends still out (live stamps)
    expect(attemptHoldRefsIn(readChanges()!, UID, now).sort((a, b) => a.id.localeCompare(b.id))).toEqual(all.sort((a, b) => a.id.localeCompare(b.id)));
    expect(attemptHoldRefs().map((x) => x.id).sort()).toEqual([h.id, k.id, fresh.id].sort());
    for (const x of attemptHoldRefs()) expect(x).toEqual(ref(x.id, x.id !== fresh.id));
    // A hold being freed: hidden from the warning, still a hold on the stored truth until its removal lands.
    setChangeStoreAdapter({ read: () => localStorage.getItem(CHANGE_STORE_KEY), write: () => false });
    h.release();
    expect(attemptHoldRefs().map((x) => x.id)).not.toContain(h.id);
    expect(attemptHoldRefsIn(readChanges()!, UID).map((x) => x.id)).toContain(h.id);
  });
  it('`sending` is set exactly on a send still out, one rule for the stored truth and the warning', async () => {
    const h = await held();
    const k = await held('keys:copy:k1', 'keys:copy');
    k.sent(); // answered: the stamp ends, the hold stays
    await settle();
    const t0 = Date.now();
    const stamped = (n: number, at: number): StoredChange => ({ ...foreignHold(UID, n), sending: { tab: 'other', at } });
    // Another tab's send: live just inside SENDING_STALE_MS, stale at it (sendingLive's own edge).
    const inside = stamped(1, t0 - SENDING_STALE_MS + 1), edge = stamped(2, t0 - SENDING_STALE_MS);
    writeChanges([...readChanges()!, inside, edge]);
    const flags = (refs: readonly { id: string; sending?: true }[]) => Object.fromEntries(refs.map((r) => [r.id, r.sending === true]));
    const want = { [h.id]: true, [k.id]: false, [inside.id]: true, [edge.id]: false };
    expect(flags(attemptHoldRefsIn(readChanges()!, UID, t0))).toEqual(want);
    vi.setSystemTime(t0);
    expect(flags(attemptHoldRefs())).toEqual(want);
    // The property is absent (never false) when not sending.
    expect(attemptHoldRefsIn(readChanges()!, UID, t0).find((r) => r.id === k.id)).not.toHaveProperty('sending');
    // While storage cannot be read, the warning flags this tab's own send still out by the same rule.
    setChangeStoreAdapter({ read: () => { throw new Error('unreadable'); }, write: () => false });
    expect(flags(attemptHoldRefs())).toEqual(want); // this tab's copy (it read them all), the same flags
  });
  it('dropAttemptIds drops this tab\'s copy and beat of exactly the given ids of the account, never storage', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const h = await held();
    const k = await held('keys:copy:k1', 'keys:copy');
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    const unreadable = () => setChangeStoreAdapter({ read: () => { throw new Error('unreadable'); }, write: () => false });
    dropAttemptIds(OTHER_ACCT, [h.id]); // named under another account: nothing
    unreadable();
    expect(heldAttempts().map((a) => a.id).sort()).toEqual([h.id, k.id].sort()); // memory: both still here
    setChangeStoreAdapter(null);
    dropAttemptIds(UID, [h.id]);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    unreadable();
    expect(heldAttempts().map((a) => a.id)).toEqual([k.id]); // memory: only k left
    setChangeStoreAdapter(null);
    // h's beat stopped: its stamp is no longer renewed; k's is.
    const at0 = (id: string) => readChanges()!.find((r) => r.id === id)?.sending?.at;
    const h0 = at0(h.id), k0 = at0(k.id);
    vi.advanceTimersByTime(SENDING_HEARTBEAT_MS + 1);
    await settle();
    expect(at0(h.id)).toBe(h0);
    expect(at0(k.id)).not.toBe(k0);
  });
  it('another tab\'s confirmed forget removed a hold this tab still sends; its late answer and beat write nothing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const b = await held(); // still out here; this tab keeps its copy and beat
    // Its stamp reads stale (this tab stalled). Another tab knows only the stamp (it holds no beat of b): its warning
    // shows b as a pending hold and its forget removes it. That tab's view of attemptHoldRefsIn: the stored truth less
    // this tab's own beats, i.e. the flag by stamp age alone.
    writeChanges(readChanges()!.map((r) => (r.id === b.id ? { ...r, sending: { tab: r.sending!.tab, at: Date.now() - SENDING_STALE_MS - 1000 } } : r)));
    expect(attemptHoldRefsIn(readChanges()!, UID, Date.now())).toEqual([{ id: b.id, token: b.incarnation, sending: true }]); // here: still out
    const otherTab = (list: readonly StoredChange[], acct: string, now: number) =>
      attemptHoldRefsIn(list, acct, now).map((h) => (list.some((r) => r.id === h.id && r.sending && now - r.sending.at < SENDING_STALE_MS) ? h : { id: h.id, token: h.token }));
    const shown = otherTab(readChanges()!, UID, Date.now());
    expect(shown).toEqual([{ id: b.id, token: b.incarnation }]);
    expect(await forgetAccountChanges(UID, shown, { holdsIn: otherTab, drop: () => {} })).toBe('done'); // the other tab drops its own copy only
    const after = localStorage.getItem(CHANGE_STORE_KEY);
    let writes = 0;
    setChangeStoreAdapter({ read: () => localStorage.getItem(CHANGE_STORE_KEY), write: (t) => { writes++; if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t); return true; } });
    vi.advanceTimersByTime(SENDING_HEARTBEAT_MS * 2 + 1); // its beat, before this tab reads storage again
    await settle();
    b.sent(); // the late answer
    await settle();
    b.release();
    await settle();
    expect(writes).toBe(0);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(after);
    expect(heldAttempts()).toEqual([]);
  });
  it('this tab\'s own fresh stamp of a request already answered (its sent() write refused) is no send out: unflagged, and a confirmed forget removes it', async () => {
    const h = await held();
    setChangeStoreAdapter({ read: () => localStorage.getItem(CHANGE_STORE_KEY), write: () => false });
    h.sent(); // the answer came; clearing the stamp was refused, so the stored stamp stays (fresh, this tab's)
    await settle();
    setChangeStoreAdapter(null);
    const now = Date.now();
    expect(readChanges()!.find((r) => r.id === h.id)?.sending).toBeDefined(); // still stamped, fresh
    const shown = attemptHoldRefsIn(readChanges()!, UID, now);
    expect(shown).toEqual([{ id: h.id, token: h.incarnation }]); // not flagged
    expect(attemptHoldRefs()).toEqual(shown);
    expect(heldAttempts()[0]?.inFlight).toBe(false);
    expect(await forgetAccountChanges(UID, shown, { holdsIn: attemptHoldRefsIn, drop: dropAttemptIds })).toBe('done');
    expect(readChanges()!.filter((r) => r.id.startsWith(ATTEMPT_PREFIX))).toEqual([]);
    // Another tab reading the same fresh stamp still counts it as a send out (it cannot know the answer came).
    writeChanges([...readChanges()!, { ...foreignHold(UID, 4), sending: { tab: 'other', at: Date.now() } }]);
    expect(attemptHoldRefsIn(readChanges()!, UID, Date.now())[0]?.sending).toBe(true);
  });
  it('expiry, a failed refresh, entry cleanup, a purge naming another uid, an old purge with no reason, and a bump all keep every hold', async () => {
    const h = await held();
    for (const info of [{ reason: 'expiry', uid: UID }, { reason: 'refresh', uid: UID }, { reason: 'cleanup', uid: UID }, { reason: 'forget', uid: UID }, { reason: 'signout', uid: OTHER_ACCT }] as const) {
      attemptsAuthPurge(info);
    }
    attemptsAuthPurge();
    bump('signout');
    bump('logout');
    await settle();
    expect(readChanges()!.map((r) => r.id)).toEqual([h.id]);
    // The real purge (clearAuthTokens: hooks, then the registry's purge keys) keeps hub.v3.changes.
    clearAuthTokens();
    await settle();
    expect(readChanges()!.map((r) => r.id)).toEqual([h.id]);
  });
  it('no hold while the account is going (signing out): nothing is held, so nothing may be sent', async () => {
    startLoggingOut();
    expect(await holdAttempt('keys:create', { by: 'keys:create' })).toEqual({ ok: false, code: 'NO_ACCOUNT', notSent: true });
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBeNull();
  });
  it('subscribers hear a hold and its release', async () => {
    const heard: number[] = [];
    const off = subscribeAttempts(() => heard.push(heldAttempts().length));
    try {
      const h = await held();
      h.release();
      await vi.waitFor(() => expect(heard[heard.length - 1]).toBe(0));
      expect(heard).toContain(1);
    } finally { off(); }
  });
});
