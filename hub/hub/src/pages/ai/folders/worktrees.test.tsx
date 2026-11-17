// A folder's worktrees on its page, on real core (fixture transport). Add and Remove are writes of the folder (one
// lock with the commit, sync and branch changes): each is sent once; git's own refusal says nothing changed, with git's
// words; a lost answer, a timeout or a 200 that does not say git succeeded is unknown and held (every write of the folder
// waits), survives a remount, is never sent again; Check again reads the worktrees and shows what is there now, never as
// proof. Remove is confirmed, naming the computer; only after git refused a plain remove does that row offer Remove
// anyway, behind a second confirm saying its changes are discarded. The main folder is never removed.
import { answers, bootFixtureCore, chooseComputer, computerHandle, fixtureWorld, queryClient, type FixtureAnswer, type FixtureRequest } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the page, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the page, not page code
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { chatRules } from '../parts/fixtures.chats';
import { worktreePathProblem } from './Branches';
import FolderPage from './FolderPage';
import { agentError, folderRules, repoRules, writeRules, WORKTREES, type RepoOpts, type WriteOpts } from './fixtures';
import { folderKey } from './key';
import strings from './strings.en.json';
import { forgetMessages, worktreesOf } from './writes';

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const borealis = fixtureWorld.computers.find((c) => c.name === 'borealis')!;
const ACME = borealis.realm_ids[0]!;
const SHOP = '/home/ada/projects/shop';
const URL_ = `/ai/f/${folderKey(SHOP)}?${new URLSearchParams({ computer: computerHandle(borealis), realm: ACME, tab: 'repository' }).toString()}`;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const MAIN = WORKTREES[0]!.path;
const TRY = WORKTREES[1]!.path;

let sent: FixtureRequest[] = [];
const writes = () => sent.filter((r) => r.method === 'POST');
const reads = (path: string) => sent.filter((r) => r.method === 'GET' && r.path.endsWith(path)).length;
async function open(o: WriteOpts = {}, keep = false, repo: RepoOpts = {}) {
  if (!keep) sent = [];
  const see = (r: FixtureRequest) => sent.push(r);
  if (!keep) bootFixtureCore({ rules: [...folderRules({ onSend: see }), ...chatRules({ onSend: see }), ...repoRules({ ...repo, onSend: see }), ...writeRules({ ...o, onSend: see })] });
  act(() => chooseComputer(atlas));
  const root = createRootRoute({ component: Outlet });
  const tab = createRoute({ getParentRoute: () => root, path: '/ai/$', component: FolderPage });
  const router = createRouter({ routeTree: root.addChildren([tab]), history: createMemoryHistory({ initialEntries: [URL_] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  await screen.findByRole('textbox', { name: strings['write.message'] });
  await userEvent.setup().click(screen.getByRole('radio', { name: new RegExp(strings['repo.worktrees']) }));
  await screen.findByRole('cell', { name: TRY });
}
const settle = async (ms = 60) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
const band = () => screen.getAllByRole('alert').concat(screen.queryAllByRole('status')).find((e) => e.hasAttribute('data-outcome'))!;
const button = (name: string) => screen.getByRole('button', { name });
const rowOf = (name: string) => screen.getAllByRole('row').find((r) => within(r).queryByText(name, { exact: true }))!;
const opRemove = (path: string) => fill(strings['write.op.worktreeRemove'], { path });
const opForced = (path: string) => fill(strings['write.op.worktreeRemoveForced'], { path });
const opAdd = (path: string) => fill(strings['write.op.worktreeAdd'], { path });
async function menuItem(user: ReturnType<typeof userEvent.setup>, path: string, label: string) {
  await user.click(within(rowOf(path)).getByRole('button', { name: /more|actions|⋯/i }));
  return screen.findByRole('menuitem', { name: new RegExp(label) });
}
async function askRemove(user: ReturnType<typeof userEvent.setup>, path: string) {
  await user.click(await menuItem(user, path, strings['worktrees.remove']));
  return screen.findByRole('alertdialog', { name: fill(strings['worktrees.remove.title'], { path }) });
}
async function remove(user: ReturnType<typeof userEvent.setup>, path: string) {
  await user.click(within(await askRemove(user, path)).getByRole('button', { name: strings['worktrees.remove.confirm'] }));
}
async function askAdd(user: ReturnType<typeof userEvent.setup>, path: string, branch = '', start = '') {
  await user.click(button(strings['worktrees.new']));
  const dialog = await screen.findByRole('alertdialog', { name: strings['worktrees.new.title'] });
  if (path) await user.type(within(dialog).getByRole('textbox', { name: strings['worktrees.new.path'] }), path);
  if (branch) await user.type(within(dialog).getByRole('textbox', { name: strings['worktrees.new.branch'] }), branch);
  if (start) await user.type(within(dialog).getByRole('textbox', { name: strings['worktrees.new.start'] }), start);
  return dialog;
}
afterEach(() => {
  cleanup();
  queryClient.clear();
  forgetMessages();
});

describe('worktree parts', () => {
  it('worktreesOf: the agent\'s first entry is the main folder; an entry without a path is left out', () => {
    expect(worktreesOf({ status: 'ok', worktrees: [{ path: '/a', branch: 'main' }, { path: '' }, { path: '/b', detached: true, locked: true }, 'x'] })).toEqual([
      { path: '/a', branch: 'main', detached: false, bare: false, locked: false, main: true },
      { path: '/b', branch: '', detached: true, bare: false, locked: true, main: false },
    ]);
    expect(worktreesOf({ worktrees: [{ branch: 'x' }, { path: '/b' }] })[0]!.main).toBe(false);
    expect(worktreesOf(null)).toEqual([]);
  });
  it('worktreePathProblem: only an absolute clean path passes (the agent refuses the others with a 400)', () => {
    for (const ok of ['/home/ada/shop-next', ' /home/ada/a b ', '/x']) expect(worktreePathProblem(ok)).toBe(false);
    for (const bad of ['', '/', 'shop-next', './x', '/home/ada/', '/home//ada', '/home/../etc', '/home/./x', '/home/a\tb']) expect(worktreePathProblem(bad)).toBe(true);
  });
});

describe('the Worktrees view', () => {
  it('lists the main folder first, tagged; its Remove is off with the reason; nothing is sent by looking', async () => {
    const user = userEvent.setup();
    await open();
    within(rowOf(MAIN)).getByText(strings['worktrees.main']);
    within(rowOf(TRY)).getByText('try-port');
    const item = await menuItem(user, MAIN, strings['worktrees.remove']);
    expect(item).toHaveAttribute('aria-disabled', 'true');
    within(item).getByText(strings['worktrees.mainReason']);
    expect(screen.queryByRole('menuitem', { name: new RegExp(strings['worktrees.removeAnyway']) })).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it('Add: path, new branch and start sent once, trimmed; the band says Added; the worktrees are read again', async () => {
    const user = userEvent.setup();
    await open();
    const before = reads('/github/worktrees');
    const dialog = await askAdd(user, ' /home/ada/shop-next ', ' next ', ' main ');
    within(dialog).getByText(fill(strings['worktrees.new.help'], { computer: borealis.name }));
    expect(within(dialog).getByRole('textbox', { name: strings['worktrees.new.path'] }).getAttribute('placeholder')).toBe(`${SHOP}-next`);
    await user.click(within(dialog).getByRole('button', { name: strings['worktrees.new.add'] }));
    await screen.findByText(fill(strings['write.title.done'], { op: opAdd('/home/ada/shop-next') }));
    screen.getByText(strings['write.worktree.done.worktreeAdd']);
    expect(writes().map((r) => [r.path, r.body])).toEqual([['/github/worktrees', { path: '/home/ada/shop-next', branch: 'next', start_ref: 'main' }]]);
    expect(writes()[0]!.target?.container.id).toBe(borealis.id);
    await waitFor(() => expect(reads('/github/worktrees')).toBeGreaterThan(before));
  });
  it('Add: only a path, nothing else in the body; a relative or unclean path is held back in the form', async () => {
    const user = userEvent.setup();
    await open();
    let dialog = await askAdd(user, 'shop-next');
    within(dialog).getByText(strings['worktrees.new.pathBad']);
    expect(within(dialog).getByRole('button', { name: strings['worktrees.new.add'] })).toBeDisabled();
    await user.clear(within(dialog).getByRole('textbox', { name: strings['worktrees.new.path'] }));
    await user.type(within(dialog).getByRole('textbox', { name: strings['worktrees.new.path'] }), '/home/ada/../shop');
    expect(within(dialog).getByRole('button', { name: strings['worktrees.new.add'] })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(writes()).toHaveLength(0);
    dialog = await askAdd(user, '/home/ada/shop-x', 'two words');
    within(dialog).getByText(strings['worktrees.new.refBad']);
    expect(within(dialog).getByRole('button', { name: strings['worktrees.new.add'] })).toBeDisabled();
    await user.clear(within(dialog).getByRole('textbox', { name: strings['worktrees.new.branch'] }));
    await user.click(within(dialog).getByRole('button', { name: strings['worktrees.new.add'] }));
    await screen.findByText(fill(strings['write.title.done'], { op: opAdd('/home/ada/shop-x') }));
    expect(writes().map((r) => r.body)).toEqual([{ path: '/home/ada/shop-x' }]);
  });
  it('Remove is confirmed on the named computer (its branch stays), then sent once without force', async () => {
    const user = userEvent.setup();
    await open();
    const dialog = await askRemove(user, TRY);
    within(dialog).getByText(fill(strings['worktrees.remove.body'], { computer: borealis.name }));
    expect(dialog.closest('[data-hub-overlay]')?.getAttribute('data-hub-overlay')).toBe('ai-folders-worktree-remove');
    expect(writes()).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: strings['worktrees.remove.confirm'] }));
    await screen.findByText(fill(strings['write.title.done'], { op: opRemove(TRY) }));
    screen.getByText(strings['write.worktree.done.worktreeRemove']);
    expect(writes().map((r) => [r.path, r.body])).toEqual([['/github/worktrees/remove', { path: TRY, force: false }]]);
  });
  it('Remove cancelled: nothing is sent', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(within(await askRemove(user, TRY)).getByRole('button', { name: /cancel/i }));
    await settle(100);
    expect(writes()).toHaveLength(0);
  });
});

describe('Remove anyway', () => {
  const words = "fatal: '/home/ada/shop-try' contains modified or untracked files, use --force to delete it";
  it('git refuses a plain remove: "Not changed" with git\'s words; only that row offers Remove anyway, behind its own confirm, sent with force', async () => {
    const user = userEvent.setup();
    let n = 0;
    await open({ worktreeRemove: () => (n++ === 0 ? agentError(502, 'git_command_failed', { output: words, exit_code: 128, timed_out: false }) : answers.ok({ status: 'ok', success: true, exit_code: 0, timed_out: false, output: '' })) }, false,
      { worktrees: () => [...WORKTREES, { path: '/home/ada/shop-old', branch: 'old', detached: false, bare: false, locked: false }] });
    await remove(user, TRY);
    await screen.findByText(fill(strings['write.title.failed'], { op: opRemove(TRY) }));
    screen.getByText(strings['write.branch.refused']);
    screen.getByText(words);
    screen.getByText(strings['write.worktree.forceHint']);
    // Proven not changed: the lock is free again; nothing more was sent.
    await waitFor(() => expect(button(strings['write.sync'])).toBeEnabled());
    expect(writes()).toHaveLength(1);
    // Another row offers no Remove anyway.
    await menuItem(user, '/home/ada/shop-old', strings['worktrees.remove']);
    expect(screen.queryByRole('menuitem', { name: new RegExp(strings['worktrees.removeAnyway']) })).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(await menuItem(user, TRY, strings['worktrees.removeAnyway']));
    const dialog = await screen.findByRole('alertdialog', { name: fill(strings['worktrees.force.title'], { path: TRY }) });
    within(dialog).getByText(fill(strings['worktrees.force.body'], { computer: borealis.name }));
    expect(dialog.closest('[data-hub-overlay]')?.getAttribute('data-hub-overlay')).toBe('ai-folders-worktree-force');
    expect(writes()).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: strings['worktrees.force.confirm'] }));
    await screen.findByText(fill(strings['write.title.done'], { op: opForced(TRY) }));
    expect(writes().map((r) => r.body)).toEqual([{ path: TRY, force: false }, { path: TRY, force: true }]);
  });
  it('the second confirm cancelled: nothing more is sent', async () => {
    const user = userEvent.setup();
    await open({ worktreeRemove: agentError(502, 'git_command_failed', { output: words, exit_code: 128, timed_out: false }) });
    await remove(user, TRY);
    await screen.findByText(fill(strings['write.title.failed'], { op: opRemove(TRY) }));
    await user.click(await menuItem(user, TRY, strings['worktrees.removeAnyway']));
    await user.click(within(await screen.findByRole('alertdialog', { name: fill(strings['worktrees.force.title'], { path: TRY }) })).getByRole('button', { name: /cancel/i }));
    await settle(100);
    expect(writes()).toHaveLength(1);
  });
  it('no Remove anyway after a refusal that is not git\'s (a 4xx was not run)', async () => {
    const user = userEvent.setup();
    await open({ worktreeRemove: agentError(400, 'bad_request') });
    await remove(user, TRY);
    await screen.findByText(fill(strings['write.notRunCode'], { code: 'bad_request' }));
    await menuItem(user, TRY, strings['worktrees.remove']);
    expect(screen.queryByRole('menuitem', { name: new RegExp(strings['worktrees.removeAnyway']) })).toBeNull();
    expect(screen.queryByText(strings['write.worktree.forceHint'])).toBeNull();
  });
  it('a forced remove git refused again: no Remove anyway, no hint; nothing more is sent', async () => {
    const user = userEvent.setup();
    await open({ worktreeRemove: agentError(502, 'git_command_failed', { output: words, exit_code: 128, timed_out: false }) });
    await remove(user, TRY);
    await screen.findByText(fill(strings['write.title.failed'], { op: opRemove(TRY) }));
    await user.click(await menuItem(user, TRY, strings['worktrees.removeAnyway']));
    await user.click(within(await screen.findByRole('alertdialog', { name: fill(strings['worktrees.force.title'], { path: TRY }) })).getByRole('button', { name: strings['worktrees.force.confirm'] }));
    await screen.findByText(fill(strings['write.title.failed'], { op: opForced(TRY) }));
    // Git may have deleted part of the folder before it stopped: never "Not changed".
    expect(screen.getAllByText(new RegExp(strings['write.worktree.forceRefused'])).length).toBeGreaterThan(0);
    expect(screen.queryByText(new RegExp(strings['write.branch.refused']))).toBeNull();
    expect(screen.queryByText(strings['write.worktree.forceHint'])).toBeNull();
    await menuItem(user, TRY, strings['worktrees.remove']);
    expect(screen.queryByRole('menuitem', { name: new RegExp(strings['worktrees.removeAnyway']) })).toBeNull();
    expect(writes().map((r) => r.body)).toEqual([{ path: TRY, force: false }, { path: TRY, force: true }]);
  });
  it('a 409 (the agent did not run it) offers no Remove anyway', async () => {
    const user = userEvent.setup();
    await open({ worktreeRemove: agentError(409, 'conflict') });
    await remove(user, TRY);
    await screen.findByText(fill(strings['write.notRunCode'], { code: 'conflict' }));
    await menuItem(user, TRY, strings['worktrees.remove']);
    expect(screen.queryByRole('menuitem', { name: new RegExp(strings['worktrees.removeAnyway']) })).toBeNull();
    expect(writes()).toHaveLength(1);
  });
  it('another write after the refusal takes Remove anyway away', async () => {
    const user = userEvent.setup();
    await open({ worktreeRemove: agentError(502, 'git_command_failed', { output: words, exit_code: 128, timed_out: false }), worktreeAdd: answers.ok({ status: 'ok', success: true, exit_code: 0, timed_out: false, output: '' }) });
    await remove(user, TRY);
    await screen.findByText(fill(strings['write.title.failed'], { op: opRemove(TRY) }));
    await user.keyboard('{Escape}');
    await user.click(within(await askAdd(user, '/home/ada/shop-next')).getByRole('button', { name: strings['worktrees.new.add'] }));
    await screen.findByText(fill(strings['write.title.done'], { op: opAdd('/home/ada/shop-next') }));
    await menuItem(user, TRY, strings['worktrees.remove']);
    expect(screen.queryByRole('menuitem', { name: new RegExp(strings['worktrees.removeAnyway']) })).toBeNull();
    expect(writes()).toHaveLength(2);
  });
});

describe('a held worktree change', () => {
  for (const [what, answer] of [
    ['a lost answer', answers.lost(10)],
    ['a 503 timed out', agentError(503, 'git_command_failed', { timed_out: true })],
    ['a 200 that does not say git succeeded', answers.ok({ status: 'ok', success: false })],
    ['a 201 that says git succeeded (only a 200 proves it)', { status: 201, body: { status: 'ok', success: true, exit_code: 0, timed_out: false, output: '' } } as FixtureAnswer],
  ] as const) {
    it(`${what}: unknown and held: every write of the folder waits; nothing is sent again`, async () => {
      const user = userEvent.setup();
      await open({ worktreeRemove: answer });
      await remove(user, TRY);
      await screen.findByText(fill(strings['write.title.unknown'], { op: opRemove(TRY) }));
      screen.getByText(strings['write.branch.unknown']);
      within(band()).getByText(strings['write.checkLineWorktree']);
      await waitFor(() => expect(button(strings['worktrees.new'])).toBeDisabled());
      expect(screen.getAllByRole('status').some((e) => !e.hasAttribute('data-outcome') && e.textContent === strings['write.heldReason'])).toBe(true);
      expect(button(strings['write.sync'])).toBeDisabled();
      await settle(200);
      expect(writes()).toHaveLength(1);
    });
  }
  it('Check again reads the worktrees and says whether the path is listed now, never as proof; nothing is sent', async () => {
    const user = userEvent.setup();
    let list: readonly (typeof WORKTREES)[number][] | 'fail' = WORKTREES;
    await open({ worktreeRemove: answers.lost(10) }, false, { worktrees: () => list });
    await remove(user, TRY);
    await screen.findByText(fill(strings['write.title.unknown'], { op: opRemove(TRY) }));
    const before = reads('/github/worktrees');
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await screen.findByText(fill(strings['write.worktreeListed'], { path: TRY }));
    expect(reads('/github/worktrees')).toBeGreaterThan(before);
    list = [WORKTREES[0]!];
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await screen.findByText(fill(strings['write.worktreeNotListed'], { path: TRY }));
    list = 'fail';
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await screen.findByText(strings['write.worktreeReadFailed']);
    expect(screen.queryByText(fill(strings['write.worktreeNotListed'], { path: TRY }))).toBeNull();
    // Still held: the person decides.
    screen.getByText(fill(strings['write.title.unknown'], { op: opRemove(TRY) }));
    expect(writes()).toHaveLength(1);
  });
  it('an unknown add that makes a branch: Check again also reads the branch list and says whether the branch is in it', async () => {
    const user = userEvent.setup();
    let list: readonly { name: string; upstream: string; current: boolean }[] | 'fail' = [{ name: 'main', upstream: 'origin/main', current: true }];
    await open({ worktreeAdd: answers.lost(10) }, false, { branches: () => list });
    await user.click(within(await askAdd(user, '/home/ada/shop-next', 'next')).getByRole('button', { name: strings['worktrees.new.add'] }));
    await screen.findByText(fill(strings['write.title.unknown'], { op: opAdd('/home/ada/shop-next') }));
    const before = reads('/github/branches');
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await screen.findByText(fill(strings['write.branchNotListed'], { branch: 'next' }));
    expect(reads('/github/branches')).toBeGreaterThan(before);
    list = [{ name: 'main', upstream: 'origin/main', current: true }, { name: 'next', upstream: '', current: false }];
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await screen.findByText(fill(strings['write.branchListed'], { branch: 'next' }));
    screen.getByText(fill(strings['write.title.unknown'], { op: opAdd('/home/ada/shop-next') }));
    expect(writes()).toHaveLength(1);
  });
  it('an unknown add with only a path: git names its new branch after the folder; Check again reads the branch list for it', async () => {
    const user = userEvent.setup();
    await open({ worktreeAdd: answers.lost(10) });
    await user.click(within(await askAdd(user, '/home/ada/shop-next')).getByRole('button', { name: strings['worktrees.new.add'] }));
    await screen.findByText(fill(strings['write.title.unknown'], { op: opAdd('/home/ada/shop-next') }));
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await screen.findByText(fill(strings['write.branchNotListed'], { branch: 'shop-next' }));
    expect(writes()).toHaveLength(1);
  });
  it('an unknown add from a start ref without a new branch: Check again shows no branch line', async () => {
    const user = userEvent.setup();
    await open({ worktreeAdd: answers.lost(10) });
    await user.click(within(await askAdd(user, '/home/ada/shop-next', '', 'main')).getByRole('button', { name: strings['worktrees.new.add'] }));
    await screen.findByText(fill(strings['write.title.unknown'], { op: opAdd('/home/ada/shop-next') }));
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await screen.findByText(fill(strings['write.worktreeNotListed'], { path: '/home/ada/shop-next' }));
    expect(within(band()).queryByText(strings['write.branchListLabel'])).toBeNull();
  });
  it('survives a remount, names its path, and is never sent again', async () => {
    const user = userEvent.setup();
    await open({ worktreeAdd: answers.lost(10) });
    await user.click(within(await askAdd(user, '/home/ada/shop-next', 'next')).getByRole('button', { name: strings['worktrees.new.add'] }));
    await screen.findByText(fill(strings['write.title.unknown'], { op: opAdd('/home/ada/shop-next') }));
    cleanup();
    await open({}, true);
    await screen.findByText(fill(strings['write.title.unknown'], { op: opAdd('/home/ada/shop-next') }));
    expect(button(strings['worktrees.new'])).toBeDisabled();
    await settle(200);
    expect(writes()).toHaveLength(1);
  });
  it('a held forced remove names itself as forced after a remount', async () => {
    const user = userEvent.setup();
    let n = 0;
    await open({ worktreeRemove: () => (n++ === 0 ? agentError(502, 'git_command_failed', { output: 'fatal: dirty', exit_code: 128, timed_out: false }) : answers.lost(10)) });
    await remove(user, TRY);
    await screen.findByText(fill(strings['write.title.failed'], { op: opRemove(TRY) }));
    await user.click(await menuItem(user, TRY, strings['worktrees.removeAnyway']));
    await user.click(within(await screen.findByRole('alertdialog', { name: fill(strings['worktrees.force.title'], { path: TRY }) })).getByRole('button', { name: strings['worktrees.force.confirm'] }));
    await screen.findByText(fill(strings['write.title.unknown'], { op: opForced(TRY) }));
    cleanup();
    await open({}, true);
    await screen.findByText(fill(strings['write.title.unknown'], { op: opForced(TRY) }));
    expect(writes()).toHaveLength(2);
  });
  it('a held branch change keeps the worktree changes waiting, with the reason', async () => {
    const user = userEvent.setup();
    await open({ branchSwitch: answers.lost(10) });
    await user.click(screen.getByRole('radio', { name: new RegExp(strings['repo.branches']) }));
    await screen.findByRole('cell', { name: /try-port/ });
    await user.click(within(rowOf('try-port')).getByRole('button', { name: strings['branches.switch'] }));
    await screen.findByText(fill(strings['write.title.unknown'], { op: fill(strings['write.op.branchSwitch'], { branch: 'try-port' }) }));
    await user.click(screen.getByRole('radio', { name: new RegExp(strings['repo.worktrees']) }));
    await screen.findByRole('cell', { name: TRY });
    expect(button(strings['worktrees.new'])).toBeDisabled();
    const item = await menuItem(user, TRY, strings['worktrees.remove']);
    expect(item).toHaveAttribute('aria-disabled', 'true');
    within(item).getByText(strings['write.heldReason']);
    expect(writes().map((r) => r.path)).toEqual(['/github/branch/switch']);
  });
});

// forms-required, "Add a worktree dialog": Location was the one needed field, unmarked above two fields
// labelled optional; and a start ref only the agent refused ("main~1") failed after the dialog closed.
describe('Add a worktree: what is needed is said in the form', () => {
  it('Location is marked required and says what it takes before anything is typed', async () => {
    const user = userEvent.setup();
    await open();
    const dialog = await askAdd(user, '');
    expect(within(dialog).getByRole('textbox', { name: strings['worktrees.new.path'] })).toBeRequired();
    within(dialog).getByText(strings['worktrees.new.pathHelp']);
    expect(within(dialog).getByRole('button', { name: strings['worktrees.new.add'] })).toBeDisabled();
  });
  it('a start ref the agent would refuse is named at its field; nothing is sent', async () => {
    const user = userEvent.setup();
    await open();
    const dialog = await askAdd(user, '/home/ada/shop-x', '', 'main~1');
    within(dialog).getByText(strings['worktrees.new.refBad']);
    expect(within(dialog).getByRole('button', { name: strings['worktrees.new.add'] })).toBeDisabled();
    expect(writes()).toHaveLength(0);
  });
});
