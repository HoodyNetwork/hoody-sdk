// sendingChanges: a change whose request is out
// in one tab is visible to every tab of the same account and view before its answer, so a page that must not overlap
// it (a lifecycle press while a save of the same computer is out) can hold back. heldChanges() lists it once the
// answer left it pending. Rows: another tab's request, before the answer, then held after it; this tab's own;
// another account never sees it; another realm's view never sees a change filed under its realm (All realms and
// account-wide changes still count); a stale stamp moves to held at the re-read and re-renders (useChangesVersion);
// another lock never sees it; the copies are frozen and carry no variables.
// A page mounted before the press lists it unattributed while admission waits, attributed once admitted (the
// notice after admission); a page mounted in tab B follows A's stamp arriving and its answer; no gap at the
// stamp's expiry: it stays sending until the re-read shows it held, so a page reading both lists blocks a different
// lock's press throughout; an older build's live send, unattributed (no identity, key or digest); a send
// recorded without metadata, unattributed, in every lock's list; this tab's request after an account round trip
// (here: true); a shared lock's send without its lock and realm is refused unsent (NOT_WIRED).
// An older build's record stays listed until converted (conversion waiting or refused; a
// partly corrupt read); a send without metadata stays listed once its outcome is unknown; this tab's
// request after a warned Dismiss of its copy, and another tab's later send of the same change beside it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SENDING_STALE_MS, CHANGE_STORE_KEY, readChanges, writeChanges, type StoredChange } from './change-store';
import * as C from './changes';
import { bump, setIdentity, setRealm, snapshot } from './ctx';
import { boot, R1, R2 } from './test/env';
import { removeTestLocks } from './test/locks';

const META = { base: 'lock:computer.lifecycle', target: { project: { id: 'p1' }, container: { id: 'c1' } }, realm: R1, identity: { computer: 'c1' }, by: 'q:lifecycle@computer.lifecycle' };
const reload = (): void => C.reloadChangesForTests(); // another tab on the same storage (a fresh registry and tab id)
const announce = () => window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
// Every held send is answered after its test (a request still out is BUSY in its tab across a boot).
const outs: Array<() => void> = [];
const held = () => {
  let open: (v: { outcome: 'pending'; idem: string }) => void = () => {};
  const p = new Promise<{ outcome: 'pending'; idem: string }>((r) => { open = r; });
  outs.push(() => open({ outcome: 'pending', idem: 'K-after' }));
  return { send: vi.fn((_k: string | undefined) => p), open };
};
const out = async (scope: string, meta: typeof META | (Omit<typeof META, 'realm'> & { realm: string | null }) = META) => {
  const a = held();
  const done = C.guarded(scope, 'd', a.send, meta);
  for (let i = 0; i < 20 && !a.send.mock.calls.length; i++) await Promise.resolve(); // the store lock is granted asynchronously
  expect(a.send).toHaveBeenCalledTimes(1);
  return { ...a, done };
};

// The same send as an older build's tab stores it: no fmt, no nonce of this build.
const asOlder = (r: StoredChange): StoredChange => { const { fmt: _f, oc: _o, ...older } = r; void _f; void _o; return older as StoredChange; };
const lifecycle = (realm: string | null = R1) => ({ sending: C.sendingChanges('computer.lifecycle', { realm }).length, held: C.heldChanges('computer.lifecycle', { realm }).length });

beforeEach(() => { boot({ realm: R1 }); });
afterEach(async () => { vi.useRealTimers(); for (const o of outs.splice(0)) o(); for (let i = 0; i < 50; i++) await Promise.resolve(); });

describe('sendingChanges: another tab\'s request is visible before its answer', () => {
  it('tab B lists tab A\'s request (not held yet); once A\'s answer lands pending, B lists it held and no longer sending', async () => {
    const a = await out(C.realmScoped('s'));
    reload(); // tab B
    expect(C.heldChanges('computer.lifecycle', { realm: R1 })).toEqual([]);
    expect(C.sendingChanges('computer.lifecycle', { realm: R1 })).toEqual([{ identity: { computer: 'c1' }, target: META.target, realm: R1, by: META.by, from: null, here: false, attributed: true }]);
    a.open({ outcome: 'pending', idem: 'KA' });
    await a.done;
    announce();
    expect(C.sendingChanges('computer.lifecycle', { realm: R1 })).toEqual([]);
    expect(C.heldChanges('computer.lifecycle', { realm: R1 })).toEqual([expect.objectContaining({ key: 'KA', identity: { computer: 'c1' } })]);
  });
});

describe('sendingChanges: a page mounted in tab B follows A\'s request', () => {
  it('starts empty; A\'s stamp arriving (storage event) lists it; A\'s answer moves it to held', async () => {
    const a = await out(C.realmScoped('s'));
    const stamped = localStorage.getItem(CHANGE_STORE_KEY);
    localStorage.removeItem(CHANGE_STORE_KEY);
    reload(); // tab B, before A's stamp is stored
    const { result } = renderHook(() => { C.useChangesVersion(); return { sending: C.sendingChanges('computer.lifecycle', { realm: R1 }).length, held: C.heldChanges('computer.lifecycle', { realm: R1 }).length }; });
    expect(result.current).toEqual({ sending: 0, held: 0 });
    localStorage.setItem(CHANGE_STORE_KEY, stamped!);
    act(() => announce());
    expect(result.current).toEqual({ sending: 1, held: 0 });
    a.open({ outcome: 'pending', idem: 'KA' });
    await a.done;
    act(() => announce());
    expect(result.current).toEqual({ sending: 0, held: 1 });
  });
});

describe('sendingChanges: a page mounted before this tab\'s press', () => {
  it('lists the press unattributed while admission waits, attributed once admitted, before the request leaves', async () => {
    const seen: Array<[number, string]> = []; // [version, sending rows as here/attributed] per render
    const last = (): [number, string] => seen[seen.length - 1] ?? [-1, 'none'];
    const { result } = renderHook(() => { const v = C.useChangesVersion(); const rows = C.sendingChanges('computer.lifecycle').map((x) => `${x.here}/${x.attributed}`).join(','); seen.push([v, rows]); return rows; });
    expect(result.current).toBe('');
    let openLock!: () => void;
    const gate = new Promise<void>((r) => { openLock = r; });
    void navigator.locks.request('hub_changes', () => gate); // admission waits for the store lock
    const a = held();
    const v0 = last()[0];
    void C.guarded(C.realmScoped('s'), 'd', a.send, META);
    // The press's own notice renders while admission still waits (guarded() is given the digest): the press is listed, but
    // without metadata yet, so unattributed (a page blocks on it conservatively).
    await act(async () => { for (let i = 0; i < 200 && last()[0] === v0; i++) await new Promise((r) => setTimeout(r, 0)); });
    const pressed = last();
    expect(pressed[0]).toBeGreaterThan(v0);
    expect(pressed[1]).toBe('true/false');
    expect(a.send).not.toHaveBeenCalled();
    await act(async () => { openLock(); for (let i = 0; i < 50 && !a.send.mock.calls.length; i++) await Promise.resolve(); });
    expect(a.send).toHaveBeenCalledTimes(1);
    // Only a notice after admission moves the version past the press's and renders the send attributed.
    expect(last()[0]).toBeGreaterThan(pressed[0]);
    expect(result.current).toBe('true/true');
  });
});

describe('sendingChanges: this tab\'s own request', () => {
  it('listed with here: true while out; gone once answered done', async () => {
    const a = held();
    const done = C.guarded(C.realmScoped('s'), 'd', async (k) => { await a.send(k); return { outcome: 'done' as const }; }, META);
    for (let i = 0; i < 20 && !a.send.mock.calls.length; i++) await Promise.resolve();
    expect(C.sendingChanges('computer.lifecycle')).toEqual([expect.objectContaining({ identity: { computer: 'c1' }, here: true })]);
    a.open({ outcome: 'pending', idem: 'K' });
    await done;
    expect(C.sendingChanges('computer.lifecycle')).toEqual([]);
  });
});

describe('sendingChanges: another account never sees it', () => {
  it('another account on the same storage lists nothing, and the same account signing back in lists it again', async () => {
    await out(C.realmScoped('s'));
    const me = snapshot().account!;
    reload();
    setIdentity({ id: 'someone-else', banned: false });
    bump('account');
    expect(C.sendingChanges('computer.lifecycle')).toEqual([]);
    expect(C.sendingChanges('computer.lifecycle', { realm: 'all' })).toEqual([]);
    setIdentity({ id: me, banned: false });
    bump('account');
    announce();
    expect(C.sendingChanges('computer.lifecycle', { realm: R1 })).toHaveLength(1);
  });
  it('in this tab, the shown identity changing before its bump already hides the account\'s own request', async () => {
    await out(C.realmScoped('s'));
    expect(C.sendingChanges('computer.lifecycle')).toHaveLength(1);
    setIdentity({ id: 'someone-else', banned: false }); // no bump yet: the registry still holds the request
    expect(C.sendingChanges('computer.lifecycle')).toEqual([]);
  });
});

describe('sendingChanges: the realm view', () => {
  it('a change filed under realm R1: R1, All realms and no view list it; R2 too, since its base files across realms', async () => {
    await out(C.realmScoped('s'));
    reload();
    // computer.lifecycle files across realms (power.ts lifecycleLock): a send of it filed under R1 (a build before
    // the flag) is the same computer's change in every view. A base that does not keep the realm filter:
    // changes.acrossrealms.either-filing-honours-other.test.tsx.
    C.declareAcrossRealms('lock:computer.lifecycle');
    expect(C.sendingChanges('computer.lifecycle', { realm: R2 })).toHaveLength(1);
    expect(C.sendingChanges('computer.lifecycle', { realm: R1 })).toHaveLength(1);
    expect(C.sendingChanges('computer.lifecycle', { realm: 'all' })).toHaveLength(1);
    expect(C.sendingChanges('computer.lifecycle')).toHaveLength(1);
  });
  it('an account-wide change (no realm) and one not filed under its realm count in every view', async () => {
    await out('kit', { ...META, realm: null });
    await out('across', { ...META, identity: { computer: 'c2' } });
    reload();
    setRealm(R2); bump('switch');
    expect(C.sendingChanges('computer.lifecycle', { realm: R2 }).map((x) => x.identity)).toEqual(expect.arrayContaining([{ computer: 'c1' }, { computer: 'c2' }]));
  });
});

describe('sendingChanges: a stamp that goes stale', () => {
  it('no gap at its expiry: still sending until the re-read shows it held, so a different lock\'s page stays blocked', async () => {
    vi.useFakeTimers({ now: 10_000 });
    await out(C.realmScoped('s'));
    reload();
    const blocked = (): number => C.sendingChanges('computer.lifecycle', { realm: R1 }).length + C.heldChanges('computer.lifecycle', { realm: R1 }).length;
    expect(C.sendingChanges('computer.lifecycle', { realm: R1 })).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(SENDING_STALE_MS + 10); // past the stamp's window; the re-read (+50 ms) not yet
    expect(Date.now() - 10_000).toBeGreaterThan(SENDING_STALE_MS);
    expect(C.sendingChanges('computer.lifecycle', { realm: R1 })).toHaveLength(1);
    expect(blocked()).toBe(1);
    await vi.advanceTimersByTimeAsync(200); // the re-read
    expect(C.sendingChanges('computer.lifecycle', { realm: R1 })).toEqual([]);
    expect(C.heldChanges('computer.lifecycle', { realm: R1 })).toHaveLength(1);
    expect(blocked()).toBe(1);
  });
  it('leaves the sending list for the held one, and the change version moves so a page re-renders', async () => {
    vi.useFakeTimers({ now: 10_000 });
    await out(C.realmScoped('s'));
    reload(); // the tab that sent is gone (no heartbeat any more); this is another tab
    const { result } = renderHook(() => { C.useChangesVersion(); return C.sendingChanges('computer.lifecycle', { realm: R1 }).length; });
    expect(result.current).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(SENDING_STALE_MS + 200); });
    expect(result.current).toBe(0);
    expect(C.heldChanges('computer.lifecycle', { realm: R1 })).toHaveLength(1);
  });
});

describe('sendingChanges: the lock, and what a page gets', () => {
  it('another lock lists nothing; the copy is deep-frozen and names no variables', async () => {
    await out(C.realmScoped('s'));
    reload();
    expect(C.sendingChanges('scripts.write')).toEqual([]);
    const [x] = C.sendingChanges('computer.lifecycle');
    expect(Object.isFrozen(x)).toBe(true);
    expect(Object.isFrozen(x!.identity)).toBe(true);
    expect(Object.keys(x!).sort()).toEqual(['attributed', 'by', 'from', 'here', 'identity', 'realm', 'target']);
    expect(Object.isFrozen(x!.target)).toBe(true);
    expect(Object.isFrozen((x!.target as { container: object }).container)).toBe(true);
  });
  it('a page link (from) is a frozen copy', async () => {
    await out(C.realmScoped('s'), { ...META, page: 'computers' } as typeof META);
    reload();
    const [x] = C.sendingChanges('computer.lifecycle');
    expect(x!.from).not.toBeNull();
    expect(Object.isFrozen(x!.from)).toBe(true);
  });
});

describe('sendingChanges: an older build\'s live send', () => {
  it('listed unattributed (no identity, target, key or digest) while its stamp is live, for its lock only', async () => {
    await out(C.realmScoped('s'));
    const [r] = readChanges()!;
    // The same send as an older build's tab stores it: no fmt, no nonce of this build; another tab's live stamp.
    const { fmt: _f, oc: _o, ...older } = r!; void _f; void _o;
    reload();
    writeChanges([older as StoredChange]);
    act(() => announce());
    expect(C.heldChanges('computer.lifecycle', { realm: R1 })).toEqual([]);
    expect(C.sendingChanges('computer.lifecycle', { realm: R1 })).toEqual([{ identity: null, target: null, realm: R1, by: undefined, from: null, here: false, attributed: false }]);
    // Its base files across realms (power.ts lifecycleLock): R2 lists it too (the realm filter of a base
    // that does not: changes.acrossrealms.either-filing-honours-other.test.tsx).
    C.declareAcrossRealms('lock:computer.lifecycle');
    expect(C.sendingChanges('computer.lifecycle', { realm: R2 })).toHaveLength(1);
    expect(C.sendingChanges('scripts.write')).toEqual([]);
  });
});

describe('sendingChanges: a send recorded without metadata', () => {
  it('listed unattributed in every lock\'s list and every realm view', async () => {
    const a = held();
    void C.guarded('s', 'd', a.send); // no metadata
    for (let i = 0; i < 20 && !a.send.mock.calls.length; i++) await Promise.resolve();
    reload();
    for (const lock of ['computer.lifecycle', 'scripts.write']) {
      expect(C.sendingChanges(lock, { realm: R2 })).toEqual([{ identity: null, target: null, realm: null, by: undefined, from: null, here: false, attributed: false }]);
    }
  });
});

describe('sendingChanges: this tab\'s request across an account round trip', () => {
  it('still listed here: true after A -> B -> A in the same tab, until its answer', async () => {
    const a = await out(C.realmScoped('s'));
    const me = snapshot().account!;
    setIdentity({ id: 'someone-else', banned: false }); bump('account');
    expect(C.sendingChanges('computer.lifecycle')).toEqual([]);
    setIdentity({ id: me, banned: false }); bump('account');
    expect(C.sendingChanges('computer.lifecycle')).toEqual([expect.objectContaining({ here: true, attributed: true, identity: { computer: 'c1' } })]);
    a.open({ outcome: 'pending', idem: 'KA' });
    await a.done;
    expect(C.sendingChanges('computer.lifecycle')).toEqual([]);
  });
});

describe('sendingChanges: a shared lock\'s send must name its lock and realm', () => {
  it('refused unsent (NOT_WIRED) without metadata, without its realm, or with another lock\'s (a prefix too), nothing stored or listed; with them sent', async () => {
    const scope = C.realmScoped('lock:computer.lifecycle');
    const before = JSON.stringify(readChanges());
    const { realm: _r, ...noRealm } = META; void _r;
    const metas = [undefined, { ...META, base: 'lock:scripts.write' }, { ...META, base: 'lock:computer' }, noRealm as typeof META];
    for (const meta of metas) {
      // Answers at once, so a wrongly admitted press fails here, not by a timeout.
      const send = vi.fn(async () => ({ outcome: 'done' as const }));
      expect(await C.guarded(scope, 'd', send, meta)).toEqual({ outcome: 'not_sent', code: 'NOT_WIRED' });
      expect(send).not.toHaveBeenCalled();
    }
    expect(JSON.stringify(readChanges())).toBe(before);
    expect(C.sendingChanges('computer.lifecycle')).toEqual([]);
    expect(C.sendingChanges('scripts.write')).toEqual([]);
    await out(scope);
    expect(C.sendingChanges('computer.lifecycle')).toEqual([expect.objectContaining({ here: true, attributed: true })]);
  });
});

describe('sendingChanges: an older build\'s record until it is converted', () => {
  it('past its stamp, while its conversion waits for the store lock, it stays listed; converted, it is held, in one notice', async () => {
    vi.useFakeTimers({ now: 10_000 });
    await out(C.realmScoped('s'));
    const older = asOlder(readChanges()![0]!);
    reload();
    writeChanges([older]);
    act(() => announce());
    const seen: number[] = [];
    renderHook(() => { C.useChangesVersion(); const x = lifecycle(); seen.push(x.sending + x.held); });
    expect(lifecycle()).toEqual({ sending: 1, held: 0 });
    let openLock!: () => void;
    void navigator.locks.request('hub_changes', () => new Promise<void>((r) => { openLock = r; }));
    await act(async () => { await vi.advanceTimersByTimeAsync(SENDING_STALE_MS + 200); }); // the stale re-read queues the conversion
    expect(lifecycle()).toEqual({ sending: 1, held: 0 });
    await act(async () => { openLock(); await vi.advanceTimersByTimeAsync(10); });
    expect(lifecycle()).toEqual({ sending: 0, held: 1 });
    expect(seen.every((n) => n === 1)).toBe(true); // no render ever saw it free
  });
  it('a conversion that cannot run (no coordination) leaves it listed past its stamp', async () => {
    vi.useFakeTimers({ now: 10_000 });
    await out(C.realmScoped('s'));
    const older = asOlder(readChanges()![0]!);
    reload();
    writeChanges([older]);
    act(() => announce());
    removeTestLocks();
    await act(async () => { await vi.advanceTimersByTimeAsync(SENDING_STALE_MS + 200); act(() => announce()); });
    expect(lifecycle()).toEqual({ sending: 1, held: 0 });
  });
  it('a partly corrupt read keeps the older records it cannot read; a clean read without one drops it', async () => {
    await out(C.realmScoped('s'));
    await out(C.realmScoped('s2'), { ...META, base: 'lock:scripts.write' });
    const list = readChanges()!.map(asOlder);
    const isLifecycle = (r: StoredChange): boolean => (r.meta as { base?: string } | undefined)?.base === META.base;
    const save = [list.find(isLifecycle)!, list.find((r) => !isLifecycle(r))!];
    reload();
    writeChanges(save);
    act(() => announce());
    expect([lifecycle().sending, C.sendingChanges('scripts.write').length]).toEqual([1, 1]);
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([save[1], { not: 'a record' }])); // the lifecycle one unreadable
    act(() => announce());
    expect([lifecycle().sending, C.sendingChanges('scripts.write').length]).toEqual([1, 1]);
    writeChanges([save[1]!]);
    act(() => announce());
    expect([lifecycle().sending, C.sendingChanges('scripts.write').length]).toEqual([0, 1]);
  });
});

describe('sendingChanges: a send without metadata whose outcome becomes unknown', () => {
  it('stays listed, unattributed, past its stamp (heldChanges cannot show it)', async () => {
    vi.useFakeTimers({ now: 10_000 });
    const a = held();
    void C.guarded('s', 'd', a.send);
    for (let i = 0; i < 20 && !a.send.mock.calls.length; i++) await Promise.resolve();
    reload();
    expect(lifecycle()).toEqual({ sending: 1, held: 0 });
    await vi.advanceTimersByTimeAsync(SENDING_STALE_MS + 200);
    expect(C.isPending('s', 'd')).toBe(true);
    expect(lifecycle()).toEqual({ sending: 1, held: 0 });
  });
  it('stays listed, unattributed, once its answer lands pending', async () => {
    const a = held();
    const done = C.guarded('s', 'd', a.send);
    for (let i = 0; i < 20 && !a.send.mock.calls.length; i++) await Promise.resolve();
    reload();
    a.open({ outcome: 'pending', idem: 'K' });
    await done;
    act(() => announce());
    expect(C.isPending('s', 'd')).toBe(true);
    expect(C.sendingChanges('scripts.write', { realm: R2 })).toEqual([{ identity: null, target: null, realm: null, by: undefined, from: null, here: false, attributed: false }]);
  });
});

describe('sendingChanges: this tab\'s request, whatever became of its registry copy', () => {
  const roundTrip = (me: string): void => {
    setIdentity({ id: 'someone-else', banned: false }); bump('account');
    setIdentity({ id: me, banned: false }); bump('account');
  };
  it('after a warned Dismiss of its re-adopted copy, and another round trip, listed here: true until its answer, which stores nothing', async () => {
    const a = await out(C.realmScoped('s'));
    const me = snapshot().account!;
    roundTrip(me);
    const scope = C.realmScoped('s');
    expect(await C.release(scope, 'd', C.holdOfLock(scope, 'd')!, { warned: true })).toBe(true);
    expect(readChanges()).toEqual([]);
    expect(C.sendingChanges('computer.lifecycle')).toEqual([expect.objectContaining({ here: true, attributed: true, identity: { computer: 'c1' } })]);
    roundTrip(me);
    expect(C.sendingChanges('computer.lifecycle')).toEqual([expect.objectContaining({ here: true, attributed: true })]);
    a.open({ outcome: 'pending', idem: 'KA' });
    await a.done;
    expect(C.sendingChanges('computer.lifecycle')).toEqual([]);
    expect(readChanges()).toEqual([]); // a removed record never comes back
  });
  it('another tab\'s later send of the same change is listed as its own (here: false), beside this tab\'s', async () => {
    await out(C.realmScoped('s'));
    const mine = readChanges()![0]!;
    const me = snapshot().account!;
    roundTrip(me);
    const scope = C.realmScoped('s');
    expect(await C.release(scope, 'd', C.holdOfLock(scope, 'd')!, { warned: true })).toBe(true);
    writeChanges([{ ...mine, inc: 'other-inc', nonce: 'other-nonce', sending: { tab: 'another-tab', at: Date.now() } } as StoredChange]);
    act(() => announce());
    expect(C.sendingChanges('computer.lifecycle').map((x) => x.here).sort()).toEqual([false, true]);
  });
});

describe('sendingChanges: the made-up-metadata rule (madeUpMeta): converted, pending, no sender, target or realm, no lock base (original metadata of exactly that shape is listed too)', () => {
  const PRIVATE = { base: 's', target: null, realm: null, identity: null, by: 'src:notes' } as unknown as typeof META;
  it('an older record with its own metadata (a sender) on a private scope is listed neither before nor after conversion', async () => {
    vi.useFakeTimers({ now: 10_000 });
    await out(C.realmScoped('s'), PRIVATE);
    const older = asOlder(readChanges()![0]!);
    expect(older.meta).toMatchObject({ base: 's', by: 'src:notes' });
    reload();
    writeChanges([older]);
    act(() => announce());
    expect(C.sendingChanges('computer.lifecycle', { realm: R1 })).toEqual([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(SENDING_STALE_MS + 200); }); // stale: the conversion runs
    const after = readChanges()!;
    expect(C.quarantinedDigest(after[0]!.id.slice(after[0]!.id.lastIndexOf('\u0000') + 1))).toBe(true);
    expect(after[0]!.pending).toBe(true);
    expect(C.sendingChanges('computer.lifecycle', { realm: R1 })).toEqual([]);
  });
  it('a record of this build, pending, whose metadata has no sender (never made by the conversion), is not listed', async () => {
    const { by: _b, ...noSender } = PRIVATE as unknown as Record<string, unknown>;
    void _b;
    const a = await out(C.realmScoped('s'), noSender as unknown as typeof META);
    a.open({ outcome: 'pending', idem: 'KD' });
    await a.done;
    reload();
    announce();
    const r = readChanges()!;
    expect(r).toHaveLength(1);
    expect(r[0]!.pending).toBe(true);
    expect(C.quarantinedDigest(r[0]!.id.slice(r[0]!.id.lastIndexOf('\u0000') + 1))).toBe(false);
    expect(C.sendingChanges('computer.lifecycle', { realm: R1 })).toEqual([]);
  });
});

describe('sendingChanges: an older build\'s record without metadata, once converted', () => {
  // The consumer's rule: hold back a press while its lock lists a change sending or held.
  const blocked = (lock: string, realm: string | null = R1): boolean => C.sendingChanges(lock, { realm }).length + C.heldChanges(lock, { realm }).length > 0;
  it('on a private scope it still blocks every lock and realm view after conversion, and a different-lock press holds back', async () => {
    vi.useFakeTimers({ now: 10_000 });
    const a = held();
    void C.guarded(C.realmScoped('s'), 'd', a.send); // no metadata, a private scope
    for (let i = 0; i < 20 && !a.send.mock.calls.length; i++) await Promise.resolve();
    const older = asOlder(readChanges()![0]!);
    expect(older.meta).toBeUndefined();
    reload();
    writeChanges([older]);
    act(() => announce());
    expect(blocked('computer.lifecycle')).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(SENDING_STALE_MS + 200); }); // stale: the conversion runs
    const after = readChanges()!;
    expect(after).toHaveLength(1);
    expect(C.quarantinedDigest(after[0]!.id.slice(after[0]!.id.lastIndexOf('\u0000') + 1))).toBe(true);
    for (const [lock, realm] of [['computer.lifecycle', R1], ['scripts.write', R2], ['computer.lifecycle', null]] as const) expect(blocked(lock, realm)).toBe(true);
    expect(C.sendingChanges('computer.lifecycle', { realm: R1 })).toEqual([{ identity: null, target: null, realm: null, by: undefined, from: null, here: false, attributed: false }]);
    // The consumer's different-lock press: held back, so nothing is sent.
    const b = held();
    if (!blocked('computer.lifecycle')) void C.guarded(C.realmScoped('t'), 'd', b.send, META);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(b.send).not.toHaveBeenCalled();
    expect(after[0]!.meta).toEqual({ base: 's', target: null, realm: null }); // stored as before: made from the scope
  });
  it('on a shared lock\'s scope it converts into a held row of that lock (unchanged)', async () => {
    vi.useFakeTimers({ now: 10_000 });
    const a = held();
    void C.guarded(C.realmScoped('s'), 'd', a.send);
    for (let i = 0; i < 20 && !a.send.mock.calls.length; i++) await Promise.resolve();
    const r = asOlder(readChanges()![0]!);
    const older = { ...r, id: r.id.replace(C.realmScoped('s'), C.realmScoped('lock:computer.lifecycle')) } as StoredChange;
    expect(older.id).not.toBe(r.id);
    reload();
    writeChanges([older]);
    act(() => announce());
    await act(async () => { await vi.advanceTimersByTimeAsync(SENDING_STALE_MS + 200); });
    expect(readChanges()![0]!.meta).toEqual({ base: 'lock:computer.lifecycle', target: null, realm: null });
    expect(lifecycle()).toEqual({ sending: 0, held: 1 });
  });
});

describe('sendingChanges: this tab\'s request without metadata, across an account round trip', () => {
  const roundTrip = (me: string): void => {
    setIdentity({ id: 'someone-else', banned: false }); bump('account');
    setIdentity({ id: me, banned: false }); bump('account');
  };
  it('listed once (here: true), not again from its re-adopted registry copy', async () => {
    const a = held();
    const done = C.guarded('s', 'd', a.send);
    for (let i = 0; i < 20 && !a.send.mock.calls.length; i++) await Promise.resolve();
    roundTrip(snapshot().account!);
    expect(C.sendingChanges('scripts.write', { realm: R2 })).toEqual([{ identity: null, target: null, realm: null, by: undefined, from: null, here: true, attributed: false }]);
    a.open({ outcome: 'pending', idem: 'KA' });
    await done;
    // Answered pending without metadata: the outcome is unknown, so it stays listed, now from the registry.
    expect(C.sendingChanges('scripts.write', { realm: R2 })).toEqual([{ identity: null, target: null, realm: null, by: undefined, from: null, here: false, attributed: false }]);
  });
  it('another tab\'s later send of the same change (another token) keeps its own row beside it; this answer leaves only it', async () => {
    const a = held();
    const done = C.guarded('s', 'd', a.send);
    for (let i = 0; i < 20 && !a.send.mock.calls.length; i++) await Promise.resolve();
    const mine = readChanges()![0]!;
    roundTrip(snapshot().account!);
    expect(await C.release('s', 'd', C.holdOfLock('s', 'd')!, { warned: true })).toBe(true);
    writeChanges([{ ...mine, inc: 'other-inc', nonce: 'other-nonce', sending: { tab: 'another-tab', at: Date.now() } } as StoredChange]);
    act(() => announce());
    expect(C.sendingChanges('scripts.write').map((x) => x.here).sort()).toEqual([false, true]);
    a.open({ outcome: 'pending', idem: 'KA' });
    await done;
    expect(C.sendingChanges('scripts.write').map((x) => x.here)).toEqual([false]);
  });
});
