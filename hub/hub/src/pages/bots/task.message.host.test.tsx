// Vitest on a live page: the message form as the Bot's pane mounts it. A message left unresolved about one task is that task's alone (the form
// of another task is fresh), stays in reach in the Bot's pane when the task is no longer listed and after a reload, and Stop tracking frees
// exactly that task's hold.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent, waitFor, within } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { heldMessageTasks, registerTargets, type Delegate } from './data';
import { MessageTaskHost, PendingMessages, openTaskOf } from './parts/MessageTask';
import strings from './strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEY = `c1~${R1}~chief`;
const task = (sessionId: string, title: string): Delegate => ({ sessionId, title, state: 'working', computerId: 'c1', model: 'm', waitingOn: null, startedAt: 'x' });
const A = task('sa', 'Read deploy log');
const B = task('sb', 'Draft reply');
const flush = async () => {
  for (let i = 0; i < 20; i++) await act(async () => { await settle(); });
};
const posts = () => calls.filter((c) => c.method === 'POST' && /\/bots\/[^/]+\/messages$/.test(new URL(c.url).pathname));

let setTask: (t: Delegate | undefined) => void = () => undefined;
let setTasks: (t: Delegate[]) => void = () => undefined;
// The address names the task (`param`); the form opens on it only while it is a running task of the Bot, as the Bot's pane decides.
function Root({ first, list }: { first: Delegate | undefined; list: Delegate[] }) {
  const [param, setParam] = useState<string | undefined>(first?.sessionId);
  const [tasks, setList] = useState<Delegate[]>(list);
  setTask = (t) => setParam(t?.sessionId);
  setTasks = setList;
  const open = openTaskOf(param, tasks);
  return (
    <>
      <PendingMessages botKey={KEY} tasks={tasks} openId={open?.sessionId} />
      <MessageTaskHost botKey={KEY} task={open} onClose={() => setParam(undefined)} reads={[]} />
    </>
  );
}
async function show(first: Delegate | undefined, list: Delegate[] = [A, B]): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Root first={first} list={list} /> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
  await flush();
}
const form = () => screen.findByRole('dialog');
async function sendFrom(words: string) {
  const dialog = await form();
  await userEvent.type(within(dialog).getByRole('textbox', { name: strings['task.msgLabel'] }), words);
  await userEvent.click(within(dialog).getByRole('button', { name: strings['task.msgSend'] }));
  await flush();
}
const pendingTitle = (title: string) => strings['task.pendingTitle'].replace('{{title}}', title);

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }]);
  onFetch((c) => (c.method === 'POST' ? { status: 0, network: true } : { status: 200, body: { data: {} } }));
});
afterEach(() => cleanup());

describe('a message left unresolved about one task', () => {
  it('is that task\'s only: another task\'s form opens fresh, and the first is listed in the pane', async () => {
    await show(A);
    await sendFrom('first words');
    expect(within(await form()).getByText(strings['task.msgMaybe'])).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
    // The open form shows its own uncertainty; the pane does not say it a second time.
    expect(screen.queryByText(pendingTitle('Read deploy log'))).toBeNull();
    // Open the other task without leaving the Bot.
    await act(async () => setTask(B));
    await flush();
    const dialog = await form();
    expect(within(dialog).queryByText(strings['task.msgMaybe'])).toBeNull();
    expect(within(dialog).getByRole('textbox', { name: strings['task.msgLabel'] })).toBeEnabled();
    expect(screen.getByText(pendingTitle('Read deploy log'))).toBeInTheDocument();
    // The other task sends once, and the first stays unresolved.
    onFetch((c) => (c.method === 'POST' ? { status: 202, body: { message_id: 'm2', state: 'accepted' } } : { status: 200, body: { data: {} } }));
    await sendFrom('second words');
    expect(posts()).toHaveLength(2);
    expect(await screen.findByText(strings['task.msgSent'])).toBeInTheDocument();
    expect(screen.getByText(pendingTitle('Read deploy log'))).toBeInTheDocument();
  });

  it('with its address still naming the task, a task that leaves the list keeps its message in the pane and opens no form', async () => {
    await show(A);
    await sendFrom('first words');
    // The form is open on A (address names A). A finishes: the address still says A, the form closes, the hold must show.
    await act(async () => setTasks([B]));
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(pendingTitle(strings['task.pendingGone']))).toBeInTheDocument();
  });

  it('stays in reach when its task is no longer listed, and after a reload; Stop tracking frees exactly that hold', async () => {
    await show(A);
    await sendFrom('first words');
    await act(async () => setTask(undefined));
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(pendingTitle('Read deploy log'))).toBeInTheDocument();
    // The task finishes and leaves the list.
    await act(async () => setTasks([B]));
    await flush();
    expect(screen.getByText(pendingTitle(strings['task.pendingGone']))).toBeInTheDocument();
    // A reload: nothing of the page survives but the hold.
    cleanup();
    await show(undefined, []);
    expect(screen.getByText(pendingTitle(strings['task.pendingGone']))).toBeInTheDocument();
    const before = posts().length;
    await userEvent.click(screen.getByRole('button', { name: 'Stop tracking' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Stop tracking anyway' }));
    await waitFor(() => expect(screen.queryByText(pendingTitle(strings['task.pendingGone']))).toBeNull());
    expect(posts()).toHaveLength(before);
  });
});

describe('the task the form opens on', () => {
  it('is a running task of the Bot named by the address, nothing else', () => {
    const done: Delegate = { ...A, state: 'closed' };
    expect(openTaskOf('sa', [A, B])).toBe(A);
    expect(openTaskOf('sa', [done, B])).toBeUndefined();
    expect(openTaskOf('zz', [A, B])).toBeUndefined();
    expect(openTaskOf(undefined, [A, B])).toBeUndefined();
    expect(openTaskOf('', [A, B])).toBeUndefined();
  });
});

describe('which tasks hold a message', () => {
  const id = (bot: string, sid: string) => `acct\u0001l:bots.sendMessage.${bot}.${sid}@${R1}\u0000digest`;
  it('reads the task from a hold of this Bot only, once', () => {
    expect(heldMessageTasks(KEY, [{ id: id(KEY, 'sa') }, { id: id(KEY, 'sa') }, { id: id(KEY, 'sb') }])).toEqual(['sa', 'sb']);
    expect(heldMessageTasks(KEY, [{ id: id(`c1~${R1}~scout`, 'sa') }, { id: `acct\u0001l:bots.stopDelegate.${KEY}@${R1}\u0000d` }, { id: 'junk' }])).toEqual([]);
  });
});

describe('the Bot\'s pane mounts both', () => {
  // The pane itself is too heavy to render live here: this holds the wiring the tests above rely on.
  const pane = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'parts', 'BotPane.tsx'), 'utf8');
  it('the task\'s form and the list of unresolved messages', () => {
    expect(pane).toMatch(/<MessageTaskHost botKey=\{botKey\} task=\{msgTask\}/);
    expect(pane).toMatch(/<PendingMessages botKey=\{botKey\} tasks=\{delegatesQ\.delegates\} openId=\{msgTask\?\.sessionId\}/);
    expect(pane).toMatch(/const msgTask = openTaskOf\(msgParam, delegatesQ\.delegates\)/);
  });
});
