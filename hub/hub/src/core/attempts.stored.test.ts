// attempts.ts attemptStored: the one account-bound read an authorization may use.
// Remembered copies and heldAttempts() are display views; an unreadable or corrupt store is `unreadable`, never "kept".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attemptStored, heldAttempts, holdAttempt, resetAttempts } from './attempts';
import { CHANGE_STORE_KEY, newChangeStoreTabForTests, setChangeStoreAdapter } from './change-store';
import { boot, R1, UID } from './test/env';
import { removeTestLocks } from './test/locks';

const BY = 'apps.github';
const meta = { step: 'create', computer: 'c1' };
const mk = async (lock = 'gh:a') => {
  const r = await holdAttempt(lock, { by: BY, meta, realm: R1 });
  if (!r.ok) throw new Error('not held ' + r.code);
  return r.hold;
};
const reload = () => { resetAttempts(); newChangeStoreTabForTests(); };

beforeEach(() => { boot({ realm: R1 }); });
afterEach(() => { vi.useRealTimers(); setChangeStoreAdapter(null); resetAttempts(); localStorage.clear(); removeTestLocks(); });

describe('attemptStored: one read of the stored hold', () => {
  it('returns the stored hold of the shown account and sender, with this tab\'s live stamp', async () => {
    const h = await mk();
    const r = attemptStored(h.id, BY);
    expect(r).toMatchObject({ s: 'ok', acct: UID, v: { id: h.id, incarnation: h.incarnation, key: h.key, by: BY, realm: R1, meta, metaVersion: 0, stampHere: true } });
  });
  it('an update bumps the stored version it reports', async () => {
    const h = await mk();
    expect(await h.update({ ...meta, step: 'turn' }, 0)).toBe(true);
    expect(attemptStored(h.id, BY)).toMatchObject({ s: 'ok', v: { metaVersion: 1, meta: { step: 'turn' } } });
  });
  it('after a reload the stored stamp is no longer this tab\'s beat: stampHere is false', async () => {
    const h = await mk();
    reload();
    expect(attemptStored(h.id, BY)).toMatchObject({ s: 'ok', v: { stampHere: false } });
  });
  it('a stamp that went stale reports stampHere false even while the beat object exists', async () => {
    vi.useFakeTimers();
    const h = await mk();
    expect(attemptStored(h.id, BY)).toMatchObject({ v: { stampHere: true } });
    resetAttempts(); // this tab forgets its beat; the stored stamp is still live but not kept by this tab
    expect(attemptStored(h.id, BY)).toMatchObject({ v: { stampHere: false } });
  });
  it('an expired stored stamp is not this tab\'s while its beat still runs', async () => {
    const h = await mk();
    const raw = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY)!) as Array<{ sending: { at: number } }>;
    raw[0]!.sending.at = Date.now() - 60 * 60 * 1000;
    setChangeStoreAdapter({ read: () => JSON.stringify(raw), write: () => true });
    expect(attemptStored(h.id, BY)).toMatchObject({ s: 'ok', v: { stampHere: false } });
  });
  it('a hold whose cleanup is owed (stored, no admitting mark) is not a hold', async () => {
    let text: string | null = null, w = 0, dead = false;
    setChangeStoreAdapter({
      read: () => { if (dead) throw new Error('unreadable'); return text; },
      write: (t: string) => { w++; if (w >= 3) return false; text = t; if (w === 2) dead = true; return true; },
    });
    const r = await holdAttempt('gh:owed', { by: BY, meta, realm: R1 });
    expect(r.ok).toBe(false);
    dead = false; w = 0;
    const stored = JSON.parse(text!) as Array<{ id: string; admitting?: number }>;
    expect(stored).toHaveLength(1);
    expect(stored[0]!.admitting).toBeUndefined();
    expect(attemptStored(stored[0]!.id, BY)).toMatchObject({ s: 'missing' });
  });
  it('another sender\'s record, an unknown id and an id of another account are missing', async () => {
    const h = await mk();
    expect(attemptStored(h.id, 'apps.other')).toMatchObject({ s: 'missing' });
    expect(attemptStored(h.id.slice(0, -1) + (h.id.endsWith('0') ? '1' : '0'), BY)).toMatchObject({ s: 'missing' });
    expect(attemptStored(h.id.replace(UID, 'b'.repeat(24)), BY)).toMatchObject({ s: 'missing' });
    expect(attemptStored('', BY)).toMatchObject({ s: 'missing' });
  });
  it('with no shown account it is missing before any read', async () => {
    boot({ realm: R1, signedIn: false, identity: false });
    let reads = 0;
    setChangeStoreAdapter({ read: () => { reads++; return null; }, write: () => true });
    expect(attemptStored('hub-held:' + UID + '\u0001x\u0000y', BY)).toMatchObject({ s: 'missing' });
    expect(reads).toBe(0);
  });
  it('an id outside the shown account\'s prefix is missing without reading storage', async () => {
    let reads = 0;
    setChangeStoreAdapter({ read: () => { reads++; return null; }, write: () => true });
    expect(attemptStored('hub-held:' + 'c'.repeat(24) + '\u0001x\u0000y', BY)).toMatchObject({ s: 'missing' });
    expect(reads).toBe(0);
  });
  it('reads storage once per call', async () => {
    const h = await mk();
    let reads = 0;
    setChangeStoreAdapter({ read: () => { reads++; return localStorage.getItem(CHANGE_STORE_KEY); }, write: () => true });
    attemptStored(h.id, BY);
    expect(reads).toBe(1);
  });
});

describe('unreadable or corrupt storage is unreadable even with a remembered hold', () => {
  it('unreadable storage', async () => {
    const h = await mk();
    expect(heldAttempts()).toHaveLength(1); // the display view still remembers it
    setChangeStoreAdapter({ read: () => { throw new Error('denied'); }, write: () => false });
    expect(heldAttempts()).toHaveLength(1);
    expect(attemptStored(h.id, BY)).toEqual({ s: 'unreadable' });
  });
  it('corrupt storage (unparseable text, a non-array, an invalid record)', async () => {
    const h = await mk();
    for (const text of ['{not json', '{"a":1}', JSON.stringify([{ id: 5 }])]) {
      setChangeStoreAdapter({ read: () => text, write: () => true });
      expect(attemptStored(h.id, BY), text).toEqual({ s: 'unreadable' });
    }
  });
  it('a hold still being admitted, or one whose cleanup is owed, is not a hold', async () => {
    const h = await mk();
    const raw = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY)!) as Array<Record<string, unknown>>;
    raw[0]!.admitting = Date.now();
    setChangeStoreAdapter({ read: () => JSON.stringify(raw), write: () => true });
    expect(attemptStored(h.id, BY)).toMatchObject({ s: 'missing' });
  });
});
