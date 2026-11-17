// Vitest: where each shared folder resolves (useRealPaths), on real core over the fixture transport. A folder that is
// gone (404) has nothing under it, so it is judged by its own spelling; any other failed read leaves the plan unable
// to tell what a delete would take from the other computer, so it fails the whole read, with a retry that only reads.
import { answers, bootFixtureCore, fixtureWorld, queryClient, reply, type FixtureRequest } from '@core';
// eslint-disable-next-line no-restricted-imports -- a hook harness, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { computerOf, useRealPaths } from './data';
import { realpathRoute } from './routes';

const W = fixtureWorld;
const atlas = W.computers.find((c) => c.name === 'atlas')!;
const C = computerOf(atlas)!;
const WAIT = { timeout: 8000 };
const asked: string[] = [];
let failing = true;

// As the files fixtures read it: the parts after /api/v1/files/realpath.
const pathOf = (r: FixtureRequest) => '/' + (r.path.split('?')[0] ?? '').split('/').slice(5).filter(Boolean).map(decodeURIComponent).join('/');
const rules = [reply(realpathRoute, (r: FixtureRequest) => {
  const p = pathOf(r);
  asked.push(p);
  if (p === '/srv/gone') return answers.refused(404, 'NOT_FOUND');
  if (p === '/home/ada/link' && failing) return answers.pending5xx(502);
  return answers.ok({ path: p, real_path: p === '/home/ada/link' ? '/mnt/real' : p });
})];
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

afterEach(() => { cleanup(); asked.length = 0; failing = true; });

describe('useRealPaths', () => {
  it('a shared folder whose resolution failed fails the whole read: never judged by its spelling alone; retry reads again', async () => {
    bootFixtureCore({ rules });
    const { result } = renderHook(() => useRealPaths(C, ['/home/ada/link', '/srv/data'], true), { wrapper: wrap });
    await waitFor(() => expect(result.current).toBeDefined(), WAIT);
    expect(result.current).toEqual(expect.objectContaining({ failed: true }));
    failing = false;
    const before = asked.filter((p) => p === '/home/ada/link').length;
    await act(async () => { if (result.current && 'failed' in result.current) result.current.retry(); });
    await waitFor(() => expect(result.current && 'real' in result.current ? result.current.real.get('/home/ada/link') : undefined).toBe('/mnt/real'), WAIT);
    expect(asked.filter((p) => p === '/home/ada/link').length).toBeGreaterThan(before);
  });

  it('a shared folder the Hub cannot address (reserved first name) fails the whole read, unsent: it may be a link', async () => {
    failing = false;
    bootFixtureCore({ rules });
    const { result } = renderHook(() => useRealPaths(C, ['/realpath/link', '/srv/data'], true), { wrapper: wrap });
    await waitFor(() => expect(result.current).toBeDefined(), WAIT);
    expect(result.current).toEqual(expect.objectContaining({ failed: true }));
    expect(asked).not.toContain('/realpath/link');
  });

  it('a shared folder that is gone (404) is left out: judged by its own spelling, the read is not failed', async () => {
    failing = false;
    bootFixtureCore({ rules });
    const { result } = renderHook(() => useRealPaths(C, ['/srv/gone', '/home/ada/link'], true), { wrapper: wrap });
    await waitFor(() => expect(result.current).toBeDefined(), WAIT);
    expect(result.current).toEqual({ real: new Map([['/home/ada/link', '/mnt/real']]) });
  });
});
