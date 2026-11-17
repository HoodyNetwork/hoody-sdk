// A change whose send throws reports core's own word, never a fixture's.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useClaimBonus } from './data';

vi.mock('@core', async (orig) => {
  const core = await orig<Record<string, unknown>>();
  const coreSource = core.coreSource as (...a: unknown[]) => Record<string, unknown>;
  return {
    ...core,
    coreSource: (...a: unknown[]) => ({
      ...coreSource(...a),
      useMutation: () => ({ mutateAsync: () => Promise.reject(new Error('thrown')), reset: () => undefined, dismiss: async () => false, held: () => [] }),
    }),
  };
});

describe('a send that throws', () => {
  it('fails with CALL_FAILED', async () => {
    const { result } = renderHook(() => useClaimBonus());
    let out: { outcome: string; code?: string } | undefined;
    await act(async () => {
      out = await result.current.run();
    });
    expect(out).toEqual({ outcome: 'failed', code: 'CALL_FAILED' });
  });
});
