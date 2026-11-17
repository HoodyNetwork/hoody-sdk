// Vitest: the Notes computers list is never "no computers" from a body it could not read or from an empty first page of a
// longer list: the page would say Get a computer. Those are the query's error state (Try again). A non-empty page, or an empty whole
// list, reads as before.
import { CoreQueryProvider, queryClient } from '@core';
import { renderHook, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, onFetch, R1, type Reply } from '@core/test/env';

vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return { ...real, fixtureModeActive: () => false };
});

import { toComputers, useComputers } from './data';

const row = (id: string) => ({ id, project_id: 'p1', name: id, status: 'running', server_name: 'sv1', realm_ids: [] });
const answer = (data: unknown) => onFetch((c): Reply => (c.method === 'GET' && new URL(c.url).pathname.endsWith('/computers') ? { status: 200, body: { data } } : { status: 404, body: { code: 'not_found' } }));
const settled = async (r: { result: { current: { isSuccess: boolean; isError: boolean } } }) => waitFor(() => expect(r.result.current.isSuccess || r.result.current.isError).toBe(true));

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
});

describe('the Notes computers list that is not known', () => {
  it('a body without a list is an error, not no computers', async () => {
    answer({});
    const r = renderHook(() => useComputers(), { wrapper: CoreQueryProvider });
    await settled(r);
    expect(r.result.current.isError).toBe(true);
    expect(r.result.current.data).toBeUndefined();
  });

  it('an empty first page of a longer list is an error, not no computers', async () => {
    answer({ computers: [], pagination: { totalPages: 3 } });
    const r = renderHook(() => useComputers(), { wrapper: CoreQueryProvider });
    await settled(r);
    expect(r.result.current.isError).toBe(true);
    expect(r.result.current.data).toBeUndefined();
  });

  it('an empty whole list is no computers (Get a computer)', async () => {
    answer({ computers: [], pagination: { totalPages: 1 } });
    const r = renderHook(() => useComputers(), { wrapper: CoreQueryProvider });
    await settled(r);
    expect(r.result.current.isError).toBe(false);
    expect(r.result.current.data).toEqual([]);
  });

  it('a non-empty first page of a longer list lists what it holds', async () => {
    answer({ computers: [row('c1')], pagination: { totalPages: 3 } });
    const r = renderHook(() => useComputers(), { wrapper: CoreQueryProvider });
    await settled(r);
    expect(r.result.current.data?.map((c) => c.id)).toEqual(['c1']);
  });

  it('a plain array still parses (toComputers, for the fixtures)', () => {
    expect(toComputers([row('c1')]).map((c) => c.id)).toEqual(['c1']);
  });
});
