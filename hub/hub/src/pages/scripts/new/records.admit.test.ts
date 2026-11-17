// Vitest: a new draft in a full store is admitted in ONE locked
// step. Each interleaving that could lose a draft is a row: two tabs opening the same new draft drop at most one draft; a draft
// that reserved an attempt (nextAttempt) or has an ask is never dropped, before or after the check; a draft that is dropped is
// always announced, whatever happens to the new one; without the cross-tab lock nothing is dropped.
import { DRAFTS_MAX, dropDraftRecord, dropScriptAsks, putDraftRecord, putScriptAsk, readDraftRecords, readScriptAsks, type DraftRecord, type ScriptAsk } from '@core';
import { boot, R1, TARGET } from '@core/test/env';
import { installTestLocks, removeTestLocks } from '@core/test/locks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Binding } from '../data';
import strings from '../strings.en.json';
import { askIdOf, attemptPath } from '../writer';
import { nextAttempt, openRecord, readDraftRecord } from './records';

const toasts = vi.hoisted(() => [] as Array<{ title: string; tone?: string }>);
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string; tone?: string }) => { toasts.push(c); return 'toast-1'; } }));

const B: Binding = { target: TARGET, realm: R1, owner: 'fp1', exec: 1 };
const idOf = (i: number) => `d${String(i).padStart(9, '0')}`;
const NEW = 'zzzzzzzzzz';
const NEW2 = 'yyyyyyyyyy';
/** A draft that built (current 1, with its attempt's ask) unless `idle`: never built (current 0), no ask. */
const rec = (i: number, idle: boolean): DraftRecord => ({ draftId: idOf(i), mode: 'ai', project: 'p1', compId: 'c1', realm: R1, owner: 'fp1', exec: 1, current: idle ? 0 : 1, retained: null, state: 'open', deploy: null, updatedAt: Date.now() - 100_000 + i });
const askFor = (i: number): ScriptAsk => {
  const p = { compId: 'c1', path: attemptPath('p1', idOf(i), 1), realm: R1, owner: 'fp1' };
  return { askId: askIdOf(p), ...p, sessionId: `s${i}`, turnId: `t${i}`, phase: 'read', sentAt: 1_000 + i, createKey: `ck${i}`, turnKey: `tk${i}` };
};
const ids = (): string[] => { const l = readDraftRecords(); return Array.isArray(l) ? l.map((r) => r.draftId) : []; };
async function fill(idle: (i: number) => boolean): Promise<void> {
  for (let i = 0; i < DRAFTS_MAX; i++) {
    expect(await putDraftRecord(rec(i, idle(i)), null)).toBe('ok');
    if (!idle(i)) expect(await putScriptAsk(askFor(i), null)).toBe('ok');
  }
}
const missing = (before: string[]) => before.filter((d) => !ids().includes(d));
/** Another tab's write (`hook`) runs just before this tab's k-th lock request; the hook's own requests are not counted.
 *  `fired()`: whether this tab made a k-th request at all (one locked step makes only one). */
function beforeLock(k: number, hook: () => Promise<unknown>): { fired: () => boolean } {
  const locks = (globalThis.navigator as unknown as { locks: { request: (...a: unknown[]) => Promise<unknown> } }).locks;
  const real = locks.request.bind(locks);
  let n = 0;
  let inHook = false;
  let fired = false;
  locks.request = async (...a: unknown[]) => {
    if (!inHook && ++n === k) { inHook = true; fired = true; try { await hook(); } finally { inHook = false; } }
    return real(...a);
  };
  return { fired: () => fired };
}

beforeEach(() => { boot({ realm: R1 }); toasts.length = 0; });
const clearStore = async (): Promise<void> => {
  const asks = readScriptAsks();
  if (Array.isArray(asks)) await dropScriptAsks(asks);
  const recs = readDraftRecords();
  if (Array.isArray(recs)) for (const r of recs) await dropDraftRecord(r);
};
afterEach(async () => { installTestLocks(); await clearStore(); });

describe('a new draft admitted into a full store (one locked step)', () => {
  it('two tabs open the same new draft at once: one draft is dropped, once, and announced once', async () => {
    await fill((i) => i === 3 || i === 5);
    const before = ids();
    const [a, b] = await Promise.all([openRecord(NEW, 'ai', B), openRecord(NEW, 'ai', B)]);
    expect(a.ok && b.ok).toBe(true);
    expect(missing(before)).toEqual([idOf(3)]);
    expect(ids()).toHaveLength(DRAFTS_MAX);
    expect(toasts).toHaveLength(1);
  });

  it('two tabs open two new drafts at once with one idle draft: each admission drops at most one draft, each drop is announced', async () => {
    await fill((i) => i === 3);
    const before = ids();
    const r = await Promise.all([openRecord(NEW, 'ai', B), openRecord(NEW2, 'ai', B)]);
    const dropped = r.flatMap((m) => (m.ok && m.dropped ? [m.dropped.draftId] : []));
    expect(new Set(dropped).size).toBe(dropped.length);
    expect(missing(before)).toEqual([idOf(3)]);
    expect(toasts).toHaveLength(dropped.length);
    expect(ids()).toHaveLength(DRAFTS_MAX);
  });

  it('a draft that reserved an attempt (nextAttempt) before its ask was stored is never dropped', async () => {
    await fill((i) => i === 3);
    const r3 = readDraftRecord(idOf(3)) as DraftRecord;
    expect((await nextAttempt(r3, false)).ok).toBe(true);
    // Its ask is not stored yet; it is reserved all the same.
    const m = await openRecord(NEW, 'ai', B);
    expect(m).toEqual({ ok: false, why: 'full' });
    expect(ids()).toContain(idOf(3));
    expect(toasts).toEqual([]);
  });

  it('an attempt reserved while the new draft is being admitted: either the draft stays and the attempt is its, or it went first and the attempt is refused (nothing sent)', async () => {
    await fill((i) => i === 3);
    const r3 = readDraftRecord(idOf(3)) as DraftRecord;
    const [att, m] = await Promise.all([nextAttempt(r3, false), openRecord(NEW, 'ai', B)]);
    const kept = ids().includes(idOf(3));
    if (att.ok) { expect(kept).toBe(true); expect(m.ok).toBe(false); }
    else { expect(kept).toBe(false); expect(m.ok).toBe(true); expect(toasts).toHaveLength(1); }
  });

  it.each([1, 2, 3])('an ask another tab stores for an idle-looking draft (before lock %i) protects it', async (k) => {
    await fill((i) => i === 3);
    // A record still at attempt 0 whose ask lands while the new draft is being admitted: it holds a build.
    const at = beforeLock(k, () => putScriptAsk(askFor(3), null));
    const m = await openRecord(NEW, 'ai', B);
    // Stored before the one locked step: it is seen there. A k-th lock that never comes means no step after it to race.
    if (at.fired()) {
      expect(ids()).toContain(idOf(3));
      expect(m.ok).toBe(false);
      expect(toasts).toEqual([]);
    } else {
      expect(m.ok && m.dropped?.draftId).toBe(idOf(3));
      expect(toasts).toHaveLength(1);
    }
  });

  it.each([1, 2, 3])('a slot another tab takes (before lock %i): every dropped draft is announced (never a silent drop)', async (k) => {
    await fill((i) => i === 3);
    const before = ids();
    beforeLock(k, () => putDraftRecord(rec(99, true), null));
    await openRecord(NEW, 'ai', B);
    const gone = missing(before);
    expect(toasts).toHaveLength(gone.length);
    expect(gone.length).toBeLessThanOrEqual(1);
    expect(ids().length).toBeLessThanOrEqual(DRAFTS_MAX);
  });

  it('no cross-tab lock: nothing is dropped and the new draft is refused', async () => {
    await fill((i) => i === 3);
    const before = ids();
    removeTestLocks();
    const m = await openRecord(NEW, 'ai', B);
    expect(m.ok).toBe(false);
    installTestLocks();
    expect(ids()).toEqual(before);
    expect(toasts).toEqual([]);
  });

  it('the notice names what was dropped: a draft that never built', async () => {
    await fill((i) => i === 3);
    await openRecord(NEW, 'ai', B);
    expect(toasts.map((x) => x.title)).toEqual([strings['draft.droppedOldest']]);
  });
});
