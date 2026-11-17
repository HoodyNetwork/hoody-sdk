// Loops list on a live page: the real core over a fake fetch. Each row shows its chat (the session's title,
// read in the row's realm), the count against the computer's 8-loop limit across every realm, the pause warning, and
// Every / Runs / Spent / State. It sends nothing (every request is a GET).
// eslint-disable-next-line no-restricted-imports -- a router harness for the list's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryClient } from '@core';
import { boot, calls, onFetch, settle, type Reply } from '@core/test/env';
import { pin } from '@core/realm';
import { interpolate } from '@kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LoopsList } from './List';
import strings from './List.strings.en.json';
import aiStrings from '../../strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const R2 = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const loop = (o: Record<string, unknown> = {}) => ({
  id: 'loop_0000aaaa', session_id: 'sess-1', prompt: 'Check CI on main', interval_ms: 1800000, max_runs: 50, run_count: 7,
  paused: false, state: 'running', realm: R1, spent_usd: 0.04, ...o,
});
let loops: unknown[] = [];
let sessions: Record<string, Reply> = {};
let pinned = false;
let failList = false;
let badList = false;

const path = (u: string) => new URL(u).pathname;
const realmOf = (u: string) => new URL(u).searchParams.get('realm');
const listCalls = () => calls.filter((c) => path(c.url).endsWith('/agent/loops'));
const sessionCalls = () => calls.filter((c) => /\/agent\/sessions\/[^/]+$/.test(path(c.url)));

// Text inside a longer sentence of one element.
const within_ = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const flush = async () => {
  for (let i = 0; i < 20; i++) await act(async () => { await settle(); });
};
async function show(o: { href?: boolean; at?: string } = {}) {
  const href = o.href === false ? undefined : (sid: string, realm: string) => `/ai/c/${realm}/${sid}`;
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <LoopsList computer="atlas" chatHref={href} /> }),
    history: createMemoryHistory({ initialEntries: [o.at ?? '/ai/auto/loops'] }),
  });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  await flush();
  return router;
}

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  pinned = false;
  failList = false;
  badList = false;
  loops = [
    loop(),
    loop({ id: 'loop_0000bbbb', session_id: 'sess-2', prompt: 'Watch the backup job', interval_ms: 300000, run_count: 12, paused: true, state: 'paused', realm: R2, spent_usd: undefined }),
  ];
  sessions = {
    'sess-1': { status: 200, body: { session: { id: 'sess-1', name: 'Fix the failing checkout tests', first_message: 'hi' } } },
    'sess-2': { status: 200, body: { session: { id: 'sess-2', first_message: 'Nightly backup of /data\nand more' } } },
  };
  onFetch((c) => {
    const p = path(c.url);
    if (p.endsWith('/agent/loops')) {
      if (failList) return { status: 500, body: { error: 'boom', code: 'internal' } };
      if (badList) return { status: 200, body: { meta: {} } };
      if (pinned && realmOf(c.url) === 'all') return { status: 400, body: { error: 'pinned', code: 'realm_scope_unsupported' } };
      return { status: 200, body: { items: loops, meta: { total: loops.length } } };
    }
    const m = /\/agent\/sessions\/([^/]+)$/.exec(p);
    if (m) return sessions[decodeURIComponent(m[1]!)] ?? { status: 404, body: { error: 'session not found', code: 'not_found' } };
    return { status: 404, body: {} };
  });
});
afterEach(() => cleanup());

describe('loops list', () => {
  it('lists every realm and counts active loops against the 8-loop limit of the computer', async () => {
    loops.push(loop({ id: 'loop_0000cccc', state: 'firing', realm: R2 }), loop({ id: 'loop_0000dddd', state: 'ended', paused: true, run_count: 50 }));
    await show();
    expect(listCalls().length).toBeGreaterThan(0);
    expect(listCalls().every((c) => realmOf(c.url) === 'all')).toBe(true);
    expect(screen.getByText(interpolate(strings.cap, { n: 2, max: 8, computer: 'atlas' }))).toBeInTheDocument();
    expect(screen.getByText(within_(interpolate(strings.noteCap, { max: 8, computer: 'atlas' })))).toBeInTheDocument();
  });

  it('each row shows its chat: the title read in the row realm, linked when the host gives a link', async () => {
    await show();
    const chat = await screen.findByRole('link', { name: 'Fix the failing checkout tests' });
    expect(chat).toHaveAttribute('href', `/ai/c/${R1}/sess-1`);
    expect(screen.getByRole('link', { name: 'Nightly backup of /data' })).toHaveAttribute('href', `/ai/c/${R2}/sess-2`);
    const reads = sessionCalls().map((c) => [path(c.url).split('/').pop(), realmOf(c.url) ?? c.headers['x-hoody-realm']]);
    expect(reads).toEqual(expect.arrayContaining([['sess-1', R1], ['sess-2', R2]]));
    expect(reads).toHaveLength(2);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('the note (a Why under the table) links to the loops, TODOs and workflows question, which opens its answer in place', async () => {
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.noteQ }));
    await userEvent.click(await screen.findByRole('link', { name: strings.more }));
    expect(await screen.findByText(aiStrings['faq.autoKinds.a'])).toBeInTheDocument();
  });

  it('a chat that cannot be read shows a short id, and plain text without a host link', async () => {
    delete sessions['sess-2'];
    await show({ href: false });
    // The only link left is the page's FAQ link (loops, TODOs and workflows, in the note's Why), never one to the chat.
    await userEvent.click(await screen.findByRole('button', { name: strings.noteQ }));
    expect(screen.queryAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/ai/auto/loops#faq-autoKinds']);
    expect(await screen.findByText('Fix the failing checkout tests')).toBeInTheDocument();
    expect(screen.getByText(interpolate(strings['chat.unread'], { id: 'sess-2' }))).toBeInTheDocument();
  });

  it('a chat that has no title says so; it is not a chat that could not be read', async () => {
    sessions['sess-1'] = { status: 200, body: { session: { id: 'sess-1' } } };
    await show({ href: false });
    expect(await screen.findByText(strings['chat.untitled'])).toBeInTheDocument();
    expect(screen.queryByText(interpolate(strings['chat.unread'], { id: 'sess-1' }))).toBeNull();
  });

  it('shows the pause warning in its own words', async () => {
    await show();
    expect(screen.getByText(/A paused loop no longer keeps its chat open: if nobody has the chat open, the agent may close it, and the loop ends with it\./)).toBeInTheDocument();
  });

  it('Every, Runs, Spent and State per row', async () => {
    await show();
    const row1 = screen.getByText('Check CI on main').closest('tr')!;
    expect(within(row1).getByText(interpolate(strings['every.min'], { n: 30 }))).toBeInTheDocument();
    expect(within(row1).getByText(interpolate(strings['runs.of'], { n: 7, max: 50 }))).toBeInTheDocument();
    expect(within(row1).getByText('$0.04')).toBeInTheDocument();
    expect(within(row1).getByText(strings['st.running'])).toBeInTheDocument();
    const row2 = screen.getByText('Watch the backup job').closest('tr')!;
    expect(within(row2).getByText(interpolate(strings['every.min'], { n: 5 }))).toBeInTheDocument();
    expect(within(row2).getByText(strings['spent.free'])).toBeInTheDocument();
    expect(within(row2).getByText(strings['st.paused'])).toBeInTheDocument();
  });

  it('an agent pinned to one realm: the list falls back to this realm and the count says so', async () => {
    pinned = true;
    await show();
    expect(listCalls().some((c) => realmOf(c.url) === 'all')).toBe(true);
    expect(listCalls().some((c) => realmOf(c.url) === R1)).toBe(true);
    expect(await screen.findByText('Check CI on main')).toBeInTheDocument();
    expect(screen.getByText(interpolate(strings.capHere, { n: 1, max: 8, computer: 'atlas' }))).toBeInTheDocument();
    expect(screen.queryByText(interpolate(strings.cap, { n: 1, max: 8, computer: 'atlas' }))).toBeNull();
  });

  it('no count is claimed while the list cannot be read', async () => {
    failList = true;
    await show();
    expect(await screen.findByText(strings['error.title'])).toBeInTheDocument();
    expect(screen.queryByText(/of 8 active/)).toBeNull();
  });

  it('the view for a list that cannot be read keeps the link to the loops, TODOs and workflows answer', async () => {
    failList = true;
    await show();
    expect(await screen.findByText(strings['error.title'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: strings.more }));
    expect(await screen.findByText(aiStrings['faq.autoKinds.a'])).toBeInTheDocument();
  });

  it.each([['some', true], ['none', false]])('a failed refresh drops the count (%s listed before); a recovered read brings it back', async (_, some) => {
    if (!some) loops = [];
    await show();
    const cap = interpolate(strings.cap, { n: some ? 1 : 0, max: 8, computer: 'atlas' });
    expect(screen.getByText(cap)).toBeInTheDocument();
    const refresh = async () => {
      await act(async () => { await queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('auto.loops') }); });
      await flush();
    };
    failList = true;
    await refresh();
    expect(screen.queryByText(/of 8 active/)).toBeNull();
    if (some) expect(screen.getByText('Check CI on main')).toBeInTheDocument();
    failList = false;
    await refresh();
    expect(screen.getByText(cap)).toBeInTheDocument();
  });

  it('a token session pinned to every realm still counts the whole computer', async () => {
    pin('all');
    await show();
    expect(await screen.findByText('Check CI on main')).toBeInTheDocument();
    expect(screen.getByText(interpolate(strings.cap, { n: 1, max: 8, computer: 'atlas' }))).toBeInTheDocument();
  });

  it('a token session pinned to one realm counts that realm only', async () => {
    pin(R1);
    await show();
    expect(await screen.findByText('Check CI on main')).toBeInTheDocument();
    expect(screen.getByText(interpolate(strings.capHere, { n: 1, max: 8, computer: 'atlas' }))).toBeInTheDocument();
    expect(screen.queryByText(interpolate(strings.cap, { n: 1, max: 8, computer: 'atlas' }))).toBeNull();
  });

  it('an answer that is not a listing fails the read: never "no loops", never a count', async () => {
    badList = true;
    await show();
    expect(await screen.findByText(strings['error.title'])).toBeInTheDocument();
    expect(screen.queryByText(interpolate(strings['empty.title'], { computer: 'atlas' }))).toBeNull();
    expect(screen.queryByText(/of 8 active/)).toBeNull();
  });

  it('a session answer that names no session is a chat not read, never an untitled one', async () => {
    sessions['sess-1'] = { status: 200, body: {} };
    await show({ href: false });
    expect(await screen.findByText(interpolate(strings['chat.unread'], { id: 'sess-1' }))).toBeInTheDocument();
    expect(screen.queryByText(strings['chat.untitled'])).toBeNull();
  });

  it('opening a loop shows its detail beside the list, with the selection in the URL', async () => {
    const router = await show();
    await userEvent.click(screen.getByText('Watch the backup job'));
    await flush();
    expect(router.state.location.search).toMatchObject({ sel: `${R2}/sess-2/loop_0000bbbb` });
    expect(screen.getByRole('heading', { name: 'Watch the backup job' })).toBeInTheDocument();
    // The paused plate: what pausing does now, and what follows if nobody has the chat open.
    expect(screen.getByText(strings['d.pausedNote'])).toBeInTheDocument();
    expect(screen.getByText(strings['d.pausedNext'])).toBeInTheDocument();
    expect(screen.getByText(interpolate(strings['d.memory'], { computer: 'atlas' }))).toBeInTheDocument();
  });

  it('a loop that is over says why it stopped and the agent words on its last problem; no next run', async () => {
    loops = [loop({ state: 'stopped', paused: true, stop_reason: 'max_cost_usd', last_error: 'budget reached', next_in_ms: 0, prompt: 'Line one\nLine two' })];
    await show({ at: `/ai/auto/loops?sel=${encodeURIComponent(`${R1}/sess-1/loop_0000aaaa`)}` });
    expect(await screen.findByText(strings['stop.max_cost_usd'])).toBeInTheDocument();
    expect(screen.getByText('budget reached')).toBeInTheDocument();
    expect(screen.queryByText(strings['d.next'])).toBeNull();
    expect(screen.queryByText(strings['d.pausedNote'])).toBeNull();
    // It ran (7 runs) but the agent gave no time for the last one: never "Not yet".
    expect(screen.queryByText(strings['d.notYet'])).toBeNull();
  });

  it('a loop that has not run yet says so', async () => {
    loops = [loop({ run_count: 0 })];
    await show({ at: `/ai/auto/loops?sel=${encodeURIComponent(`${R1}/sess-1/loop_0000aaaa`)}` });
    expect(await screen.findByText(strings['d.notYet'])).toBeInTheDocument();
  });

  it('a selected loop that is no longer listed says so', async () => {
    await show({ at: `/ai/auto/loops?sel=${encodeURIComponent(`${R1}/sess-9/loop_gone`)}` });
    expect(await screen.findByText(strings['d.notFound'])).toBeInTheDocument();
  });
});
