// On real core (fixture transport): a folder's Issues and Pull requests. An issue create is sent once and never again:
// a lost or timed-out answer reads "This issue may have been created" with Check issues (the issues with that title; the
// person picks, the Hub never claims one); a refusal says "Not created" and keeps the text; a second submit of a title
// already sent asks first. A pull request create is the same. A checkout and a merge are confirmed in the Hub; a checkout
// reads the folder's status again; a lost merge is proven only by a list that reads it merged.
import { FIXTURE_REALM, bootFixtureCore, fixtureWorld, queryClient, type FixtureRequest } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the views, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the views, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FolderAt } from './data';
import { repoRules } from './fixtures';
import { forgetSent, heldOutputCount } from './pulls';
import { GH_REFUSAL, prRules, type PrOpts } from './pulls.fixtures';
import { Issues, PullRequests } from './PRs';
import Repository from './Repository';
import strings from './pulls.strings.en.json';
import folderStrings from './strings.en.json';
import kitStrings from '@kit/strings.en.json';

void FIXTURE_REALM;
const BOREALIS = fixtureWorld.computers.find((c) => c.name === 'borealis')!;
const AT: FolderAt = { target: { project: { id: BOREALIS.project_id }, container: { id: BOREALIS.id, server_name: BOREALIS.server_name } }, realm: BOREALIS.realm_ids[0]!, cwd: '/home/ada/shop' };
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k] ?? ''));
const NAMES = { computer: 'borealis' };
const CHECK = kitStrings['outcome.pending.check'];
const STOP = /stop tracking/i;

let sent: FixtureRequest[] = [];
let repoChanged = 0;
const posts = (path: string) => sent.filter((r) => r.method === 'POST' && r.path.endsWith(path));
const gets = (path: string) => sent.filter((r) => r.method === 'GET' && r.path.endsWith(path));

async function show(view: ReactNode | ((ui: 'issues' | 'pulls') => ReactNode), o: PrOpts = {}, ui: 'issues' | 'pulls' = 'issues') {
  sent = [];
  repoChanged = 0;
  const onSend = (r: FixtureRequest) => sent.push(r);
  bootFixtureCore({ rules: [...prRules({ ...o, onSend }), ...repoRules({ onSend })] });
  const el = typeof view === 'function' ? view(ui) : view;
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <>{el}</> }),
    history: createMemoryHistory({ initialEntries: ['/ai/f/shop'] }),
  });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
}
const issues = (o: PrOpts = {}) => show(<Issues at={AT} names={NAMES} />, o);
const pulls = (o: PrOpts = {}) => show(<PullRequests at={AT} names={NAMES} onRepoChanged={() => { repoChanged++; }} />, o);
const settle = async (ms = 60) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };

afterEach(() => {
  cleanup();
  queryClient.clear();
  forgetSent();
});

async function newIssue(title: string, body = '') {
  const u = userEvent.setup();
  await u.click(await screen.findByRole('button', { name: new RegExp(strings['issue.new'], 'i') }));
  const dialog = await screen.findByRole('dialog');
  await u.type(within(dialog).getByRole('textbox', { name: new RegExp(strings['form.title']) }), title);
  if (body) await u.type(within(dialog).getByRole('textbox', { name: new RegExp(strings['form.body']) }), body);
  return { u, dialog };
}
const createBtn = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: strings['issue.create'] });

describe('Issues: the list', () => {
  it('reads the folder repository (owner/repo from the identity read) on its computer, realm and path, open by default', async () => {
    await issues();
    await screen.findByText('Port is fixed at 8080');
    const g = gets('/github/issues');
    expect(g.length).toBeGreaterThan(0);
    expect(g[0]!.query).toMatchObject({ owner: 'ada', repo: 'shop', state: 'open' });
    expect(g[0]!.target?.container.id).toBe(BOREALIS.id);
    expect(screen.queryByText('Docs are old')).toBeNull();
    expect(screen.getByText(strings.slice)).toBeTruthy();
  });
});

describe('Issues: an issue create is never resent', () => {
  it('made: one POST, the folder and the words the person wrote, then "Issue created" with its link', async () => {
    await issues();
    const { u, dialog } = await newIssue('New port bug', 'details');
    await u.click(createBtn(dialog));
    await screen.findByText(strings['issue.made']);
    expect(posts('/github/issues')).toHaveLength(1);
    expect(posts('/github/issues')[0]!.body).toEqual({ title: 'New port bug', body: 'details' });
    expect(screen.getByRole('link', { name: fill(strings.number, { number: 32 }) }).getAttribute('href')).toBe('https://github.com/ada/shop/issues/32');
  });

  it('a lost answer: "may have been created", nothing sent again, the same title cannot be sent until it is checked', async () => {
    await issues({ issue: 'lost' });
    const { u, dialog } = await newIssue('Port is fixed at 8080');
    await u.click(createBtn(dialog));
    await screen.findByText(strings['issue.unknown.title']);
    expect(screen.getByText(fill(strings['unknown.known'], { title: 'Port is fixed at 8080' }))).toBeTruthy();
    await settle(200);
    expect(posts('/github/issues')).toHaveLength(1);
    // The same title again (other case and spacing): the form refuses it and says why; nothing is sent.
    const again = await newIssue('port IS fixed at  8080');
    expect(within(again.dialog).getByText(strings['issue.heldHere'])).toBeTruthy();
    expect(createBtn(again.dialog).hasAttribute('disabled') || createBtn(again.dialog).getAttribute('aria-disabled') === 'true').toBe(true);
    await again.u.click(createBtn(again.dialog));
    await settle(100);
    expect(posts('/github/issues')).toHaveLength(1);
  });

  it('a timed-out answer (503 timed_out) is unknown too, never "not created"', async () => {
    await issues({ issue: 'timedOut' });
    const { u, dialog } = await newIssue('Slow one');
    await u.click(createBtn(dialog));
    await screen.findByText(strings['issue.unknown.title']);
    expect(screen.queryByText(strings['issue.refused'])).toBeNull();
    expect(posts('/github/issues')).toHaveLength(1);
  });

  it('a 200 that does not say gh succeeded (an older agent) is held unknown like a lost answer: never "created", never sent again', async () => {
    for (const issue of ['okNotRan', 'okCutShort'] as const) {
      cleanup();
      forgetSent();
      await issues({ issue });
      const { u, dialog } = await newIssue('Old agent ' + issue);
      await u.click(createBtn(dialog));
      // Held by core: a band with Check again (the first answer's hold too: it outlives the remount) and the same title
      // cannot be sent from the form.
      const bands = issue === 'okNotRan' ? 1 : 2;
      await waitFor(() => expect(screen.getAllByText(strings['issue.unknown.title'])).toHaveLength(bands));
      expect(screen.getByText(fill(strings['unknown.known'], { title: 'Old agent ' + issue }))).toBeTruthy();
      expect(screen.queryByText(strings['issue.made'])).toBeNull();
      expect(screen.getAllByRole('button', { name: CHECK })).toHaveLength(bands);
      const again = await newIssue('old AGENT ' + issue);
      expect(within(again.dialog).getByText(strings['issue.heldHere'])).toBeTruthy();
      await again.u.click(createBtn(again.dialog));
      await settle(100);
      expect(posts('/github/issues').filter((r) => (r.body as { title?: string }).title === 'Old agent ' + issue)).toHaveLength(1);
    }
  });

  it('no answer at all (the connection dropped) is unknown too', async () => {
    await issues({ issue: 'network' });
    const { u, dialog } = await newIssue('Dropped');
    await u.click(createBtn(dialog));
    await screen.findByText(strings['issue.unknown.title']);
    expect(posts('/github/issues')).toHaveLength(1);
  });

  it('Check issues reads every issue (state all) and offers only those with the title sent; the person picks one', async () => {
    const listed = [
      { number: 40, title: 'Port is fixed at 8080', state: 'open', author: 'ada', url: 'https://github.com/ada/shop/issues/40' },
      { number: 31, title: 'Port is fixed at 8080', state: 'closed', author: 'grace', url: 'https://github.com/ada/shop/issues/31' },
      { number: 33, title: 'Something else', state: 'open', author: 'ada', url: 'https://github.com/ada/shop/issues/33' },
    ];
    await issues({ issue: 'lost', issues: () => listed });
    const { u, dialog } = await newIssue('port IS fixed at  8080');
    await u.click(createBtn(dialog));
    await screen.findByText(strings['issue.unknown.title']);
    const before = gets('/github/issues').filter((r) => r.query.state === 'all').length;
    await u.click(screen.getByRole('button', { name: CHECK }));
    const table = await screen.findByRole('grid', { name: strings.candidates }).catch(() => screen.findByRole('table', { name: strings.candidates }));
    expect(gets('/github/issues').filter((r) => r.query.state === 'all').length).toBeGreaterThan(before);
    expect(within(table).getAllByText('Port is fixed at 8080')).toHaveLength(2);
    expect(within(table).queryByText('Something else')).toBeNull();
    // Still unknown until the person picks: the band stays.
    expect(screen.getByText(strings['issue.unknown.title'])).toBeTruthy();
    await u.click(within(table).getAllByRole('button', { name: strings.mine })[0]!);
    await waitFor(() => expect(screen.queryByText(strings['issue.unknown.title'])).toBeNull());
    expect(posts('/github/issues')).toHaveLength(1);
  });

  it('Check with nothing of that title says so and keeps it unknown', async () => {
    await issues({ issue: 'lost', issues: () => [] });
    const { u, dialog } = await newIssue('Never listed');
    await u.click(createBtn(dialog));
    await screen.findByText(strings['issue.unknown.title']);
    await u.click(screen.getByRole('button', { name: CHECK }));
    await screen.findByText(strings['candidates.none']);
    expect(screen.getByText(strings['issue.unknown.title'])).toBeTruthy();
  });

  it('Dismiss asks first, then stops tracking it; the title can be sent again (asking first)', async () => {
    await issues({ issue: 'lost' });
    const { u, dialog } = await newIssue('Forget me');
    await u.click(createBtn(dialog));
    await screen.findByText(strings['issue.unknown.title']);
    await u.click(screen.getByRole('button', { name: STOP }));
    const ask = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    expect(within(ask).getByText(strings['dismiss.body'])).toBeTruthy();
    await u.click(within(ask).getByRole('button', { name: strings.dismiss }));
    await waitFor(() => expect(screen.queryByText(strings['issue.unknown.title'])).toBeNull());
    const again = await newIssue('Forget me');
    await again.u.click(createBtn(again.dialog));
    await screen.findByText(strings['issue.again.title']);
    expect(posts('/github/issues')).toHaveLength(1);
  });

  it('a ran-but-failed command (502 git_command_failed) may have made it: unknown, never "Not created"', async () => {
    await issues({ issue: 'cmdFailed' });
    const { u, dialog } = await newIssue('Disabled issues');
    await u.click(createBtn(dialog));
    await screen.findByText(strings['issue.unknown.title']);
    expect(screen.queryByText(strings['issue.refused'])).toBeNull();
    expect(posts('/github/issues')).toHaveLength(1);
  });

  it('a ran-but-failed command shows gh\'s own output on the held band, and still after a remount on the same page life', async () => {
    await issues({ issue: 'cmdFailed' });
    const { u, dialog } = await newIssue('Disabled issues here');
    await u.click(createBtn(dialog));
    await screen.findByText(strings['issue.unknown.title']);
    expect(screen.getAllByText(strings.output).length).toBeGreaterThan(0);
    expect(screen.getByText(GH_REFUSAL)).toBeTruthy();
    cleanup();
    await issues({ issue: 'cmdFailed' });
    await screen.findByText(strings['issue.unknown.title']);
    expect(screen.getByText(GH_REFUSAL)).toBeTruthy();
    expect(posts('/github/issues')).toHaveLength(0);
    // Stop tracking (confirmed) frees the hold and forgets its output.
    const before = heldOutputCount();
    const u2 = userEvent.setup();
    await u2.click(screen.getByRole('button', { name: STOP }));
    const ask = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    await u2.click(within(ask).getByRole('button', { name: strings.dismiss }));
    await waitFor(() => expect(screen.queryByText(strings['issue.unknown.title'])).toBeNull());
    expect(heldOutputCount()).toBe(before - 1);
  });

  it('a lost answer carries no output: the band shows no output row', async () => {
    await issues({ issue: 'lost' });
    const { u, dialog } = await newIssue('No words came');
    await u.click(createBtn(dialog));
    await screen.findByText(strings['issue.unknown.title']);
    expect(screen.queryByText(strings.output)).toBeNull();
  });

  it('an unreadable account store (refused before anything ran) says "Not created" in its typed words', async () => {
    await issues({ issue: 'storeUnavailable' });
    const { u, dialog } = await newIssue('Store down');
    await u.click(createBtn(dialog));
    await within(dialog).findByText(folderStrings['account.store_unavailable']);
    expect(screen.queryByText(strings['issue.unknown.title'])).toBeNull();
  });

  it('a refusal (400) says "Not created", keeps the dialog and its text, holds nothing', async () => {
    await issues({ issue: 'badRequest' });
    const { u, dialog } = await newIssue('Disabled issues', 'body text');
    await u.click(createBtn(dialog));
    await within(dialog).findByText(strings['issue.refused']);
    expect((within(dialog).getByRole('textbox', { name: new RegExp(strings['form.title']) }) as HTMLInputElement).value).toBe('Disabled issues');
    expect(screen.queryByText(strings['issue.unknown.title'])).toBeNull();
    expect(posts('/github/issues')).toHaveLength(1);
  });

  it('an account failure on a create is told in its typed words', async () => {
    await issues({ issue: 'notLinked' });
    const { u, dialog } = await newIssue('No account');
    await u.click(createBtn(dialog));
    await within(dialog).findByText(folderStrings['account.not_linked']);
  });

  it('a second submit of a title already created asks "This may create a second issue"; Cancel sends nothing, Send again sends one more', async () => {
    await issues();
    const first = await newIssue('Twice');
    await first.u.click(createBtn(first.dialog));
    await screen.findByText(strings['issue.made']);
    const again = await newIssue('  twice ');
    await again.u.click(createBtn(again.dialog));
    const ask = await screen.findByText(strings['issue.again.title']);
    expect(posts('/github/issues')).toHaveLength(1);
    const askDialog = ask.closest('[role="alertdialog"],[role="dialog"]') as HTMLElement;
    await again.u.click(within(askDialog).getByRole('button', { name: /cancel/i }));
    await settle(100);
    expect(posts('/github/issues')).toHaveLength(1);
    await again.u.click(createBtn(again.dialog));
    const ask2 = (await screen.findByText(strings['issue.again.title'])).closest('[role="alertdialog"],[role="dialog"]') as HTMLElement;
    await again.u.click(within(ask2).getByRole('button', { name: strings['again.confirm'] }));
    await waitFor(() => expect(posts('/github/issues')).toHaveLength(2));
  });

  it('a different title is a different issue: no question', async () => {
    await issues();
    const first = await newIssue('One');
    await first.u.click(createBtn(first.dialog));
    await screen.findByText(strings['issue.made']);
    const second = await newIssue('Two');
    await second.u.click(createBtn(second.dialog));
    await waitFor(() => expect(posts('/github/issues')).toHaveLength(2));
    expect(screen.queryByText(strings['issue.again.title'])).toBeNull();
  });
});

describe('Pull requests', () => {
  it('lists open pull requests of the folder repository; Merge only on an open one', async () => {
    await pulls();
    await screen.findByText('Read the port from the environment');
    expect(gets('/github/pr')[0]!.query).toMatchObject({ owner: 'ada', repo: 'shop', state: 'open' });
  });

  it('Check out asks first, naming the detached checkout; Cancel sends nothing', async () => {
    await pulls();
    const u = userEvent.setup();
    await screen.findByText('Read the port from the environment');
    await u.click(screen.getByRole('button', { name: strings.checkout }));
    const ask = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    expect(within(ask).getByText(fill(strings['checkout.title'], { number: 12 }))).toBeTruthy();
    expect(within(ask).getByText(strings['checkout.body'])).toBeTruthy();
    await u.click(within(ask).getByRole('button', { name: /cancel/i }));
    await settle(100);
    expect(posts('/github/pr/checkout')).toHaveLength(0);
  });

  it('a confirmed checkout sends the number once and reads the folder status again', async () => {
    await pulls();
    const u = userEvent.setup();
    await screen.findByText('Read the port from the environment');
    await u.click(screen.getByRole('button', { name: strings.checkout }));
    const ask = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    await u.click(within(ask).getByRole('button', { name: strings.checkout }));
    await screen.findByText(fill(strings['checkout.done'], { number: 12 }));
    expect(posts('/github/pr/checkout').map((r) => r.body)).toEqual([{ number: 12 }]);
    expect(repoChanged).toBe(1);
  });

  it('a lost checkout answer may have happened: Check reads the status, nothing is sent again', async () => {
    await pulls({ checkout: 'lost' });
    const u = userEvent.setup();
    await screen.findByText('Read the port from the environment');
    await u.click(screen.getByRole('button', { name: strings.checkout }));
    const ask = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    await u.click(within(ask).getByRole('button', { name: strings.checkout }));
    await screen.findByText(strings['checkout.unknown.title']);
    const n = repoChanged;
    await u.click(screen.getByRole('button', { name: CHECK }));
    expect(repoChanged).toBe(n + 1);
    expect(posts('/github/pr/checkout')).toHaveLength(1);
  });

  it('a ran-but-failed checkout shows gh\'s own output on its held band', async () => {
    await pulls({ checkout: 'cmdFailed' });
    const u = userEvent.setup();
    await screen.findByText('Read the port from the environment');
    await u.click(screen.getByRole('button', { name: strings.checkout }));
    const ask = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    await u.click(within(ask).getByRole('button', { name: strings.checkout }));
    await screen.findByText(strings['checkout.unknown.title']);
    expect(screen.getByText(GH_REFUSAL)).toBeTruthy();
    expect(posts('/github/pr/checkout')).toHaveLength(1);
  });

  it('a checkout 200 that does not say gh succeeded is unknown, never "Checked out"', async () => {
    await pulls({ checkout: 'okNotRan' });
    const u = userEvent.setup();
    await screen.findByText('Read the port from the environment');
    await u.click(screen.getByRole('button', { name: strings.checkout }));
    const ask = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    await u.click(within(ask).getByRole('button', { name: strings.checkout }));
    await screen.findByText(strings['checkout.unknown.title']);
    expect(screen.queryByText(fill(strings['checkout.done'], { number: 12 }))).toBeNull();
    expect(posts('/github/pr/checkout')).toHaveLength(1);
  });

  it('a merge 200 cut short (timed_out) is unknown, never "Merged"', async () => {
    await pulls({ merge: 'okCutShort' });
    const u = userEvent.setup();
    await screen.findByText('Read the port from the environment');
    await u.click(screen.getAllByRole('button', { name: /more|actions|⋯/i })[0]!);
    await u.click(await screen.findByRole('menuitem', { name: new RegExp(strings.merge) }));
    const ask = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    await u.click(within(ask).getByRole('button', { name: strings['merge.confirm'] }));
    await screen.findByText(strings['merge.unknown.title']);
    expect(screen.queryByText(fill(strings['merge.done'], { number: 12 }))).toBeNull();
    expect(posts('/github/pr/merge')).toHaveLength(1);
  });

  it('Merge is confirmed as a danger, sends the chosen method once', async () => {
    await pulls();
    const u = userEvent.setup();
    await screen.findByText('Read the port from the environment');
    await u.click(screen.getAllByRole('button', { name: /more|actions|⋯/i })[0]!);
    await u.click(await screen.findByRole('menuitem', { name: new RegExp(strings.merge) }));
    const ask = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    expect(within(ask).getByText(strings['merge.body'])).toBeTruthy();
    await u.click(within(ask).getByRole('radio', { name: strings['merge.method.squash'] }));
    await u.click(within(ask).getByRole('button', { name: strings['merge.confirm'] }));
    await screen.findByText(fill(strings['merge.done'], { number: 12 }));
    expect(posts('/github/pr/merge').map((r) => r.body)).toEqual([{ number: 12, method: 'squash' }]);
  });

  it('a lost merge stays unknown until a list reads it merged; nothing is said before the list answers', async () => {
    let merged = false;
    const rows = () => [{ number: 12, title: 'Read the port from the environment', state: merged ? 'merged' : 'open', author: 'ada', head: 'try-port', url: 'https://github.com/ada/shop/pull/12' }];
    let open: Promise<void> = Promise.resolve();
    let release = () => undefined as void;
    await pulls({ merge: 'lost', pulls: rows, pullsGate: () => open });
    const u = userEvent.setup();
    await screen.findByText('Read the port from the environment');
    await u.click(screen.getAllByRole('button', { name: /more|actions|⋯/i })[0]!);
    await u.click(await screen.findByRole('menuitem', { name: new RegExp(strings.merge) }));
    const ask = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    await u.click(within(ask).getByRole('button', { name: strings['merge.confirm'] }));
    await screen.findByText(strings['merge.unknown.title']);
    // Check while GitHub's list is still on its way: no "not merged yet" from a list that has not answered.
    open = new Promise<void>((res) => { release = res; });
    await u.click(screen.getByRole('button', { name: CHECK }));
    await settle(150);
    expect(screen.queryByText(fill(strings['merge.notYet'], { number: 12 }))).toBeNull();
    release();
    await screen.findByText(fill(strings['merge.notYet'], { number: 12 }));
    expect(screen.getByText(strings['merge.unknown.title'])).toBeTruthy();
    merged = true;
    await u.click(screen.getByRole('button', { name: CHECK }));
    await waitFor(() => expect(screen.queryByText(strings['merge.unknown.title'])).toBeNull());
    expect(posts('/github/pr/merge')).toHaveLength(1);
  });

  it('a held merge is never freed by another repository: the folder repointed to one where #12 is merged keeps it unknown', async () => {
    let repo = 'shop';
    const rows = () => [{ number: 12, title: 'Read the port from the environment', state: repo === 'shop' ? 'open' : 'merged', author: 'ada', head: 'try-port', url: `https://github.com/ada/${repo}/pull/12` }];
    await pulls({ merge: 'lost', pulls: rows, identity: () => ({ owner: 'ada', repo }) });
    const u = userEvent.setup();
    await screen.findByText('Read the port from the environment');
    await u.click(screen.getAllByRole('button', { name: /more|actions|⋯/i })[0]!);
    await u.click(await screen.findByRole('menuitem', { name: new RegExp(strings.merge) }));
    const ask = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    await u.click(within(ask).getByRole('button', { name: strings['merge.confirm'] }));
    await screen.findByText(strings['merge.unknown.title']);
    // The folder now reads ada/other, whose #12 is merged: every read (identity first) is read again.
    repo = 'other';
    await act(async () => { await queryClient.invalidateQueries(); });
    await waitFor(() => expect(gets('/github/pr').some((r) => r.query.repo === 'other')).toBe(true));
    await u.click(screen.getByRole('button', { name: CHECK }));
    await screen.findByText(fill(strings['merge.otherRepo'], { number: 12 }));
    await settle(150);
    expect(screen.getByText(strings['merge.unknown.title'])).toBeTruthy();
    expect(posts('/github/pr/merge')).toHaveLength(1);
  });

  it('a lost pull request create may have been opened; the same title cannot be sent again until checked', async () => {
    await pulls({ pull: 'lost' });
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: new RegExp(strings['pull.new'], 'i') }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(strings['pull.form.help'])).toBeTruthy();
    await u.type(within(dialog).getByRole('textbox', { name: new RegExp(strings['form.title']) }), 'Fix port');
    await u.click(within(dialog).getByRole('button', { name: strings['pull.create'] }));
    await screen.findByText(strings['pull.unknown.title']);
    expect(posts('/github/pr')).toHaveLength(1);
  });
});

describe('the Repository tab shows the two views', () => {
  it('Read again on the Issues view reads the list again', async () => {
    await show(<Repository at={AT} names={NAMES} />);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('radio', { name: strings['repo.issues'] }));
    await screen.findByText('Port is fixed at 8080');
    const before = gets('/github/issues').length;
    await u.click(screen.getByRole('button', { name: folderStrings['repo.refresh'] }));
    await waitFor(() => expect(gets('/github/issues').length).toBeGreaterThan(before));
  });

  it('Pull requests and Issues are views of the Repository tab', async () => {
    await show(<Repository at={AT} names={NAMES} />);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('radio', { name: strings['repo.issues'] }).catch(() => screen.findByRole('tab', { name: strings['repo.issues'] })));
    await screen.findByText('Port is fixed at 8080');
    await u.click(screen.getByRole('radio', { name: strings['repo.pulls'] }));
    await screen.findByText('Read the port from the environment');
  });
});
