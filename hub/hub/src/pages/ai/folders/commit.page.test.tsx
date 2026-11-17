// A folder's writes on its page, on real core (fixture transport), the answer table row by row: each step shows only
// with positive evidence; an unknown write is held (the commit box and Sync wait), survives a remount, and is never sent
// again; the checks read the history ("Is this your commit?", never claimed) and offer the branch on GitHub; pushing again
// goes through Push after stopping tracking; account failures use the typed words.
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
import { suggestSpec } from './Commit';
import { forgetMessages, replyOf, REPO_WRITE_LOCK } from './writes';

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const borealis = fixtureWorld.computers.find((c) => c.name === 'borealis')!;
const ACME = borealis.realm_ids[0]!;
const SHOP = '/home/ada/projects/shop';
const URL_ = `/ai/f/${folderKey(SHOP)}?${new URLSearchParams({ computer: computerHandle(borealis), realm: ACME, tab: 'repository' }).toString()}`;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const MSG = 'Read the port from the environment';

let sent: FixtureRequest[] = [];
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
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  await screen.findByRole('textbox', { name: strings['write.message'] });
  return router;
}
const settle = async (ms = 60) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
async function commitPush(user: ReturnType<typeof userEvent.setup>, op: 'write.commitPush' | 'write.commit' = 'write.commitPush', message = MSG) {
  await user.type(screen.getByRole('textbox', { name: strings['write.message'] }), message);
  await user.click(screen.getByRole('button', { name: strings[op] }));
}
const band = () => screen.getAllByRole('alert').concat(screen.queryAllByRole('status')).find((e) => e.hasAttribute('data-outcome'))!;
const button = (name: string) => screen.getByRole('button', { name });
afterEach(() => {
  cleanup();
  queryClient.clear();
  forgetMessages();
});

describe('Commit and push: the answer table', () => {
  it('200 committed:true: "Commit created", "Pushed"; the message clears; sent once', async () => {
    const user = userEvent.setup();
    await open();
    await commitPush(user);
    await screen.findByText(fill(strings['write.title.done'], { op: strings['write.op.commitPush'] }));
    screen.getByText(strings['write.commit.created']);
    screen.getByText(strings['write.push.pushed']);
    expect(screen.getByRole('textbox', { name: strings['write.message'] })).toHaveValue('');
    expect(writes().map((r) => [r.path, r.body])).toEqual([['/github/commit/push', { message: MSG }]]);
    expect(writes()[0]!.target?.container.id).toBe(borealis.id);
  });
  it('200 committed:false: "Nothing new to commit", "Pushed"', async () => {
    const user = userEvent.setup();
    await open({ commitPush: answers.ok({ status: 'ok', success: true, committed: false }) });
    await commitPush(user);
    await screen.findByText(strings['write.commit.nothing']);
    screen.getByText(strings['write.push.pushed']);
  });
  it('502 push_failed with committed:true: created; "Push failed: <reason>"; "Do not commit again"; nothing held, nothing resent', async () => {
    const user = userEvent.setup();
    await open({ commitPush: agentError(502, 'push_failed', { committed: true, output: '! [rejected] main -> main (fetch first)' }) });
    await commitPush(user);
    await screen.findByText(fill(strings['write.push.failedReason'], { reason: '! [rejected] main -> main (fetch first)' }));
    screen.getByText(strings['write.commit.created']);
    screen.getByText(strings['write.doNotCommitAgain']);
    expect(band().getAttribute('data-outcome')).toBe('failed');
    // The answer proved both steps: the hold is freed, Sync is offered again.
    await waitFor(() => expect(button(strings['write.sync'])).toBeEnabled());
    await settle(200);
    expect(writes()).toHaveLength(1);
  });
  it('502 git_command_failed with committed:false: "Not committed: refused by the repository" with git\'s words; push not run', async () => {
    const user = userEvent.setup();
    await open({ commitPush: agentError(502, 'git_command_failed', { committed: false, output: 'pre-commit hook failed' }) });
    await commitPush(user);
    await screen.findByText(strings['write.commit.refused']);
    screen.getByText('pre-commit hook failed');
    screen.getByText(strings['write.notRun']);
    // The message stays: nothing was recorded.
    expect(screen.getByRole('textbox', { name: strings['write.message'] })).toHaveValue(MSG);
  });
  it('the banner (the live region) says each step\'s result, never git\'s output; a lost answer says it first', async () => {
    const user = userEvent.setup();
    await open({ commitPush: agentError(502, 'git_command_failed', { committed: false, output: 'pre-commit hook failed' }) });
    await commitPush(user);
    await screen.findByText(strings['write.commit.refused']);
    expect(band()).toHaveAttribute('role', 'alert');
    const said = band().textContent ?? '';
    expect(said).toContain(fill(strings['write.stepLine'], { label: strings['write.step.commit'], value: strings['write.commit.refused'] }));
    expect(said).toContain(fill(strings['write.stepLine'], { label: strings['write.step.push'], value: strings['write.notRun'] }));
    expect(said).not.toContain('pre-commit hook failed');
    cleanup();
    await open({ commitPush: answers.lost(10) });
    await commitPush(user);
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }));
    const unknownStep = fill(strings['write.stepLine'], { label: strings['write.step.commit'], value: strings['write.commit.unknown'] });
    expect(band().textContent).toContain(unknownStep);
    // A remount has no answer: the banner says it was sent and none came back, then the steps (all unknown).
    cleanup();
    await open({}, true);
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }));
    const lost = band().textContent ?? '';
    expect(lost).toMatch(/Sent at .* No answer came back/);
    expect(lost.indexOf('Sent at')).toBeLessThan(lost.indexOf(unknownStep));
  });
  it('a push failure\'s reason is git\'s output too: the facts show it, the banner says only that the push failed', async () => {
    const user = userEvent.setup();
    await open({ commitPush: agentError(502, 'push_failed', { committed: true, output: '! [rejected] main -> main (fetch first)' }) });
    await commitPush(user);
    await screen.findByText(fill(strings['write.push.failedReason'], { reason: '! [rejected] main -> main (fetch first)' }));
    expect(band().textContent).toContain(fill(strings['write.stepLine'], { label: strings['write.step.push'], value: strings['write.push.failed'] }));
    expect(band().textContent).not.toContain('[rejected]');
  });
  it('a sync step\'s failure reason is git\'s output too: the facts show it, the banner says only that the step failed', async () => {
    const user = userEvent.setup();
    await open({ sync: agentError(502, 'sync_step_failed', { failed_step: 'github.pull', steps: [{ step: 'github.fetch', result: { status: 'ok' } }, { step: 'github.pull', result: { status: 'error', message: 'CONFLICT (content): Merge conflict in a.ts' } }] }) });
    await user.click(button(strings['write.sync']));
    await screen.findByText(fill(strings['write.step.failedReason'], { reason: 'CONFLICT (content): Merge conflict in a.ts' }));
    expect(band()).toHaveAttribute('role', 'alert');
    expect(band().textContent).toContain(strings['write.step.failed']);
    expect(band().textContent).not.toContain('CONFLICT');
  });
  it('409 detached_head with committed:true: created, push not run (the code named), do not commit again', async () => {
    const user = userEvent.setup();
    await open({ commitPush: agentError(409, 'detached_head', { committed: true }) });
    await commitPush(user);
    await screen.findByText(strings['write.commit.created']);
    screen.getByText(fill(strings['write.notRunCode'], { code: 'detached_head' }));
    screen.getByText(strings['write.doNotCommitAgain']);
  });
  it('503 timed_out with committed:true: created, push unknown (partly done); held: no commit, no Sync, nothing resent', async () => {
    const user = userEvent.setup();
    await open({ commitPush: agentError(503, 'push_failed', { committed: true, timed_out: true }) });
    await commitPush(user);
    await screen.findByText(strings['write.title.partly']);
    screen.getByText(strings['write.commit.created']);
    screen.getByText(strings['write.push.unknown']);
    expect(button(strings['write.commitPush'])).toBeDisabled();
    expect(button(strings['write.commit'])).toBeDisabled();
    expect(button(strings['write.sync'])).toBeDisabled();
    // The checks: the local status, labelled, and the branch on GitHub.
    await screen.findByText(/^Local view, as of the last fetch at /);
    expect(await screen.findByRole('link', { name: strings['write.branchLink'] })).toHaveAttribute('href', 'https://github.com/ada/shop/tree/main');
    await settle(200);
    expect(writes()).toHaveLength(1);
  });
  it('503 timed_out without committed: commit and push unknown (commit unknown)', async () => {
    const user = userEvent.setup();
    await open({ commitPush: agentError(503, 'service_unavailable', { timed_out: true }) });
    await commitPush(user);
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }));
    screen.getByText(strings['write.commit.unknown']);
    screen.getByText(strings['write.push.unknown']);
    expect(screen.queryByText(strings['write.commit.created'])).toBeNull();
  });
  it('a lost answer: both unknown; Check again reads the history and offers the matching commit, never claimed', async () => {
    const user = userEvent.setup();
    await open({ commitPush: answers.lost(10) });
    await commitPush(user);
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }));
    // Not claimed before the person says so.
    expect(screen.queryByText(fill(strings['write.isThisYours'], { sha: 'a1b2c3d', subject: MSG }))).toBeNull();
    const logsBefore = sent.filter((r) => r.path.endsWith('/github/log')).length;
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await screen.findByText(fill(strings['write.isThisYours'], { sha: 'a1b2c3d', subject: MSG }));
    expect(sent.filter((r) => r.path.endsWith('/github/log')).length).toBeGreaterThan(logsBefore);
    screen.getByText(strings['write.commit.unknown']);
    await user.click(button(strings['write.itIsMine']));
    // The commit is now the person's word; the push is still unknown, so the write stays held.
    await screen.findByText(fill(strings['write.commit.mine'], { sha: 'a1b2c3d' }));
    screen.getByText(strings['write.title.partly']);
    expect(button(strings['write.commitPush'])).toBeDisabled();
    expect(writes()).toHaveLength(1);
  });
  it('a history read before the write (History viewed first) offers nothing until Check again reads it afresh', async () => {
    const user = userEvent.setup();
    await open({ commitPush: answers.lost(10) });
    await user.click(screen.getByRole('radio', { name: new RegExp(strings['repo.history']) }));
    await screen.findByText(MSG);
    await user.click(screen.getByRole('radio', { name: new RegExp(strings['repo.changes']) }));
    await commitPush(user);
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }));
    await settle(100);
    expect(screen.queryByText(fill(strings['write.isThisYours'], { sha: 'a1b2c3d', subject: MSG }))).toBeNull();
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await screen.findByText(fill(strings['write.isThisYours'], { sha: 'a1b2c3d', subject: MSG }));
  });
  it('a message the history does not hold: no commit is offered', async () => {
    const user = userEvent.setup();
    await open({ commitPush: answers.lost(10) });
    await commitPush(user, 'write.commitPush', 'Something nobody wrote');
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }));
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await screen.findByText(strings['write.historyNone']);
    expect(screen.queryByRole('button', { name: strings['write.itIsMine'] })).toBeNull();
  });
});

describe('Commit (without push)', () => {
  it('a lost answer, then "Yes, it\'s mine": the commit is proven and the hold is freed', async () => {
    const user = userEvent.setup();
    await open({ commit: answers.lost(10) });
    await commitPush(user, 'write.commit');
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commit'] }));
    expect(button(strings['write.commit'])).toBeDisabled();
    await user.click(within(band()).getByRole('button', { name: /check again/i }));
    await user.click(await screen.findByRole('button', { name: strings['write.itIsMine'] }));
    await screen.findByText(fill(strings['write.title.done'], { op: strings['write.op.commit'] }));
    await waitFor(() => expect(button(strings['write.sync'])).toBeEnabled());
    expect(writes().map((r) => r.path)).toEqual(['/github/commit']);
  });
  it('409 nothing_to_commit: "Nothing new to commit"', async () => {
    const user = userEvent.setup();
    await open({ commit: agentError(409, 'nothing_to_commit') });
    await commitPush(user, 'write.commit');
    await screen.findByText(strings['write.commit.nothing']);
  });
});

describe('a held write', () => {
  it('survives a remount: the band says it was sent and no answer came; nothing is sent again', async () => {
    const user = userEvent.setup();
    await open({ commitPush: answers.lost(10) });
    await commitPush(user);
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }));
    cleanup();
    await open({}, true);
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }));
    screen.getByText(/^Sent at .* No answer came back/);
    expect(button(strings['write.commitPush'])).toBeDisabled();
    await settle(200);
    expect(writes()).toHaveLength(1);
  });
  it('Stop tracking (after its warning) frees it: the commit box and Sync are offered again', async () => {
    const user = userEvent.setup();
    await open({ commitPush: answers.lost(10) });
    await commitPush(user);
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }));
    await user.click(within(band()).getByRole('button', { name: /stop tracking/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /stop tracking/i }));
    await waitFor(() => expect(button(strings['write.sync'])).toBeEnabled());
    expect(screen.queryByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }))).toBeNull();
    expect(writes()).toHaveLength(1);
  });
  it('Push while held: the person confirms stopping tracking, then exactly one push is sent', async () => {
    const user = userEvent.setup();
    await open({ commitPush: agentError(503, 'push_failed', { committed: true, timed_out: true }) });
    await commitPush(user);
    await screen.findByText(strings['write.title.partly']);
    await user.click(screen.getByRole('button', { name: strings['write.more'] }));
    await user.click(await screen.findByRole('menuitem', { name: new RegExp(strings['write.push']) }));
    const dialog = await screen.findByRole('alertdialog', { name: strings['write.pushAgain.title'] });
    expect(dialog.closest('[data-hub-overlay]')?.getAttribute('data-hub-overlay')).toBe('ai-folders-push-again');
    expect(writes()).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: strings['write.pushAgain.confirm'] }));
    await screen.findByText(fill(strings['write.title.done'], { op: strings['write.op.push'] }));
    expect(writes().map((r) => [r.path, r.body])).toEqual([['/github/commit/push', { message: MSG }], ['/github/sync', { direction: 'push' }]]);
  });
  it('the lock is the folder\'s own', () => {
    expect(REPO_WRITE_LOCK).toBe('agent.repo_write');
  });
});

describe('Sync', () => {
  it('200: every step done', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(button(strings['write.sync']));
    await screen.findByText(fill(strings['write.title.done'], { op: strings['write.op.full'] }));
    expect(screen.getAllByText(strings['write.step.done'])).toHaveLength(3);
    expect(writes().map((r) => [r.path, r.body])).toEqual([['/github/sync', {}]]);
  });
  it('502 sync_step_failed: the steps that ran, the failing one with its reason, the rest not run', async () => {
    const user = userEvent.setup();
    await open({ sync: agentError(502, 'sync_step_failed', { failed_step: 'github.pull', steps: [{ step: 'github.fetch', result: { status: 'ok' } }, { step: 'github.pull', result: { status: 'error', message: 'CONFLICT (content): Merge conflict in a.ts' } }] }) });
    await user.click(button(strings['write.sync']));
    await screen.findByText(fill(strings['write.step.failedReason'], { reason: 'CONFLICT (content): Merge conflict in a.ts' }));
    screen.getByText(strings['write.step.done']);
    screen.getByText(strings['write.notRun']);
    expect(band().getAttribute('data-outcome')).toBe('failed');
  });
  it('a lost answer: every step unknown, held, with the branch on GitHub', async () => {
    const user = userEvent.setup();
    await open({ sync: answers.lost(10) });
    await user.click(button(strings['write.sync']));
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.full'] }));
    expect(screen.getAllByText(strings['write.step.unknown'])).toHaveLength(3);
    await screen.findByRole('link', { name: strings['write.branchLink'] });
    expect(button(strings['write.sync'])).toBeDisabled();
  });
  it('an account failure uses the typed words, never the agent\'s text', async () => {
    const user = userEvent.setup();
    await open({ sync: agentError(403, 'github_token_forbidden', { operation: { steps: [{ step: 'github.fetch', result: { status: 'error' } }] } }, 'RAW AGENT TEXT') });
    await user.click(button(strings['write.sync']));
    await screen.findByText(`${strings['write.step.failed']}: ${strings['account.token_forbidden']}`);
    expect(screen.queryByText(/RAW AGENT TEXT/)).toBeNull();
  });
});

describe('Suggest a message', () => {
  it('uses Hoody Free when no default agent model is configured, names it before sending, and fills the message', async () => {
    const user = userEvent.setup();
    await open();
    await screen.findByText(new RegExp(fill(strings['write.suggestHelp'], { model: 'hoody-ai/hoody-free' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await user.click(button(strings['write.suggest']));
    await waitFor(() => expect(screen.getByRole('textbox', { name: strings['write.message'] })).toHaveValue(MSG));
    screen.getByText(fill(strings['write.suggested'], { model: 'hoody-ai/hoody-free', cost: strings['write.cost.free'] }));
    expect(writes().map((r) => [r.path, r.body])).toEqual([['/github/commit/suggest-message', { model: 'hoody-ai/hoody-free' }]]);
  });
  it('uses the configured default agent\'s model; a lost answer changes nothing and is not sent again', async () => {
    const user = userEvent.setup();
    await open({ agents: answers.ok({ items: [{ name: 'general', model: 'openai/gpt-5', is_configured_default: true }] }), suggest: answers.lost(10) });
    await screen.findByText(new RegExp('openai/gpt-5'));
    await user.click(button(strings['write.suggest']));
    await screen.findByText(strings['write.suggestFailed']);
    expect(screen.getByRole('textbox', { name: strings['write.message'] })).toHaveValue('');
    await settle(200);
    expect(writes().map((r) => r.body)).toEqual([{ model: 'openai/gpt-5' }]);
  });
});

describe('the model and the answer as the page reads them', () => {
  it('Suggest uses the configured default; Hoody Free when none, when unreadable, or for a fusion composite (refused by the agent)', () => {
    expect(suggestSpec('openai/gpt-5', false)).toBe('openai/gpt-5');
    expect(suggestSpec('fusion/duo', false)).toBe('hoody-ai/hoody-free');
    expect(suggestSpec('', false)).toBe('hoody-ai/hoody-free');
    expect(suggestSpec(undefined, true)).toBe('hoody-ai/hoody-free');
    expect(suggestSpec(undefined, false)).toBeUndefined();
  });
  it('an unreadable agent list: Suggest names Hoody Free', async () => {
    await open({ agents: answers.pending5xx() });
    await screen.findByText(new RegExp(fill(strings['write.suggestHelp'], { model: 'hoody-ai/hoody-free' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  it('a pending result: no code and no details is a lost answer; push_failed, git_command_failed and sync_step_failed are 502s; any other code an unknown 5xx', () => {
    expect(replyOf({ outcome: 'pending' })).toEqual({ kind: 'lost' });
    for (const code of ['push_failed', 'git_command_failed', 'sync_step_failed']) expect(replyOf({ outcome: 'pending', code, details: { committed: true } })).toMatchObject({ kind: 'answer', status: 502, code, details: { committed: true } });
    expect(replyOf({ outcome: 'pending', code: 'TIMEOUT' })).toMatchObject({ kind: 'answer', status: 500, code: 'TIMEOUT', details: {} });
    // An earlier send's hold, and a send that never left, say nothing of this send.
    for (const code of ['READ_BACK_FIRST', 'HELD_BY_OTHER']) expect(replyOf({ outcome: 'pending', code })).toBeNull();
    expect(replyOf({ outcome: 'not_sent', code: 'X' })).toBeNull();
    expect(replyOf({ outcome: 'failed', status: 409, code: 'detached_head', details: { committed: true } })).toEqual({ kind: 'answer', status: 409, code: 'detached_head', details: { committed: true }, data: {} });
    expect(replyOf({ outcome: 'done', data: { committed: true } })).toEqual({ kind: 'answer', status: 200, code: null, details: {}, data: { committed: true } });
  });
});

describe('what a suggestion cost', () => {
  it('cost 0 is "included" only for Hoody Free; another model at 0 says its price was not reported', async () => {
    const { costWords } = await import('./Commit');
    const t = (k: string, v?: Record<string, string>) => fill((strings as Record<string, string>)[k] ?? k, v ?? {});
    expect(costWords(t as never, 0, 'hoody-ai/hoody-free')).toBe(strings['write.cost.free']);
    expect(costWords(t as never, 0, 'openai/gpt-5')).toBe(strings['write.cost.unknown']);
    expect(costWords(t as never, undefined, 'openai/gpt-5')).toBe(strings['write.cost.unknown']);
    expect(costWords(t as never, -1, 'hoody-ai/hoody-free')).toBe(strings['write.cost.unknown']);
    expect(costWords(t as never, 0.0123, 'openai/gpt-5')).toBe('$0.01');
  });
  it('Suggest never sends to an Anthropic model: a configured anthropic/ default uses Hoody Free', () => {
    expect(suggestSpec('anthropic/claude-sonnet-4-6', false)).toBe('hoody-ai/hoody-free');
  });
});

describe('an unknown outcome keeps the hold, and only the person releases it', () => {
  it('200 with a body that proves nothing ({}): held, both unknown, no write offered; still held after a remount; sent once', async () => {
    const user = userEvent.setup();
    await open({ commitPush: answers.ok({}) });
    await commitPush(user);
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }));
    expect(button(strings['write.commitPush'])).toBeDisabled();
    expect(button(strings['write.sync'])).toBeDisabled();
    cleanup();
    await open({}, true);
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }));
    expect(button(strings['write.commitPush'])).toBeDisabled();
    await settle(200);
    expect(writes()).toHaveLength(1);
  });
  it('200 success:false with committed:true: never "Pushed"; held', async () => {
    const user = userEvent.setup();
    await open({ commitPush: answers.ok({ status: 'ok', success: false, committed: true }) });
    await commitPush(user);
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }));
    expect(screen.queryByText(strings['write.push.pushed'])).toBeNull();
    expect(button(strings['write.sync'])).toBeDisabled();
  });
  it('an account failure with the commit under details.operation: created, push failed, "Do not commit again"', async () => {
    const user = userEvent.setup();
    await open({ commitPush: agentError(403, 'github_token_forbidden', { operation: { committed: true } }) });
    await commitPush(user);
    await screen.findByText(strings['write.commit.created']);
    screen.getByText(strings['write.doNotCommitAgain']);
  });
  it('a refusal whose details were too big to keep: unknown, and no write is offered until the person stops tracking it', async () => {
    const user = userEvent.setup();
    await open({ commitPush: agentError(403, 'github_token_forbidden', { operation: { committed: true }, output: 'x'.repeat(9000) }) });
    await commitPush(user);
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }));
    expect(button(strings['write.commitPush'])).toBeDisabled();
    expect(button(strings['write.sync'])).toBeDisabled();
    await user.click(within(band()).getByRole('button', { name: /stop tracking/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /stop tracking/i }));
    await waitFor(() => expect(button(strings['write.sync'])).toBeEnabled());
    expect(writes()).toHaveLength(1);
  });
  it('a sync throttled to 429 keeps the steps that ran', async () => {
    const user = userEvent.setup();
    const steps = [{ step: 'github.fetch', result: { status: 'ok' } }, { step: 'github.pull', result: { status: 'ok' } }, { step: 'github.push', result: { status: 'error', code: 'rate_limited' } }];
    await open({ sync: agentError(429, 'rate_limited', { steps }) });
    await user.click(button(strings['write.sync']));
    await screen.findByText(fill(strings['write.step.failedCode'], { code: 'rate_limited' }));
    expect(screen.getAllByText(strings['write.step.done'])).toHaveLength(2);
  });
});

describe('Push again belongs to the folder it was asked in', () => {
  it('moving to another folder while the confirm is open sends nothing there', async () => {
    const user = userEvent.setup();
    const router = await open({ commitPush: agentError(503, 'push_failed', { committed: true, timed_out: true }) });
    // Both folders read once first (their status cached), so moving between them keeps the page's head mounted.
    const other = `/ai/f/${folderKey('/home/ada')}?${new URLSearchParams({ computer: computerHandle(borealis), realm: ACME, tab: 'repository' }).toString()}`;
    await act(async () => { await router.navigate({ href: other }); });
    await screen.findByRole('button', { name: strings['write.sync'] });
    await act(async () => { await router.navigate({ href: URL_ }); });
    await screen.findByRole('textbox', { name: strings['write.message'] });
    await commitPush(user);
    await screen.findByText(strings['write.title.partly']);
    await user.click(screen.getByRole('button', { name: strings['write.more'] }));
    await user.click(await screen.findByRole('menuitem', { name: new RegExp(strings['write.push']) }));
    await screen.findByRole('alertdialog', { name: strings['write.pushAgain.title'] });
    await act(async () => { await router.navigate({ href: other }); });
    await settle(100);
    const still = screen.queryByRole('alertdialog', { name: strings['write.pushAgain.title'] });
    if (still) await user.click(within(still).getByRole('button', { name: strings['write.pushAgain.confirm'] }));
    await settle(300);
    expect(writes().filter((r) => r.path === '/github/sync')).toHaveLength(0);
  });
});

describe('one folder per mount', () => {
  it("another folder's page never shows this folder's last answer", async () => {
    const user = userEvent.setup();
    const router = await open();
    const other = `/ai/f/${folderKey('/home/ada')}?${new URLSearchParams({ computer: computerHandle(borealis), realm: ACME, tab: 'repository' }).toString()}`;
    await act(async () => { await router.navigate({ href: other }); });
    await screen.findByRole('button', { name: strings['write.sync'] });
    await act(async () => { await router.navigate({ href: URL_ }); });
    await screen.findByRole('textbox', { name: strings['write.message'] });
    await commitPush(user);
    await screen.findByText(fill(strings['write.title.done'], { op: strings['write.op.commitPush'] }));
    await act(async () => { await router.navigate({ href: other }); });
    await screen.findByRole('button', { name: strings['write.sync'] });
    await settle(100);
    expect(screen.queryByText(fill(strings['write.title.done'], { op: strings['write.op.commitPush'] }))).toBeNull();
  });
});

describe('an unknown refusal is held by core, not by the page', () => {
  it('403 with the commit under operation and details too big to keep: held after a remount, and another mount sees the hold', async () => {
    const user = userEvent.setup();
    await open({ commitPush: agentError(403, 'github_token_forbidden', { operation: { committed: true }, output: 'x'.repeat(9000) }) });
    await commitPush(user);
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }));
    cleanup();
    await open({}, true);
    // The new mount has no page state: only core's hold can show it and block the writes.
    await screen.findByText(fill(strings['write.title.unknown'], { op: strings['write.op.commitPush'] }));
    expect(button(strings['write.commitPush'])).toBeDisabled();
    expect(button(strings['write.sync'])).toBeDisabled();
    await settle(200);
    expect(writes()).toHaveLength(1);
  });
});
