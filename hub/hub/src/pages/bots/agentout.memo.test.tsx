// Vitest: the page's own Bots read, through core and a live transport. A computer whose Bots read keeps
// failing, never read yet (status error, dataUpdatedAt 0), tells "signed out" exactly while the agent's latest refusal says so: an
// ordinary failure that turns into restriction_unknown offers the sign-in, and back again takes it away.
import { act, renderHook, waitFor } from '@app/testing';
import { CoreQueryProvider, containersRoute, queryClient } from '@core';
import { bump } from '@core/ctx';
import { installTransport, startFixtureMode, type Transport } from '@core/transport';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useComputers } from './data';

const w = { code: 'unavailable', sent: [] as string[] };
const live: Transport = {
  hoody(method, url, _body, _opts, meta) {
    w.sent.push(`hoody ${method} ${url}`);
    if (meta?.route?.id === containersRoute.id) return Promise.resolve({ data: { computers: [{ id: 'c1', name: 'atlas', status: 'running', project_id: 'p1', server_name: 's1', server: { name: 'n12' } }] } });
    return Promise.reject({ status: 503, code: w.code });
  },
  fetch(url, init) {
    w.sent.push(`fetch ${init.method ?? 'GET'} ${url}`);
    return Promise.resolve(new Response(JSON.stringify({ code: w.code, message: 'refused' }), { status: 503, headers: { 'content-type': 'application/json' } }));
  },
};
const wrap = ({ children }: { children: ReactNode }) => <CoreQueryProvider>{children}</CoreQueryProvider>;

beforeEach(() => {
  bump('test-boot');
  startFixtureMode([], { realm: 'global', target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } } });
  installTransport(live);
  queryClient.clear();
  w.code = 'unavailable';
  w.sent = [];
});
afterEach(() => installTransport(null));

describe('a never-read Bots read whose refusal changes', () => {
  it('ordinary failure, then restriction_unknown, then ordinary again: agentOut follows the latest refusal', async () => {
    const h = renderHook(() => useComputers(), { wrapper: wrap });
    const c1 = () => h.result.current.data?.find((c) => c.id === 'c1');
    await waitFor(() => expect(c1()?.listState).toBe('failed'), { timeout: 10_000 });
    expect(c1()?.agentOut).toBeUndefined();
    w.code = 'restriction_unknown';
    await act(async () => { expect(await h.result.current.rereadBots('c1')).toBe(false); });
    await waitFor(() => expect(c1()?.agentOut).toBe(true), { timeout: 10_000 });
    expect(c1()?.listState).toBe('failed');
    w.code = 'unavailable';
    await act(async () => { expect(await h.result.current.rereadBots('c1')).toBe(false); });
    await waitFor(() => expect(c1()?.agentOut).toBeUndefined(), { timeout: 10_000 });
    expect(c1()?.listState).toBe('failed');
    // Every Bots read went to the flat routing node s1, never to the nested display name n12.
    const reads = w.sent.filter((x) => x.startsWith('fetch '));
    expect(reads.length).toBeGreaterThanOrEqual(3);
    expect(reads.filter((x) => !/^fetch GET https:\/\/[^/]*-1\.s1\./.test(x))).toEqual([]);
    expect(reads.filter((x) => x.includes('n12'))).toEqual([]);
  }, 60_000);
});
