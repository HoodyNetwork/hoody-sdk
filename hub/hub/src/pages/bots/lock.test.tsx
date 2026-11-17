// Vitest: a change whose answer is unknown stays locked across an unmount and remount: the same press is
// refused with READ_BACK_FIRST and nothing is sent again.
import { bootFixtureCore, useLockedChange } from '@core';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LOCK_KEYS, changeId, shownOutcome } from './data';

const unknown = () => Promise.reject({ kind: 'pending' });

describe('a pending change survives a remount', () => {
  beforeEach(() => {
    bootFixtureCore({ rules: [] });
  });

  it('is refused with READ_BACK_FIRST under the same id, sending nothing', async () => {
    const id = changeId('saveSettings', { botKey: 'c-atlas~global~chief' });
    let sent = 0;
    const run = () => {
      sent += 1;
      return unknown();
    };
    const first = renderHook(() => useLockedChange(run, [], id));
    let r = await act(() => first.result.current.run({ patch: { name: 'x' } }));
    expect(r.outcome).toBe('pending');
    first.unmount();
    const second = renderHook(() => useLockedChange(run, [], id));
    r = await act(() => second.result.current.run({ patch: { name: 'x' } }));
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(sent).toBe(1);
  });

  it('another Bot is not held by it', async () => {
    expect(changeId('saveSettings', { botKey: 'a~g~one' })).not.toBe(changeId('saveSettings', { botKey: 'a~g~two' }));
  });
});

describe('what a change shows', () => {
  it('a send in flight reads running in a fresh mount (the lock decides, not local state)', () => {
    expect(shownOutcome(true, 'running', 'idle')).toBe('running');
  });
  it('a lock that is free hides a stale local running; pending always wins', () => {
    expect(shownOutcome(true, 'free', 'running')).toBe('idle');
    expect(shownOutcome(true, 'pending', 'idle')).toBe('pending');
  });
  it('under fixtures the local state is the truth', () => {
    expect(shownOutcome(false, 'free', 'running')).toBe('running');
  });
});

describe('a create stays locked whatever name is typed', () => {
  it('create, remount, change the name, press again: one POST', async () => {
    const id = changeId('createBot', { botKey: undefined });
    let sent = 0;
    const run = () => {
      sent += 1;
      return unknown();
    };
    const opts = { realm: true, lockKey: LOCK_KEYS.createBot as (v: unknown) => unknown };
    const first = renderHook(() => useLockedChange(run, [], id, opts));
    await act(() => first.result.current.run({ name: 'Support', computerId: 'c-atlas' }));
    first.unmount();
    const second = renderHook(() => useLockedChange(run, [], id, opts));
    const r = await act(() => second.result.current.run({ name: 'Other name', computerId: 'c-atlas' }));
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(sent).toBe(1);
  });
});
