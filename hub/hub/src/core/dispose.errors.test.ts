// dispose.ts: every reset runs although one throws, and the first error is the one thrown: the purge or crypt error
// before a reset's. resetLeave clears its own bookkeeping although the host's unsubscribe throws.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdLeave, leaveCount, onLeaveCount } from './leave';
import { otpPrompt, otpState } from './otp';
import { accountEnded, pin } from './realm';
import { boot, R1 } from './test/env';

const crypt = { fail: null as Error | null };
const notifications = { fail: null as Error | null };
vi.mock('./notifications', async (orig) => {
  const real = await orig<{ resetNotifications: () => void }>();
  return { ...real, resetNotifications: () => { real.resetNotifications(); if (notifications.fail) throw notifications.fail; } };
});
const leaveState = () => (globalThis as unknown as Record<symbol, { failed: unknown[]; holds: Map<number, unknown>; listeners: Set<unknown> }>)[Symbol.for('hoody.hub.leave.3')]!;
vi.mock('./cryptStore', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  cryptIdleForTests: async () => { if (crypt.fail) throw crypt.fail; },
}));

const unloadOffFails = (err: Error) => {
  const real = window.removeEventListener.bind(window);
  vi.spyOn(window, 'removeEventListener').mockImplementation(((type: string, ...rest: unknown[]) => {
    if (type === 'beforeunload') throw err;
    return (real as (...a: unknown[]) => void)(type, ...rest);
  }) as typeof window.removeEventListener);
};
afterEach(() => { crypt.fail = null; notifications.fail = null; vi.restoreAllMocks(); });

describe('disposeCoreSession when a reset throws', () => {
  it('the unsubscribe error is thrown, after every later reset ran and resetLeave cleared its own state', async () => {
    const { disposeCoreSession } = await import('./dispose');
    boot();
    const told = vi.fn();
    onLeaveCount(told);
    holdLeave('upload');
    expect(told).toHaveBeenCalledTimes(1); // the hold
    expect(pin(R1)).toBe(true);
    const err = new Error('unsubscribe failed');
    unloadOffFails(err);
    await expect(disposeCoreSession('term-quit')).rejects.toBe(err);
    expect(told).toHaveBeenCalledTimes(2); // the listeners were still told, once
    expect(leaveCount()).toBe(0);
    expect(leaveState().failed.length).toBe(1); // the failed unsubscribe is kept, to try again
    expect(leaveState().listeners.size).toBe(0);
    expect(accountEnded()).toBe(false); // resetRealm, after resetCore, ran
    expect(pin(R1)).toBe(true); // and the realm pin of the next session is free
    vi.restoreAllMocks();
    holdLeave('upload');
    expect(leaveCount()).toBe(1);
    expect(told).toHaveBeenCalledTimes(2); // the listener set was cleared with the rest
  });
  it('an earlier purge or crypt failure is the error thrown, not the reset failure after it', async () => {
    const { disposeCoreSession } = await import('./dispose');
    boot();
    holdLeave('upload');
    const first = new Error('crypt store never settled');
    crypt.fail = first;
    unloadOffFails(new Error('unsubscribe failed'));
    await expect(disposeCoreSession('term-error')).rejects.toBe(first);
    expect(leaveCount()).toBe(0);
    expect(pin(R1)).toBe(true);
  });
  it('two resets throw: both later resets still ran and the first error is the one thrown', async () => {
    const { disposeCoreSession } = await import('./dispose');
    boot();
    void otpPrompt.ask(); // resetOtp comes after both failing resets
    expect(otpState().open).toBe(true);
    holdLeave('upload');
    const first = new Error('unsubscribe failed'), second = new Error('notifications failed');
    notifications.fail = second;
    unloadOffFails(first);
    await expect(disposeCoreSession('term-quit')).rejects.toBe(first);
    expect(otpState().open).toBe(false);
  });
});
