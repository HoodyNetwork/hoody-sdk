// Vitest: the agent address rule on the Bots page. The routing node is the flat server_name only;
// a running computer with only a nested server.name (a subserver display name) has no address, so its Bots are never read.
// Its row then says the read failed (unknown), never 'ok' with no Bots, and no request goes to the display name.
import { renderHook, waitFor } from '@app/testing';
import { CoreQueryProvider, containersRoute, queryClient } from '@core';
import { bump } from '@core/ctx';
import { installTransport, startFixtureMode, type Transport } from '@core/transport';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useComputers } from './data';

const R = '0123456789abcdef01234567';
const sent: string[] = [];
const live: Transport = {
  hoody(_method, _url, _body, _opts, meta) {
    if (meta?.route?.id === containersRoute.id) {
      return Promise.resolve({ data: { computers: [
        { id: 'c1', name: 'atlas', status: 'running', project_id: 'p1', server_name: 'n12', server: { name: 'fra-7' } },
        { id: 'c2', name: 'borealis', status: 'running', project_id: 'p1', server: { name: 'ash-3' } },
        { id: 'c3', name: 'cirrus', status: 'stopped', project_id: 'p1', server: { name: 'ash-3' } },
      ] } });
    }
    return Promise.reject({ status: 503, code: 'unavailable' });
  },
  fetch(url, init) {
    sent.push(`${init.method ?? 'GET'} ${url}`);
    if ((init.method ?? 'GET') === 'GET' && new URL(url).pathname.endsWith('/bots')) {
      return Promise.resolve(new Response(JSON.stringify({ items: [{ id: 'b1', name: 'One', realm: R }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return Promise.resolve(new Response(JSON.stringify({ code: 'not_found', message: 'none' }), { status: 404, headers: { 'content-type': 'application/json' } }));
  },
};
const wrap = ({ children }: { children: ReactNode }) => <CoreQueryProvider>{children}</CoreQueryProvider>;

beforeEach(() => {
  bump('test-boot');
  startFixtureMode([], { realm: 'global', target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'n12' } } });
  installTransport(live);
  queryClient.clear();
  sent.length = 0;
});
afterEach(() => installTransport(null));

describe('a running computer with no flat server_name on the Bots page', () => {
  it('is never read and shows as failed (unknown), never ok; the addressed one is read at its flat node; a stopped one stays ok', async () => {
    const h = renderHook(() => useComputers(), { wrapper: wrap });
    const row = (id: string) => h.result.current.data?.find((c) => c.id === id);
    await waitFor(() => expect(sent.length).toBeGreaterThan(0), { timeout: 10_000 });
    await waitFor(() => expect(row('c1')?.listState).toBe('ok'), { timeout: 10_000 });
    expect(row('c2')?.listState).toBe('failed');
    expect(row('c3')?.listState).toBe('ok');
    expect(sent.every((x) => /^GET https:\/\/[^/]*-1\.n12\./.test(x))).toBe(true);
    expect(sent.filter((x) => x.includes('ash-3') || x.includes('fra-7'))).toEqual([]);
  }, 30_000);
});
