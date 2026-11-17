// attempts.ts kept holds (setKeptAttemptLocks): a host names the locks whose holds no sign-out forget drops. Only the
// terminal names any (its boot-token mints: the only trace of a token that may exist, revoked by name by its recovery);
// the web names none, so there a hold of any lock, one named like the terminal's mint included, is listed and forgotten
// as before.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | No lock named (the web): a hold named like the terminal's mint is in the warning and the wipe's confirm, and the warned sign-out forgets it like any other | 'no lock named' |
// | 2 | A named lock: the warning, the wipe's confirm and its stored check leave the hold out; it still refuses its lock and pages still list it; the warned sign-out answers done, removes the other hold and keeps that record | 'a named lock' |
// | 3 | A named lock: after that forget and a reload, the sender's free (the recovery's path) still removes the record, through the change store's one writer | 'the recovery still frees it' |
// | 4 | attemptKept: a change record is never kept; a lock test that throws keeps the record | 'attemptKept' |
// | 5 | Only core/attempts.ts and term/app/live-wire.ts name setKeptAttemptLocks: the web Hub never names a lock | 'only the terminal names kept locks' |
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attemptFor, attemptHoldRefsIn, attemptKept, dropAttemptIds, heldAttempts, holdAttempt, resetAttempts, setKeptAttemptLocks, type AttemptHold } from './attempts';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY, newChangeStoreTabForTests, setChangeStoreAdapter, type StoredChange } from './change-store';
import { forgetAccountChanges } from './changes';
import { configureLifecycle, initLive, signOutForgetting, signOutHolds } from './lifecycle';
import { localWipeWarning, storedWarning } from './local-wipe.pure';
import { boot, R1, settle, UID } from './test/env';
import { removeTestLocks } from './test/locks';
import { referencesIn, sourcesUnder } from './test/noarg-scan';

/** The terminal's boot-token mint lock (term/app/live-direct.ts BOOT_MINT_LOCK_PREFIX + its op id) and its test. */
const MINT_PREFIX = 'term.direct.boot-token-mint:';
const MINT_LOCK = MINT_PREFIX + 'k3v9q2m7xa';
const kept = (lock: string): boolean => lock.startsWith(MINT_PREFIX);

const drainSignOuts = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });
afterEach(async () => {
  setKeptAttemptLocks(null);
  setChangeStoreAdapter(null);
  removeTestLocks();
  await drainSignOuts(50);
  delete (window as { HubBootToken?: unknown }).HubBootToken;
});

/** A booted live page whose navigations are recorded. */
function tab(): { navs: string[] } {
  boot({ realm: R1 });
  const w = { navs: [] as string[] };
  configureLifecycle({ navigate: (u) => w.navs.push(u), loginPath: '/auth/login', herePath: () => '/auth/home' });
  initLive();
  (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
  return w;
}
const stored = (): string[] => (JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) ?? '[]') as Array<{ id: string }>).map((r) => r.id).sort();
/** A held attempt whose request was answered with an unknown outcome: pending, no send out. */
async function hold(lock: string, by: string): Promise<AttemptHold> {
  const r = await holdAttempt(lock, { by });
  if (!r.ok) throw new Error('not held: ' + r.code);
  r.hold.sent();
  await settle();
  return r.hold;
}

describe('kept holds', () => {
  it('no lock named (the web): a hold named like the terminal\'s mint is shown and forgotten like any other', async () => {
    const w = tab();
    const mint = await hold(MINT_LOCK, 'term.direct');
    const other = await hold('keys:create', 'keys:create');
    const shown = signOutHolds();
    expect(shown.map((h) => h.id).sort()).toEqual([mint.id, other.id].sort());
    expect(localWipeWarning()!.holds.map((h) => h.ref.id).sort()).toEqual([mint.id, other.id].sort());
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('done');
    expect(stored()).toEqual([]);
    await vi.waitFor(() => expect(w.navs).toContain('/auth/login'));
  });

  it('a named lock: left out of the warning and the wipe\'s confirm; the warned sign-out keeps its record and answers done', async () => {
    const w = tab();
    setKeptAttemptLocks(kept);
    const mint = await hold(MINT_LOCK, 'term.direct');
    const other = await hold('keys:create', 'keys:create');
    // Still a hold everywhere else: pages list it, and its lock refuses a second send.
    expect(heldAttempts().map((h) => h.id).sort()).toEqual([mint.id, other.id].sort());
    expect(await holdAttempt(MINT_LOCK, { by: 'term.direct' })).toMatchObject({ ok: false, code: 'HELD', notSent: true });
    const shown = signOutHolds();
    expect(shown).toEqual([{ id: other.id, token: other.incarnation }]);
    expect(localWipeWarning()!.holds.map((h) => h.ref)).toEqual(shown);
    expect(storedWarning(UID)!.holds.map((h) => h.ref)).toEqual(shown);
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('done');
    expect(stored()).toEqual([mint.id]);
    await vi.waitFor(() => expect(w.navs).toContain('/auth/login'));
  });

  it('the recovery still frees it: after the forget and a reload, its sender\'s free removes it through the store\'s writer', async () => {
    tab();
    setKeptAttemptLocks(kept);
    const mint = await hold(MINT_LOCK, 'term.direct');
    await hold('keys:create', 'keys:create');
    // The same forget signOutForgetting runs (lifecycle.ts passes these three), without the sign-out after it.
    expect(await forgetAccountChanges(UID, signOutHolds(), { holdsIn: attemptHoldRefsIn, drop: dropAttemptIds, keeps: attemptKept })).toBe('done');
    expect(stored()).toEqual([mint.id]);
    resetAttempts(); newChangeStoreTabForTests(); // a reload: no memory, a new tab id
    const writes: Array<string | null> = [];
    setChangeStoreAdapter({
      read: () => localStorage.getItem(CHANGE_STORE_KEY),
      write: (t) => { writes.push(t); if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t); return true; },
    });
    expect(heldAttempts().map((h) => h.id)).toEqual([mint.id]);
    const h = attemptFor(mint.id, 'term.direct');
    expect(h).not.toBeNull();
    expect(await h!.free('proved', { metaVersion: 0 })).toBe('freed');
    expect(stored()).toEqual([]);
    expect(writes.length).toBeGreaterThan(0);
    expect(String(writes[writes.length - 1])).not.toContain(mint.id);
  });

  it('attemptKept: a change record is never kept; a lock test that throws keeps the record', () => {
    const attempt: StoredChange = { id: ATTEMPT_PREFIX + UID + '\u0001' + MINT_LOCK + '\u0000' + 'a'.repeat(32), pending: true, key: null, t: 1, meta: { base: MINT_LOCK, target: null, realm: null, by: 'term.direct' } };
    const change: StoredChange = { id: UID + '\u0001' + 'c'.repeat(32), pending: true, key: null, t: 1, meta: { base: MINT_LOCK, target: null, realm: null } };
    expect(attemptKept(attempt)).toBe(false);
    setKeptAttemptLocks(kept);
    expect(attemptKept(attempt)).toBe(true);
    expect(attemptKept(change)).toBe(false);
    setKeptAttemptLocks(() => { throw new Error('the host\'s'); });
    expect(attemptKept(attempt)).toBe(true);
    setKeptAttemptLocks(null);
    expect(attemptKept(attempt)).toBe(false);
  });
});

describe('only the terminal names kept locks', () => {
  const NAME = 'setKeptAttemptLocks';
  /** The definition and the terminal's live wiring (install and dispose). */
  const OWNERS = new Set(['core/attempts.ts', 'term/app/live-wire.ts']);
  const src = join(import.meta.dirname, '..');
  it('no other non-test source names setKeptAttemptLocks, so the web Hub keeps no hold through a forget', () => {
    const named = sourcesUnder(src).map((f) => relative(src, f).split(sep).join('/')).filter((rel) => !OWNERS.has(rel) && referencesIn(readFileSync(join(src, rel), 'utf8'), NAME, rel) > 0);
    expect(named).toEqual([]);
  });
  it('the owners do name it (the scan is not blind)', () => {
    for (const rel of OWNERS) expect(referencesIn(readFileSync(join(src, rel), 'utf8'), NAME, rel)).toBeGreaterThan(0);
  });
});
