// dispose.ts: a crypt store that never settles (stuck mid-load after a crash) bounds the dispose instead of hanging it:
// CRYPT_SETTLE_TIMEOUT after the bound, the resets still run.
import { afterEach, describe, expect, it } from 'vitest';
import { __disposeCoreSeams, disposeCoreSession } from './dispose';
import { accountEnded, pin } from './realm';
import { boot, R1 } from './test/env';

afterEach(() => { __disposeCoreSeams.setCryptIdle(null); __disposeCoreSeams.setSettleMs(null); });

describe('disposeCoreSession with a crypt store that never settles', () => {
  it('rejects CRYPT_SETTLE_TIMEOUT within the bound, and the resets have run', async () => {
    __disposeCoreSeams.setCryptIdle(() => new Promise<void>(() => {}));
    __disposeCoreSeams.setSettleMs(50);
    boot();
    expect(pin(R1)).toBe(true);
    const t0 = Date.now();
    await expect(disposeCoreSession('term-error')).rejects.toThrow('CRYPT_SETTLE_TIMEOUT');
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(accountEnded()).toBe(false);
    expect(pin(R1)).toBe(true);
  });
  it('a store that settles in time: no error from the bound', async () => {
    __disposeCoreSeams.setCryptIdle(() => Promise.resolve());
    __disposeCoreSeams.setSettleMs(50);
    boot();
    await expect(disposeCoreSession('term-error')).resolves.toBeUndefined();
  });
});
