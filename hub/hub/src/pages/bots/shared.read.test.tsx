// Vitest: the Bots page's computers and Bots readers (useComputers) and
// the Board picker's reader (core useComputerBots, given the target the picker builds from its computer row) mounted
// together on a live transport. They share one read per computer: one query, and the same rows on the page and in
// the picker. Which one names the computer's address first does not matter, and after a server move that both have
// seen, the next read goes to the new server, whichever saw the move first.
import { act, renderHook, waitFor } from '@app/testing';
import { CoreQueryProvider, containersRoute, queryClient, sourceReads, useComputerBots } from '@core';
import { bump, type Target } from '@core/ctx';
import { installTransport, startFixtureMode, type Transport } from '@core/transport';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useBots, useComputers } from './data';

const R = '0123456789abcdef01234567';
// The computer's server as the containers answer has it now (the flat server_name, its routing node); each Bots request
// answers with a Bot named for the server it reached, so a read sent to the old server shows. The row also carries a
// nested server.name, a subserver display name that never moves and is never a routing node: a read
// sent to it would show as 'on-n12'.
// A held containers answer lets the picker name the address before the page has read it.
const w = { server: 's1', bots: [] as string[], hold: null as Promise<void> | null };
const live: Transport = {
  hoody(_method, _url, _body, _opts, meta) {
    if (meta?.route?.id === containersRoute.id) {
      const answer = () => ({ data: { computers: [{ id: 'c1', name: 'atlas', status: 'running', project_id: 'p1', server_name: w.server, server: { name: 'n12' } }] } });
      return w.hold ? w.hold.then(answer) : Promise.resolve(answer());
    }
    return Promise.reject({ status: 503, code: 'unavailable' });
  },
  fetch(url, init) {
    const server = /^https:\/\/[^/]*-1\.([^./]+)\./.exec(url)?.[1] ?? '';
    if ((init.method ?? 'GET') === 'GET' && new URL(url).pathname.endsWith('/bots')) {
      w.bots.push(server);
      return Promise.resolve(new Response(JSON.stringify({ items: [{ id: 'on-' + server, name: 'On ' + server, realm: R }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return Promise.resolve(new Response(JSON.stringify({ code: 'not_found', message: 'none' }), { status: 404, headers: { 'content-type': 'application/json' } }));
  },
};
const wrap = ({ children }: { children: ReactNode }) => <CoreQueryProvider>{children}</CoreQueryProvider>;
// The target the Board picker builds from its computer row (pages/board/parts/Picker.tsx).
const pickerTarget = (server: string): Target => ({ project: { id: 'p1' }, container: { id: 'c1', server_name: server } });

function mount(picker: string | null) {
  return renderHook(({ picker: at }: { picker: string | null }) => ({
    page: useComputers(),
    rows: useBots(),
    picker: useComputerBots(at === null ? null : pickerTarget(at)),
  }), { wrapper: wrap, initialProps: { picker } });
}
const c1Queries = () => queryClient.getQueryCache().findAll({ predicate: (q) => sourceReads('bots', 'computerBots', { computer: 'c1' })(q.queryKey) });
const pickerNames = (h: ReturnType<typeof mount>) => h.result.current.picker.bots?.map((b) => b.id);
const rereadBots = () => act(async () => { await queryClient.invalidateQueries({ predicate: (q) => sourceReads('bots', ['computerBots'])(q.queryKey) }); });
const pageNames = (h: ReturnType<typeof mount>) => h.result.current.rows.data?.map((r) => r.id);
const rereadComputers = (h: ReturnType<typeof mount>) => act(async () => { await h.result.current.page.refetch(); });

beforeEach(() => {
  bump('test-boot');
  startFixtureMode([], { realm: 'global', target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } } });
  installTransport(live);
  queryClient.clear();
  w.server = 's1';
  w.bots = [];
  w.hold = null;
});
afterEach(() => installTransport(null));

describe("the Bots page's read and the Board picker's read of one computer", () => {
  it('the page names the address first, then the picker mounts: one query, the same rows for both, all sent to it', async () => {
    const h = mount(null);
    await waitFor(() => expect(pageNames(h)).toEqual(['on-s1']), { timeout: 10_000 });
    h.rerender({ picker: 's1' });
    await waitFor(() => expect(pickerNames(h)).toEqual(['on-s1']), { timeout: 10_000 });
    expect(c1Queries()).toHaveLength(1);
    expect(new Set(w.bots)).toEqual(new Set(['s1']));
  }, 30_000);

  it('the picker names the address first, before the page has read the computers: the page shows the same read', async () => {
    let release = () => undefined as void;
    w.hold = new Promise<void>((r) => { release = r; });
    const h = mount('s1');
    await waitFor(() => expect(pickerNames(h)).toEqual(['on-s1']), { timeout: 10_000 });
    expect(pageNames(h)).toBeUndefined();
    await act(async () => { release(); });
    await waitFor(() => expect(pageNames(h)).toEqual(['on-s1']), { timeout: 10_000 });
    expect(c1Queries()).toHaveLength(1);
    expect(new Set(w.bots)).toEqual(new Set(['s1']));
  }, 30_000);

  it.each<[string, (h: ReturnType<typeof mount>) => Promise<void>]>([
    ['the page sees the move first, then the picker', async (h) => { await rereadComputers(h); h.rerender({ picker: 's2' }); }],
    ['the picker sees the move first, then the page', async (h) => { h.rerender({ picker: 's2' }); await rereadComputers(h); }],
  ])('a server move, %s: the next read goes to the new server, for both', async (_, see) => {
    const h = mount('s1');
    await waitFor(() => expect(pickerNames(h)).toEqual(['on-s1']), { timeout: 10_000 });
    await waitFor(() => expect(pageNames(h)).toEqual(['on-s1']), { timeout: 10_000 });
    w.server = 's2';
    await see(h);
    w.bots = [];
    await rereadBots();
    await waitFor(() => expect(pickerNames(h)).toEqual(['on-s2']), { timeout: 10_000 });
    await waitFor(() => expect(pageNames(h)).toEqual(['on-s2']), { timeout: 10_000 });
    expect(new Set(w.bots)).toEqual(new Set(['s2']));
    expect(c1Queries()).toHaveLength(1);
  }, 30_000);
});
