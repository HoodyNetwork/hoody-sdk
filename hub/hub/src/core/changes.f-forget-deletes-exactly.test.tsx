// Sign-out
// forgets only the holds that were SHOWN.
// The warning and the forget share one hold predicate (changeHoldRefs / changeHoldRefsIn); a hold of the account
// that the warning did not show (another tab admitted it after, or swapped one in under the same count) makes the
// forget delete nothing and answer 'changed'. Without Web Locks the forget only finishes when nothing is held.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './changes';
import { CHANGE_STORE_KEY, readChanges, setChangeStoreAdapter, type HoldRef, type StoredChange } from './change-store';
import { snapshot } from './ctx';
import { boot, R1, settle } from './test/env';
import { installTestLocks, removeTestLocks } from './test/locks';

const META = { base: 'lock:case-f.raw', target: null, realm: R1, by: 'q:case-f@case-f.raw' };
const pendingWith = (idem: string) => async (replay: string | undefined) => ({ outcome: 'pending' as const, idem: replay ?? idem });
const reload = (): void => C.reloadChangesForTests();
const announce = (): boolean => window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
type Rec = StoredChange & { t: number };
const raw = (): Rec[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Rec[];
const put = (list: readonly Rec[]): void => localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
const uid = (): string => String(snapshot().account);
const noAttempts = (): HoldRef[] => [];
const forget = (shown: readonly HoldRef[], holdsIn: C.AttemptsForget['holdsIn'] = noAttempts, drop: C.AttemptsForget['drop'] = () => {}) => C.forgetAccountChanges(uid(), shown, { holdsIn, drop });
/** Another tab of the same account admits a hold of another change after this tab's warning was read: its record
 *  lands in storage and this tab has not seen it yet. */
function siblingAdmits(digest: string, o: { nonce?: string; sending?: { tab: string; at: number }; pending?: boolean } = {}): Rec {
  const list = raw();
  const mine = list.find((r) => r.id.startsWith(uid() + '\u0001'))!;
  const t = Math.max(...list.map((r) => r.t)) + 1;
  const id = mine.id.slice(0, mine.id.lastIndexOf('\u0000') + 1) + digest;
  const rec: Rec = { ...mine, id, t, pending: o.pending ?? true, inc: 'sib-inc', nonce: o.nonce ?? 'sib-nonce', ...(o.sending ? { sending: o.sending } : {}) };
  put([...list.filter((r) => r.id !== id), rec]);
  return rec;
}

describe('the forget deletes exactly the holds that were shown', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { setChangeStoreAdapter(null); vi.unstubAllGlobals(); installTestLocks(); });

  it('the warning view and the stored predicate agree: one ref per hold, by id and token; unresolvedChanges() is its count', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    const shown = C.changeHoldRefs();
    expect(shown).toEqual([{ id: expect.any(String) as string, token: C.holdOfLock('s', 'a')!.split('~')[0] }]); // a ref names the send (inc#nonce); a hold adds its outcome nonce
    expect(C.unresolvedChanges()).toBe(shown.length);
    expect(C.changeHoldRefsIn(readChanges()!, uid(), Date.now())).toEqual(shown);
    // Another account's hold is never in this account's set.
    expect(C.changeHoldRefsIn(readChanges()!, 'someone-else', Date.now())).toEqual([]);
  });

  it('a send still out here: the warning counts it, storage holds its sending stamp, both name the same hold', async () => {
    let open!: (v: { outcome: 'pending'; idem: string }) => void;
    const going = C.guarded('s', 'a', () => new Promise<{ outcome: 'pending'; idem: string }>((r) => { open = r; }), META);
    await vi.waitFor(() => expect(raw()).toHaveLength(1));
    expect(raw()[0]!.pending).toBe(false);
    const shown = C.changeHoldRefs();
    expect(shown).toHaveLength(1);
    expect(C.unresolvedChanges()).toBe(1);
    expect(C.changeHoldRefsIn(readChanges()!, uid(), Date.now())).toEqual(shown);
    open({ outcome: 'pending', idem: 'K' });
    await going;
  });

  it('a sibling whose tab died mid-send (a stale stamp) may have sent: a hold, changed', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    const shown = C.changeHoldRefs();
    siblingAdmits('b', { pending: false, sending: { tab: 'dead-tab', at: 1 } });
    expect(await forget(shown)).toBe('changed');
    announce();
    await settle();
    expect(C.changeHoldRefs()).toHaveLength(2); // the warning view agrees once it has read it
  });

  it('sibling admission: a hold admitted after the warning makes the forget delete nothing and answer changed', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    const shown = C.changeHoldRefs();
    siblingAdmits('b');
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    expect(await forget(shown)).toBe('changed');
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    expect(C.isPending('s', 'a')).toBe(true);
    // Re-read and re-shown: the warning now counts both, and the forget of that set finishes.
    announce();
    await settle();
    const again = C.changeHoldRefs();
    expect(again).toHaveLength(2);
    expect(await forget(again)).toBe('done');
    expect(raw()).toEqual([]);
    expect(C.unresolvedChanges()).toBe(0);
  });

  it('a sibling send still out (a live sending stamp, not pending) is a hold too: changed', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    const shown = C.changeHoldRefs();
    siblingAdmits('b', { pending: false, sending: { tab: 'other-tab', at: Date.now() } });
    expect(await forget(shown)).toBe('changed');
    expect(raw()).toHaveLength(2);
  });

  it('swap, another change: the same count, a different hold: changed, nothing deleted', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    const shown = C.changeHoldRefs();
    const swapped = siblingAdmits('b');
    put(raw().filter((r) => r.id === swapped.id)); // a's hold resolved elsewhere, b's admitted: still one hold
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    expect(await forget(shown)).toBe('changed');
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
  });

  it('swap, the same change sent again elsewhere (same id, another token; the store version never decides): changed', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    const shown = C.changeHoldRefs();
    put(raw().map((r) => ({ ...r, nonce: 'replayed-elsewhere', t: r.t + 1 })));
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    expect(await forget(shown)).toBe('changed');
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
  });

  it('a heartbeat (only the store version moves) is still the shown hold: done', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    const shown = C.changeHoldRefs();
    put(raw().map((r) => ({ ...r, t: r.t + 5 })));
    expect(await forget(shown)).toBe('done');
    expect(raw()).toEqual([]);
  });

  it('records outside the predicate (a kept key, no hold) never make it changed, and go with the cleanup', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    const shown = C.changeHoldRefs();
    siblingAdmits('kept', { pending: false });
    const other = { ...raw()[0]!, id: 'someone-else\u0001s\u0000z', t: 99 };
    put([...raw(), other]);
    expect(await forget(shown)).toBe('done');
    expect(raw().map((r) => r.id)).toEqual([other.id]); // only another account's record stays
  });

  it('extra refs in shown (resolved since, or never stored) are a no-op: done', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    const shown = [...C.changeHoldRefs(), { id: uid() + '\u0001s\u0000gone', token: 'x#y' }];
    expect(await forget(shown)).toBe('done');
    expect(raw()).toEqual([]);
  });

  it('attempt holds are judged in the same lock turn: one not shown makes it changed; shown, it is removed', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    const att = { id: 'attempt\u0002' + uid() + '\u0001x', token: 'inc1' };
    put([...raw(), { id: att.id, pending: true, key: null, t: 50 } as Rec]);
    const shown = C.changeHoldRefs();
    const seen: string[] = [];
    const attempts = (list: readonly StoredChange[], account: string): HoldRef[] => {
      seen.push(account);
      return list.some((r) => r.id === att.id) ? [att] : [];
    };
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    expect(await forget(shown, attempts)).toBe('changed');
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    expect(await forget([...shown, att], attempts)).toBe('done');
    expect(raw()).toEqual([]);
    expect(seen).toEqual([uid(), uid()]);
  });

  it('an unreadable store: failed, nothing written', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    const shown = C.changeHoldRefs();
    localStorage.setItem(CHANGE_STORE_KEY, '{not json');
    expect(await forget(shown)).toBe('failed');
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe('{not json');
    expect(C.unresolvedChanges()).toBe(1);
  });

  it('the removal lands, its read-back throws: failed, the exact prior records go back', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    const shown = C.changeHoldRefs();
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    let wrote = false, failed = 0;
    setChangeStoreAdapter({
      read: () => { if (wrote && failed === 0) { failed++; throw new Error('read failed'); } return localStorage.getItem(CHANGE_STORE_KEY); },
      write: (t) => { wrote = true; if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t); return true; },
    });
    expect(await forget(shown)).toBe('failed');
    setChangeStoreAdapter(null);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    reload();
    expect(C.unresolvedChanges()).toBe(1);
  });

  it('an empty account name: failed', async () => {
    expect(await C.forgetAccountChanges('', [], { holdsIn: noAttempts, drop: () => {} })).toBe('failed');
  });
});

describe('the warning and the forget judge the same clean read; unknown never loops on changed', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { setChangeStoreAdapter(null); });
  it('a hold another tab admitted is in the warning at once (a clean read now), before this tab heard of it', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    siblingAdmits('b');
    const shown = C.changeHoldRefs();
    expect(shown).toHaveLength(2);
    expect(C.unresolvedChanges()).toBe(2);
    expect(await forget(shown)).toBe('done');
    expect(raw()).toEqual([]);
  });
  it('after an unknown forget whose removal never landed, the next warning shows the holds again and its forget finishes', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    const shown = C.changeHoldRefs();
    let writes = 0;
    setChangeStoreAdapter({ read: () => localStorage.getItem(CHANGE_STORE_KEY), write: () => (++writes === 1) }); // the removal is reported stored, never lands; the rollback is refused
    expect(await forget(shown)).toBe('unknown');
    setChangeStoreAdapter(null);
    expect(C.isPending('s', 'a')).toBe(false); // this tab dropped it
    const again = C.changeHoldRefs(); // storage still holds it: shown again (no carry-over set)
    expect(again).toEqual(shown);
    expect(await forget(again)).toBe('done');
    expect(raw()).toEqual([]);
  });
  it('after an unknown forget whose removal landed, the next warning is empty and its forget finishes', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    const shown = C.changeHoldRefs();
    let writes = 0;
    setChangeStoreAdapter({ read: () => { if (writes > 0 && writes < 3) throw new Error('read failed'); return localStorage.getItem(CHANGE_STORE_KEY); }, write: (t) => { if (++writes === 1) { if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t); return true; } writes = 3; return false; } });
    expect(await forget(shown)).toBe('unknown');
    setChangeStoreAdapter(null);
    expect(C.changeHoldRefs()).toEqual([]);
    expect(await forget([])).toBe('done');
  });
});

describe('without Web Locks the forget writes nothing and finishes only when nothing is held', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { installTestLocks(); });

  it('no holds (a kept-key record and another account\'s hold stay): done, storage untouched', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    put(raw().map((r) => ({ ...r, pending: false, t: r.t + 1 }))); // released, its key kept
    put([...raw(), { ...raw()[0]!, id: 'someone-else\u0001s\u0000z', pending: true, t: 99 }]);
    reload();
    expect(C.changeHoldRefs()).toEqual([]);
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    removeTestLocks();
    expect(await forget([])).toBe('done');
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
  });

  it('a hold of the account (even a shown one): failed, storage untouched', async () => {
    await C.guarded('s', 'a', pendingWith('KA'), META);
    const shown = C.changeHoldRefs();
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    removeTestLocks();
    expect(await forget(shown)).toBe('failed');
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    expect(C.unresolvedChanges()).toBe(1);
  });

  it('an attempt hold of the account: failed', async () => {
    put([{ id: 'attempt\u0002' + uid() + '\u0001x', pending: true, key: null, t: 1 } as Rec]);
    removeTestLocks();
    expect(await forget([], (list) => list.map((r) => ({ id: r.id, token: 'i' })))).toBe('failed');
  });

  it('an unreadable store: failed', async () => {
    localStorage.setItem(CHANGE_STORE_KEY, '{not json');
    removeTestLocks();
    expect(await forget([])).toBe('failed');
  });
});
