// pending.ts: identities only, per account and computer, capped, expiring, size-bounded, never throwing, settled only by
// the exact (conn, utt), and gone at sign-out. Runs on the real shared.js storage registry (boot()).
/* eslint-disable no-restricted-globals -- the test reads the stored bytes and plays a browser refusing reads and writes
   (as pages/ai/holds.test.tsx); pending.ts reaches storage only through core */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registryEntry } from '@core/registry';
import { clearAuthTokens } from '@core/session';
import { boot, signIn, OTHER, UID } from '@core/test/env';
import { setIdentity } from '@core/ctx';
import { VOICE_NOTE_TTL_MS as NOTE_TTL_MS, VOICE_NOTES_CAP as NOTES_CAP } from '@kit/pure';
import { createPendingSaver, loadPending, PENDING_KEY, PENDING_MAX_BYTES, savePending, settlePending, type VoiceWhere } from './pending';

const NOW = 1_800_000_000_000;
const C1 = 'c1', C2 = 'c2', R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1', R2 = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const A: VoiceWhere = { computer: C1, realm: R1, bot: 'bot-a' };
const id = (utt: number, at = NOW - 1000, conn = 'conn-1') => ({ conn, utt, at });
const raw = () => JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null');
const notes = (w: VoiceWhere, now = NOW) => {
  const r = loadPending(w, now);
  if (r.s !== 'ok') throw new Error('unreadable');
  return r.notes.map((n) => [n.conn, n.utt]);
};

afterEach(() => vi.restoreAllMocks());

describe('pending voice identities (hub_voice_pending_v1)', () => {
  it('the key is registered: local, purged at sign-out', () => {
    expect(registryEntry('local', PENDING_KEY)).toEqual({ area: 'local', key: PENDING_KEY, purge: true });
  });
  it('round trip: what was saved for a Bot loads back as maybe-sent notes, oldest first', () => {
    boot();
    expect(savePending(A, [id(2, NOW - 500), id(1, NOW - 900)], [], NOW)).toBe('ok');
    expect(loadPending(A, NOW)).toEqual({ s: 'ok', notes: [
      { kind: 'maybeSent', conn: 'conn-1', utt: 1, at: NOW - 900 },
      { kind: 'maybeSent', conn: 'conn-1', utt: 2, at: NOW - 500 },
    ] });
  });
  it('stores exactly {realm, bot, conn, utt, at}: no audio, no text, nothing else a caller passed', () => {
    boot();
    savePending(A, [{ ...id(1), text: 'hello there', pcm: [1, 2, 3], sender: 'me' } as never], [], NOW);
    const s = localStorage.getItem(PENDING_KEY)!;
    expect(s).not.toContain('hello');
    expect(s).not.toContain('pcm');
    expect(s).not.toContain('sender');
    const rows = raw().a[UID][C1].rows;
    expect(rows).toEqual([{ realm: R1, bot: 'bot-a', conn: 'conn-1', utt: 1, at: NOW - 1000 }]);
    // A stored row carrying more (another Bot's, written by anything else) is rewritten with the five fields only.
    const doc = raw();
    doc.a[UID][C1].rows.push({ realm: R1, bot: 'bot-b', conn: 'k', utt: 4, at: NOW - 500, text: 'secret words' });
    localStorage.setItem(PENDING_KEY, JSON.stringify(doc));
    savePending(A, [id(2)], [id(1)], NOW);
    expect(localStorage.getItem(PENDING_KEY)).not.toContain('secret');
    expect(raw().a[UID][C1].rows).toEqual([
      { realm: R1, bot: 'bot-b', conn: 'k', utt: 4, at: NOW - 500 },
      { realm: R1, bot: 'bot-a', conn: 'conn-1', utt: 2, at: NOW - 1000 },
    ].sort((x, y) => x.at - y.at));
  });
  it('one entry per account and computer; realm and Bot ride in the rows; a save changes only its own Bot\'s rows', () => {
    boot();
    const B = { ...A, bot: 'bot-b' }, Ar2 = { ...A, realm: R2 }, Ac2 = { ...A, computer: C2 };
    savePending(A, [id(1)], [], NOW);
    savePending(B, [id(5)], [], NOW);
    savePending(Ar2, [id(7)], [], NOW);
    savePending(Ac2, [id(9)], [], NOW);
    expect(notes(A)).toEqual([['conn-1', 1]]);
    expect(notes(B)).toEqual([['conn-1', 5]]);
    expect(notes(Ar2)).toEqual([['conn-1', 7]]);
    expect(notes(Ac2)).toEqual([['conn-1', 9]]);
    savePending(A, [id(2)], [id(1)], NOW);
    expect(notes(A)).toEqual([['conn-1', 2]]);
    expect(notes(B)).toEqual([['conn-1', 5]]);
    savePending(A, [], [id(2)], NOW);
    expect(notes(A)).toEqual([]);
    expect(notes(B)).toEqual([['conn-1', 5]]);
    expect(Object.keys(raw().a[UID]).sort()).toEqual([C1, C2]);
  });
  it('a save removes only its own Bot\'s rows, also when another Bot holds the same (conn, utt)', () => {
    boot();
    const B = { ...A, bot: 'bot-b' }, Ar2 = { ...A, realm: R2 };
    savePending(A, [id(1)], [], NOW);
    savePending(B, [id(1)], [], NOW);
    savePending(Ar2, [id(1)], [], NOW);
    savePending(A, [], [id(1)], NOW);
    expect(notes(A)).toEqual([]);
    expect(notes(B)).toEqual([['conn-1', 1]]);
    expect(notes(Ar2)).toEqual([['conn-1', 1]]);
  });
  it('another account sees none of them', () => {
    boot();
    savePending(A, [id(1)], [], NOW);
    setIdentity({ id: OTHER, banned: false });
    expect(notes(A)).toEqual([]);
    setIdentity({ id: UID, banned: false });
    expect(notes(A)).toEqual([['conn-1', 1]]);
  });
  it(`keeps the newest ${NOTES_CAP} rows of a computer`, () => {
    boot();
    const many = Array.from({ length: NOTES_CAP + 5 }, (_, i) => id(i + 1, NOW - 100_000 + i));
    savePending(A, many, [], NOW);
    expect(notes(A).map(([, u]) => u)).toEqual(many.slice(-NOTES_CAP).map((x) => x.utt));
    expect(raw().a[UID][C1].rows).toHaveLength(NOTES_CAP);
  });
  it('drops rows 24 h old on save and on load; a row dated in the future is kept by writes and shown once it is due', () => {
    boot();
    savePending(A, [id(1, NOW - NOTE_TTL_MS), id(2, NOW - NOTE_TTL_MS + 1), id(3, NOW + 1), id(5, NOW + NOTE_TTL_MS + 1)], [], NOW);
    expect(raw().a[UID][C1].rows.map((r: { utt: number }) => r.utt)).toEqual([2, 3]);
    expect(notes(A)).toEqual([['conn-1', 2]]);
    expect(notes(A, NOW + 1)).toEqual([['conn-1', 3]]);
    savePending({ ...A, bot: 'bot-b' }, [id(4)], [], NOW + 1);
    expect(raw().a[UID][C1].rows.map((r: { utt: number }) => r.utt)).toEqual([4, 3]);
  });
  it('a clock that moved back drops nobody\'s rows: another Bot\'s save and a settle keep them, and they show when due', () => {
    boot();
    const B = { ...A, bot: 'bot-b' };
    savePending(A, [id(1, NOW - 100), id(2, NOW - 50)], [], NOW);
    const back = NOW - 60_000;
    savePending(B, [id(7, back - 10)], [], back);
    settlePending(B, 'conn-9', 9, back);
    expect(notes(A, back)).toEqual([]);
    expect(notes(A, NOW)).toEqual([['conn-1', 1], ['conn-1', 2]]);
    // This Bot's own save after the jump keeps an identity the machine dated later than the page's clock.
    savePending(A, [id(1, NOW - 100), id(2, NOW - 50), id(3, NOW + 10)], [id(1, NOW - 100), id(2, NOW - 50)], back);
    expect(notes(A, NOW + 10)).toEqual([['conn-1', 1], ['conn-1', 2], ['conn-1', 3]]);
  });
  it('two tabs on one Bot: each save removes only the rows its own caller held', () => {
    boot();
    // Tab 1 runs connection k1, tab 2 connection k2; each saves its machine's list with what it saved before.
    const t1 = [id(1, NOW - 900, 'k1')], t2 = [id(1, NOW - 800, 'k2'), id(2, NOW - 700, 'k2')];
    savePending(A, t1, [], NOW);
    savePending(A, t2, [], NOW);
    expect(notes(A)).toEqual([['k1', 1], ['k2', 1], ['k2', 2]]);
    // Tab 1's next save (a new utterance) leaves tab 2's rows.
    const t1b = [...t1, id(2, NOW - 600, 'k1')];
    savePending(A, t1b, t1, NOW);
    expect(notes(A)).toEqual([['k1', 1], ['k2', 1], ['k2', 2], ['k1', 2]]);
    // Tab 2 settles k2/1 in its machine: only that row goes.
    savePending(A, [t2[1]!], t2, NOW);
    expect(notes(A)).toEqual([['k1', 1], ['k2', 2], ['k1', 2]]);
    // A save never drops a row it did not hold, even an older one of its own connection.
    savePending(A, [], [id(2, NOW - 600, 'k1')], NOW);
    expect(notes(A)).toEqual([['k1', 1], ['k2', 2]]);
    // Saving an identity again replaces its stored row (one row each).
    savePending(A, [id(1, NOW - 500, 'k1')], [], NOW);
    expect(raw().a[UID][C1].rows.filter((r: { conn: string; utt: number }) => r.conn === 'k1' && r.utt === 1)).toHaveLength(1);
  });
  it(`stays within ${PENDING_MAX_BYTES} bytes: the oldest rows go first`, () => {
    boot();
    const big = Array.from({ length: NOTES_CAP }, (_, i) => id(i + 1, NOW - 1000 + i, 'x'.repeat(120) + i));
    savePending(A, big, [], NOW);
    const entry = raw().a[UID][C1];
    expect(JSON.stringify(entry).length).toBeLessThanOrEqual(PENDING_MAX_BYTES);
    expect(entry.rows.length).toBeLessThan(NOTES_CAP);
    expect(entry.rows.at(-1).utt).toBe(NOTES_CAP);
  });
  it('malformed rows and identities are dropped, never thrown on', () => {
    boot();
    savePending(A, [id(1), { conn: '', utt: 2, at: NOW } as never, { conn: 'c', utt: 1.5, at: NOW } as never, { conn: 'c', utt: -1, at: NOW } as never, { conn: 'c d', utt: 3, at: NOW } as never], [], NOW);
    expect(notes(A)).toEqual([['conn-1', 1]]);
    const doc = raw();
    doc.a[UID][C1].rows.push({ realm: R1, bot: 'bot-a', conn: 'k', utt: 'x', at: NOW }, null, 7, { realm: R1, bot: 'bot-a', conn: 'k', utt: 3, at: NOW - 1 });
    localStorage.setItem(PENDING_KEY, JSON.stringify(doc));
    expect(notes(A)).toEqual([['conn-1', 1], ['k', 3]]);
    expect(savePending({ ...A, bot: 'a b' }, [id(1)], [], NOW)).toBe('nostore');
    expect(savePending({ ...A, computer: '' }, [id(1)], [], NOW)).toBe('nostore');
  });
  it('a later layout of the entry (v 2) is never overwritten: a save and a settle leave it as it is', () => {
    boot();
    savePending(A, [id(1)], [], NOW);
    const doc = raw();
    doc.a[UID][C1] = { v: 2, rows: [{ realm: R1, bot: 'bot-b', conn: 'k', utt: 4, at: NOW - 500, extra: 'kept' }] };
    localStorage.setItem(PENDING_KEY, JSON.stringify(doc));
    const before = localStorage.getItem(PENDING_KEY);
    expect(savePending(A, [id(2)], [], NOW)).toBe('same');
    expect(settlePending({ ...A, bot: 'bot-b' }, 'k', 4, NOW)).toBe('same');
    expect(localStorage.getItem(PENDING_KEY)).toBe(before);
    expect(loadPending(A, NOW)).toEqual({ s: 'ok', notes: [] });
  });
  it('a store that throws reads as unreadable, writes nothing and never throws', () => {
    boot();
    savePending(A, [id(1)], [], NOW);
    const before = localStorage.getItem(PENDING_KEY);
    // Only this key fails (as core's own storage tests do); each spy is restored by its handle: restoreAllMocks does
    // not undo a spy on the test environment's localStorage.
    const getItem = Storage.prototype.getItem, setItem = Storage.prototype.setItem;
    const get = vi.spyOn(localStorage, 'getItem').mockImplementation(function (this: Storage, k: string) {
      if (k === PENDING_KEY) throw new Error('denied');
      return getItem.call(this, k);
    });
    const set = vi.spyOn(localStorage, 'setItem');
    try {
      expect(loadPending(A, NOW)).toEqual({ s: 'unreadable' });
      expect(savePending(A, [id(2)], [], NOW)).toBe('unreadable');
      expect(settlePending(A, 'conn-1', 1, NOW)).toBe('unreadable');
      expect(set).not.toHaveBeenCalledWith(PENDING_KEY, expect.anything());
    } finally { get.mockRestore(); set.mockRestore(); }
    const quota = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === PENDING_KEY) throw new Error('quota');
      setItem.call(this, k, v);
    });
    try {
      expect(() => savePending(A, [id(2)], [], NOW)).not.toThrow();
    } finally { quota.mockRestore(); }
    expect(localStorage.getItem(PENDING_KEY)).toBe(before);
  });
  it('signed out, nothing loads and nothing is written', () => {
    boot({ signedIn: false });
    expect(loadPending(A, NOW)).toEqual({ s: 'unreadable' });
    expect(savePending(A, [id(1)], [], NOW)).not.toBe('ok');
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });
  it('settles only the exact (conn, utt) of that Bot: the same utt of another connection or Bot stays', () => {
    boot();
    const B = { ...A, bot: 'bot-b' };
    savePending(A, [id(1), id(2), id(1, NOW - 900, 'conn-2')], [], NOW);
    savePending(B, [id(1)], [], NOW);
    expect(settlePending(A, 'conn-1', 1, NOW)).toBe('ok');
    expect(notes(A)).toEqual([['conn-1', 2], ['conn-2', 1]]);
    expect(notes(B)).toEqual([['conn-1', 1]]);
    expect(settlePending(A, 'conn-9', 2, NOW)).toBe('ok');
    expect(notes(A)).toEqual([['conn-1', 2], ['conn-2', 1]]);
    settlePending(A, 'conn-1', 2, NOW);
    settlePending(A, 'conn-2', 1, NOW);
    settlePending(B, 'conn-1', 1, NOW);
    expect(notes(A)).toEqual([]);
    expect(notes(B)).toEqual([]);
    expect(raw()?.a?.[UID]?.[C1]).toBeUndefined();
  });
  it('the future window: exactly 24 h ahead is kept on write, a moment past it is dropped', () => {
    boot();
    savePending(A, [id(1, NOW + NOTE_TTL_MS), id(2, NOW + NOTE_TTL_MS + 1)], [], NOW);
    expect(raw()?.a?.[UID]?.[C1]?.rows?.map((r: { utt: number }) => r.utt)).toEqual([1]);
    savePending({ ...A, bot: 'bot-b' }, [id(3)], [], NOW);
    expect(raw().a[UID][C1].rows.map((r: { utt: number }) => r.utt)).toEqual([3, 1]);
  });
  it('a saver holds what it loaded: a future row the load left out survives its own saves', () => {
    boot();
    savePending(A, [id(1, NOW - 100), id(2, NOW + 5000)], [], NOW);
    const s = createPendingSaver(A);
    expect(s.load(NOW)).toEqual({ s: 'ok', notes: [{ kind: 'maybeSent', conn: 'conn-1', utt: 1, at: NOW - 100 }] });
    // Its machine settled utt 1 and has nothing else: utt 1 goes, the hidden future row stays.
    expect(s.save([], NOW)).toBe('ok');
    expect(raw().a[UID][C1].rows.map((r: { utt: number }) => r.utt)).toEqual([2]);
    expect(notes(A, NOW + 5000)).toEqual([['conn-1', 2]]);
  });
  it('a saver updates what it holds on every save: a dropped identity goes on the next save, not before', () => {
    boot();
    const u1 = id(1, NOW - 900), u2 = id(2, NOW - 800), u3 = id(3, NOW - 700);
    const s = createPendingSaver(A);
    s.load(NOW);
    s.save([u1, u2], NOW);
    s.save([u2], NOW);
    expect(notes(A)).toEqual([['conn-1', 2]]);
    // Re-adding utt 1 by another caller: this saver no longer holds it, so its save leaves it.
    savePending(A, [u1], [], NOW);
    s.save([u2, u3], NOW);
    expect(notes(A)).toEqual([['conn-1', 1], ['conn-1', 2], ['conn-1', 3]]);
    // settle: the identity goes and is no longer held.
    expect(s.settle('conn-1', 3, NOW)).toBe('ok');
    savePending(A, [u3], [], NOW);
    s.save([u2], NOW);
    expect(notes(A)).toEqual([['conn-1', 1], ['conn-1', 2], ['conn-1', 3]]);
  });
  it('a failed save keeps holding what it held, so the next save still removes it', () => {
    boot();
    const s = createPendingSaver(A);
    s.save([id(1)], NOW);
    const setItem = Storage.prototype.setItem;
    const quota = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === PENDING_KEY) throw new Error('quota');
      setItem.call(this, k, v);
    });
    try {
      expect(s.save([id(2)], NOW)).not.toBe('ok');
    } finally { quota.mockRestore(); }
    expect(notes(A)).toEqual([['conn-1', 1]]);
    s.save([], NOW);
    expect(notes(A)).toEqual([]);
  });
  it('a row tab A settled that tab B still holds: B\'s save does not bring it back, unless B\'s machine still has it', () => {
    boot();
    const a = createPendingSaver(A), b = createPendingSaver(A);
    a.save([id(1), id(2)], NOW);
    b.load(NOW);
    a.settle('conn-1', 1, NOW);
    // B's machine settled nothing yet but saves only what it has: utt 1 is in its prev, not in its ids.
    b.save([id(2)], NOW);
    expect(notes(A)).toEqual([['conn-1', 2]]);
    // B's machine still has utt 1 unsettled (it has not seen the log row yet): its save stores it again, as unsettled.
    b.save([id(1), id(2)], NOW);
    expect(notes(A)).toEqual([['conn-1', 1], ['conn-1', 2]]);
  });
  it('a saver is bound to the Bot it was made for: changing the object it came from changes nothing', () => {
    boot();
    const w = { ...A };
    const s = createPendingSaver(w);
    w.bot = 'bot-z';
    s.save([id(1)], NOW);
    expect(notes(A)).toEqual([['conn-1', 1]]);
    expect(notes({ ...A, bot: 'bot-z' })).toEqual([]);
  });
  it('is gone at sign-out (the auth purge removes the key)', () => {
    boot();
    signIn();
    savePending(A, [id(1)], [], NOW);
    expect(localStorage.getItem(PENDING_KEY)).not.toBeNull();
    clearAuthTokens();
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });
  describe('a settle that could not be written', () => {
    const failWrites = () => {
      // A write that empties the entry is a removeItem, so both refuse.
      const set = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('denied'); });
      const del = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
      return () => { set.mockRestore(); del.mockRestore(); };
    };
    it('a row this saver does not hold (dated ahead, so its load left it out): the next save that works removes it', () => {
      boot();
      savePending(A, [id(5, NOW + 5000)], [], NOW);
      const saver = createPendingSaver(A);
      expect(saver.load(NOW)).toEqual({ s: 'ok', notes: [] });
      const heal = failWrites();
      expect(saver.settle('conn-1', 5, NOW)).toBe('failed');
      heal();
      expect(raw()?.a?.[UID]?.[C1]?.rows).toHaveLength(1);
      expect(saver.save([], NOW)).toBe('ok');
      expect(notes(A, NOW + 10_000)).toEqual([]);
    });
    it('another tab\'s row saved after this load, the same', () => {
      boot();
      const saver = createPendingSaver(A);
      saver.load(NOW);
      savePending(A, [id(6)], [], NOW);
      const heal = failWrites();
      saver.settle('conn-1', 6, NOW);
      heal();
      saver.save([id(7)], NOW);
      expect(notes(A)).toEqual([['conn-1', 7]]);
    });
    it('stays owed across a failed save and a later load, which does not show it again', () => {
      boot();
      savePending(A, [id(5), id(8)], [], NOW);
      const saver = createPendingSaver(A);
      saver.load(NOW);
      const heal = failWrites();
      saver.settle('conn-1', 5, NOW);
      expect(saver.save([id(8)], NOW)).toBe('failed');
      heal();
      expect(saver.load(NOW)).toEqual({ s: 'ok', notes: [{ kind: 'maybeSent', conn: 'conn-1', utt: 8, at: NOW - 1000 }] });
      saver.save([id(8)], NOW);
      expect(notes(A)).toEqual([['conn-1', 8]]);
    });
    it('a settle that worked later clears what was owed: a new row under that identity is not removed by a save', () => {
      boot();
      savePending(A, [id(5)], [], NOW);
      const saver = createPendingSaver(A);
      saver.load(NOW);
      const heal = failWrites();
      saver.settle('conn-1', 5, NOW);
      heal();
      expect(saver.settle('conn-1', 5, NOW)).toBe('ok');
      savePending(A, [id(5)], [], NOW);
      saver.save([], NOW);
      expect(notes(A)).toEqual([['conn-1', 5]]);
    });
    it('a save that still lists an owed identity does not write it back, now or after the owed removal: the note stays gone', () => {
      boot();
      savePending(A, [id(5), id(8)], [], NOW);
      const saver = createPendingSaver(A);
      saver.load(NOW);
      const heal = failWrites();
      expect(saver.settle('conn-1', 5, NOW)).toBe('failed');
      heal();
      expect(saver.save([id(5), id(8)], NOW)).toBe('ok');
      expect(notes(A)).toEqual([['conn-1', 8]]);
      expect(createPendingSaver(A).load(NOW)).toEqual({ s: 'ok', notes: [{ kind: 'maybeSent', conn: 'conn-1', utt: 8, at: NOW - 1000 }] });
      saver.save([id(5), id(8)], NOW);
      expect(notes(A)).toEqual([['conn-1', 8]]);
    });
    it('a settle that was written: a later save listing that identity does not write it back', () => {
      boot();
      savePending(A, [id(5), id(8)], [], NOW);
      const saver = createPendingSaver(A);
      saver.load(NOW);
      expect(saver.settle('conn-1', 5, NOW)).toBe('ok');
      saver.save([id(5), id(8)], NOW);
      expect(notes(A)).toEqual([['conn-1', 8]]);
    });
    it('an ok save clears what was owed: the same identity saved by another tab later is not removed', () => {
      boot();
      savePending(A, [id(5)], [], NOW);
      const saver = createPendingSaver(A);
      saver.load(NOW);
      const heal = failWrites();
      saver.settle('conn-1', 5, NOW);
      heal();
      saver.save([], NOW);
      savePending(A, [id(5)], [], NOW);
      saver.save([], NOW);
      expect(notes(A)).toEqual([['conn-1', 5]]);
    });
  });
});
