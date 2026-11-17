// Vitest: claimRetryMinute, the one per-account setup-retry minute core's retrySetup and Home's retry both take.
// A claim's release frees only that claim (never a later press's, never another account's).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, OTHER, UID } from './test/env';
import { setIdentity } from './ctx';
import { claimRetryMinute, resetSetup, retrySetupWait } from './setup';

afterEach(() => vi.useRealTimers());

function fresh() {
  boot();
  resetSetup();
  setIdentity({ id: UID, banned: false });
}

describe('claimRetryMinute', () => {
  it('claims the minute once; a second claim inside it is refused', () => {
    fresh();
    const a = claimRetryMinute();
    expect(a).not.toBeNull();
    expect(retrySetupWait()).toBeGreaterThan(59000);
    expect(claimRetryMinute()).toBeNull();
  });

  it('a released claim frees the minute', () => {
    fresh();
    claimRetryMinute()!.release();
    expect(retrySetupWait()).toBe(0);
    expect(claimRetryMinute()).not.toBeNull();
  });

  it('a late release of an old claim never frees a newer press\'s minute', () => {
    vi.useFakeTimers();
    fresh();
    const a = claimRetryMinute()!;
    vi.setSystemTime(Date.now() + 60001);
    const b = claimRetryMinute();
    expect(b).not.toBeNull();
    a.release();
    expect(retrySetupWait()).toBeGreaterThan(59000);
    expect(claimRetryMinute()).toBeNull();
  });

  it('the minute is the account\'s: another account claims its own, and a release touches only its own', () => {
    fresh();
    const a = claimRetryMinute()!;
    setIdentity({ id: OTHER, banned: false });
    expect(retrySetupWait()).toBe(0);
    const b = claimRetryMinute();
    expect(b).not.toBeNull();
    a.release();
    expect(retrySetupWait()).toBeGreaterThan(59000);
    setIdentity({ id: UID, banned: false });
    expect(retrySetupWait()).toBe(0);
  });
});
