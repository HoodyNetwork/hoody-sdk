// Vitest: the account's link list is read as one page (100 links, newest first: the API's largest). A Bot not on that page
// while the API says more pages follow (next_cursor) is not "no link": its own computer's list is read and answers for it.
// Before, such a Bot showed no link and offered Give it a link (which the API then refuses: one live link per Bot).
// The reads go through a live transport (as noaddress.test.tsx): under a fixture transport the page's source answers from
// the bots fixtures, never from a test's rules, so the GET /bot-urls answers below would not be seen.
import { renderHook, waitFor } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import { bump } from '@core/ctx';
import { installTransport, startFixtureMode, type Transport } from '@core/transport';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ROUTES, useBotLink, useLinkUrls } from './data';

type Answer = { data: { bot_urls: unknown[]; next_cursor: string | null } };
const KEY = 'c-atlas~global~chief';
const url = (id: string, computer: string, bot: string) => ({ id, label: id, url: `https://${id}.x.test`, status: 'active', computer_id: computer, bot: { realm: 'global', id: bot, uid: `u-${bot}` } });
const page = (rows: unknown[], next: string | null): Answer => ({ data: { bot_urls: rows, next_cursor: next } });
const chief = url('bu_chief', 'c-atlas', 'chief');
const scout = url('bu_scout', 'c-boreal', 'scout');
const wrap = ({ children }: { children: ReactNode }) => <CoreQueryProvider>{children}</CoreQueryProvider>;

// GET /bot-urls answers `first` (the account's page) or, with computer_id, `here` (that computer's list); every query is kept.
let asked: Array<Readonly<Record<string, string>>> = [];
let first: Answer = page([], null);
let here: Answer = page([], null);
const live: Transport = {
  hoody(_method, u, _body, _opts, meta) {
    if (meta?.route?.id === ROUTES.urlList.id) {
      const query = Object.fromEntries(new URL(u, 'http://x').searchParams);
      asked.push(query);
      return Promise.resolve(query.computer_id ? here : first);
    }
    return Promise.reject({ status: 503, code: 'unavailable' });
  },
  fetch: () => Promise.resolve(new Response(JSON.stringify({ code: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } })),
};
function boot(account: Answer, computer: Answer = page([], null)) {
  asked = [];
  first = account;
  here = computer;
  bump('test-boot');
  startFixtureMode([], { realm: 'global', target: { project: { id: 'p1' }, container: { id: 'c-atlas', server_name: 'n12' } } });
  installTransport(live);
  queryClient.clear();
}
afterEach(() => installTransport(null));
const computerReads = () => asked.filter((q) => q.computer_id !== undefined);

describe('a Bot\'s link when the account has more links than one page', () => {
  it('on a page with nothing after it: found, or no link, and nothing more is read (the control)', async () => {
    boot(page([scout, chief], null));
    const h = renderHook(() => useBotLink(KEY), { wrapper: wrap });
    await waitFor(() => expect(h.result.current.link?.id).toBe('bu_chief'), { timeout: 10_000 });
    h.unmount();
    boot(page([scout], null));
    const g = renderHook(() => useBotLink(KEY), { wrapper: wrap });
    await waitFor(() => expect(g.result.current.data).toBeDefined(), { timeout: 10_000 });
    expect(g.result.current.link).toBeNull();
    expect(asked.length).toBeGreaterThan(0);
    expect(computerReads()).toEqual([]);
  }, 30_000);

  it('not on a page with more after it: its computer\'s list is read and shows its link', async () => {
    boot(page([scout], 'c2'), page([chief], null));
    const h = renderHook(() => useBotLink(KEY), { wrapper: wrap });
    await waitFor(() => expect(h.result.current.link?.id).toBe('bu_chief'), { timeout: 10_000 });
    expect(computerReads()[0]).toMatchObject({ computer_id: 'c-atlas', limit: '100' });
  }, 30_000);

  it('its computer\'s whole list without it: no link', async () => {
    boot(page([scout], 'c2'), page([], null));
    const h = renderHook(() => useBotLink(KEY), { wrapper: wrap });
    await waitFor(() => expect(computerReads().length).toBe(1), { timeout: 10_000 });
    await waitFor(() => expect(h.result.current.data).toBeDefined(), { timeout: 10_000 });
    expect(h.result.current.link).toBeNull();
  }, 30_000);

  it('its computer\'s list a page with more after it, still without it: nothing is known (no data, never "no link")', async () => {
    boot(page([scout], 'c2'), page([url('bu_other', 'c-atlas', 'scribe')], 'c3'));
    const h = renderHook(() => useBotLink(KEY), { wrapper: wrap });
    await waitFor(() => expect(computerReads().length).toBe(1), { timeout: 10_000 });
    await waitFor(() => expect(h.result.current.isPending).toBe(false), { timeout: 10_000 });
    expect(h.result.current.data).toBeUndefined();
    expect(h.result.current.link).toBeNull();
  }, 30_000);

  it('the list\'s Copy link says "no address" only for a Bot a whole list shows without a link', async () => {
    boot(page([scout], 'c2'));
    const h = renderHook(() => useLinkUrls(), { wrapper: wrap });
    await waitFor(() => expect(h.result.current.data).toBeDefined(), { timeout: 10_000 });
    expect(asked.length).toBeGreaterThan(0);
    expect(h.result.current.noAddress(KEY)).toBe(false);
    h.unmount();
    boot(page([scout], null));
    const g = renderHook(() => useLinkUrls(), { wrapper: wrap });
    await waitFor(() => expect(g.result.current.data).toBeDefined(), { timeout: 10_000 });
    expect(g.result.current.noAddress(KEY)).toBe(true);
  }, 30_000);
});
