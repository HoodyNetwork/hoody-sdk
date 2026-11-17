// Push anyway, on real core (fixture transport). Offered in the head's menu only while the answer shown is git's
// refusal of this folder's push (Commit and push: push failed; Push: its push step failed), never after an account
// failure, a repository-state code, a timed-out push, Sync or Pull, nor once another write answered. Its own confirm says
// what is lost and what the lease protects; only it sends force:true, on Push (sync direction push). A forced push follows
// the held-write rules: unknown is held, named "Push anyway" after a remount, never sent again.
import { answers, bootFixtureCore, chooseComputer, computerHandle, fixtureWorld, queryClient, type FixtureRequest } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the page, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the page, not page code
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { chatRules } from '../parts/fixtures.chats';
import FolderPage from './FolderPage';
import { agentError, folderRules, repoRules, writeRules, type WriteOpts } from './fixtures';
import { folderKey } from './key';
import strings from './strings.en.json';
import { forgetMessages } from './writes';

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const borealis = fixtureWorld.computers.find((c) => c.name === 'borealis')!;
const ACME = borealis.realm_ids[0]!;
const SHOP = '/home/ada/projects/shop';
const URL_ = `/ai/f/${folderKey(SHOP)}?${new URLSearchParams({ computer: computerHandle(borealis), realm: ACME, tab: 'repository' }).toString()}`;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const MSG = 'Read the port from the environment';
const REJECTED = '! [rejected] main -> main (fetch first)';
const pushFailed = agentError(502, 'push_failed', { committed: true, output: REJECTED });
const pushStepFailed = agentError(502, 'sync_step_failed', { failed_step: 'github.push', steps: [{ step: 'github.push', result: { status: 'error', message: REJECTED } }] });
const ok = answers.ok({ status: 'ok', steps: [{ step: 'github.push', result: { status: 'ok' } }] });

let sent: FixtureRequest[] = [];
let host: HTMLElement = document.body;
const writes = () => sent.filter((r) => r.method === 'POST');
async function open(o: WriteOpts = {}, keep = false) {
  if (!keep) sent = [];
  const see = (r: FixtureRequest) => sent.push(r);
  if (!keep) bootFixtureCore({ rules: [...folderRules({ onSend: see }), ...chatRules({ onSend: see }), ...repoRules({ onSend: see }), ...writeRules({ ...o, onSend: see })] });
  act(() => chooseComputer(atlas));
  const root = createRootRoute({ component: Outlet });
  const tab = createRoute({ getParentRoute: () => root, path: '/ai/$', component: FolderPage });
  const router = createRouter({ routeTree: root.addChildren([tab]), history: createMemoryHistory({ initialEntries: [URL_] }) });
  await act(async () => {
    host = render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>).container;
    await router.load();
  });
  await screen.findByRole('textbox', { name: strings['write.message'] });
}
async function mountAgain(): Promise<HTMLElement> {
  const root = createRootRoute({ component: Outlet });
  const tab = createRoute({ getParentRoute: () => root, path: '/ai/$', component: FolderPage });
  const router = createRouter({ routeTree: root.addChildren([tab]), history: createMemoryHistory({ initialEntries: [URL_] }) });
  let c: HTMLElement | null = null;
  await act(async () => {
    c = render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>).container;
    await router.load();
  });
  await within(c!).findByRole('textbox', { name: strings['write.message'] });
  return c!;
}
const settle = async (ms = 60) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
const button = (name: string) => screen.getByRole('button', { name });
const anyway = new RegExp(`^${strings['write.pushAnyway']}`);
async function commitPush(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: strings['write.message'] }), MSG);
  await user.click(button(strings['write.commitPush']));
}
async function menu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button(strings['write.more']));
  await screen.findByRole('menuitem', { name: new RegExp(`^${strings['write.pull']}`) });
}
async function push(user: ReturnType<typeof userEvent.setup>) {
  await menu(user);
  await user.click(screen.getByRole('menuitem', { name: new RegExp(`^${strings['write.push']}(?! anyway)`) }));
}
async function noAnyway(user: ReturnType<typeof userEvent.setup>) {
  await menu(user);
  expect(screen.queryByRole('menuitem', { name: anyway })).toBeNull();
  await user.keyboard('{Escape}');
  expect(screen.queryByText(strings['write.push.forceHint'])).toBeNull();
}
async function askAnyway(user: ReturnType<typeof userEvent.setup>) {
  await menu(user);
  await user.click(screen.getByRole('menuitem', { name: anyway }));
  return screen.findByRole('alertdialog', { name: strings['write.pushForce.title'] });
}
const forcedTitle = (kind: 'done' | 'failed' | 'unknown') => fill(strings[`write.title.${kind}`], { op: strings['write.op.pushForced'] });
afterEach(() => {
  cleanup();
  queryClient.clear();
  forgetMessages();
});

describe('Push anyway', () => {
  it('after git refused Commit and push\'s push: the hint, then its own confirm; sent once on Push with force:true', async () => {
    const user = userEvent.setup();
    await open({ commitPush: pushFailed, sync: ok });
    await commitPush(user);
    await screen.findByText(fill(strings['write.push.failedReason'], { reason: REJECTED }));
    screen.getByText(strings['write.push.forceHint']);
    await waitFor(() => expect(button(strings['write.sync'])).toBeEnabled());
    const dialog = await askAnyway(user);
    within(dialog).getByText('Replaces the branch on GitHub with this folder\'s. Commits only GitHub has are lost. If GitHub moved since the last fetch, nothing changes.');
    expect(dialog.textContent ?? '').not.toMatch(/sync/i);
    expect(dialog.closest('[data-hub-overlay]')?.getAttribute('data-hub-overlay')).toBe('ai-folders-push-force');
    expect(writes()).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: strings['write.pushForce.confirm'] }));
    await screen.findByText(forcedTitle('done'));
    expect(writes().map((r) => [r.path, r.body])).toEqual([['/github/commit/push', { message: MSG }], ['/github/sync', { direction: 'push', force: true }]]);
    expect(writes()[1]!.target?.container.id).toBe(borealis.id);
    // Done: the refusal is no longer the answer shown, so it is not offered again.
    await noAnyway(user);
  });
  it('after git refused Push\'s push step; cancelling the confirm sends nothing', async () => {
    const user = userEvent.setup();
    await open({ sync: pushStepFailed });
    await push(user);
    await screen.findByText(fill(strings['write.title.failed'], { op: strings['write.op.push'] }));
    screen.getByText(strings['write.push.forceHint']);
    const dialog = await askAnyway(user);
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await settle(100);
    expect(writes().map((r) => r.body)).toEqual([{ direction: 'push' }]);
  });
  it('a forced push git refused again: no Push anyway, no hint; nothing more is sent', async () => {
    const user = userEvent.setup();
    await open({ sync: pushStepFailed });
    await push(user);
    await screen.findByText(fill(strings['write.title.failed'], { op: strings['write.op.push'] }));
    await user.click(within(await askAnyway(user)).getByRole('button', { name: strings['write.pushForce.confirm'] }));
    await screen.findByText(forcedTitle('failed'));
    await noAnyway(user);
    expect(writes().map((r) => r.body)).toEqual([{ direction: 'push' }, { direction: 'push', force: true }]);
  });
  it('a forced push whose answer is lost: held, named Push anyway after a remount, never sent again', async () => {
    const user = userEvent.setup();
    let n = 0;
    await open({ sync: () => (n++ === 0 ? pushStepFailed : answers.lost(10)) });
    await push(user);
    await screen.findByText(fill(strings['write.title.failed'], { op: strings['write.op.push'] }));
    await user.click(within(await askAnyway(user)).getByRole('button', { name: strings['write.pushForce.confirm'] }));
    await screen.findByText(forcedTitle('unknown'));
    await waitFor(() => expect(button(strings['write.sync'])).toBeDisabled());
    expect(button(strings['write.commitPush'])).toBeDisabled();
    await menu(user);
    expect(screen.getByRole('menuitem', { name: new RegExp(`^${strings['write.pull']}`) })).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Escape}');
    cleanup();
    await open({}, true);
    await screen.findByText(forcedTitle('unknown'));
    await settle(200);
    expect(writes()).toHaveLength(2);
  });
  it('not offered after Sync or Pull whose push or pull git refused', async () => {
    const user = userEvent.setup();
    await open({ sync: agentError(502, 'sync_step_failed', { failed_step: 'github.push', steps: [{ step: 'github.fetch', result: { status: 'ok' } }, { step: 'github.pull', result: { status: 'ok' } }, { step: 'github.push', result: { status: 'error', message: REJECTED } }] }) });
    await user.click(button(strings['write.sync']));
    await screen.findByText(fill(strings['write.title.failed'], { op: strings['write.op.full'] }));
    await noAnyway(user);
    expect(writes()).toHaveLength(1);
  });
  it('not offered after an account failure or a timed-out push', async () => {
    const user = userEvent.setup();
    await open({ sync: agentError(403, 'github_token_forbidden', { operation: { steps: [{ step: 'github.push', result: { status: 'error' } }] } }) });
    await push(user);
    await screen.findByText(fill(strings['write.title.failed'], { op: strings['write.op.push'] }));
    await noAnyway(user);
    cleanup(); queryClient.clear(); forgetMessages();
    await open({ commitPush: agentError(503, 'push_failed', { committed: true, timed_out: true }) });
    await commitPush(user);
    await screen.findByText(strings['write.push.unknown']);
    await noAnyway(user);
  });
  it('not offered after a push that went through', async () => {
    const user = userEvent.setup();
    await open({ sync: ok });
    await push(user);
    await screen.findByText(fill(strings['write.title.done'], { op: strings['write.op.push'] }));
    await noAnyway(user);
  });
  it('not offered when the push step carries a repository-state code, or its steps came under 429 rate_limited', async () => {
    const user = userEvent.setup();
    await open({ sync: agentError(502, 'sync_step_failed', { failed_step: 'github.push', steps: [{ step: 'github.push', result: { status: 'error', code: 'branch_protected', message: REJECTED } }] }) });
    await push(user);
    await screen.findByText(fill(strings['write.title.failed'], { op: strings['write.op.push'] }));
    await noAnyway(user);
    cleanup(); queryClient.clear(); forgetMessages();
    await open({ sync: agentError(429, 'rate_limited', { steps: [{ step: 'github.push', result: { status: 'error', message: REJECTED } }] }) });
    await push(user);
    await screen.findByText(fill(strings['write.title.failed'], { op: strings['write.op.push'] }));
    await noAnyway(user);
    expect(writes()).toHaveLength(1);
  });
  it('a double press on the confirm sends one forced push', async () => {
    const user = userEvent.setup();
    let n = 0;
    await open({ sync: () => (n++ === 0 ? pushStepFailed : ok) });
    await push(user);
    await screen.findByText(fill(strings['write.title.failed'], { op: strings['write.op.push'] }));
    const dialog = await askAnyway(user);
    await user.dblClick(within(dialog).getByRole('button', { name: strings['write.pushForce.confirm'] }));
    await screen.findByText(forcedTitle('done'));
    await settle(150);
    expect(writes().map((r) => r.body)).toEqual([{ direction: 'push' }, { direction: 'push', force: true }]);
  });
  it('a write of the folder from another mount takes Push anyway away from this one', async () => {
    const user = userEvent.setup();
    let n = 0;
    await open({ sync: () => (n++ === 0 ? pushStepFailed : answers.ok({ status: 'ok', steps: [{ step: 'github.fetch', result: { status: 'ok' } }, { step: 'github.pull', result: { status: 'ok' } }] })) });
    const first = host;
    await push(user);
    await within(first).findByText(fill(strings['write.title.failed'], { op: strings['write.op.push'] }));
    const second = await mountAgain();
    await user.click(within(second).getByRole('button', { name: strings['write.more'] }));
    await user.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['write.pull']}`) }));
    await within(second).findByText(fill(strings['write.title.done'], { op: strings['write.op.pull'] }));
    // The first mount still shows its own refusal, but no longer offers to force it.
    within(first).getByText(fill(strings['write.title.failed'], { op: strings['write.op.push'] }));
    await waitFor(() => expect(within(first).getByRole('button', { name: strings['write.sync'] })).toBeEnabled());
    await user.click(within(first).getByRole('button', { name: strings['write.more'] }));
    await screen.findByRole('menuitem', { name: new RegExp(`^${strings['write.pull']}`) });
    expect(screen.queryByRole('menuitem', { name: anyway })).toBeNull();
    await user.keyboard('{Escape}');
    expect(writes().map((r) => r.body)).toEqual([{ direction: 'push' }, { direction: 'pull' }]);
  });
  it('another write after the refusal takes Push anyway away', async () => {
    const user = userEvent.setup();
    let n = 0;
    await open({ sync: () => (n++ === 0 ? pushStepFailed : answers.ok({ status: 'ok', steps: [{ step: 'github.fetch', result: { status: 'ok' } }, { step: 'github.pull', result: { status: 'ok' } }] })) });
    await push(user);
    await screen.findByText(fill(strings['write.title.failed'], { op: strings['write.op.push'] }));
    await menu(user);
    await user.click(screen.getByRole('menuitem', { name: new RegExp(`^${strings['write.pull']}`) }));
    await screen.findByText(fill(strings['write.title.done'], { op: strings['write.op.pull'] }));
    await noAnyway(user);
    expect(writes().map((r) => r.body)).toEqual([{ direction: 'push' }, { direction: 'pull' }]);
  });
});
