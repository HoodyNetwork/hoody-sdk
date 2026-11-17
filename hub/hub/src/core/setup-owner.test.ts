// setup-owner.test.ts: the retry minute is strictly the pressing account's. api() is replaced so a late
// "never went out" answer of one account can arrive after another account pressed. The modules are loaded fresh
// (the shared test setup already loaded core with the real api).
import { describe, expect, it, vi } from 'vitest';
import type * as ApiModule from './api';

const sends: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
vi.mock('./api', async (orig) => {
  const real = await orig<typeof ApiModule>();
  return { ...real, api: vi.fn(() => new Promise((resolve, reject) => { sends.push({ resolve, reject }); })) };
});
vi.resetModules();
const { boot, OTHER, UID } = await import('./test/env');
const { setIdentity, snapshot } = await import('./ctx');
const { resetSetup, retrySetup, retrySetupWait } = await import('./setup');

describe('an old account\'s late answer never clears another account\'s retry minute', () => {
  it('A presses, B presses, A\'s request is refused unsent: B still waits its minute; A\'s own minute is released', async () => {
    boot();
    resetSetup();
    setIdentity({ id: UID, banned: false });
    const a = retrySetup();
    expect(retrySetupWait()).toBeGreaterThan(0);
    setIdentity({ id: OTHER, banned: false });
    expect(snapshot().account).toBe(OTHER);
    const b = retrySetup();
    expect(sends).toHaveLength(2);
    sends[1]!.resolve({ data: {} });
    expect(await b).toMatchObject({ outcome: 'done' });
    expect(retrySetupWait()).toBeGreaterThan(59000);
    sends[0]!.reject({ kind: 'not_sent', notSent: true });
    expect(await a).toMatchObject({ outcome: 'not_sent' });
    expect(retrySetupWait()).toBeGreaterThan(59000);
    setIdentity({ id: UID, banned: false });
    expect(retrySetupWait()).toBe(0);
  });
});
