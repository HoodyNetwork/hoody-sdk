// Vitest: a bounded draft store. A new draft that finds the
// store full makes room by dropping the oldest record that holds no build: an ended one first (it is only kept for other tabs),
// then the oldest open draft that never reserved an attempt and has no stored ask, never a draft with an ask, a reserved
// attempt or one under a deploy (its outcome may be unknown,
// C9). Dropping an open draft is never silent: a notice says so. Nothing droppable: the store stays full and nothing is dropped.
import { DRAFTS_MAX, dropDraftRecord, dropScriptAsks, putDraftRecord, putScriptAsk, readDraftRecords, readScriptAsks, type DraftRecord, type ScriptAsk } from '@core';
import { boot, R1, TARGET } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Binding } from '../data';
import strings from '../strings.en.json';
import { askIdOf, attemptPath } from '../writer';
import { listOf } from '../building';
import { discardDraft, openRecord } from './records';

const toasts = vi.hoisted(() => [] as Array<{ title: string; tone?: string }>);
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string; tone?: string }) => { toasts.push(c); return 'toast-1'; } }));

const B: Binding = { target: TARGET, realm: R1, owner: 'fp1', exec: 1 };
const idOf = (i: number) => `d${String(i).padStart(9, '0')}`;
const NEW = 'zzzzzzzzzz';
const rec = (i: number, over: Partial<DraftRecord> = {}): DraftRecord => ({ draftId: idOf(i), mode: 'ai', project: 'p1', compId: 'c1', realm: R1, owner: 'fp1', exec: 1, current: 1, retained: null, state: 'open', deploy: null, updatedAt: 1_000 + i, ...over });
const askFor = (i: number): ScriptAsk => {
  const p = { compId: 'c1', path: attemptPath('p1', idOf(i), 1), realm: R1, owner: 'fp1' };
  return { askId: askIdOf(p), ...p, sessionId: `s${i}`, turnId: `t${i}`, phase: 'read', sentAt: 1_000 + i, createKey: `ck${i}`, turnKey: `tk${i}` };
};
const ids = (): string[] => { const l = readDraftRecords(); return Array.isArray(l) ? l.map((r) => r.draftId).sort() : []; };
/** DRAFTS_MAX records; `shape(i)` decides each one, and `withAsk(i)` stores an ask for it. */
async function fill(shape: (i: number) => Partial<DraftRecord> = () => ({}), withAsk: (i: number) => boolean = () => true): Promise<void> {
  for (let i = 0; i < DRAFTS_MAX; i++) {
    expect(await putDraftRecord(rec(i, shape(i)), null)).toBe('ok');
    // The ask store holds at most SCRIPT_ASKS_MAX (= DRAFTS_MAX): a record without an ask frees its ask slot.
    if (withAsk(i)) expect(await putScriptAsk(askFor(i), null)).toBe('ok');
  }
}
const clearStore = async (): Promise<void> => {
  const asks = readScriptAsks();
  if (Array.isArray(asks)) await dropScriptAsks(asks);
  const recs = readDraftRecords();
  if (Array.isArray(recs)) for (const r of recs) await dropDraftRecord(r);
};

beforeEach(() => { boot({ realm: R1 }); toasts.length = 0; });
afterEach(async () => { await clearStore(); });

describe('a new draft in a full store', () => {
  it('drops the oldest open draft with no build, and says so', async () => {
    // Drafts 5 and 9 never built (attempt 0, no ask); 5 is older.
    await fill((i) => (i === 5 || i === 9 ? { current: 0 } : {}), (i) => i !== 5 && i !== 9);
    const m = await openRecord(NEW, 'ai', B);
    expect(m.ok).toBe(true);
    expect(m.ok && m.dropped?.draftId).toBe(idOf(5));
    expect(ids()).toContain(NEW);
    expect(ids()).not.toContain(idOf(5));
    expect(ids()).toContain(idOf(9));
    expect(ids()).toHaveLength(DRAFTS_MAX);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.title).toBe(strings['draft.droppedOldest']);
  });

  it('an ended record goes before any open draft, and its drop needs no notice', async () => {
    // A recent ended record (one older than a day would already be gone with the store's next write).
    await fill((i) => (i === 20 ? { state: 'discarded', updatedAt: Date.now() - 60_000 } : {}), (i) => i !== 3 && i !== 20);
    const m = await openRecord(NEW, 'ai', B);
    expect(m.ok && m.dropped?.draftId).toBe(idOf(20));
    expect(ids()).toContain(idOf(3));
    expect(toasts).toEqual([]);
  });

  it('a draft under a deploy, or one being made live, is never dropped, even with no ask', async () => {
    const deploy = { kind: 'write' as const, path: '/a.ts', opId: 'op', sentAfter: 1, attempt: 1, beatAt: 1, phase: 'held' as const };
    // 0 and 1 at attempt 0 too, so only their deploy protects them.
    await fill((i) => (i === 0 ? { state: 'deploying', deploy, current: 0 } : i === 1 ? { state: 'live_cleanup', deploy, current: 0 } : i === 2 ? { current: 0 } : {}), (i) => i > 2);
    const m = await openRecord(NEW, 'ai', B);
    // Draft 2 (open, never built) is the one that goes; 0 and 1 are older but under a deploy.
    expect(m.ok && m.dropped?.draftId).toBe(idOf(2));
    expect(ids()).toEqual(expect.arrayContaining([idOf(0), idOf(1)]));
  });

  it('every draft holds a build: nothing is dropped, the store stays full, no notice', async () => {
    await fill();
    const before = ids();
    const m = await openRecord(NEW, 'ai', B);
    expect(m).toEqual({ ok: false, why: 'full' });
    expect(ids()).toEqual(before);
    expect(toasts).toEqual([]);
  });

  // ---- abandoned reservations fill the store; recovery shows them and a Discard frees a slot ----
  it('32 abandoned reservations (no ask stored): refused full, every one is listed with Discard, and one discard lets a new draft in', async () => {
    await fill(() => ({ current: 1 }), () => false);
    expect(await openRecord(NEW, 'ai', B)).toEqual({ ok: false, why: 'full' });
    const drafts = readDraftRecords() as DraftRecord[];
    const l = listOf(drafts, readScriptAsks() as ScriptAsk[]);
    expect(l.draftsFull).toBe(true);
    expect(l.full).toBe(false);
    expect(l.entries).toHaveLength(DRAFTS_MAX);
    const one = drafts.find((r) => r.draftId === idOf(4))!;
    expect(await discardDraft(one)).toEqual({ ok: true, clean: true, removed: [] });
    expect(listOf(readDraftRecords() as DraftRecord[], []).draftsFull).toBe(false);
    const m = await openRecord(NEW, 'ai', B);
    expect(m.ok && m.dropped?.draftId).toBe(idOf(4));
    // The discarded record goes as an ended one: no notice.
    expect(toasts).toEqual([]);
    expect(ids()).toContain(NEW);
  });

  it('an existing record is returned as it is; nothing is dropped', async () => {
    await fill((i) => (i === 5 ? { current: 0 } : {}), (i) => i !== 5);
    const m = await openRecord(idOf(7), 'ai', B);
    expect(m.ok && m.record.draftId).toBe(idOf(7));
    expect(m.ok && m.dropped).toBeUndefined();
    expect(ids()).toContain(idOf(5));
  });
});
