// Vitest: the agent's home comes only from the latest read of GET /sessions/cwds. A home read once is
// not offered while a later read of the same computer and realm fails (the folders keep their last answer, as before).
// eslint-disable-next-line no-restricted-imports -- a test harness, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { queryClient } from '@core';
import { target as shownTarget } from '@core/ctx';
import { boot, onFetch, settle } from '@core/test/env';
import { beforeEach, describe, expect, it } from 'vitest';
import { useFolders } from './data';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
let down = false;
const flush = async () => {
  for (let i = 0; i < 20; i++) await act(async () => { await settle(); });
};
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  down = false;
  onFetch((c) => {
    if (c.method === 'GET' && new URL(c.url).pathname.endsWith('/sessions/cwds')) {
      return down ? { status: 500, body: { code: 'internal', error: 'down' } } : { status: 200, body: { cwds: ['/srv/data'], home: '/home/ada' } };
    }
    return { status: 404, body: { code: 'not_found', error: 'nope' } };
  });
});

describe('the home folder of the cwds read', () => {
  it('is offered from an answered read, and not while a later read fails', async () => {
    const h = renderHook(() => useFolders(shownTarget(), R1), { wrapper });
    await flush();
    expect(h.result.current.state).toBe('ok');
    expect(h.result.current.home).toBe('/home/ada');
    down = true;
    await act(async () => { h.result.current.retry?.(); });
    await flush();
    expect(h.result.current.state).toBe('failed');
    expect(h.result.current.home).toBeNull();
    // It comes back with the next answered read.
    down = false;
    await act(async () => { h.result.current.retry?.(); });
    await flush();
    expect(h.result.current.home).toBe('/home/ada');
  });
});
