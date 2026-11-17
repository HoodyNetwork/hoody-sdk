// Vitest on the computers list the Scripts page reads (GET /computers): the API answers 422 to a limit over 100, so the page
// may not ask for more. Over core's real request path; only the network is replaced, by a fake that refuses as the API does.
import { CoreQueryProvider, queryClient } from '@core';
import { renderHook, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, calls, onFetch, R1, type Call, type Reply } from '@core/test/env';

const world = vi.hoisted(() => ({ computer: 'c1' }));
vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return { ...real, fixtureModeActive: () => false, useCurrentComputer: () => ({ project: { id: 'p1' }, container: { id: world.computer, server_name: 'sv1' } }) };
});

import { useOverview } from './data';

const LIMIT_MAX = 100;
const lists = (): Call[] => calls.filter((c) => c.method === 'GET' && new URL(c.url).pathname.endsWith('/computers'));
const limitOf = (c: Call): number => Number(new URL(c.url).searchParams.get('limit'));

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch((c): Reply => {
    const u = new URL(c.url);
    if (c.method === 'GET' && u.pathname.endsWith('/computers')) {
      const n = Number(u.searchParams.get('limit'));
      // the API's own bound: limit is 1..100, anything else is refused
      if (!(n >= 1 && n <= LIMIT_MAX)) return { status: 422, body: { code: 'validation_error' } };
      return { status: 200, body: { data: { computers: [{ id: 'c1', project_id: 'p1', name: 'atlas', status: 'running', server_name: 'sv1', realm_ids: [] }] } } };
    }
    return { status: 404, body: { code: 'not_found' } };
  });
});

describe('the Scripts computers list asks for no more than the API allows', () => {
  it('Scripts reads its computers with a limit of at most 100 and finds the computer', async () => {
    const r = renderHook(() => useOverview(), { wrapper: CoreQueryProvider });
    await waitFor(() => expect(lists().length).toBeGreaterThan(0));
    await waitFor(() => expect(r.result.current.data?.computers.length ?? 0).toBeGreaterThan(0));
    for (const c of lists()) expect(limitOf(c)).toBeLessThanOrEqual(LIMIT_MAX);
    expect(r.result.current.data?.computers[0]?.id).toBe('c1');
  });
});
