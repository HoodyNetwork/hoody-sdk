// script-asks.ts draft records (New script): one per draft in the same key, under the same lock and
// account rule, compare-and-set on the whole record; a value with drafts is v 2, so an older build never writes over it; a
// value without drafts stays v 1; ended records go after a day; bounds refuse, never push out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setIdentity } from './ctx';
import {
  dropDraftRecord, putDraftRecord, putScriptAsk, readDraftRecords, readScriptAsks, validDraftRecord, DRAFTS_MAX, DRAFT_KEEP_MS, SCRIPT_ASKS_KEY,
  type DraftRecord, type ScriptAsk,
} from './script-asks';
import { boot, R1 } from './test/env';

const OTHER = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const rec = (draftId: string, o: Partial<DraftRecord> = {}): DraftRecord => ({
  draftId, mode: 'ai', project: 'p1', compId: 'comp-1', realm: R1, owner: 'fp1', exec: 1, current: 1, retained: null, state: 'open', deploy: null, updatedAt: Date.now(), ...o,
});
const deploy = { kind: 'write' as const, path: 'default/1/probe.ts', opId: 'op-0001', sentAfter: 1000, attempt: 1, beatAt: 1, phase: 'sending' as const };
const ask = (askId: string): ScriptAsk => ({ askId, compId: 'comp-1', path: 'new:abcdefghij.1', realm: R1, owner: 'fp1', sessionId: null, turnId: null, phase: 'create', sentAt: 1000, createKey: 'ck-' + askId, turnKey: 'tk-' + askId });
const stored = () => JSON.parse(localStorage.getItem(SCRIPT_ASKS_KEY) ?? 'null') as { v: number; accounts: Record<string, unknown>; drafts?: Record<string, unknown> } | null;

beforeEach(() => { boot({ realm: R1 }); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('draft records', () => {
  it('a value with drafts is v 2; drafts and asks keep each other; the last draft gone makes it v 1 again', async () => {
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    expect(stored()?.v).toBe(1);
    expect(stored()).not.toHaveProperty('drafts');
    const r = rec('abcdefghij');
    expect(await putDraftRecord(r, null)).toBe('ok');
    expect(stored()?.v).toBe(2);
    expect(readDraftRecords()).toEqual([r]);
    expect(readScriptAsks()).toEqual([ask('a1')]);
    // an asks-only write keeps the drafts
    expect(await putScriptAsk(ask('a2'), null)).toBe('ok');
    expect(readDraftRecords()).toEqual([r]);
    expect(await dropDraftRecord(r)).toBe('ok');
    expect(stored()?.v).toBe(1);
    expect(readScriptAsks()).toHaveLength(2);
  });

  it('compare-and-set: a stale record never lands; of two tabs moving one draft, exactly one wins', async () => {
    const r0 = rec('abcdefghij');
    expect(await putDraftRecord(r0, null)).toBe('ok');
    expect(await putDraftRecord(r0, null)).toBe('changed');
    const a = { ...r0, current: 2 };
    const b = { ...r0, state: 'deploying' as const, deploy };
    const got = await Promise.all([putDraftRecord(a, r0), putDraftRecord(b, r0)]);
    expect(got.filter((x) => x === 'ok')).toHaveLength(1);
    expect(got.filter((x) => x === 'changed')).toHaveLength(1);
    expect(await dropDraftRecord(r0)).toBe('changed');
  });

  it('shape: a deploy exactly while one may be out or was made; no extra field; bounds', () => {
    expect(validDraftRecord(rec('abcdefghij'))).toBe(true);
    expect(validDraftRecord(rec('abcdefghij', { state: 'deploying', deploy }))).toBe(true);
    expect(validDraftRecord(rec('abcdefghij', { state: 'deploying' }))).toBe(false);
    expect(validDraftRecord(rec('abcdefghij', { deploy }))).toBe(false);
    expect(validDraftRecord({ ...rec('abcdefghij'), prompt: 'secret' })).toBe(false);
    expect(validDraftRecord(rec('ABCDEFGHIJ'))).toBe(false);
    expect(validDraftRecord(rec('abcdefghij', { exec: 0 }))).toBe(false);
    // the project names the attempt places (new:<project>/…): only a plain id
    for (const project of ['', 'p/1', 'p 1', 'x'.repeat(65), 'p\n']) expect(validDraftRecord(rec('abcdefghij', { project }))).toBe(false);
    expect(validDraftRecord(rec('abcdefghij', { state: 'deploying', deploy: { ...deploy, extra: 1 } as never }))).toBe(false);
    for (const phase of ['didnt', 'held']) expect(validDraftRecord(rec('abcdefghij', { state: 'deploying', deploy: { ...deploy, phase } as never }))).toBe(true);
    expect(validDraftRecord(rec('abcdefghij', { state: 'deploying', deploy: { ...deploy, phase: 'open' } as never }))).toBe(false);
    const { phase: _p, ...noPhase } = deploy;
    expect(validDraftRecord(rec('abcdefghij', { state: 'deploying', deploy: noPhase as never }))).toBe(false);
  });

  it('another account reads none and its records are untouched; a value an older build could misread is never written over', async () => {
    expect(await putDraftRecord(rec('abcdefghij'), null)).toBe('ok');
    setIdentity({ id: OTHER, banned: false });
    expect(readDraftRecords()).toEqual([]);
    localStorage.setItem(SCRIPT_ASKS_KEY, JSON.stringify({ v: 1, accounts: {}, drafts: {} }));
    expect(readDraftRecords()).toBe('unreadable');
    expect(await putDraftRecord(rec('bcdefghijk'), null)).toBe('unreadable');
    localStorage.setItem(SCRIPT_ASKS_KEY, JSON.stringify({ v: 3, accounts: {} }));
    expect(await putScriptAsk(ask('a1'), null)).toBe('unreadable');
  });

  it('ended records older than a day are dropped by the next write; open and deploying ones never are', async () => {
    const old = Date.now() - DRAFT_KEEP_MS - 1;
    expect(await putDraftRecord(rec('aaaaaaaaaa', { state: 'consumed', deploy, updatedAt: old }), null)).toBe('ok');
    expect(await putDraftRecord(rec('bbbbbbbbbb', { state: 'discarded', updatedAt: old }), null)).toBe('ok');
    expect(await putDraftRecord(rec('cccccccccc', { state: 'deploying', deploy, updatedAt: old }), null)).toBe('ok');
    expect(await putDraftRecord(rec('dddddddddd', { updatedAt: old }), null)).toBe('ok');
    expect((readDraftRecords() as DraftRecord[]).map((r) => r.draftId).sort()).toEqual(['cccccccccc', 'dddddddddd']);
  });

  it('past DRAFTS_MAX a new record is refused; nothing stored is pushed out', async () => {
    for (let i = 0; i < DRAFTS_MAX; i++) expect(await putDraftRecord(rec(`d${String(i).padStart(9, '0')}`), null)).toBe('ok');
    expect(await putDraftRecord(rec('zzzzzzzzzz'), null)).toBe('full');
    expect(readDraftRecords()).toHaveLength(DRAFTS_MAX);
  });
});
