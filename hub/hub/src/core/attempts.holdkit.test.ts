// attempts.ts for the holdkit: update() is a compare-and-set of the sender's metadata
// inside the store lock, and free() removes the record only for the account, sender and version the caller checked,
// never while its request is out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attemptFor, attemptsAuthPurge, heldAttempts, holdAttempt, resetAttempts, type AttemptHold } from './attempts';
import { CHANGE_STORE_KEY, SENDING_HEARTBEAT_MS, SENDING_STALE_MS, newChangeStoreTabForTests, readChanges, readChangesState, setChangeStoreAdapter, underChangeStore, writeChanges, type StoredChange } from './change-store';
import { setIdentity, startLoggingOut } from './ctx';
import { boot, R1, settle, UID } from './test/env';

const OTHER_ACCT = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const meta = { step: 'saved', n: 1 };
const held = async (lock = 'keys:create', by = 'keys:create'): Promise<AttemptHold> => {
  const r = await holdAttempt(lock, { by, meta, realm: R1 });
  if (!r.ok) throw new Error('not held: ' + r.code);
  return r.hold;
};
/** A hold whose request was answered (sent() landed): no send out, so it may be freed. */
const answered = async (lock?: string): Promise<AttemptHold> => {
  const h = await held(lock);
  h.sent();
  await vi.waitFor(() => expect(stored(h.id)!.sending).toBeUndefined());
  return h;
};
/** Another tab (or this one after a reload): its memory is empty, storage is shared. */
const reload = () => { resetAttempts(); newChangeStoreTabForTests(); };
const stored = (id: string): StoredChange | undefined => readChanges()!.find((r) => r.id === id);
/** Holds the store lock until the returned function is called: anything queued behind it waits. */
const holdStoreLock = (): (() => void) => {
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  void underChangeStore(() => gate);
  return open;
};
const switchTo = (id: string) => setIdentity({ id, banned: false });
const refusingWrites = () => {
  const text = { text: localStorage.getItem(CHANGE_STORE_KEY) };
  setChangeStoreAdapter({ read: () => text.text, write: () => false });
};

beforeEach(() => { boot({ realm: R1 }); });
afterEach(() => { vi.useRealTimers(); setChangeStoreAdapter(null); resetAttempts(); localStorage.clear(); });

describe('update(meta, expectVersion) is a compare-and-set inside the store lock', () => {
  it('a new hold is at metaVersion 0; an update from 0 writes the meta at 1', async () => {
    const h = await held();
    expect(heldAttempts('keys:create')).toMatchObject([{ meta, metaVersion: 0 }]);
    expect(await h.update({ step: 'dispatched' }, 0)).toBe(true);
    expect(stored(h.id)).toMatchObject({ attempt: { step: 'dispatched' }, metaVersion: 1 });
    expect(heldAttempts('keys:create')).toMatchObject([{ meta: { step: 'dispatched' }, metaVersion: 1 }]);
  });
  it('two handles update one record from the same version: exactly one wins', async () => {
    const a = await held();
    reload();
    const b = attemptFor(a.id, 'keys:create')!;
    const [ra, rb] = await Promise.all([a.update({ by: 'a' }, 0), b.update({ by: 'b' }, 0)]);
    expect([ra, rb].sort()).toEqual([false, true]);
    expect(stored(a.id)).toMatchObject({ attempt: ra ? { by: 'a' } : { by: 'b' }, metaVersion: 1 });
    // The loser's next try from the version it now reads goes through.
    expect(await (ra ? b : a).update({ by: 'late' }, 1)).toBe(true);
    expect(stored(a.id)).toMatchObject({ attempt: { by: 'late' }, metaVersion: 2 });
  });
  it('a stale version writes nothing', async () => {
    const h = await held();
    expect(await h.update({ v: 1 }, 0)).toBe(true);
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    expect(await h.update({ v: 2 }, 0)).toBe(false);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
  });
  it('a heartbeat rewrites the record but not its meta version: an update from the same version still wins', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const h = await held();
    const t0 = stored(h.id)!.t;
    await vi.advanceTimersByTimeAsync(SENDING_HEARTBEAT_MS + 50);
    await vi.waitFor(() => expect(stored(h.id)!.t).not.toBe(t0));
    expect(await h.update({ step: 'dispatched' }, 0)).toBe(true);
  });
  it('after a free the update is false and writes nothing (the same handle, or another one\'s)', async () => {
    const h = await answered();
    reload();
    const other = attemptFor(h.id, 'keys:create')!;
    expect(await h.free('done', { metaVersion: 0 })).toBe('freed');
    expect(await h.update({ v: 1 }, 0)).toBe(false);
    expect(await other.update({ v: 1 }, 0)).toBe(false);
    expect(readChanges()).toEqual([]);
  });
  it('under another account, or while the account is going, the update is false and writes nothing', async () => {
    const h = await held();
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    switchTo(OTHER_ACCT);
    expect(await h.update({ v: 1 }, 0)).toBe(false);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    switchTo(UID);
    expect(await h.update({ v: 1 }, 0)).toBe(true);
    startLoggingOut();
    expect(await h.update({ v: 2 }, 1)).toBe(false);
    expect(stored(h.id)).toMatchObject({ attempt: { v: 1 }, metaVersion: 1 });
  });
  it('a record of another sender, too large a meta, a bad or unsafe version and refused storage: false', async () => {
    const h = await held();
    const list = readChanges()!;
    writeChanges(list.map((r) => (r.id === h.id ? { ...r, meta: { ...r.meta!, by: 'home' } } : r)));
    expect(await h.update({ v: 1 }, 0)).toBe(false);
    writeChanges(list);
    expect(await h.update({ big: 'x'.repeat(9000) }, 0)).toBe(false);
    expect(await h.update({ v: 1 }, -1)).toBe(false);
    expect(await h.update({ v: 1 }, 0.5)).toBe(false);
    refusingWrites();
    expect(await h.update({ v: 1 }, 0)).toBe(false);
    setChangeStoreAdapter(null);
    expect(stored(h.id)).toMatchObject({ attempt: meta });
    expect(stored(h.id)!.metaVersion ?? 0).toBe(0);
  });
  it('the largest safe version is the last one: an update from it is refused, the store stays clean', async () => {
    const h = await held();
    writeChanges(readChanges()!.map((r) => (r.id === h.id ? { ...r, metaVersion: Number.MAX_SAFE_INTEGER } : r)));
    expect(await h.update({ v: 1 }, Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(readChangesState().state).toBe('clean');
  });
  it('sending: true stamps this tab and restarts the beat: in flight again, and the stamp is renewed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const h = await answered();
    expect(heldAttempts('keys:create')).toMatchObject([{ inFlight: false }]);
    expect(await h.update({ step: 'dispatched' }, 0, { sending: true })).toBe(true);
    expect(heldAttempts('keys:create')).toMatchObject([{ inFlight: 'here', metaVersion: 1 }]);
    const at = stored(h.id)!.sending!.at;
    await vi.advanceTimersByTimeAsync(SENDING_HEARTBEAT_MS + 50);
    await vi.waitFor(() => expect(stored(h.id)!.sending!.at).toBeGreaterThan(at));
    h.sent();
    await vi.waitFor(() => expect(heldAttempts('keys:create')).toMatchObject([{ inFlight: false }]));
  });
  it('meta and version survive a reload; the sender\'s handle after the reload updates from there', async () => {
    const h = await held();
    expect(await h.update({ step: 'dispatched' }, 0)).toBe(true);
    reload();
    expect(heldAttempts('keys:create')).toMatchObject([{ id: h.id, meta: { step: 'dispatched' }, metaVersion: 1 }]);
    const back = attemptFor(h.id, 'keys:create')!;
    expect(await back.update({ step: 'done' }, 0)).toBe(false);
    expect(await back.update({ step: 'done' }, 1)).toBe(true);
  });
  it('a malformed stored meta version makes the read corrupt: nothing compares against it, nothing is admitted', async () => {
    const h = await held();
    writeChanges(readChanges()!.map((r) => (r.id === h.id ? { ...r, metaVersion: 'x' as unknown as number } : r)));
    expect(await h.update({ v: 1 }, 0)).toBe(false);
    expect(await holdAttempt('keys:copy:k1', { by: 'keys:copy' })).toMatchObject({ ok: false, code: 'NOT_DURABLE' });
  });
  it('a release() called while the update waits for the lock refuses it', async () => {
    const h = await held();
    const open = holdStoreLock();
    const u = h.update({ v: 1 }, 0);
    h.release();
    open();
    expect(await u).toBe(false);
    await settle();
    expect(readChanges()).toEqual([]);
  });
  it('a free() called while the update waits for the lock refuses it', async () => {
    const h = await answered();
    const open = holdStoreLock();
    const u = h.update({ v: 1 }, 0, { sending: true });
    const f = h.free('dismissed', { metaVersion: 0 });
    open();
    expect(await u).toBe(false);
    expect(await f).toBe('freed');
    expect(readChanges()).toEqual([]);
    expect(heldAttempts()).toEqual([]);
  });
  it('a sent() called while a sending update waits ends that beat again: not in flight', async () => {
    const h = await answered();
    const open = holdStoreLock();
    const u = h.update({ v: 1 }, 0, { sending: true });
    h.sent();
    open();
    expect(await u).toBe(true);
    await vi.waitFor(() => expect(stored(h.id)!.sending).toBeUndefined());
    expect(heldAttempts('keys:create')).toMatchObject([{ inFlight: false, metaVersion: 1 }]);
  });
  it('a sending update after the sign-out purge dropped this tab\'s copy is refused (no beat without a copy)', async () => {
    const h = await answered();
    attemptsAuthPurge({ reason: 'signout', uid: UID });
    expect(await h.update({ v: 1 }, 0, { sending: true })).toBe(false);
    expect(stored(h.id)!.sending).toBeUndefined();
  });
  it('a legacy release() whose removal storage refused leaves a disposed handle: its update is false', async () => {
    const h = await held();
    refusingWrites();
    h.release();
    await settle();
    setChangeStoreAdapter(null);
    expect(stored(h.id)).toBeDefined();
    expect(await h.update({ v: 1 }, 0)).toBe(false);
  });
});

describe('free(kind, expectVersion) removes only the checked state, for the account and sender the handle was built for', () => {
  it('a plain free resolves freed, and a clean read shows the record gone', async () => {
    const h = await answered();
    expect(await h.free('done', { metaVersion: 0 })).toBe('freed');
    expect(readChanges()).toEqual([]);
    expect(heldAttempts()).toEqual([]);
    expect(await h.free('done', { metaVersion: 0 })).toBe('freed'); // a second call answers the first one's outcome
  });
  it('the sender\'s handle after a reload frees too; one whose record is already gone answers freed', async () => {
    const h = await answered();
    reload();
    const back = attemptFor(h.id, 'keys:create')!;
    reload();
    const other = attemptFor(h.id, 'keys:create')!;
    expect(await back.free('dismissed', { metaVersion: 0 })).toBe('freed');
    expect(await other.free('dismissed', { metaVersion: 0 })).toBe('freed');
    expect(readChanges()).toEqual([]);
  });
  it('an already-gone record under another account is refused, not freed', async () => {
    const h = await answered();
    reload();
    const other = attemptFor(h.id, 'keys:create')!;
    expect(await h.free('done', { metaVersion: 0 })).toBe('freed');
    switchTo(OTHER_ACCT);
    expect(await other.free('done', { metaVersion: 0 })).toBe('refused');
  });
  it('confirmed under A, switched to B while another write holds the store lock: the queued removal is refused, A\'s record kept; it may be tried again', async () => {
    const h = await answered();
    const open = holdStoreLock();
    const p = h.free('dismissed', { metaVersion: 0 });
    switchTo(OTHER_ACCT);
    open();
    expect(await p).toBe('refused');
    expect(stored(h.id)).toBeDefined();
    switchTo(UID);
    expect(heldAttempts('keys:create').map((a) => a.id)).toEqual([h.id]);
    expect(await holdAttempt('keys:create', { by: 'keys:create' })).toMatchObject({ ok: false, code: 'HELD' });
    expect(await h.free('dismissed', { metaVersion: 0 })).toBe('freed');
    expect(readChanges()).toEqual([]);
  });
  it('a read while the free waits keeps this tab\'s copy and beat: refused, the send still out stays in flight and flagged', async () => {
    const h = await held(); // its request is still out (no sent())
    const open = holdStoreLock();
    const p = h.free('dismissed', { metaVersion: 0 });
    expect(heldAttempts('keys:create')).toEqual([]); // hidden while its free waits
    switchTo(OTHER_ACCT);
    open();
    expect(await p).toBe('refused');
    switchTo(UID);
    expect(heldAttempts('keys:create')).toMatchObject([{ id: h.id, inFlight: 'here' }]);
  });
  it('a free of this tab\'s own send not yet answered is refused, read or not, and the beat runs on', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const h = await held();
    const open = holdStoreLock();
    const p = h.free('proved', { metaVersion: 0 });
    heldAttempts();
    open();
    expect(await p).toBe('refused');
    const at = stored(h.id)!.sending!.at;
    await vi.advanceTimersByTimeAsync(SENDING_HEARTBEAT_MS + 50);
    await vi.waitFor(() => expect(stored(h.id)!.sending!.at).toBeGreaterThan(at));
    h.sent();
    await vi.waitFor(() => expect(stored(h.id)!.sending).toBeUndefined());
    expect(await h.free('proved', { metaVersion: 0 })).toBe('freed');
  });
  it('a read while an unresolved free waits keeps the copy: the hold shows again, its stamp untouched', async () => {
    const h = await answered();
    refusingWrites();
    const p = h.free('done', { metaVersion: 0 });
    expect(heldAttempts('keys:create')).toEqual([]);
    expect(await p).toBe('unresolved');
    expect(heldAttempts('keys:create').map((a) => a.id)).toEqual([h.id]);
  });
  it('a free queued behind another tab\'s dispatch (its update from the checked version, with its live stamp) is refused: the dispatch keeps its hold', async () => {
    const a = await answered();
    const open = holdStoreLock();
    // Another tab's update(dispatched, 0, { sending: true }), as it lands in the store under the lock.
    const dispatch = underChangeStore(() => writeChanges(readChanges()!.map((r) => (r.id === a.id
      ? { ...r, attempt: { step: 'dispatched' }, metaVersion: 1, sending: { tab: 'other-tab', at: Date.now() }, t: r.t + 1 } : r))));
    const dismiss = a.free('dismissed', { metaVersion: 0 });
    open();
    expect(await dispatch).toBe(true);
    expect(await dismiss).toBe('refused');
    expect(stored(a.id)).toMatchObject({ attempt: { step: 'dispatched' }, metaVersion: 1 });
    expect(heldAttempts('keys:create')).toMatchObject([{ id: a.id, inFlight: 'elsewhere' }]);
    expect(await holdAttempt('keys:create', { by: 'keys:create' })).toMatchObject({ ok: false, code: 'HELD' });
  });
  it('in one tab, a dispatch queued before another handle\'s free is refused (the free in progress wins); nothing is sent', async () => {
    const a = await answered();
    reload();
    const b = attemptFor(a.id, 'keys:create')!;
    const open = holdStoreLock();
    const dispatch = b.update({ step: 'dispatched' }, 0, { sending: true });
    const dismiss = a.free('dismissed', { metaVersion: 0 });
    open();
    expect(await dispatch).toBe(false);
    expect(await dismiss).toBe('freed');
    expect(readChanges()).toEqual([]);
  });
  it('a stale version is refused even with no request out; the version now shown frees', async () => {
    const h = await answered();
    expect(await h.update({ step: 'checked' }, 0)).toBe(true);
    expect(await h.free('dismissed', { metaVersion: 0 })).toBe('refused');
    expect(stored(h.id)).toBeDefined();
    expect(await h.free('dismissed', { metaVersion: 1 })).toBe('freed');
  });
  it('another tab\'s live sending stamp refuses the free; once that stamp is stale (its tab died mid-send) the person\'s Dismiss frees it', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    const h = await held();
    reload(); // that tab died with its request out: its stamp stays until it ages
    const back = attemptFor(h.id, 'keys:create')!;
    expect(await back.free('dismissed', { metaVersion: 0 })).toBe('refused');
    vi.advanceTimersByTime(SENDING_STALE_MS + 1000);
    expect(await back.free('dismissed', { metaVersion: 0 })).toBe('freed');
    expect(readChanges()).toEqual([]);
  });
  it('this tab\'s own stamp still stored (its sent() write was refused) refuses the free until it is cleared or stale', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    const h = await held();
    refusingWrites();
    h.sent();
    await settle();
    setChangeStoreAdapter(null);
    expect(stored(h.id)!.sending).toBeDefined();
    expect(heldAttempts('keys:create')).toMatchObject([{ id: h.id, inFlight: false }]);
    expect(await h.free('done', { metaVersion: 0 })).toBe('refused');
    expect(stored(h.id)).toBeDefined();
    vi.advanceTimersByTime(SENDING_STALE_MS + 1000);
    expect(await h.free('done', { metaVersion: 0 })).toBe('freed');
    expect(readChanges()).toEqual([]);
  });
  it('this tab\'s own send not yet answered refuses the free and stays here even once its stamp aged (missed beats)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    const h = await held();
    vi.advanceTimersByTime(SENDING_STALE_MS + 1000); // no beat ran: the stamp is stale, the send is still out here
    expect(heldAttempts('keys:create')).toMatchObject([{ id: h.id, inFlight: 'here' }]);
    expect(await h.free('proved', { metaVersion: 0 })).toBe('refused');
    expect(stored(h.id)).toBeDefined();
  });
  it('a record whose stored sender is another one is refused, nothing written', async () => {
    const h = await answered();
    writeChanges(readChanges()!.map((r) => (r.id === h.id ? { ...r, meta: { ...r.meta!, by: 'home' } } : r)));
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    expect(await h.free('done', { metaVersion: 0 })).toBe('refused');
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
  });
  it('storage that cannot be read resolves unresolved and writes nothing', async () => {
    const h = await answered();
    let wrote = false;
    setChangeStoreAdapter({ read: () => { throw new Error('gone'); }, write: () => { wrote = true; return true; } });
    expect(await h.free('done', { metaVersion: 0 })).toBe('unresolved');
    expect(wrote).toBe(false);
  });
});

describe('where a request is out, and the legacy release', () => {
  it('inFlight is here for this tab\'s own send, elsewhere for another tab\'s live stamp, false once answered or stale', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    const h = await held();
    expect(heldAttempts('keys:create')).toMatchObject([{ id: h.id, inFlight: 'here' }]);
    reload(); // this tab's view after a reload: the stamp belongs to the tab that died
    expect(heldAttempts('keys:create')).toMatchObject([{ id: h.id, inFlight: 'elsewhere' }]);
    vi.advanceTimersByTime(SENDING_STALE_MS + 1000);
    expect(heldAttempts('keys:create')).toMatchObject([{ id: h.id, inFlight: false }]);
  });
  it('a view read while a legacy release() waits does not keep the freed hold listed once storage stops reading', async () => {
    const h = await answered();
    const open = holdStoreLock();
    h.release();
    expect(heldAttempts('keys:create')).toEqual([]);
    open();
    await vi.waitFor(() => expect(readChanges()).toEqual([]));
    setChangeStoreAdapter({ read: () => { throw new Error('gone'); }, write: () => false });
    expect(heldAttempts('keys:create')).toEqual([]);
  });
});
