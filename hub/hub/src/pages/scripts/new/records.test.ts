// Vitest (New script): attempts of one draft. Build again after a cancel or a failure and
// a fix attempt each get the next attempt; a late answer of an older attempt never replaces newer code and its ask is closed;
// the previous usable code is kept until a replacement is usable; a stale tab allocates nothing and closes nothing.
import { dropDraftRecord, dropScriptAsks, putScriptAsk, readDraftRecords, readScriptAsks, type DraftRecord, type ScriptAsk } from '@core';
import { boot, R1, TARGET } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Binding } from '../data';
import { askIdOf, attemptPath } from '../writer';
import { attemptUsable, beatDeploy, beginDeploy, discardDraft, finishDeploy, markDeploy, nextAttempt, openRecord, readDraftRecord, rebindRecord, sendAgain } from './records';

const B: Binding = { target: TARGET, realm: R1, owner: 'fp1', exec: 1 };
const ID = 'abcdefghij';
const place = (n: number, project = 'p1', compId = 'c1') => ({ compId, path: attemptPath(project, ID, n), realm: R1, owner: 'fp1' });
const storeAsk = (n: number, project = 'p1', compId = 'c1'): Promise<unknown> => {
  const askId = askIdOf(place(n, project, compId));
  const a: ScriptAsk = { askId, compId, path: attemptPath(project, ID, n), realm: R1, owner: 'fp1', sessionId: `s${n}`, turnId: `t${n}`, phase: 'read', sentAt: 1000 + n, createKey: `ck${n}`, turnKey: `tk${n}` };
  return putScriptAsk(a, null);
};
const askPaths = (): (string | null)[] => { const l = readScriptAsks(); return Array.isArray(l) ? l.map((a) => a.path).sort() : []; };
// The page's store through core only: every stored ask and draft record removed.
const clearStore = async (): Promise<void> => {
  const asks = readScriptAsks();
  if (Array.isArray(asks)) await dropScriptAsks(asks);
  const recs = readDraftRecords();
  if (Array.isArray(recs)) for (const r of recs) await dropDraftRecord(r);
};
const rec = (): DraftRecord => readDraftRecord(ID) as DraftRecord;

beforeEach(() => { boot({ realm: R1 }); });
afterEach(async () => { await clearStore(); });

describe('attempts of one draft', () => {
  it('first build, then Build again after a failure: attempt 2; the failed attempt is not retained', async () => {
    expect((await openRecord(ID, 'ai', B)).ok).toBe(true);
    expect(rec()).toMatchObject({ current: 0, retained: null, state: 'open', compId: 'c1' });
    expect((await nextAttempt(rec(), false)).ok).toBe(true);
    await storeAsk(1);
    expect((await nextAttempt(rec(), false)).ok).toBe(true);
    expect(rec()).toMatchObject({ current: 2, retained: null });
  });

  it('the previous usable code is kept until the replacement is usable; then the older ask is closed', async () => {
    await openRecord(ID, 'ai', B);
    await nextAttempt(rec(), false);
    await storeAsk(1);
    expect((await attemptUsable(rec(), 1)).use).toBe(true);
    expect(rec()).toMatchObject({ current: 1, retained: 1 });
    // Ask the assistant to fix it: attempt 2 starts; attempt 1 stays retained (its code is still the draft's) and stored
    await nextAttempt(rec(), true);
    await storeAsk(2);
    expect(rec()).toMatchObject({ current: 2, retained: 1 });
    expect(askPaths()).toEqual([attemptPath('p1', ID, 1), attemptPath('p1', ID, 2)]);
    // attempt 2 is usable: it is the draft's code now, and attempt 1's ask is closed
    expect((await attemptUsable(rec(), 2)).use).toBe(true);
    expect(rec()).toMatchObject({ current: 2, retained: 2 });
    expect(askPaths()).toEqual([attemptPath('p1', ID, 2)]);
  });

  it('a late answer of an older attempt changes nothing and its ask is closed; the retained one is never closed by it', async () => {
    await openRecord(ID, 'ai', B);
    await nextAttempt(rec(), false);
    await storeAsk(1);
    await attemptUsable(rec(), 1);
    await nextAttempt(rec(), true); // 2, retained 1
    await storeAsk(2);
    await nextAttempt(rec(), false); // Build again after a cancel of 2: 3, retained still 1
    await storeAsk(3);
    expect(rec()).toMatchObject({ current: 3, retained: 1 });
    const late = await attemptUsable(rec(), 2);
    expect(late.use).toBe(false);
    expect(rec()).toMatchObject({ current: 3, retained: 1 });
    expect(askPaths()).toEqual([attemptPath('p1', ID, 1), attemptPath('p1', ID, 3)]);
    expect((await attemptUsable(rec(), 1)).use).toBe(false);
    expect(askPaths()).toContain(attemptPath('p1', ID, 1));
  });

  it('a stale tab (it read an older generation) allocates no attempt and closes nothing', async () => {
    await openRecord(ID, 'ai', B);
    await nextAttempt(rec(), false);
    await storeAsk(1);
    await attemptUsable(rec(), 1);
    const old = rec();
    await nextAttempt(rec(), true); // another tab moved on: current 2, retained 1
    const stale = await nextAttempt(old, true);
    expect(stale).toEqual({ ok: false, why: 'stale' });
    expect(rec()).toMatchObject({ current: 2, retained: 1 });
    expect(askPaths()).toContain(attemptPath('p1', ID, 1));
    // its copy is of an older generation: its answer is judged on the record as stored now, never used from the old copy
    expect(await attemptUsable(old, 1)).toMatchObject({ use: false, why: 'stale' });
    expect(askPaths()).toContain(attemptPath('p1', ID, 1));
  });

  it('a tab that read attempt 1 after another tab made attempt 2 usable: attempt 1 is not used and attempt 2 is never closed', async () => {
    await openRecord(ID, 'ai', B);
    await nextAttempt(rec(), false);
    await storeAsk(1);
    const old = rec(); // current 1, retained null
    await nextAttempt(rec(), false); // the other tab: 2
    await storeAsk(2);
    expect((await attemptUsable(rec(), 2)).use).toBe(true); // retained 2
    const got = await attemptUsable(old, 1);
    expect(got.use).toBe(false);
    expect(rec()).toMatchObject({ current: 2, retained: 2 });
    expect(askPaths()).toContain(attemptPath('p1', ID, 2));
    // a stale copy cannot close the attempt the record needs, whatever number it asks about
    expect((await attemptUsable(old, 2)).use).toBe(false);
    expect(askPaths()).toContain(attemptPath('p1', ID, 2));
  });

  it('after a discard or a deploy, a late answer is not used', async () => {
    await openRecord(ID, 'ai', B);
    await nextAttempt(rec(), false);
    await storeAsk(1);
    const old = rec();
    await beginDeploy(rec(), { kind: 'write', path: 'default/1/a.ts', opId: 'op1', sentAfter: 1, attempt: 1 });
    expect(await attemptUsable(old, 1)).toMatchObject({ use: false, why: 'state' });
    expect(askPaths()).toContain(attemptPath('p1', ID, 1));
  });

  it('rebound away: discard closes every attempt where it was made, without switching back', async () => {
    await openRecord(ID, 'ai', B);
    await nextAttempt(rec(), false);
    await storeAsk(1); // made on p1/c1
    const other: Binding = { target: { project: { id: 'p2' }, container: { id: 'c2' } }, realm: R1, owner: 'fp1', exec: 1 };
    expect((await rebindRecord(rec(), other)).ok).toBe(true);
    await nextAttempt(rec(), false);
    await storeAsk(2, 'p2', 'c2');
    // Each ask as the discard removed it, where it was made.
    expect(await discardDraft(rec())).toEqual({ ok: true, clean: true, removed: [expect.objectContaining({ path: attemptPath('p1', ID, 1), compId: 'c1' }), expect.objectContaining({ path: attemptPath('p2', ID, 2), compId: 'c2' })] });
    expect(askPaths()).toEqual([]);
  });

  it('rebound away: a deploy finalizes by closing the attempts made on the earlier computer too', async () => {
    await openRecord(ID, 'ai', B);
    await nextAttempt(rec(), false);
    await storeAsk(1);
    const other: Binding = { target: { project: { id: 'p2' }, container: { id: 'c2' } }, realm: R1, owner: 'fp1', exec: 1 };
    await rebindRecord(rec(), other);
    await beginDeploy(rec(), { kind: 'write', path: 'default/1/a.ts', opId: 'op1', sentAfter: 1, attempt: 1 });
    expect(await finishDeploy(rec())).toEqual({ state: 'consumed' });
    expect(askPaths()).toEqual([]);
  });

  it('rebind changes the computer of an open draft only; discard ends it and closes its attempts', async () => {
    await openRecord(ID, 'ai', B);
    await nextAttempt(rec(), false);
    await storeAsk(1);
    const other: Binding = { target: { project: { id: 'p1' }, container: { id: 'c2' } }, realm: R1, owner: 'fp1', exec: 3 };
    expect((await rebindRecord(rec(), other)).ok).toBe(true);
    expect(rec()).toMatchObject({ compId: 'c2', exec: 3, current: 1 });
    await rebindRecord(rec(), B);
    expect(await discardDraft(rec())).toEqual({ ok: true, clean: true, removed: [expect.objectContaining({ path: attemptPath('p1', ID, 1) })] });
    expect(rec().state).toBe('discarded');
    expect(askPaths()).toEqual([]);
    expect(await nextAttempt(rec(), false)).toEqual({ ok: false, why: 'state' });
    expect(readDraftRecords()).toHaveLength(1);
  });

  it('a draft under a deploy (or ended) takes no second reservation and cannot be discarded; nothing is moved', async () => {
    await openRecord(ID, 'ai', B);
    await nextAttempt(rec(), false);
    await storeAsk(1);
    const d = { kind: 'write' as const, path: 'default/1/a.ts', opId: 'op1', sentAfter: 1, attempt: 1 };
    expect((await beginDeploy(rec(), d)).ok).toBe(true);
    const held = rec();
    expect(await beginDeploy(held, { ...d, opId: 'op2' })).toEqual({ ok: false, why: 'state' });
    expect(await discardDraft(held)).toEqual({ ok: false, why: 'state' });
    expect(rec()).toEqual(held);
    expect(askPaths()).toHaveLength(1);
  });

  it('the stored phase: only didnt goes back to sending, once; answers are stored only from sending, for its op id', async () => {
    await openRecord(ID, 'ai', B);
    await nextAttempt(rec(), false);
    expect((await beginDeploy(rec(), { kind: 'write', path: 'default/1/a.ts', opId: 'op1', sentAfter: 1, attempt: 1 })).ok).toBe(true);
    expect(rec().deploy?.phase).toBe('sending');
    expect(await sendAgain(rec())).toEqual({ ok: false, why: 'state' });
    expect(await markDeploy(rec(), 'op2', 'didnt')).toEqual({ ok: false, why: 'state' });
    expect((await markDeploy(rec(), 'op1', 'didnt')).ok).toBe(true);
    expect(await markDeploy(rec(), 'op1', 'held')).toEqual({ ok: false, why: 'state' });
    const didnt = rec();
    expect((await sendAgain(didnt)).ok).toBe(true);
    expect(await sendAgain(didnt)).toEqual({ ok: false, why: 'stale' });
    expect(rec().deploy).toMatchObject({ opId: 'op1', path: 'default/1/a.ts', sentAfter: 1, phase: 'sending' });
    expect((await markDeploy(rec(), 'op1', 'held')).ok).toBe(true);
    expect(await sendAgain(rec())).toEqual({ ok: false, why: 'state' });
    expect(await beatDeploy(rec())).toEqual({ ok: false, why: 'state' });
  });
});
