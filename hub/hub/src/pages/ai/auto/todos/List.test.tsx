// TODOs list + thread on a live page: the real core over a fake fetch. Tabs come from each todo's state, lease,
// question and snooze; the thread shows the timeline and the proposed runs; when the store cursor moves past the
// list's, the list and the open todo are read again. It sends nothing (every request is a GET).
// eslint-disable-next-line no-restricted-imports -- a router harness for the list's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryClient } from '@core';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { interpolate } from '@kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TodosList } from './List';
import strings from './List.strings.en.json';
import actionStrings from './Actions.strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const todo = (o: Record<string, unknown>) => ({ num: 1, state: 'ready', priority: 2, rank: 1, cwd: '/w', source: { kind: 'manual' }, created_at: '2026-10-27T08:00:00Z', updated_at: '2026-10-27T09:00:00Z', realm: R1, revision: 1, ...o });
let items: Array<Record<string, unknown>> = [];
let listRev = 3;
let storeRev = 3;
let full: Record<string, unknown> = {};
let listReply: { status: number; body: unknown } | null = null;
let revReply: { status: number; body: unknown } | null = null;

const path = (u: string) => new URL(u).pathname;
const listCalls = () => calls.filter((c) => path(c.url).endsWith('/agent/todos'));
const todoCalls = () => calls.filter((c) => /\/agent\/todos\/todo_/.test(path(c.url)));
const flush = async () => {
  for (let i = 0; i < 20; i++) await act(async () => { await settle(); });
};
async function show(at = '/ai/auto/todos') {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <TodosList computer="atlas" /> }),
    history: createMemoryHistory({ initialEntries: [at] }),
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
  listRev = 3;
  storeRev = 3;
  listReply = null;
  revReply = null;
  items = [
    todo({ id: 'todo_a', num: 1, title: 'Rotate the staging credentials' }),
    todo({ id: 'todo_b', num: 2, title: 'Pick the backup region', needs_human: true, question_for_human: 'Singapore or Frankfurt?' }),
    todo({ id: 'todo_c', num: 3, title: 'Upgrade the database', state: 'in_progress', lease: { daemon_id: 'd', acquired_at: 'x', expires_at: 'y' } }),
    todo({ id: 'todo_d', num: 4, title: 'Renew the domain', wake_at: '2099-01-01T00:00:00Z' }),
    todo({ id: 'todo_e', num: 5, title: 'Write the release notes', state: 'done', closed_at: '2026-10-26T00:00:00Z' }),
  ];
  full = {
    todo_a: { ...items[0], body: 'Use the vault for the new ones.', timeline: [
      { id: 'e1', ts: '2026-10-27T08:00:00Z', kind: 'filed', actor: { kind: 'human' } },
      { id: 'e2', ts: '2026-10-27T08:30:00Z', kind: 'proposal', actor: { kind: 'orchestrator' }, body: 'I can run this with implementer.' },
    ], proposals: [{ id: 'prop_1', action: 'run_worker', agent: 'implementer', prompt: 'Rotate them', status: 'pending', todo_revision: 1, created_at: 'x', expires_at: 'y' }] },
  };
  onFetch((c) => {
    const p = path(c.url);
    if (p.endsWith('/agent/todos') && listReply) return listReply;
    if (p.endsWith('/agent/todos')) return { status: 200, body: { items, meta: { total: items.length }, revision: listRev } };
    if (p.endsWith('/agent/todos/revision') && revReply) return revReply;
    if (p.endsWith('/agent/todos/revision')) return { status: 200, body: { revision: storeRev } };
    const m = /\/agent\/todos\/([^/]+)$/.exec(p);
    if (m) {
      const t = full[m[1]!];
      return t ? { status: 200, body: { status: 'ok', todo: t } } : { status: 404, body: { error: 'not found', code: 'not_found' } };
    }
    return { status: 404, body: {} };
  });
});
afterEach(() => cleanup());

const rowsShown = () => screen.queryAllByRole('row').map((r) => r.textContent ?? '');

describe('TODOs list', () => {
  it('Open is the default tab and holds only open todos', async () => {
    await show();
    expect(screen.getByText('Rotate the staging credentials')).toBeInTheDocument();
    for (const other of ['Pick the backup region', 'Upgrade the database', 'Renew the domain', 'Write the release notes']) expect(screen.queryByText(other)).toBeNull();
  });

  it.each([
    ['waiting', 'Pick the backup region', strings['tab.waiting']],
    ['running', 'Upgrade the database', strings['st.in_progress']],
    ['snoozed', 'Renew the domain', strings['st.ready']],
    ['done', 'Write the release notes', strings['st.done']],
  ])('the %s tab (in the URL) holds its todo only, with what it is waiting on', async (tab, title, state) => {
    await show(`/ai/auto/todos?tab=${tab}`);
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByText('Rotate the staging credentials')).toBeNull();
    const rows = rowsShown().filter((r) => r.includes('#'));
    expect(rows.length).toBe(1);
    expect(rows[0]).toContain(state);
  });

  it('the thread shows the details, the proposed run with its status, and the activity in order', async () => {
    const router = await show();
    await userEvent.click(screen.getByText('Rotate the staging credentials'));
    await flush();
    expect(router.state.location.search).toMatchObject({ sel: `${R1}/todo_a` });
    expect(screen.getByText('Use the vault for the new ones.')).toBeInTheDocument();
    // A waiting run is shown once, in the actions' list of runs waiting for you, with its status.
    expect(screen.getByText(interpolate(actionStrings.proposal, { agent: 'implementer' }))).toBeInTheDocument();
    expect(screen.queryByText(interpolate(strings['t.proposal'], { agent: 'implementer' }))).toBeNull();
    expect(screen.getByText(strings['p.pending'])).toBeInTheDocument();
    const lines = screen.getAllByText(/ · /).map((x) => x.textContent);
    expect(lines).toEqual([
      interpolate(strings.by, { what: strings['k.filed'], who: strings['a.human'] }),
      interpolate(strings.by, { what: strings['k.proposal'], who: strings['a.orchestrator'] }),
    ]);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('a todo waiting only on a proposed run is on Waiting for you, not Open, and says so; one triage also asks about says Waiting for you', async () => {
    items = [
      ...items,
      todo({ id: 'todo_p', num: 6, title: 'Clear the old build cache', pending_proposals: 1 }),
      todo({ id: 'todo_q', num: 7, title: 'Rebuild the search index', pending_proposals: 2 }),
      todo({ id: 'todo_r', num: 8, title: 'Move the logs bucket', pending_proposals: 1, needs_human: true, question_for_human: 'Which region?' }),
    ];
    await show();
    for (const title of ['Clear the old build cache', 'Rebuild the search index', 'Move the logs bucket']) expect(screen.queryByText(title)).toBeNull();
    cleanup();
    await show('/ai/auto/todos?tab=waiting');
    const row = (title: string) => rowsShown().find((r) => r.includes(title)) ?? '';
    expect(row('Clear the old build cache')).toContain(interpolate(strings['waiting.proposals_one'], { count: 1 }));
    expect(row('Rebuild the search index')).toContain(interpolate(strings['waiting.proposals_other'], { count: 2 }));
    expect(row('Move the logs bucket')).toContain(strings['tab.waiting']);
    expect(row('Move the logs bucket')).not.toContain(strings['waiting.proposals_one']);
  });

  it('a list row whose pending_proposals is malformed fails the read: never shown as nothing waiting', async () => {
    items = [...items, todo({ id: 'todo_p', num: 6, title: 'Clear the old build cache', pending_proposals: -1 })];
    await show('/ai/auto/todos?tab=waiting');
    expect(await screen.findByText(strings['error.title'])).toBeInTheDocument();
    expect(screen.queryByText('Pick the backup region')).toBeNull();
  });

  it('what triage asks shows on a waiting todo', async () => {
    await show(`/ai/auto/todos?tab=waiting&sel=${encodeURIComponent(`${R1}/todo_b`)}`);
    expect(await screen.findByRole('heading', { name: 'Pick the backup region' })).toBeInTheDocument();
    expect(screen.getByText(strings['t.question'])).toBeInTheDocument();
    expect(screen.getByText('Singapore or Frankfurt?')).toBeInTheDocument();
  });

  it('a moved store cursor reads the list and the open todo again, once per new cursor', async () => {
    await show(`/ai/auto/todos?sel=${encodeURIComponent(`${R1}/todo_a`)}`);
    const lists = listCalls().length;
    const reads = todoCalls().length;
    expect(lists).toBe(1);
    // The store moved: the list answers at the new cursor.
    storeRev = 4;
    listRev = 4;
    items[0] = { ...items[0], title: 'Rotate the staging and prod credentials' };
    full.todo_a = { ...(full.todo_a as object), title: 'Rotate the staging and prod credentials' };
    await act(async () => { await queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('auto.todosRev') }); });
    await flush();
    expect(listCalls().length).toBe(lists + 1);
    expect(todoCalls().length).toBe(reads + 1);
    expect(screen.getAllByText('Rotate the staging and prod credentials').length).toBeGreaterThan(0);
    // The same cursor again: nothing more is read.
    await act(async () => { await queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('auto.todosRev') }); });
    await flush();
    expect(listCalls().length).toBe(lists + 1);
  });

  it('an answer that is not a listing fails the read: never "nothing open"', async () => {
    listReply = { status: 200, body: { meta: {}, revision: 3 } };
    await show();
    expect(await screen.findByText(strings['error.title'])).toBeInTheDocument();
    expect(screen.queryByText(interpolate(strings['empty.open'], { computer: 'atlas' }))).toBeNull();
  });

  it('a TODO that cannot be read says so; it never shows as a TODO with no activity', async () => {
    await show(`/ai/auto/todos?sel=${encodeURIComponent(`${R1}/todo_d`)}&tab=snoozed`);
    expect(await screen.findByText(strings['t.error'])).toBeInTheDocument();
    expect(screen.queryByText(strings['t.empty'])).toBeNull();
  });

  it('a list member that is not a todo fails the read: never "nothing open"', async () => {
    listReply = { status: 200, body: { items: [{ title: 'no id' }], meta: { total: 1 }, revision: 3 } };
    await show();
    expect(await screen.findByText(strings['error.title'])).toBeInTheDocument();
    expect(screen.queryByText(interpolate(strings['empty.open'], { computer: 'atlas' }))).toBeNull();
  });

  it('a thread whose timeline is malformed says it could not be read, never "no activity"', async () => {
    full.todo_a = { ...(full.todo_a as object), timeline: 'x' };
    await show(`/ai/auto/todos?sel=${encodeURIComponent(`${R1}/todo_a`)}`);
    expect(await screen.findByText(strings['t.error'])).toBeInTheDocument();
    expect(screen.queryByText(strings['t.empty'])).toBeNull();
  });

  it('a thread whose timeline and proposals are null says it could not be read, never "no activity"', async () => {
    full.todo_a = { ...(full.todo_a as object), timeline: null, proposals: null };
    await show(`/ai/auto/todos?sel=${encodeURIComponent(`${R1}/todo_a`)}`);
    expect(await screen.findByText(strings['t.error'])).toBeInTheDocument();
    expect(screen.queryByText(strings['t.empty'])).toBeNull();
    expect(screen.queryByText(strings['t.proposals'])).toBeNull();
  });

  it('a poll cursor that is not a number says it could not check for changes, with Try again; the rows stay', async () => {
    await show();
    revReply = { status: 200, body: { revision: '4' } };
    await act(async () => { await queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('auto.todosRev') }); });
    await flush();
    expect(screen.getByText('Rotate the staging credentials')).toBeInTheDocument();
    expect(screen.getByText(strings.pollFailed)).toBeInTheDocument();
    expect(screen.queryByText(strings['error.title'])).toBeNull();
    revReply = null;
    await act(async () => { screen.getByRole('button', { name: strings.retry }).click(); });
    await flush();
    expect(screen.queryByText(strings.pollFailed)).toBeNull();
  });

  it('an empty list under a failed poll stays the empty state with the poll band, never "could not be read"', async () => {
    items = [];
    await show();
    revReply = { status: 500, body: { error: { code: 'internal_error', message: 'x' } } };
    await act(async () => { await queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('auto.todosRev') }); });
    await flush();
    expect(screen.queryByText(strings['error.title'])).toBeNull();
    expect(screen.getByText(strings.pollFailed)).toBeInTheDocument();
  });

  it('one polled cursor re-reads once, even when the re-read list answers at a newer cursor', async () => {
    await show(`/ai/auto/todos?sel=${encodeURIComponent(`${R1}/todo_a`)}`);
    const lists = listCalls().length;
    const reads = todoCalls().length;
    storeRev = 4;
    listRev = 5; // another change landed while the list was read again
    await act(async () => { await queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('auto.todosRev') }); });
    await flush();
    expect(listCalls().length).toBe(lists + 1);
    expect(todoCalls().length).toBe(reads + 1);
  });

  it('a failed refresh keeps the rows already read', async () => {
    await show();
    listReply = { status: 500, body: { error: 'boom', code: 'internal' } };
    await act(async () => { await queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('"auto.todos"') }); });
    await flush();
    expect(screen.getByText('Rotate the staging credentials')).toBeInTheDocument();
  });

  it('a list that still answers at the older cursor is read once for each new cursor, not on every poll', async () => {
    await show();
    storeRev = 4; // listRev stays 3: the list lags behind the store
    const poll = async () => {
      await act(async () => { await queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('auto.todosRev') }); });
      await flush();
    };
    await poll();
    expect(listCalls().length).toBe(2);
    await poll();
    await poll();
    expect(listCalls().length).toBe(2);
    storeRev = 5;
    await poll();
    expect(listCalls().length).toBe(3);
  });

  it('an unmoved cursor reads nothing more', async () => {
    await show();
    await act(async () => { await queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('auto.todosRev') }); });
    await flush();
    expect(listCalls().length).toBe(1);
  });
});
