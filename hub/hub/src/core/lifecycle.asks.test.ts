// signOutForgettingAsks: the warned sign-out drops the script asks its warning showed (one dropScriptAsks, bound to
// the account the warning was for), then runs signOutForgetting whatever the drop answered (a person is
// never kept signed in by a local drop). An ask the drop could not remove stays stored for that account (C9: no
// purge drops an ask whose outcome is unknown). The drop is checked against `account` under the store lock,
// and the result is signOutForgetting's verdict.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setIdentity, snapshot } from './ctx';
import { holdAttempt } from './attempts';
import { configureLifecycle, initLive, signOutForgettingAsks, signOutHolds } from './lifecycle';
import { dropScriptAsks, putScriptAsk, readScriptAsks, SCRIPT_ASKS_KEY, useScriptAsksVersion, type ScriptAsk } from './script-asks';
import { boot, OTHER, R1, settle, signIn, UID } from './test/env';

const ask = (askId: string, o: Partial<ScriptAsk> = {}): ScriptAsk => ({
  askId, compId: 'comp-1', path: 'scripts/a.ts', realm: R1, owner: null, sessionId: null, turnId: null,
  phase: 'create', sentAt: 1000, createKey: 'hub-ck-' + askId, turnKey: 'hub-tk-' + askId, ...o,
});
const stored = () => JSON.parse(localStorage.getItem(SCRIPT_ASKS_KEY) ?? 'null') as { v: number; accounts: Record<string, ScriptAsk[]> } | null;

function tab(o: { identity?: boolean } = {}): { navs: string[] } {
  boot({ realm: R1, ...o });
  const w = { navs: [] as string[] };
  configureLifecycle({ navigate: (u) => w.navs.push(u), loginPath: '/auth/login', herePath: () => '/auth/home' });
  initLive();
  (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
  return w;
}
afterEach(() => { delete (window as { HubBootToken?: unknown }).HubBootToken; vi.restoreAllMocks(); });

describe('signOutForgettingAsks', () => {
  it("drops the asks the warning showed, then signs out; another account's asks and an ask not shown stay", async () => {
    const w = tab();
    await settle();
    setIdentity({ id: OTHER, banned: false });
    expect(await putScriptAsk(ask('o1'), null)).toBe('ok');
    setIdentity({ id: UID, banned: false });
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    expect(await putScriptAsk(ask('a2'), null)).toBe('ok');
    const shown = readScriptAsks(UID) as ScriptAsk[];
    expect(await putScriptAsk(ask('a3'), null)).toBe('ok'); // stored after the warning was read: not shown
    expect(await signOutForgettingAsks(UID, signOutHolds(), shown, { minWaitMs: 0 })).toEqual({ result: 'done', asksDropped: 'ok' });
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(stored()?.accounts[UID]).toEqual([ask('a3')]);
    expect(stored()?.accounts[OTHER]).toEqual([ask('o1')]);
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('a drop that cannot remove them (an ask changed since the warning) never blocks: signed out, nothing removed', async () => {
    const w = tab();
    await settle();
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    expect(await putScriptAsk(ask('a2'), null)).toBe('ok');
    const shown = readScriptAsks(UID) as ScriptAsk[];
    expect(await putScriptAsk(ask('a1', { phase: 'turn', turnId: 't1' }), ask('a1'))).toBe('ok');
    expect(await signOutForgettingAsks(UID, signOutHolds(), shown, { minWaitMs: 0 })).toEqual({ result: 'done', asksDropped: 'changed' });
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    // One write or none: the unchanged a2 stays too (never a part).
    expect(stored()?.accounts[UID]).toEqual([ask('a1', { phase: 'turn', turnId: 't1' }), ask('a2')]);
  });

  it('another account shown when it starts: its asks stay untouched (account_changed) and nobody is signed out', async () => {
    const w = tab();
    await settle();
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    const shown = readScriptAsks(UID) as ScriptAsk[];
    setIdentity({ id: OTHER, banned: false });
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok'); // OTHER's own ask, field for field the same record
    expect(await signOutForgettingAsks(UID, signOutHolds(), shown, { minWaitMs: 0 })).toEqual({ result: 'changed', asksDropped: 'account_changed' });
    await settle();
    expect(stored()?.accounts[OTHER]).toEqual([ask('a1')]);
    expect(stored()?.accounts[UID]).toEqual([ask('a1')]);
    expect(w.navs).toEqual([]);
  });

  it("no identity loaded, the stored session swapped to B before its storage event; B's asks stay untouched", async () => {
    tab({ identity: false });
    await settle();
    setIdentity(null); // the identity read has not answered: the account comes from the stored session
    expect(snapshot().account).toBe(UID); // and the snapshot is cached with it
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    const shown = readScriptAsks(UID) as ScriptAsk[];
    expect(shown).toEqual([ask('a1')]);
    signIn(OTHER, 'sid0000000000002'); // another tab signed in as B; this tab has not seen the storage event yet
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok'); // B's own ask, field for field the same record
    const r = await signOutForgettingAsks(UID, signOutHolds(), shown, { minWaitMs: 0 });
    expect(r.asksDropped).toBe('account_changed');
    expect(stored()?.accounts[OTHER]).toEqual([ask('a1')]);
    expect(stored()?.accounts[UID]).toEqual([ask('a1')]);
  });

  it('the account changes while the drop waits for the store lock: nothing is removed from either account', async () => {
    tab();
    await settle();
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    const shown = readScriptAsks(UID) as ScriptAsk[];
    // B's own ask, field for field the same record, already stored.
    const v = stored()!;
    localStorage.setItem(SCRIPT_ASKS_KEY, JSON.stringify({ v: 1, accounts: { ...v.accounts, [OTHER]: [ask('a1')] } }));
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    void (navigator as unknown as { locks: { request: (n: string, cb: () => Promise<void>) => Promise<void> } }).locks.request('hub_changes', () => gate);
    const out = signOutForgettingAsks(UID, signOutHolds(), shown, { minWaitMs: 0 });
    await settle();
    setIdentity({ id: OTHER, banned: false }); // another account shows while the drop waits
    release();
    const r = await out;
    expect(r).toEqual({ result: 'changed', asksDropped: 'account_changed' });
    expect(stored()?.accounts[OTHER]).toEqual([ask('a1')]);
    expect(stored()?.accounts[UID]).toEqual([ask('a1')]);
  });

  it('an empty warning drops nothing and answers ok; a drop storage refuses answers refused and the sign-out still runs', async () => {
    const w = tab();
    await settle();
    expect(await signOutForgettingAsks(UID, signOutHolds(), [], { minWaitMs: 0 })).toEqual({ result: 'done', asksDropped: 'ok' });
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));

    const w2 = tab();
    await settle();
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    const shown = readScriptAsks(UID) as ScriptAsk[];
    const real = { set: localStorage.setItem.bind(localStorage), remove: localStorage.removeItem.bind(localStorage) };
    const setSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => { if (k === SCRIPT_ASKS_KEY) throw new Error('quota'); real.set(k, v); });
    const removeSpy = vi.spyOn(localStorage, 'removeItem').mockImplementation((k: string) => { if (k === SCRIPT_ASKS_KEY) throw new Error('refused'); real.remove(k); });
    const r = await signOutForgettingAsks(UID, signOutHolds(), shown, { minWaitMs: 0 });
    setSpy.mockRestore();
    removeSpy.mockRestore();
    expect(r.asksDropped).toBe('refused');
    expect(r.result).toBe('done');
    await vi.waitFor(() => expect(w2.navs).toEqual(['/auth/login']));
    expect(stored()?.accounts[UID]).toEqual([ask('a1')]);
  });
});

describe('script asks for the warning', () => {
  it("readScriptAsks(account) reads only the shown account's asks; another account reads empty", async () => {
    tab();
    await settle();
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    expect(readScriptAsks(UID)).toEqual([ask('a1')]);
    expect(readScriptAsks(OTHER)).toEqual([]);
  });

  it('readScriptAsks for an account not shown reads empty even when storage is corrupt or refused; the shown one reads unreadable', async () => {
    tab();
    await settle();
    localStorage.setItem(SCRIPT_ASKS_KEY, '{not json');
    expect(readScriptAsks(OTHER)).toEqual([]);
    expect(readScriptAsks(UID)).toBe('unreadable');
    localStorage.removeItem(SCRIPT_ASKS_KEY);
    const real = localStorage.getItem.bind(localStorage);
    const getSpy = vi.spyOn(localStorage, 'getItem').mockImplementation((k: string) => { if (k === SCRIPT_ASKS_KEY) throw new Error('refused'); return real(k); });
    try {
      expect(readScriptAsks(OTHER)).toEqual([]);
      expect(readScriptAsks(UID)).toBe('unreadable');
    } finally { getSpy.mockRestore(); }
  });

  it('dropScriptAsks for an account not shown answers account_changed at once, without waiting for a held store lock', async () => {
    tab();
    await settle();
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const held = (navigator as unknown as { locks: { request: (n: string, cb: () => Promise<void>) => Promise<void> } }).locks.request('hub_changes', () => gate);
    let got: string | undefined;
    void dropScriptAsks([ask('a1')], OTHER).then((r) => { got = r; });
    await settle();
    expect(got).toBe('account_changed'); // answered while the lock is still held
    release();
    await held;
    expect(stored()?.accounts[UID]).toEqual([ask('a1')]);
  });

  it("dropScriptAsks with another account removes nothing (account_changed)", async () => {
    tab();
    await settle();
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    expect(await dropScriptAsks([ask('a1')], OTHER)).toBe('account_changed');
    expect(stored()?.accounts[UID]).toEqual([ask('a1')]);
  });

  it("useScriptAsksVersion moves on this tab's write and on another tab's storage event", async () => {
    tab();
    await settle();
    const h = renderHook(() => useScriptAsksVersion());
    const v0 = h.result.current;
    await act(async () => { expect(await putScriptAsk(ask('a1'), null)).toBe('ok'); });
    const v1 = h.result.current;
    expect(v1).toBeGreaterThan(v0);
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: SCRIPT_ASKS_KEY })); });
    expect(h.result.current).toBeGreaterThan(v1);
    h.unmount();
  });
});

describe('signOutForgetting: work started from this tab while it runs', () => {
  it('not covered when it starts: changed, the shown asks stay, nobody signed out', async () => {
    const w = tab();
    await settle();
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    const h = await holdAttempt('keys:create', { by: 'keys:create' });
    if (!h.ok) throw new Error('not held');
    h.hold.sent();
    await settle();
    const holds = signOutHolds();
    expect(holds).toHaveLength(1);
    const shown = readScriptAsks(UID) as ScriptAsk[];
    expect(await signOutForgettingAsks(UID, holds, shown, { minWaitMs: 0 }, () => false)).toEqual({ result: 'changed', asksDropped: 'not_run' });
    expect(stored()?.accounts[UID]).toEqual([ask('a1')]);
    // Nothing forgotten: the shown hold is still stored.
    expect(signOutHolds()).toEqual(holds);
    await settle();
    expect(w.navs).toEqual([]);
    expect(localStorage.getItem('access_token')).not.toBeNull();
  });

  it('covered at the start, not right before the sign-out (work started while the forget waited): changed, no sign-out', async () => {
    const w = tab();
    await settle();
    const reads: boolean[] = [];
    const still = () => { const ok = reads.length === 0; reads.push(ok); return ok; };
    expect(await signOutForgettingAsks(UID, signOutHolds(), [], { minWaitMs: 0 }, still)).toEqual({ result: 'changed', asksDropped: 'ok' });
    // Nothing was shown, so nothing can be forgotten: no `forgot`.
    expect(reads).toEqual([true, false]);
    await settle();
    expect(w.navs).toEqual([]);
    expect(snapshot().loggingOut).toBe(false);
  });

  it('a check that throws is not covered; covered both times signs out', async () => {
    const w = tab();
    await settle();
    expect((await signOutForgettingAsks(UID, signOutHolds(), [], { minWaitMs: 0 }, () => { throw new Error('x'); })).result).toBe('changed');
    expect((await signOutForgettingAsks(UID, signOutHolds(), [], { minWaitMs: 0 }, () => true)).result).toBe('done');
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
  });
});
