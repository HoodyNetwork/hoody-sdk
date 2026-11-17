// The switchers' realm-list refresh: one read at a time; an open in a newer
// context (a realm switch or account change since the running read began, whose answer core will drop) queues exactly
// one more read for after it, so the first open after a switch still gets fresh counts.
import { afterEach, describe, expect, it, vi } from 'vitest';

const reads = vi.hoisted(() => ({ pending: [] as { resolve: () => void; reject: (e: unknown) => void }[] }));
vi.mock('@core/shell', () => ({
  loadRealms: () =>
    new Promise<null>((resolve, reject) => {
      reads.pending.push({ resolve: () => resolve(null), reject });
    }),
}));
const { refreshRealms } = await import('./realmsRefresh');

const settle = async (i: number, ok = true) => {
  if (ok) reads.pending[i]!.resolve();
  else reads.pending[i]!.reject(new Error('read failed'));
  for (let n = 0; n < 5; n++) await Promise.resolve();
};

afterEach(async () => {
  // Let every read end so the next test starts with none running.
  for (let i = 0; i < reads.pending.length; i++) await settle(i);
  reads.pending.length = 0;
});

describe('refreshRealms', () => {
  it('opens in the same context while a read runs add no request; after it ends, an open reads again', async () => {
    refreshRealms(1);
    refreshRealms(1);
    refreshRealms(1);
    expect(reads.pending).toHaveLength(1);
    await settle(0);
    expect(reads.pending).toHaveLength(1);
    refreshRealms(1);
    expect(reads.pending).toHaveLength(2);
  });

  it('an open after a realm switch, while the old read runs: one more read once it ends (never two at once)', async () => {
    refreshRealms(1);
    refreshRealms(2);
    refreshRealms(2);
    expect(reads.pending).toHaveLength(1);
    await settle(0);
    expect(reads.pending).toHaveLength(2);
    await settle(1);
    expect(reads.pending).toHaveLength(2);
  });

  it('the old read failing still lets the queued read go; a failure is swallowed', async () => {
    refreshRealms(3);
    refreshRealms(4);
    await settle(0, false);
    expect(reads.pending).toHaveLength(2);
  });
});
