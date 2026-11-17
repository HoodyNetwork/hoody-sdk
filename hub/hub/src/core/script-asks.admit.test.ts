// script-asks.ts admitDraftRecord: a new draft record is admitted in ONE write under the
// cross-tab lock. Existence, capacity and the victim are read under that lock; at most one victim goes, in the same write as
// the insert; nothing is written without the lock.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  admitDraftRecord, putDraftRecord, putScriptAsk, readDraftRecords, DRAFTS_MAX, SCRIPT_ASKS_KEY,
  type DraftRecord, type ScriptAsk,
} from './script-asks';
import { boot, R1 } from './test/env';
import { removeTestLocks } from './test/locks';

const rec = (draftId: string, o: Partial<DraftRecord> = {}): DraftRecord => ({
  draftId, mode: 'ai', project: 'p1', compId: 'comp-1', realm: R1, owner: 'fp1', exec: 1, current: 0, retained: null, state: 'open', deploy: null, updatedAt: Date.now(), ...o,
});
const idOf = (i: number) => `d${String(i).padStart(9, '0')}`;
const ask = (draftId: string): ScriptAsk => ({ askId: 'a-' + draftId, compId: 'comp-1', path: `new:${draftId}.1`, realm: R1, owner: 'fp1', sessionId: null, turnId: null, phase: 'create', sentAt: 1000, createKey: 'ck-' + draftId, turnKey: 'tk-' + draftId });
const ids = () => { const l = readDraftRecords(); return Array.isArray(l) ? l.map((r) => r.draftId) : []; };
async function fill(): Promise<void> { for (let i = 0; i < DRAFTS_MAX; i++) expect(await putDraftRecord(rec(idOf(i), { updatedAt: Date.now() - 1000 + i }), null)).toBe('ok'); }
const NEW = 'zzzzzzzzzz';
const first = (drafts: readonly DraftRecord[]) => drafts[0] ?? null;

beforeEach(() => { boot({ realm: R1 }); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('admitDraftRecord', () => {
  it('room left: stored, nothing dropped, the victim is never asked for', async () => {
    const victimOf = vi.fn(first);
    expect(await admitDraftRecord(rec(NEW), victimOf)).toEqual({ w: 'ok', dropped: null });
    expect(ids()).toEqual([NEW]);
    expect(victimOf).not.toHaveBeenCalled();
  });

  it('already stored: changed, nothing written', async () => {
    expect(await putDraftRecord(rec(NEW), null)).toBe('ok');
    const before = localStorage.getItem(SCRIPT_ASKS_KEY);
    expect(await admitDraftRecord(rec(NEW, { mode: 'idea' }), first)).toEqual({ w: 'changed', dropped: null });
    expect(localStorage.getItem(SCRIPT_ASKS_KEY)).toBe(before);
  });

  it('full: the victim goes and the new record comes in ONE write', async () => {
    await fill();
    const set = vi.spyOn(localStorage, 'setItem');
    const out = await admitDraftRecord(rec(NEW), first);
    expect(out.w).toBe('ok');
    expect(out.dropped?.draftId).toBe(idOf(0));
    expect(set).toHaveBeenCalledTimes(1);
    expect(ids()).toHaveLength(DRAFTS_MAX);
    expect(ids()).not.toContain(idOf(0));
    expect(ids()).toContain(NEW);
  });

  it('one slot left: stored without asking for a victim', async () => {
    for (let i = 0; i < DRAFTS_MAX - 1; i++) expect(await putDraftRecord(rec(idOf(i)), null)).toBe('ok');
    const victimOf = vi.fn(first);
    expect(await admitDraftRecord(rec(NEW), victimOf)).toEqual({ w: 'ok', dropped: null });
    expect(victimOf).not.toHaveBeenCalled();
    expect(ids()).toHaveLength(DRAFTS_MAX);
  });

  it('a write that fails after the victim was named drops nothing and reports no drop', async () => {
    await fill();
    const before = localStorage.getItem(SCRIPT_ASKS_KEY);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    try {
      expect(await admitDraftRecord(rec(NEW), first)).toEqual({ w: 'refused', dropped: null });
    } finally {
      spy.mockRestore();
    }
    expect(localStorage.getItem(SCRIPT_ASKS_KEY)).toBe(before);
  });

  it('full with no victim: full, nothing written', async () => {
    await fill();
    const before = localStorage.getItem(SCRIPT_ASKS_KEY);
    expect(await admitDraftRecord(rec(NEW), () => null)).toEqual({ w: 'full', dropped: null });
    expect(localStorage.getItem(SCRIPT_ASKS_KEY)).toBe(before);
  });

  it('a victim that is not a stored record (or is the new one) is refused: full, nothing written', async () => {
    await fill();
    const before = localStorage.getItem(SCRIPT_ASKS_KEY);
    expect((await admitDraftRecord(rec(NEW), () => rec('qqqqqqqqqq'))).w).toBe('full');
    expect((await admitDraftRecord(rec(NEW), () => rec(NEW))).w).toBe('full');
    expect((await admitDraftRecord(rec(NEW), (d) => ({ ...(d[0] as DraftRecord), current: 5 }))).w).toBe('full');
    expect(localStorage.getItem(SCRIPT_ASKS_KEY)).toBe(before);
  });

  it('the victim is chosen from the records and asks read under the lock (an ask stored just before is seen)', async () => {
    await fill();
    const seen: string[] = [];
    // The ask lands first in the lock queue; the admission is queued behind it and must see it.
    const p1 = putScriptAsk(ask(idOf(0)), null);
    const p2 = admitDraftRecord(rec(NEW), (d, a) => { seen.push(...a.map((x) => x.path ?? '')); return d.find((r) => !a.some((x) => (x.path ?? '').startsWith(`new:${r.draftId}.`))) ?? null; });
    expect(await p1).toBe('ok');
    const out = await p2;
    expect(seen).toEqual([`new:${idOf(0)}.1`]);
    expect(out.dropped?.draftId).toBe(idOf(1));
  });

  it('two admissions of the same new record: one ok with one drop, the other changed with none', async () => {
    await fill();
    const [a, b] = await Promise.all([admitDraftRecord(rec(NEW), first), admitDraftRecord(rec(NEW), first)]);
    expect([a.w, b.w].sort()).toEqual(['changed', 'ok']);
    expect([a.dropped, b.dropped].filter(Boolean)).toHaveLength(1);
    expect(ids()).toHaveLength(DRAFTS_MAX);
  });

  it('no cross-tab lock: uncoordinated, the victim is never asked for, nothing written', async () => {
    await fill();
    const before = localStorage.getItem(SCRIPT_ASKS_KEY);
    removeTestLocks();
    const victimOf = vi.fn(first);
    expect(await admitDraftRecord(rec(NEW), victimOf)).toEqual({ w: 'uncoordinated', dropped: null });
    expect(victimOf).not.toHaveBeenCalled();
    expect(localStorage.getItem(SCRIPT_ASKS_KEY)).toBe(before);
  });

  it('a victim callback that throws: refused, nothing written', async () => {
    await fill();
    const before = localStorage.getItem(SCRIPT_ASKS_KEY);
    const out = await admitDraftRecord(rec(NEW), () => { throw new Error('boom'); });
    expect(out.w).not.toBe('ok');
    expect(out.dropped).toBeNull();
    expect(localStorage.getItem(SCRIPT_ASKS_KEY)).toBe(before);
  });

  it('an invalid record: invalid, nothing written', async () => {
    expect(await admitDraftRecord({ ...rec(NEW), draftId: '' }, first)).toEqual({ w: 'invalid', dropped: null });
    expect(localStorage.getItem(SCRIPT_ASKS_KEY)).toBeNull();
  });
});
