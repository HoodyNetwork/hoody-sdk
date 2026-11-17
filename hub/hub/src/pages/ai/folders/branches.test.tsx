// A folder's branch changes on its page, on real core (fixture transport). New branch, Switch to it and Delete
// are writes of the folder (one lock with Commit, Commit and push, Sync): each is sent once; git's own refusal says nothing
// changed, with git's words; a lost answer, a timeout or a 200 that does not say git succeeded is unknown and held (every
// write of the folder waits), survives a remount, is never sent again; Check again reads the branches and shows what is
// there now, never as proof. Delete is confirmed as forced, naming the computer; the current branch is neither switched to
// nor deleted.
import { answers, bootFixtureCore, chooseComputer, computerHandle, fixtureWorld, queryClient, refreshFresh, type FixtureAnswer, type FixtureRequest } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the page, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the page, not page code
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { chatRules } from '../parts/fixtures.chats';
import { newBranchProblem } from './Branches';
import FolderPage from './FolderPage';
import { agentError, folderRules, repoRules, writeRules, type RepoOpts, type WriteOpts } from './fixtures';
import { folderKey } from './key';
import strings from './strings.en.json';
import { branchAnswer, forgetMessages, replyOf } from './writes';

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const borealis = fixtureWorld.computers.find((c) => c.name === 'borealis')!;
const ACME = borealis.realm_ids[0]!;
const SHOP = '/home/ada/projects/shop';
const URL_ = `/ai/f/${folderKey(SHOP)}?${new URLSearchParams({ computer: computerHandle(borealis), realm: ACME, tab: 'repository' }).toString()}`;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

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
  await userEvent.setup().click(screen.getByRole('radio', { name: new RegExp(strings['repo.branches']) }));
  await screen.findByRole('cell', { name: /try-port/ });
}
const settle = async (ms = 60) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
const band = () => screen.getAllByRole('alert').concat(screen.queryAllByRole('status')).find((e) => e.hasAttribute('data-outcome'))!;
const button = (name: string) => screen.getByRole('button', { name });
const rowOf = (name: string) => screen.getAllByRole('row').find((r) => within(r).queryByText(name, { exact: true }))!;
const op = (key: 'branchCreate' | 'branchSwitch' | 'branchDelete', branch: string) => fill(strings[`write.op.${key}`], { branch });
async function switchTo(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(rowOf(name)).getByRole('button', { name: strings['branches.switch'] }));
}
async function askDelete(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(rowOf(name)).getByRole('button', { name: /more|actions|⋯/i }));
  await user.click(await screen.findByRole('menuitem', { name: new RegExp(strings['branches.delete']) }));
  return screen.findByRole('alertdialog', { name: fill(strings['branches.delete.title'], { branch: name }) });
}
async function create(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(button(strings['branches.new']));
  const dialog = await screen.findByRole('alertdialog', { name: strings['branches.new.title'] });
  await user.type(within(dialog).getByRole('textbox', { name: strings['branches.new.name'] }), name);
  return dialog;
}
afterEach(() => {
  cleanup();
  queryClient.clear();
  forgetMessages();
});

describe('branchAnswer: positive evidence only', () => {
  it('done only on a 200 that says git succeeded', () => {
    expect(branchAnswer({ kind: 'answer', status: 200, code: null, details: {}, data: { status: 'ok', success: true } })).toEqual({ state: 'done' });
    expect(branchAnswer({ kind: 'answer', status: 200, code: null, details: {}, data: { status: 'ok', success: false } })).toEqual({ state: 'unknown' });
    expect(branchAnswer({ kind: 'answer', status: 200, code: null, details: {}, data: { success: true } })).toEqual({ state: 'unknown' });
    expect(branchAnswer({ kind: 'answer', status: 200, code: null, details: {}, data: null })).toEqual({ state: 'unknown' });
    // A status ok without success says nothing about git; a body that says it timed out is never done.
    expect(branchAnswer({ kind: 'answer', status: 200, code: null, details: {}, data: { status: 'ok' } })).toEqual({ state: 'unknown' });
    expect(branchAnswer({ kind: 'answer', status: 200, code: null, details: {}, data: { status: 'ok', success: true, timed_out: true } })).toEqual({ state: 'unknown' });
  });
  it('git\'s refusal (502 git_command_failed, not timed out) is refused with its words; timed out is unknown', () => {
    expect(branchAnswer({ kind: 'answer', status: 502, code: 'git_command_failed', data: {}, details: { output: 'fatal: a branch named \'main\' already exists', timed_out: false } }))
      .toEqual({ state: 'refused', output: 'fatal: a branch named \'main\' already exists' });
    expect(branchAnswer({ kind: 'answer', status: 503, code: 'git_command_failed', data: {}, details: { timed_out: true } })).toEqual({ state: 'unknown' });
    expect(branchAnswer({ kind: 'answer', status: 502, code: 'git_command_failed', data: {}, details: { timed_out: true } })).toEqual({ state: 'unknown' });
    expect(branchAnswer({ kind: 'answer', status: 502, code: 'git_command_failed', data: {}, details: {}, dropped: true })).toEqual({ state: 'unknown' });
    // The agent always says whether the command timed out: an answer that does not say so proves nothing.
    expect(branchAnswer({ kind: 'answer', status: 502, code: 'git_command_failed', data: {}, details: { output: 'fatal: no' } })).toEqual({ state: 'unknown' });
    // A timeout under details.operation (the account-failure envelope) is a timeout too, on a 4xx as well.
    expect(branchAnswer({ kind: 'answer', status: 502, code: 'git_command_failed', data: {}, details: { timed_out: false, operation: { timed_out: true } } })).toEqual({ state: 'unknown' });
    expect(branchAnswer({ kind: 'answer', status: 409, code: 'github_not_linked', data: {}, details: { operation: { timed_out: true } } })).toEqual({ state: 'unknown' });
    expect(branchAnswer({ kind: 'answer', status: 401, code: 'github_token_invalid', data: {}, details: { timed_out: true } })).toEqual({ state: 'unknown' });
  });
  it('only a status the answer really carried proves a refusal; a lost status is unknown', () => {
    const cmd = { code: 'git_command_failed', details: { output: 'fatal: no', timed_out: false } };
    // core keeps the status of a refused answer: a real 502 is the refusal.
    expect(branchAnswer(replyOf({ outcome: 'failed', status: 502, ...cmd })!)).toEqual({ state: 'refused', output: 'fatal: no' });
    // a held (pending) answer keeps no status: never read as a reconstructed 502.
    expect(branchAnswer(replyOf({ outcome: 'pending', ...cmd })!)).toEqual({ state: 'unknown' });
    // a refused answer whose status was lost.
    expect(branchAnswer(replyOf({ outcome: 'failed', ...cmd })!)).toEqual({ state: 'unknown' });
  });
  it('a 4xx was not run (an account failure in its kind, else its code); a lost answer and any other 5xx are unknown', () => {
    expect(branchAnswer({ kind: 'answer', status: 409, code: 'github_not_linked', data: {}, details: {} })).toEqual({ state: 'not_run', account: 'not_linked' });
    expect(branchAnswer({ kind: 'answer', status: 400, code: 'bad_request', data: {}, details: {} })).toEqual({ state: 'not_run', code: 'bad_request' });
    expect(branchAnswer({ kind: 'lost' })).toEqual({ state: 'unknown' });
    expect(branchAnswer({ kind: 'answer', status: 500, code: 'internal_error', data: {}, details: {} })).toEqual({ state: 'unknown' });
    expect(branchAnswer({ kind: 'answer', status: 503, code: 'service_unavailable', data: {}, details: {} })).toEqual({ state: 'unknown' });
  });
  it('a new name: blank is empty, one the ref rule of the agent refuses is bad, a name the list has is taken', () => {
    const list = [{ name: 'main', upstream: 'origin/main', current: true }];
    expect(newBranchProblem('  ', list)).toBe('empty');
    expect(newBranchProblem('my branch', list)).toBe('bad');
    // forms-required: the agent's SafeRefName refusals (400 "invalid branch name"), held back and named in the form.
    for (const bad of ['-x', '/x', 'x/', '.x', 'x.', 'a..b', 'a@{b', 'foo.lock', 'x~1', 'a^', 'a:b', 'a?', 'a*', 'a[b', 'a\\b', 'a\tb', 'a\u007fb']) expect(newBranchProblem(bad, list)).toBe('bad');
    // What that rule takes is never held back.
    for (const ok of ['feature/x', 'a.b', 'a-b', 'a@b', 'v1.0', 'x.locks', 'caf\u00e9', 'a{b', 'a]b']) expect(newBranchProblem(ok, list)).toBeNull();
    expect(newBranchProblem('main', list)).toBe('taken');
    expect(newBranchProblem(' next ', list)).toBeNull();
  });
});

describe('New branch, Switch to it, Delete', () => {
  it('New branch: sent once with the trimmed name; the band says it was created and that it tracks nothing yet', async () => {
    const user = userEvent.setup();
    await open();
    const dialog = await create(user, ' next ');
    within(dialog).getByText(strings['branches.new.help']);
    await user.click(within(dialog).getByRole('button', { name: strings['branches.new.create'] }));
    await screen.findByText(fill(strings['write.title.done'], { op: op('branchCreate', 'next') }));
    screen.getByText(strings['write.branch.done.branchCreate']);
    expect(writes().map((r) => [r.path, r.body])).toEqual([['/github/branch', { branch: 'next' }]]);
    expect(writes()[0]!.target?.container.id).toBe(borealis.id);
  });
  it('New branch: a name the folder already has is refused in the form, a blank one too; nothing is sent', async () => {
    const user = userEvent.setup();
    await open();
    const dialog = await create(user, 'main');
    within(dialog).getByText(strings['branches.new.taken']);
    expect(within(dialog).getByRole('button', { name: strings['branches.new.create'] })).toBeDisabled();
    await user.clear(within(dialog).getByRole('textbox', { name: strings['branches.new.name'] }));
    expect(within(dialog).getByRole('button', { name: strings['branches.new.create'] })).toBeDisabled();
    expect(writes()).toHaveLength(0);
  });
  it('Switch to it: sent once for that branch; the current branch offers neither Switch nor Delete', async () => {
    const user = userEvent.setup();
    await open();
    // Soft-disabled with its reason (the kit's disabled row action): focusable, says why.
    expect(within(rowOf('main')).getByRole('button', { name: strings['branches.switch'] })).toHaveAttribute('aria-disabled', 'true');
    expect(within(rowOf('main')).getByRole('button', { name: strings['branches.switch'] })).toHaveAccessibleDescription(strings['branches.currentReason']);
    await switchTo(user, 'try-port');
    await screen.findByText(fill(strings['write.title.done'], { op: op('branchSwitch', 'try-port') }));
    screen.getByText(strings['write.branch.done.branchSwitch']);
    expect(writes().map((r) => [r.path, r.body])).toEqual([['/github/branch/switch', { branch: 'try-port' }]]);
    await user.click(within(rowOf('main')).getByRole('button', { name: /more|actions|⋯/i }));
    const del = await screen.findByRole('menuitem', { name: new RegExp(strings['branches.delete']) });
    expect(del).toHaveAttribute('aria-disabled', 'true');
    expect(within(del).getByText(strings['branches.currentReason'])).toBeTruthy();
  });
  it('Delete is confirmed as a forced delete on the named computer (the GitHub branch stays), then sent once', async () => {
    const user = userEvent.setup();
    await open();
    const dialog = await askDelete(user, 'try-port');
    within(dialog).getByText(fill(strings['branches.delete.body'], { computer: borealis.name }));
    expect(dialog.closest('[data-hub-overlay]')?.getAttribute('data-hub-overlay')).toBe('ai-folders-branch-delete');
    expect(writes()).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: strings['branches.delete.confirm'] }));
    await screen.findByText(fill(strings['write.title.done'], { op: op('branchDelete', 'try-port') }));
    screen.getByText(strings['write.branch.done.branchDelete']);
    expect(writes().map((r) => [r.path, r.body])).toEqual([['/github/branch/delete', { branch: 'try-port' }]]);
  });
  it('Delete cancelled: nothing is sent', async () => {
    const user = userEvent.setup();
    await open();
    const dialog = await askDelete(user, 'try-port');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await settle(100);
    expect(writes()).toHaveLength(0);
  });
});

describe('answers', () => {
  it('git refuses (502 git_command_failed): "Not changed", git\'s words in the facts, not in the banner; nothing held', async () => {
    const user = userEvent.setup();
    const words = 'error: Your local changes to the following files would be overwritten by checkout: src/app.ts';
    await open({ branchSwitch: agentError(502, 'git_command_failed', { output: words, exit_code: 1, timed_out: false }) });
    await switchTo(user, 'try-port');
    await screen.findByText(fill(strings['write.title.failed'], { op: op('branchSwitch', 'try-port') }));
    screen.getByText(strings['write.branch.refused']);
    screen.getByText(words);
    expect(band().textContent).not.toContain('would be overwritten');
    // Proven not changed: the lock is free again.
    await waitFor(() => expect(button(strings['write.sync'])).toBeEnabled());
    await settle(200);
    expect(writes()).toHaveLength(1);
  });
  it('a 4xx was not run: the code, or an account failure in its typed words', async () => {
    const user = userEvent.setup();
    await open({ branchCreate: agentError(400, 'bad_request') });
    await user.click(within(await create(user, 'next')).getByRole('button', { name: strings['branches.new.create'] }));
    await screen.findByText(fill(strings['write.notRunCode'], { code: 'bad_request' }));
    cleanup();
    await open({ branchSwitch: agentError(409, 'github_not_linked') });
    await switchTo(user, 'try-port');
    await screen.findByText(`${strings['write.notRun']}: ${strings['account.not_linked']}`);
  });
  for (const [what, answer] of [
    ['a lost answer', answers.lost(10)],
    ['a 503 timed out', agentError(503, 'git_command_failed', { timed_out: true })],
    ['a 200 that does not say git succeeded', answers.ok({ status: 'ok', success: false })],
    ['a 200 with status ok and no success', answers.ok({ status: 'ok' })],
    ['a 503 git_command_failed that does not say it timed out', agentError(503, 'git_command_failed', { output: 'fatal: no' })],
    ['a 4xx account failure whose operation timed out', agentError(409, 'github_not_linked', { operation: { timed_out: true } })],
    ['a 201 that says git succeeded (1c H: only a 200 proves it)', { status: 201, body: { status: 'ok', success: true, exit_code: 0, timed_out: false, output: 'Deleted branch try-port' } } as FixtureAnswer],
  ] as const) {
    it(`${what}: unknown and held: every write of the folder waits; nothing is sent again`, async () => {
      const user = userEvent.setup();
      await open({ branchDelete: answer });
      await user.click(within(await askDelete(user, 'try-port')).getByRole('button', { name: strings['branches.delete.confirm'] }));
      await screen.findByText(fill(strings['write.title.unknown'], { op: op('branchDelete', 'try-port') }));
      screen.getByText(strings['write.branch.unknown']);
      expect(screen.queryByText(strings['write.branch.done.branchDelete'])).toBeNull();
      // Soft-disabled with its reason (the kit's disabled row action): focusable, says why.
      await waitFor(() => expect(within(rowOf('try-port')).getByRole('button', { name: strings['branches.switch'] })).toHaveAttribute('aria-disabled', 'true'));
      expect(within(rowOf('try-port')).getByRole('button', { name: strings['branches.switch'] })).toHaveAccessibleDescription(strings['write.heldReason']);
      expect(button(strings['branches.new'])).toBeDisabled();
      // New branch says why, as the row actions do (also when the table has no rows).
      expect(screen.getAllByRole('status').some((e) => !e.hasAttribute('data-outcome') && e.textContent === strings['write.heldReason'])).toBe(true);
      expect(button(strings['write.sync'])).toBeDisabled();
      await settle(200);
      expect(writes()).toHaveLength(1);
    });
  }
});

describe('a held branch change', () => {
  it('Check again reads the branches and status and says what is there now, never as proof; nothing is sent', async () => {
    const user = userEvent.setup();
    let list = [{ name: 'main', upstream: 'origin/main', current: true }, { name: 'try-port', upstream: '', current: false }];
    await open({ branchSwitch: answers.lost(10) }, false, { branches: () => list });
    await switchTo(user, 'try-port');
    await screen.findByText(fill(strings['write.title.unknown'], { op: op('branchSwitch', 'try-port') }));
    within(band()).getByText(strings['write.checkLineBranch']);
    // The folder moved meanwhile (the switch went through, or someone else switched): the list now says so.
    list = [{ name: 'main', upstream: 'origin/main', current: false }, { name: 'try-port', upstream: '', current: true }];
    const before = reads('/github/branches');
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await screen.findByText(fill(strings['write.branchNow'], { branch: 'try-port' }));
    screen.getByText(fill(strings['write.branchListed'], { branch: 'try-port' }));
    expect(reads('/github/branches')).toBeGreaterThan(before);
    // Each press reads afresh: the folder moved back, and the second Check says so.
    list = [{ name: 'main', upstream: 'origin/main', current: true }, { name: 'try-port', upstream: '', current: false }];
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await screen.findByText(fill(strings['write.branchNow'], { branch: 'main' }));
    // Still held: the person decides.
    screen.getByText(fill(strings['write.title.unknown'], { op: op('branchSwitch', 'try-port') }));
    expect(button(strings['write.sync'])).toBeDisabled();
    expect(writes()).toHaveLength(1);
  });
  it('a Check whose branch read fails shows no earlier list as what is there now', async () => {
    const user = userEvent.setup();
    let list: readonly { name: string; upstream: string; current: boolean }[] | 'fail' = [{ name: 'main', upstream: 'origin/main', current: true }, { name: 'try-port', upstream: '', current: false }];
    await open({ branchSwitch: answers.lost(10) }, false, { branches: () => list });
    await switchTo(user, 'try-port');
    await screen.findByText(fill(strings['write.title.unknown'], { op: op('branchSwitch', 'try-port') }));
    list = [{ name: 'main', upstream: 'origin/main', current: false }, { name: 'try-port', upstream: '', current: true }];
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await screen.findByText(fill(strings['write.branchNow'], { branch: 'try-port' }));
    // The next read fails: the earlier answer is not shown as now; the band says the list could not be read.
    list = 'fail';
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await screen.findByText(strings['write.branchReadFailed'], {}, { timeout: 5000 });
    expect(screen.queryByText(fill(strings['write.branchNow'], { branch: 'try-port' }))).toBeNull();
    expect(screen.queryByText(fill(strings['write.branchListed'], { branch: 'try-port' }))).toBeNull();
    screen.getByText(fill(strings['write.title.unknown'], { op: op('branchSwitch', 'try-port') }));
    expect(writes()).toHaveLength(1);
  });
  it('a branch read already out when Check is pressed is never shown as now; only the press\'s own read', async () => {
    const user = userEvent.setup();
    let list: readonly { name: string; upstream: string; current: boolean }[] = [{ name: 'main', upstream: 'origin/main', current: true }, { name: 'try-port', upstream: '', current: false }];
    let gate: Promise<void> | undefined;
    let open1: () => void = () => {};
    await open({ branchSwitch: answers.lost(10) }, false, { branches: () => list, branchesGate: () => gate });
    await switchTo(user, 'try-port');
    await screen.findByText(fill(strings['write.title.unknown'], { op: op('branchSwitch', 'try-port') }));
    await settle(100);
    // A first load of the branches goes out now and waits (it saw main as current), with no list cached.
    gate = new Promise<void>((r) => { open1 = r; });
    // (not awaited: the reset's refetch waits on the gate)
    act(() => { void queryClient.resetQueries({ predicate: (q) => q.queryKey[6] === 'branches' }); });
    await settle(50);
    gate = undefined;
    // The folder moves to try-port; then Check again is pressed while that first load is still out.
    list = [{ name: 'main', upstream: 'origin/main', current: false }, { name: 'try-port', upstream: '', current: true }];
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await act(async () => { open1(); });
    await settle(300);
    await screen.findByText(fill(strings['write.branchNow'], { branch: 'try-port' }));
    expect(screen.queryByText(fill(strings['write.branchNow'], { branch: 'main' }))).toBeNull();
    expect(writes()).toHaveLength(1);
  });
  it('another read-back of the branches already out when Check is pressed is never joined', async () => {
    const user = userEvent.setup();
    let list: readonly { name: string; upstream: string; current: boolean }[] = [{ name: 'main', upstream: 'origin/main', current: true }, { name: 'try-port', upstream: '', current: false }];
    let gate: Promise<void> | undefined;
    let open1: () => void = () => {};
    await open({ branchSwitch: answers.lost(10) }, false, { branches: () => list, branchesGate: () => gate });
    await switchTo(user, 'try-port');
    await screen.findByText(fill(strings['write.title.unknown'], { op: op('branchSwitch', 'try-port') }));
    await settle(100);
    // Another read-back of the folder's branches (core refreshFresh, as a page's read-back sends) goes out now and waits:
    // it saw main as current.
    gate = new Promise<void>((r) => { open1 = r; });
    act(() => { void refreshFresh((k) => k[6] === 'branches'); });
    await settle(50);
    gate = undefined;
    list = [{ name: 'main', upstream: 'origin/main', current: false }, { name: 'try-port', upstream: '', current: true }];
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await act(async () => { open1(); });
    await settle(300);
    await screen.findByText(fill(strings['write.branchNow'], { branch: 'try-port' }));
    expect(screen.queryByText(fill(strings['write.branchNow'], { branch: 'main' }))).toBeNull();
    expect(writes()).toHaveLength(1);
  });
  it('a cached branch read of the same folder under other target metadata is not the press\'s read', async () => {
    const user = userEvent.setup();
    let list: readonly { name: string; upstream: string; current: boolean }[] = [{ name: 'main', upstream: 'origin/main', current: true }, { name: 'try-port', upstream: '', current: false }];
    await open({ branchSwitch: answers.lost(10) }, false, { branches: () => list });
    await switchTo(user, 'try-port');
    await screen.findByText(fill(strings['write.title.unknown'], { op: op('branchSwitch', 'try-port') }));
    await settle(100);
    // An older read of this folder stays cached under a key whose target named another server_name (it answers too).
    const cur = queryClient.getQueryCache().findAll({ predicate: (q) => q.queryKey[6] === 'branches' });
    expect(cur).toHaveLength(1);
    const q = cur[0]!;
    const p = q.queryKey[7] as { target: { project: { id: string }; container: { id: string; server_name?: string } } };
    const old = [...q.queryKey];
    old[7] = { ...p, target: { ...p.target, container: { ...p.target.container, server_name: 'renamed-before' } } };
    await act(async () => { await queryClient.fetchQuery({ queryKey: old, queryFn: q.options.queryFn as () => Promise<unknown> }); });
    list = [{ name: 'main', upstream: 'origin/main', current: false }, { name: 'try-port', upstream: '', current: true }];
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await settle(300);
    expect(screen.queryByText(strings['write.branchReadFailed'])).toBeNull();
    await screen.findByText(fill(strings['write.branchNow'], { branch: 'try-port' }));
    expect(writes()).toHaveLength(1);
  });
  it('a deleted branch the list no longer has: "not in the list"', async () => {
    const user = userEvent.setup();
    let list = [{ name: 'main', upstream: 'origin/main', current: true }, { name: 'try-port', upstream: '', current: false }];
    await open({ branchDelete: answers.lost(10) }, false, { branches: () => list });
    await user.click(within(await askDelete(user, 'try-port')).getByRole('button', { name: strings['branches.delete.confirm'] }));
    await screen.findByText(fill(strings['write.title.unknown'], { op: op('branchDelete', 'try-port') }));
    list = [{ name: 'main', upstream: 'origin/main', current: true }];
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await screen.findByText(fill(strings['write.branchNotListed'], { branch: 'try-port' }));
    screen.getByText(fill(strings['write.branchNow'], { branch: 'main' }));
  });
  it('survives a remount, names its branch, and is never sent again', async () => {
    const user = userEvent.setup();
    await open({ branchCreate: answers.lost(10) });
    await user.click(within(await create(user, 'next')).getByRole('button', { name: strings['branches.new.create'] }));
    await screen.findByText(fill(strings['write.title.unknown'], { op: op('branchCreate', 'next') }));
    cleanup();
    await open({}, true);
    await screen.findByText(fill(strings['write.title.unknown'], { op: op('branchCreate', 'next') }));
    screen.getByText(/^Sent at .* No answer came back/);
    expect(button(strings['branches.new'])).toBeDisabled();
    await settle(200);
    expect(writes()).toHaveLength(1);
  });
  it('Stop tracking (after its warning) frees it: the branch changes and Sync are offered again', async () => {
    const user = userEvent.setup();
    await open({ branchSwitch: answers.lost(10) });
    await switchTo(user, 'try-port');
    await screen.findByText(fill(strings['write.title.unknown'], { op: op('branchSwitch', 'try-port') }));
    await user.click(within(band()).getByRole('button', { name: /stop tracking/i }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /stop tracking/i }));
    await waitFor(() => expect(button(strings['write.sync'])).toBeEnabled());
    expect(within(rowOf('try-port')).getByRole('button', { name: strings['branches.switch'] })).toBeEnabled();
    expect(writes()).toHaveLength(1);
  });
  it('a held commit keeps the branch changes waiting, with the reason', async () => {
    const user = userEvent.setup();
    await open({ commit: answers.lost(10) });
    await user.click(screen.getByRole('radio', { name: new RegExp(strings['repo.changes']) }));
    await user.type(screen.getByRole('textbox', { name: strings['write.message'] }), 'Read the port');
    await user.click(button(strings['write.commit']));
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commit'] }));
    await user.click(screen.getByRole('radio', { name: new RegExp(strings['repo.branches']) }));
    await screen.findByRole('cell', { name: /try-port/ });
    // Soft-disabled with its reason (the kit's disabled row action): focusable, says why.
    expect(within(rowOf('try-port')).getByRole('button', { name: strings['branches.switch'] })).toHaveAttribute('aria-disabled', 'true');
    expect(within(rowOf('try-port')).getByRole('button', { name: strings['branches.switch'] })).toHaveAccessibleDescription(strings['write.heldReason']);
    expect(button(strings['branches.new'])).toBeDisabled();
    await user.click(within(rowOf('try-port')).getByRole('button', { name: /more|actions|⋯/i }));
    const del = await screen.findByRole('menuitem', { name: new RegExp(strings['branches.delete']) });
    expect(del).toHaveAttribute('aria-disabled', 'true');
    expect(within(del).getByText(strings['write.heldReason'])).toBeTruthy();
    expect(writes().map((r) => r.path)).toEqual(['/github/commit']);
  });
});

// forms-required, "New branch dialog": a name with a space turned Create off with nothing saying why, and a
// name only the agent refused ("-x", "a..b") closed the dialog and failed later. Both are now named at the field.
describe('New branch: a name the agent would refuse is named in the form', () => {
  it.each(['my feature', '-x', 'a..b', 'x~1', 'foo.lock'])('%s: the field says why, Create is off, nothing is sent', async (typed) => {
    const user = userEvent.setup();
    await open();
    const dialog = await create(user, typed);
    within(dialog).getByText(strings['branches.new.bad']);
    expect(within(dialog).getByRole('textbox', { name: strings['branches.new.name'] })).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByRole('button', { name: strings['branches.new.create'] })).toBeDisabled();
    expect(writes()).toHaveLength(0);
  });
  it('the name is marked required', async () => {
    const user = userEvent.setup();
    await open();
    const dialog = await create(user, 'x');
    expect(within(dialog).getByRole('textbox', { name: strings['branches.new.name'] })).toBeRequired();
    expect(within(dialog).queryByText(strings['branches.new.bad'])).toBeNull();
  });
});
