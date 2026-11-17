// script-asks.ts: the scripts writer's unsettled asks, per account in one registered key, under the store lock,
// never written over a value it cannot read, bounded without ever pushing an ask out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setIdentity, startLoggingOut } from './ctx';
import { registryEntry } from './registry';
import {
  claimScriptAsk, dropScriptAsk, dropScriptAsks, putScriptAsk, readScriptAsks, subscribeScriptAsks, validScriptAsk,
  SCRIPT_ASKS_KEY, SCRIPT_ASKS_MAX, SCRIPT_ASKS_MAX_BYTES, SCRIPT_ASK_STR_MAX, type ScriptAsk,
} from './script-asks';
import { boot, R1, UID } from './test/env';

const OTHER = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ask = (askId: string, o: Partial<ScriptAsk> = {}): ScriptAsk => ({
  askId, compId: 'comp-1', path: 'scripts/a.ts', realm: R1, owner: null, sessionId: null, turnId: null,
  phase: 'create', sentAt: 1000, createKey: 'hub-ck-' + askId, turnKey: 'hub-tk-' + askId, ...o,
});
const raw = () => localStorage.getItem(SCRIPT_ASKS_KEY);
const stored = () => JSON.parse(raw() ?? 'null') as { v: number; accounts: Record<string, ScriptAsk[]> } | null;
const switchTo = (id: string) => setIdentity({ id, banned: false });
// Holds the store's lock itself (navigator.locks 'hub_changes', the one underChangeStore takes) until open() is called.
// underChangeStore cannot hold it: it refuses an async callback and lets go at once. Requested first, granted first.
const holdStoreLock = (): (() => void) => {
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  void navigator.locks.request('hub_changes', () => gate);
  return open;
};
// Lets every queued microtask and timer of this turn run: a write behind the held lock has done all it can.
const settle = () => new Promise<void>((r) => { setTimeout(r, 0); });

beforeEach(() => { boot({ realm: R1 }); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('script asks: the stored list of the shown account', () => {
  it('the key is registered purge:false, forget:true', () => {
    expect(registryEntry('local', SCRIPT_ASKS_KEY)).toEqual({ area: 'local', key: SCRIPT_ASKS_KEY, purge: false, forget: true });
  });
  it('put stores, upserts by askId and reads oldest first; drop removes; the last drop removes the key', async () => {
    expect(readScriptAsks()).toEqual([]);
    expect(await putScriptAsk(ask('a2', { sentAt: 2000 }), null)).toBe('ok');
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    expect(await putScriptAsk(ask('a2', { sentAt: 2000, phase: 'turn', turnId: 't1' }), ask('a2', { sentAt: 2000 }))).toBe('ok');
    expect(readScriptAsks()).toEqual([ask('a1'), ask('a2', { sentAt: 2000, phase: 'turn', turnId: 't1' })]);
    expect(stored()).toEqual({ v: 1, accounts: { [UID]: [ask('a2', { sentAt: 2000, phase: 'turn', turnId: 't1' }), ask('a1')] } });
    expect(await dropScriptAsk(ask('a2', { sentAt: 2000, phase: 'turn', turnId: 't1' }))).toBe('ok');
    expect(await dropScriptAsk(ask('gone'))).toBe('ok');
    expect(readScriptAsks()).toEqual([ask('a1')]);
    expect(await dropScriptAsk(ask('a1'))).toBe('ok');
    expect(raw()).toBeNull();
  });
  it('the record is a copy of exactly its fields: a caller mutating its object later changes nothing stored', async () => {
    const r = { ...ask('a1') };
    expect(await putScriptAsk(r, null)).toBe('ok');
    (r as { phase: string }).phase = 'read';
    expect(readScriptAsks()).toEqual([ask('a1')]);
  });
  it('a record outside the shape is refused unsent: an extra field (a prompt), a long string, a bad phase or time', async () => {
    expect(await putScriptAsk({ ...ask('a1'), prompt: 'hello' } as unknown as ScriptAsk, null)).toBe('invalid');
    expect(await putScriptAsk(ask('x'.repeat(SCRIPT_ASK_STR_MAX + 1)), null)).toBe('invalid');
    expect(await putScriptAsk(ask('a1', { path: '' }), null)).toBe('invalid');
    expect(await putScriptAsk(ask('a1', { phase: 'done' as never }), null)).toBe('invalid');
    expect(await putScriptAsk(ask('a1', { sentAt: -1 }), null)).toBe('invalid');
    expect(await putScriptAsk(ask('a1', { sentAt: Number.NaN }), null)).toBe('invalid');
    const { turnKey: _t, ...missing } = ask('a1');
    expect(await putScriptAsk(missing as ScriptAsk, null)).toBe('invalid');
    expect(await dropScriptAsk(ask(''))).toBe('invalid');
    expect(await putScriptAsk(ask('a1'), ask('a2'))).toBe('invalid'); // prev of another ask
    expect(raw()).toBeNull();
    expect(validScriptAsk(ask('ok', { owner: 'u1', sessionId: 's1' }))).toBe(true);
  });
  it('each account sees and writes only its own list; another account\'s asks stay byte for byte', async () => {
    expect(await putScriptAsk(ask('mine'), null)).toBe('ok');
    switchTo(OTHER);
    expect(readScriptAsks()).toEqual([]);
    expect(await putScriptAsk(ask('theirs'), null)).toBe('ok');
    expect(await dropScriptAsk(ask('mine'))).toBe('ok'); // not this account's: nothing of UID's is touched
    switchTo(UID);
    expect(readScriptAsks()).toEqual([ask('mine')]);
    expect(stored()!.accounts[OTHER]).toEqual([ask('theirs')]);
  });
  it('no account shown, or the account going, refuses every write; a read shows nothing for no account', async () => {
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    startLoggingOut();
    expect(await putScriptAsk(ask('a2'), null)).toBe('no_account');
    expect(await dropScriptAsk(ask('a1'))).toBe('no_account');
    expect(stored()!.accounts[UID]).toEqual([ask('a1')]);
  });
  it('an account switch while the write waits for the lock refuses it: nothing lands under the account now shown', async () => {
    const open = holdStoreLock();
    const p = putScriptAsk(ask('a1'), null);
    switchTo(OTHER);
    open();
    expect(await p).toBe('no_account');
    expect(raw()).toBeNull();
  });
  it('two writes from two tabs both land: each reads the list under the lock', async () => {
    const [a, b] = await Promise.all([putScriptAsk(ask('a1'), null), putScriptAsk(ask('a2', { sentAt: 2000 }), null)]);
    expect([a, b]).toEqual(['ok', 'ok']);
    expect((readScriptAsks() as ScriptAsk[]).map((r) => r.askId)).toEqual(['a1', 'a2']);
  });
});

describe('script asks: every write is a compare-and-set on the caller\'s read', () => {
  it('a new ask lands only when none of its askId is stored; an update only over the exact record read', async () => {
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    expect(await putScriptAsk(ask('a1', { phase: 'turn' }), null)).toBe('changed');
    expect(await putScriptAsk(ask('a1', { phase: 'turn' }), ask('a1', { phase: 'lost' }))).toBe('changed');
    expect(await putScriptAsk(ask('a1', { phase: 'turn' }), ask('a1'))).toBe('ok');
    expect(readScriptAsks()).toEqual([ask('a1', { phase: 'turn' })]);
  });
  it('a tab on an older read never moves an ask back: the second of two updates from one read is changed', async () => {
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    const [x, y] = await Promise.all([putScriptAsk(ask('a1', { phase: 'lost' }), ask('a1')), putScriptAsk(ask('a1', { phase: 'turn' }), ask('a1'))]);
    expect([x, y]).toEqual(['ok', 'changed']);
    expect(readScriptAsks()).toEqual([ask('a1', { phase: 'lost' })]);
  });
  it('a tab on an older read never brings back an ask another tab dropped', async () => {
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    expect(await dropScriptAsk(ask('a1'))).toBe('ok');
    expect(await putScriptAsk(ask('a1', { phase: 'wait' }), ask('a1'))).toBe('changed');
    expect(raw()).toBeNull();
  });
  it('a drop of an ask that moved since the read is changed, and a batch drop removes all or none', async () => {
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    expect(await putScriptAsk(ask('a2', { sentAt: 2000 }), null)).toBe('ok');
    expect(await putScriptAsk(ask('a2', { sentAt: 2000, phase: 'turn' }), ask('a2', { sentAt: 2000 }))).toBe('ok');
    expect(await dropScriptAsks([ask('a1'), ask('a2', { sentAt: 2000 })])).toBe('changed');
    expect(readScriptAsks()).toHaveLength(2);
    expect(await dropScriptAsks([ask('a1'), ask('a2', { sentAt: 2000, phase: 'turn' }), ask('gone')])).toBe('ok');
    expect(raw()).toBeNull();
  });
  it('the sign-out starting while a write waits for the lock refuses it', async () => {
    const open = holdStoreLock();
    const p = putScriptAsk(ask('a1'), null);
    startLoggingOut();
    open();
    expect(await p).toBe('no_account');
    expect(raw()).toBeNull();
  });
  it('an inherited spec field does not pass for an own one', async () => {
    const { turnKey, ...own } = ask('a1');
    const rec = Object.assign(Object.create({ turnKey }), own, { extra: 'x' }) as ScriptAsk;
    expect(validScriptAsk(rec)).toBe(false);
    expect(await putScriptAsk(rec, null)).toBe('invalid');
  });
  it('the byte cap counts UTF-8 bytes: non-ASCII paths reach it sooner than characters would', async () => {
    const wide = (i: number) => ask('w' + i, { path: '\u00e9'.repeat(SCRIPT_ASK_STR_MAX), compId: '\u4e2d'.repeat(SCRIPT_ASK_STR_MAX), sentAt: i });
    let out: string = 'ok', chars = 0;
    for (const acct of ['a'.repeat(24), 'b'.repeat(24), 'c'.repeat(24)]) {
      switchTo(acct);
      for (let i = 0; i < SCRIPT_ASKS_MAX && out === 'ok'; i++) { out = await putScriptAsk(wide(i), null); if (out === 'ok') chars = raw()!.length; }
    }
    expect(out).toBe('too_large');
    expect(chars).toBeLessThan(SCRIPT_ASKS_MAX_BYTES * 0.6); // refused on bytes, well before the character count
    expect(new TextEncoder().encode(raw()!).byteLength).toBeLessThanOrEqual(SCRIPT_ASKS_MAX_BYTES);
  });
});

describe('script asks: claim, the exclusive removal (the loser of a delivery or close does nothing)', () => {
  it('of two concurrent claims of one ask exactly one is ok; the other is changed; the ask is gone', async () => {
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    const outs = await Promise.all([claimScriptAsk(ask('a1')), claimScriptAsk(ask('a1'))]);
    expect([...outs].sort()).toEqual(['changed', 'ok']);
    expect(raw()).toBeNull();
  });
  it('a claim of an ask replaced by another record at its askId, or already gone, is changed and writes nothing', async () => {
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    expect(await putScriptAsk(ask('a1', { phase: 'turn', turnKey: 'hub-tk-new' }), ask('a1'))).toBe('ok');
    const before = raw();
    expect(await claimScriptAsk(ask('a1'))).toBe('changed');
    expect(raw()).toBe(before);
    expect(await claimScriptAsk(ask('a2'))).toBe('changed');
    expect(raw()).toBe(before);
    expect(await claimScriptAsk(ask('a1', { phase: 'turn', turnKey: 'hub-tk-new' }))).toBe('ok');
    expect(raw()).toBeNull();
  });
  it('with `when`: asked while the store is held, false (or a throw) leaves the ask stored and untouched, true removes it', async () => {
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    const before = raw();
    expect(await claimScriptAsk(ask('a1'), () => false)).toBe('changed');
    expect(await claimScriptAsk(ask('a1'), () => { throw new Error('view gone'); })).toBe('changed');
    expect(raw()).toBe(before);
    // the answer is read when the lock is taken, not when the claim is made nor while it waits for the lock
    const open = holdStoreLock();
    let wanted = true;
    const when = vi.fn(() => wanted);
    const claim = claimScriptAsk(ask('a1'), when);
    await settle();
    expect(when).not.toHaveBeenCalled();
    wanted = false;
    open();
    expect(await claim).toBe('changed');
    expect(when).toHaveBeenCalledTimes(1);
    expect(raw()).toBe(before);
    expect(await claimScriptAsk(ask('a1'), () => true)).toBe('ok');
    expect(raw()).toBeNull();
  });
  it('with `when`: it is asked only while the ask is still exactly `prev`; a gone or replaced ask is \'changed\' without asking', async () => {
    let asked = 0;
    expect(await claimScriptAsk(ask('a1'), () => { asked++; return true; })).toBe('changed'); // nothing stored
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    expect(await claimScriptAsk(ask('a1', { phase: 'turn', turnKey: 'hub-tk-other' }), () => { asked++; return true; })).toBe('changed'); // replaced
    expect(asked).toBe(0);
    expect(await claimScriptAsk(ask('a1'), () => { asked++; return true; })).toBe('ok');
    expect(asked).toBe(1);
  });
  it('with `when`: a claim behind another write never leaves room for it to take the ask\'s place', async () => {
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    for (let i = 0; i < SCRIPT_ASKS_MAX - 1; i++) expect(await putScriptAsk(ask('f' + i, { sentAt: 2000 + i }), null)).toBe('ok');
    const before = raw();
    const open = holdStoreLock();
    let wanted = true;
    const when = vi.fn(() => wanted);
    const claim = claimScriptAsk(ask('a1'), when);
    const extra = putScriptAsk(ask('extra', { sentAt: 9000 }), null);
    await settle();
    expect(when).not.toHaveBeenCalled();
    wanted = false; // the view left while both waited
    open();
    expect(await claim).toBe('changed');
    expect(await extra).toBe('full');
    expect(raw()).toBe(before);
    // still wanted when the lock is taken: the claim removes the ask, and the write queued behind it lands in its room
    const open2 = holdStoreLock();
    const claim2 = claimScriptAsk(ask('a1'), () => true);
    const extra2 = putScriptAsk(ask('extra', { sentAt: 9000 }), null);
    open2();
    expect(await claim2).toBe('ok');
    expect(await extra2).toBe('ok');
    expect(stored()!.accounts[UID]!.some((r) => r.askId === 'a1')).toBe(false);
    expect(stored()!.accounts[UID]!.some((r) => r.askId === 'extra')).toBe(true);
  });
  it('a claim leaves the account\'s other asks and other accounts\' lists as they were', async () => {
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    expect(await putScriptAsk(ask('a2', { sentAt: 2000 }), null)).toBe('ok');
    switchTo(OTHER);
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    switchTo(UID);
    expect(await claimScriptAsk(ask('a1'))).toBe('ok');
    expect(readScriptAsks()).toEqual([ask('a2', { sentAt: 2000 })]);
    expect(stored()!.accounts[OTHER]).toEqual([ask('a1')]);
  });
  it('a bad record is invalid; no account, a going account and an unreadable store refuse, nothing written', async () => {
    expect(await claimScriptAsk({ ...ask('a1'), prompt: 'x' } as unknown as ScriptAsk)).toBe('invalid');
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    const open = holdStoreLock();
    const p = claimScriptAsk(ask('a1'));
    startLoggingOut();
    open();
    expect(await p).toBe('no_account');
    expect(stored()!.accounts[UID]).toEqual([ask('a1')]);
    boot({ realm: R1 });
    localStorage.setItem(SCRIPT_ASKS_KEY, '{not json');
    expect(await claimScriptAsk(ask('a1'))).toBe('unreadable');
    expect(raw()).toBe('{not json');
  });
});

describe('script asks: never over a value it cannot read; bounded without pushing out', () => {
  for (const [name, text] of [
    ['text that does not parse', '{oops'],
    ['an empty string', ''],
    ['a newer version', JSON.stringify({ v: 2, accounts: {} })],
    ['a record with an extra field', JSON.stringify({ v: 1, accounts: { [UID]: [{ ...ask('a1'), prompt: 'x' }] } })],
    ['a duplicated askId', JSON.stringify({ v: 1, accounts: { [UID]: [ask('a1'), ask('a1')] } })],
    ['another account\'s bad record', JSON.stringify({ v: 1, accounts: { [OTHER]: [{ askId: 'x' }] } })],
    ['a list over the cap', JSON.stringify({ v: 1, accounts: { [UID]: Array.from({ length: SCRIPT_ASKS_MAX + 1 }, (_, i) => ask('a' + i)) } })],
  ] as const) {
    it(`${name}: reads 'unreadable', and put and drop write nothing`, async () => {
      localStorage.setItem(SCRIPT_ASKS_KEY, text);
      expect(readScriptAsks()).toBe('unreadable');
      expect(await putScriptAsk(ask('a2'), null)).toBe('unreadable');
      expect(await dropScriptAsk(ask('a1'))).toBe('unreadable');
      expect(raw()).toBe(text);
    });
  }
  it('storage that cannot be read: unreadable, nothing written', async () => {
    const set = vi.spyOn(localStorage, 'setItem');
    const get = localStorage.getItem.bind(localStorage);
    const read = vi.spyOn(localStorage, 'getItem').mockImplementation((k: string) => { if (k === SCRIPT_ASKS_KEY) throw new Error('gone'); return get(k); });
    try {
      expect(readScriptAsks()).toBe('unreadable');
      expect(await putScriptAsk(ask('a1'), null)).toBe('unreadable');
      expect(set).not.toHaveBeenCalledWith(SCRIPT_ASKS_KEY, expect.anything());
    } finally { read.mockRestore(); set.mockRestore(); }
  });
  it('a write the browser refuses answers refused and leaves the stored list as it was', async () => {
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    const before = raw();
    const put = localStorage.setItem.bind(localStorage);
    const w = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => { if (k === SCRIPT_ASKS_KEY) throw new Error('quota'); put(k, v); });
    try { expect(await putScriptAsk(ask('a2'), null)).toBe('refused'); } finally { w.mockRestore(); }
    expect(raw()).toBe(before);
  });
  it('no cross-tab lock: uncoordinated, nothing written', async () => {
    const nav = globalThis.navigator as { locks?: unknown };
    const locks = nav.locks;
    Object.defineProperty(nav, 'locks', { value: undefined, configurable: true });
    try {
      expect(await putScriptAsk(ask('a1'), null)).toBe('uncoordinated');
    } finally {
      Object.defineProperty(nav, 'locks', { value: locks, configurable: true });
    }
    expect(raw()).toBeNull();
  });
  it(`past ${SCRIPT_ASKS_MAX} asks for the account a new one is refused (full); none is pushed out, an upsert still lands`, async () => {
    for (let i = 0; i < SCRIPT_ASKS_MAX; i++) expect(await putScriptAsk(ask('a' + i, { sentAt: i }), null)).toBe('ok');
    expect(await putScriptAsk(ask('one-more'), null)).toBe('full');
    expect(readScriptAsks()).toHaveLength(SCRIPT_ASKS_MAX);
    expect(await putScriptAsk(ask('a0', { sentAt: 0, phase: 'wait' }), ask('a0', { sentAt: 0 }))).toBe('ok');
  });
  it(`a value past ${SCRIPT_ASKS_MAX_BYTES} bytes is refused (too_large), nothing pushed out`, async () => {
    const big = (i: number) => ask('k'.repeat(100) + i, { compId: 'c'.repeat(128), path: 'p'.repeat(128), realm: 'r'.repeat(128), owner: 'o'.repeat(128), sessionId: 's'.repeat(128), turnId: 't'.repeat(128), createKey: 'x'.repeat(128), turnKey: 'y'.repeat(128) });
    let out = 'ok', n = 0;
    for (const acct of ['a'.repeat(24), 'b'.repeat(24), 'c'.repeat(24), 'd'.repeat(24)]) {
      switchTo(acct);
      for (let i = 0; i < SCRIPT_ASKS_MAX && out === 'ok'; i++) { out = await putScriptAsk(big(i), null); if (out === 'ok') n++; }
    }
    expect(out).toBe('too_large');
    expect(raw()!.length).toBeLessThanOrEqual(SCRIPT_ASKS_MAX_BYTES);
    const kept = Object.values(stored()!.accounts).reduce((s, l) => s + l.length, 0);
    expect(kept).toBe(n);
  });
  it('another tab\'s change of the key reaches subscribers; other keys do not', () => {
    const fn = vi.fn();
    const off = subscribeScriptAsks(fn);
    window.dispatchEvent(new StorageEvent('storage', { key: 'hub.v3.changes' }));
    window.dispatchEvent(new StorageEvent('storage', { key: SCRIPT_ASKS_KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    off();
    window.dispatchEvent(new StorageEvent('storage', { key: SCRIPT_ASKS_KEY }));
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
