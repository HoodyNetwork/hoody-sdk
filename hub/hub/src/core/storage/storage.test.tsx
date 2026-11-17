// The helpers moved out of the computers page: core's barrel hands out the very functions,
// a computer's Subject and target behave as on the computers page (the server unknown: nothing is sent), and the
// runner keeps its C9 rules: an earlier unread send is unknown, never "not sent"; a hold this page's source did not
// send is someone else's (no Dismiss here); a Dismiss always names the hold it showed.
import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import * as core from '../index';
import { boot, R1 } from '../test/env';
import { asUnknown, refusal, useRunner } from './runner';
import { subjectOf, targetOf } from './subject';

beforeEach(() => { boot({ realm: R1 }); });

describe('core storage helpers', () => {
  it('the barrel hands out the very functions', () => {
    expect(core.subjectOf).toBe(subjectOf);
    expect(core.targetOf).toBe(targetOf);
    expect(core.useRunner).toBe(useRunner);
    expect(core.asUnknown).toBe(asUnknown);
  });
  it('a computer row names its server from the flat server_name only (a subserver display name server.name never routes)', () => {
    expect(subjectOf({ id: 'c', project_id: 'p', server_name: 'n1' })).toEqual({ id: 'c', project: 'p', server: 'n1' });
    expect(subjectOf({ id: 'c', project_id: 'p', server_name: 'n1', server: { name: 'n2' } } as Parameters<typeof subjectOf>[0])).toEqual({ id: 'c', project: 'p', server: 'n1' });
    expect(subjectOf({ id: 'c', project_id: 'p', server: { name: 'n2' } } as Parameters<typeof subjectOf>[0])).toEqual({ id: 'c', project: 'p', server: '' });
    expect(subjectOf({ id: 'c', project_id: 'p' })).toEqual({ id: 'c', project: 'p', server: '' });
  });
  it('no target without the computer, its project and its server: the change is not sent', () => {
    expect(targetOf({ id: 'c', project: 'p', server: 'n1' })).toEqual({ project: { id: 'p' }, container: { id: 'c', server_name: 'n1' } });
    expect(() => targetOf({ id: 'c', project: 'p', server: '' })).toThrow('NO_TARGET');
    expect(() => targetOf({ id: '', project: 'p', server: 'n1' })).toThrow('NO_TARGET');
  });
  it('an earlier send still unread (here or on another page) is unknown, never "not sent"', () => {
    expect(asUnknown({ outcome: 'not_sent' as const, code: 'READ_BACK_FIRST' }).outcome).toBe('pending');
    expect(asUnknown({ outcome: 'not_sent' as const, code: 'HELD_BY_OTHER' }).outcome).toBe('pending');
    expect(asUnknown({ outcome: 'not_sent' as const, code: 'NO_TARGET' }).outcome).toBe('not_sent');
  });
  it('refusal facts only for a definite refusal; done and unknown keep their own words', () => {
    expect(refusal({ kind: 'failed', code: 'X', facts: { status: 409 } })).toEqual({ outcome: 'failed', code: 'X', status: 409 });
    expect(refusal({ kind: 'pending' })).toBeUndefined();
    expect(refusal({ kind: 'done' })).toBeUndefined();
  });
  it('a lost answer is unknown (pending), and a second press while it is unknown sends nothing', async () => {
    let sends = 0;
    const m = { mutateAsync: async () => { sends += 1; return { outcome: 'pending' as const }; } };
    const { result } = renderHook(() => useRunner<number>(m));
    await act(async () => { await result.current.run(1); });
    expect(result.current.outcome?.kind).toBe('pending');
    let second: unknown;
    await act(async () => { second = await result.current.run(1); });
    expect(second).toEqual({ outcome: 'not_sent' });
    expect(sends).toBe(1);
  });
  it('a thrown send is unknown, never failed', async () => {
    const m = { mutateAsync: async () => { throw new Error('lost'); } };
    const { result } = renderHook(() => useRunner<number>(m));
    await act(async () => { await result.current.run(1); });
    expect(result.current.outcome?.kind).toBe('pending');
  });
  it('without a hold token or variables, a held Dismiss frees nothing (never the no-argument Dismiss of every hold)', async () => {
    let called = 0;
    const m = { mutateAsync: async () => ({ outcome: 'done' as const }), dismiss: (async () => { called += 1; return true; }) as never };
    const { result } = renderHook(() => useRunner<number>(m, { lock: 'core.storage.test' }));
    let freed: unknown;
    await act(async () => { freed = await result.current.dismiss(); });
    expect(freed).toBe(false);
    expect(called).toBe(0);
  });
});
