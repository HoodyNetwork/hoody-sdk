// The refused
// arm gets the deadline the turn's clean read saw. Its own read unreadable: a finite deadline goes to setStaleTimer
// (which also takes this tab's remembered `away` stamps), an infinite one adds no timer. The live stamp gone by the
// time it runs (stale, or released) while an older record still needs converting: one re-read now. When neither a
// stamp nor that retry gives a time, no timer, so a lasting refusal still ends.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './changes';
import { CHANGE_STORE_KEY, SENDING_STALE_MS, setChangeStoreAdapter, underChangeStore, type StoredChange } from './change-store';
import { queryClient } from './query';
import { boot, onFetch, R1 } from './test/env';

const raw = (): StoredChange[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as StoredChange[];
const rawStr = (): string => localStorage.getItem(CHANGE_STORE_KEY) ?? '';
const put = (list: readonly unknown[]): void => localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
const SECRET = 'planted-secret-f3p-Qm4';
const idFor = (scope: string, digest: string): string => C.changeOwner() + scope + '\u0000' + digest;
function older(scope: string, digest: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: idFor(scope, digest), pending: true, key: null, t: 5, inc: 'inc-' + digest, nonce: 'n1', at: Date.now(), meta: { base: scope, target: null, realm: null, identity: { n: 1, password: SECRET } }, ...extra };
}
/** Another tab's live older record (stale in `ms`, carrying an older build's keyBytes, so the turn must write while
 *  leaving it in place) and an idle older hold to convert. */
function liveAndIdle(ms: number): void {
  put([
    older('lock:f3p.live', 'Dlive', { pending: false, keyBytes: 'kb-old', sending: { tab: 'otherTab', at: Date.now() - SENDING_STALE_MS + ms } }),
    older('lock:f3p.idle', 'Didle'),
  ]);
}
type How = 'ok' | 'refuse' | 'land-throw';
/** Storage over localStorage. `write(n)` decides write attempt n; `after(n)` runs after that decision (move the clock,
 *  fail the next reads). `failReads(k)`: the next k reads throw. */
function adapter(write: (n: number) => How, after?: (n: number, fail: (k: number) => void) => void) {
  let writes = 0, readFail = 0, reads = 0;
  const fail = (k: number): void => { readFail = k; };
  setChangeStoreAdapter({
    read: () => { reads++; if (readFail > 0) { readFail--; throw new Error('read refused'); } return localStorage.getItem(CHANGE_STORE_KEY); },
    write: (t) => {
      const n = ++writes, how = write(n);
      if (how === 'refuse') { after?.(n, fail); return false; }
      if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t);
      after?.(n, fail);
      if (how === 'land-throw') throw new Error('write landed, then threw');
      return true;
    },
  });
  return { writes: () => writes, reads: () => reads, fail };
}
const shownBoth = (): void => {
  expect(rawStr()).not.toContain(SECRET);
  expect(raw().filter((r) => r.fmt !== 1)).toEqual([]);
  expect(C.pendingOf('lock:f3p.live').length).toBe(1);
  expect(C.pendingOf('lock:f3p.idle').length).toBe(1);
};

describe('a refused turn re-reads at the deadline it saw', () => {
  beforeEach(() => {
    boot({ realm: R1 }); queryClient.clear(); onFetch(() => ({ status: 200, body: { data: [] } }));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });
  afterEach(() => { setChangeStoreAdapter(null); C.resetChanges(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('p1 (a): the arm\'s own read fails once after a refused write: the re-read stays at the deadline the turn saw, and both older holds convert and show', async () => {
    liveAndIdle(3000);
    const a = adapter((n) => (n === 1 ? 'refuse' : 'ok'), (n, fail) => { if (n === 1) fail(1); });
    await expect(underChangeStore(() => 0)).rejects.toThrow();
    const reads = a.reads();
    // Bounded to the deadline: nothing reads again before it.
    await vi.advanceTimersByTimeAsync(2500);
    expect(a.reads()).toBe(reads);
    await vi.advanceTimersByTimeAsync(800);
    shownBoth();
  });
  it('p1b (a, landed-then-threw): the verification read and the arm\'s read both fail: the re-read still comes at the deadline and shows both', async () => {
    liveAndIdle(3000);
    adapter((n) => (n === 1 ? 'land-throw' : 'ok'), (n, fail) => { if (n === 1) fail(2); });
    await expect(underChangeStore(() => 0)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(3300);
    shownBoth();
  });
  it('p2 (b): the live stamp goes stale before the arm runs (a slow refused write): one re-read now converts and shows both', async () => {
    liveAndIdle(3000);
    adapter((n) => (n === 1 ? 'refuse' : 'ok'), (n) => { if (n === 1) vi.setSystemTime(Date.now() + 4000); });
    await expect(underChangeStore(() => 0)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(200);
    shownBoth();
  });
  it('p3 (bound): a lasting refusal whose stamp goes stale before the arm makes one more attempt, writes nothing and leaves no timer', async () => {
    liveAndIdle(3000);
    const before = rawStr();
    const a = adapter(() => 'refuse', (n) => { if (n === 1) vi.setSystemTime(Date.now() + 4000); });
    await expect(underChangeStore(() => 0)).rejects.toThrow();
    for (let i = 0; i < 120; i++) await vi.advanceTimersByTimeAsync(60_000);
    // The refused turn, the arm's re-read conversion and that load's keyBytes scrub, all refused.
    expect(a.writes()).toBe(3);
    expect(rawStr()).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('p3b (bound): a lasting refusal with storage that stays unreadable after the turn: one timer at the deadline, then nothing, no write', async () => {
    liveAndIdle(3000);
    const before = rawStr();
    let broken = false;
    const a = adapter(() => 'refuse', (n, fail) => { if (n === 1) { broken = true; fail(1_000_000); } });
    await expect(underChangeStore(() => 0)).rejects.toThrow();
    expect(broken).toBe(true);
    for (let i = 0; i < 120; i++) await vi.advanceTimersByTimeAsync(60_000);
    expect(a.writes()).toBe(1);
    expect(rawStr()).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('p4: a refused turn that saw no live stamp still arms nothing, even when its arm cannot read', async () => {
    put([older('lock:f3p.idle', 'Didle')]);
    const a = adapter(() => 'refuse', (n, fail) => { if (n === 1) fail(1); });
    await expect(underChangeStore(() => 0)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(a.writes()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('p5: the live record is gone before the arm runs and nothing older is left: no re-read', async () => {
    put([older('lock:f3p.live', 'Dlive', { pending: false, keyBytes: 'kb-old', sending: { tab: 'otherTab', at: Date.now() - SENDING_STALE_MS + 3000 } })]);
    // The other tab finishes its send and removes the record while this turn's write is refused.
    const a = adapter(() => 'refuse', (n) => { if (n === 1) localStorage.setItem(CHANGE_STORE_KEY, '[]'); });
    await expect(underChangeStore(() => 0)).rejects.toThrow();
    const reads = a.reads();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(a.reads()).toBe(reads);
    expect(a.writes()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('a memory away stamp whose timer already fired on an unreadable read is not re-armed by a refused turn that saw no live stamp', async () => {
    // A current-format record another tab is sending: the load adopts its away stamp and arms its expiry.
    const cur = { id: idFor('lock:f3p.cur', 'Dcur'), pending: false, key: null, t: 5, inc: 'inc-cur', nonce: 'n1', fmt: 1, at: Date.now(), meta: { base: 'lock:f3p.cur', target: null, realm: null, identity: { n: 2 } }, sending: { tab: 'otherTab', at: Date.now() - SENDING_STALE_MS + 1000 } };
    put([cur]);
    const a = adapter(() => 'refuse', (n, fail) => { if (n === 1) fail(1); });
    C.reloadChangesForTests();
    expect(vi.getTimerCount()).toBe(1);
    // That timer fires while storage cannot be read: the load returns, the memory copy keeps its away stamp.
    a.fail(1_000_000);
    await vi.advanceTimersByTimeAsync(1200);
    expect(vi.getTimerCount()).toBe(0);
    a.fail(0);
    // Storage is back, with an idle older hold to convert; the turn's write is refused and its arm cannot read.
    put([cur, older('lock:f3p.idle', 'Didle')]);
    await expect(underChangeStore(() => 0)).rejects.toThrow();
    const reads = a.reads(), writes = a.writes();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(a.reads()).toBe(reads);
    expect(a.writes()).toBe(writes);
  });
});
