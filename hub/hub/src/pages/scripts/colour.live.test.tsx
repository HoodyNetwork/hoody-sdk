// Vitest on the computers list the Scripts page reads (GET /computers), over core's real request path: each
// computer keeps its colour as the API sends it, for the New script picker's mark; none when the API sends none.
import { CoreQueryProvider, queryClient } from '@core';
import { renderHook, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, onFetch, R1, type Reply } from '@core/test/env';

const world = vi.hoisted(() => ({ computer: 'c1', color: undefined as unknown }));
vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return { ...real, fixtureModeActive: () => false, useCurrentComputer: () => ({ project: { id: 'p1' }, container: { id: world.computer, server_name: 'sv1' } }) };
});

import { useOverview } from './data';

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch((c): Reply => {
    const u = new URL(c.url);
    if (c.method === 'GET' && u.pathname.endsWith('/computers')) {
      // A stopped computer: the page reads nothing else from it.
      const row = { id: 'c1', project_id: 'p1', name: 'atlas', status: 'stopped', server_name: 'sv1', realm_ids: [], ...(world.color !== undefined ? { color: world.color } : {}) };
      return { status: 200, body: { data: { computers: [row] } } };
    }
    return { status: 404, body: { code: 'not_found' } };
  });
});

async function first() {
  const r = renderHook(() => useOverview(), { wrapper: CoreQueryProvider });
  await waitFor(() => expect(r.result.current.data?.computers.length ?? 0).toBeGreaterThan(0));
  return r.result.current.data!.computers[0]!;
}

describe('the Scripts computers list keeps the API colour', () => {
  it('a computer keeps its colour as the API sends it (the picker mark normalises it)', async () => {
    world.color = '#3b82f6';
    expect((await first()).color).toBe('#3b82f6');
  });

  it('no colour, or one that is not a string, gives none', async () => {
    world.color = undefined;
    expect(await first()).not.toHaveProperty('color');
    queryClient.clear();
    world.color = 7;
    expect(await first()).not.toHaveProperty('color');
  });
});
