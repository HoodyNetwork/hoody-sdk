// dispose.ts: a step that fails still leaves core reusable, and the error is thrown.
import { describe, expect, it, vi } from 'vitest';
import { accountEnded, pin } from './realm';
import { boot, R1 } from './test/env';

vi.mock('./cryptStore', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  cryptIdleForTests: async () => { throw new Error('crypt store never settled'); },
}));

describe('disposeCoreSession when the crypt store does not settle', () => {
  it('rejects with that error, but the resets have run', async () => {
    const { disposeCoreSession } = await import('./dispose');
    boot();
    expect(pin(R1)).toBe(true);
    await expect(disposeCoreSession('term-error')).rejects.toThrow('never settled');
    expect(accountEnded()).toBe(false);
    expect(pin(R1)).toBe(true);
  });
});
