// Vitest: the Scripts overview never answers "no computer" for the selected computer from a body it could not read or from a
// first page of a longer list that lacks it (the page would say No computer selected). Those are the overview's error state
// (Try again). A whole list that lacks it, or a short page with no pagination, still answers no computer.
import { CoreQueryProvider, queryClient } from '@core';
import { renderHook, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, onFetch, R1, type Reply } from '@core/test/env';

const world = vi.hoisted(() => ({ computer: 'c9' }));
vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return { ...real, fixtureModeActive: () => false, useCurrentComputer: () => ({ project: { id: 'p1' }, container: { id: world.computer, server_name: 'sv1' } }) };
});

import { useOverview } from './data';

const row = (id: string) => ({ id, project_id: 'p1', name: id, status: 'running', server_name: 'sv1', realm_ids: [] });
const answer = (data: unknown) => onFetch((c): Reply => (c.method === 'GET' && new URL(c.url).pathname.endsWith('/computers') ? { status: 200, body: { data } } : { status: 404, body: { code: 'not_found' } }));
const settled = (r: { result: { current: { data?: unknown; isError: boolean } } }) => waitFor(() => expect(r.result.current.data !== undefined || r.result.current.isError).toBe(true));
const others = [row('c1'), row('c2')];

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  world.computer = 'c9';
});

describe('the Scripts overview when the selected computer is not in the list', () => {
  it('a body without a list is an error, not no computer', async () => {
    answer({});
    const r = renderHook(() => useOverview(), { wrapper: CoreQueryProvider });
    await settled(r);
    expect(r.result.current.isError).toBe(true);
    expect(r.result.current.data).toBeUndefined();
  });

  it('a first page of a longer list that lacks the computer is an error, not no computer', async () => {
    answer({ computers: others, pagination: { totalPages: 2 } });
    const r = renderHook(() => useOverview(), { wrapper: CoreQueryProvider });
    await settled(r);
    expect(r.result.current.isError).toBe(true);
    expect(r.result.current.data).toBeUndefined();
  });

  it('a full page of 100 rows with no pagination that lacks the computer is an error', async () => {
    answer({ computers: Array.from({ length: 100 }, (_, i) => row(`x${i}`)) });
    const r = renderHook(() => useOverview(), { wrapper: CoreQueryProvider });
    await settled(r);
    expect(r.result.current.isError).toBe(true);
  });

  it('a whole list that lacks the computer answers no computer', async () => {
    answer({ computers: others, pagination: { totalPages: 1 } });
    const r = renderHook(() => useOverview(), { wrapper: CoreQueryProvider });
    await settled(r);
    expect(r.result.current.isError).toBe(false);
    expect(r.result.current.data).toEqual({ computers: [] });
  });

  it('a short page with no pagination that lacks the computer answers no computer', async () => {
    answer({ computers: others });
    const r = renderHook(() => useOverview(), { wrapper: CoreQueryProvider });
    await settled(r);
    expect(r.result.current.data).toEqual({ computers: [] });
  });

  it('with no computer selected there is nothing to look up: no computer, whatever the list', async () => {
    world.computer = '';
    answer({ computers: others, pagination: { totalPages: 2 } });
    const r = renderHook(() => useOverview(), { wrapper: CoreQueryProvider });
    await settled(r);
    expect(r.result.current.isError).toBe(false);
    expect(r.result.current.data).toEqual({ computers: [] });
  });
});
