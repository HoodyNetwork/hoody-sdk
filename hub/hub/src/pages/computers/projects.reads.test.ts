// Vitest: the project delete's reads (count and check) run one after another and are bounded, so a read that
// never answers holds up a later one only until its timeout, and the later one then makes its own request.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, calls, onFetch, signIn } from '@core/test/env';
import { countProjectComputers, projectGone, PROJECT_READ_MS } from './data';

afterEach(() => { vi.useRealTimers(); });

describe('project delete reads', () => {
  it('a check that never answers times out as unknown; the next check then reads for itself', async () => {
    boot();
    signIn();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    let n = 0;
    onFetch(() => (n++ === 0 ? new Promise(() => undefined) : { status: 404, body: { error: 'Not Found' } }));
    const a = projectGone('p'.repeat(24));
    const b = projectGone('q'.repeat(24));
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.filter((c) => c.url.includes('/projects/'))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PROJECT_READ_MS + 6000);
    expect(await a).toBeNull();
    expect(await b).toBe(true);
    expect(calls.filter((c) => c.url.includes('/projects/'))).toHaveLength(2);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('a count that never answers times out as unknown; the next count then reads for itself', async () => {
    boot();
    signIn();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    let n = 0;
    onFetch(() => (n++ === 0 ? new Promise(() => undefined) : { status: 200, body: { data: { pagination: { total: 0 } } } }));
    const a = countProjectComputers('p'.repeat(24));
    const b = countProjectComputers('q'.repeat(24));
    await vi.advanceTimersByTimeAsync(PROJECT_READ_MS + 6000);
    expect(await a).toBeNull();
    expect(await b).toBe(0);
  });
});
