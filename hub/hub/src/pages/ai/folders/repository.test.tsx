// A folder's Repository tab on real core (fixture transport). Every read goes to the folder's own computer, realm and
// path (never the top bar's); the status is labelled as this computer's view with the time it was read; the changed files
// group Not staged / Staged and show one file's diff; untracked, conflicts and a cut diff get notes; History and Branches;
// not a repository; an account failure in the agent's typed words with the way to Connections; any other failure retries.
import { FIXTURE_REALM, FIXTURE_TARGET, bootFixtureCore, fixtureWorld, queryClient, type FixtureRequest } from '@core';
import { pin } from '@core/realm';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { useAccountsPlace, pickAccountsPlace } from '../settings/connections/data';
import { folderOk, repoTable, useRepoStatus, type FolderAt } from './data';
import { STAGED_DIFF, UNSTAGED_DIFF, repoRules, type RepoOpts } from './fixtures';
import { ACCOUNT_FAILURES } from './logic';
import Repository, { connectionsHref, GLOBAL_CONNECTIONS_TO, type FolderNames } from './Repository';
import strings from './strings.en.json';

// borealis in Acme client: another computer and realm than the booted context (atlas in Personal).
const BOREALIS = fixtureWorld.computers.find((c) => c.name === 'borealis')!;
const REALM = BOREALIS.realm_ids[0]!;
const AT: FolderAt = { target: { project: { id: BOREALIS.project_id }, container: { id: BOREALIS.id, server_name: BOREALIS.server_name } }, realm: REALM, cwd: '/home/ada/shop' };
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k] ?? ''));

let sent: FixtureRequest[] = [];
async function show(o: RepoOpts = {}, at: FolderAt = AT, names: FolderNames = { computer: 'borealis' }, pinTo?: string) {
  sent = [];
  bootFixtureCore({ rules: repoRules({ ...o, onSend: (r) => sent.push(r) }) });
  // A shared-access (token) session is pinned to its realm by the page boot (core/realm.ts pin), which fixture boot leaves out.
  if (pinTo !== undefined) pin(pinTo);
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <Repository at={at} names={names} /> }),
    history: createMemoryHistory({ initialEntries: ['/ai/f/shop'] }),
  });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  return router;
}
function gate(): { p: Promise<void>; open: () => void } {
  let open = () => {};
  const p = new Promise<void>((r) => { open = r; });
  return { p, open };
}
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 40)); }); };
afterEach(() => {
  cleanup();
  queryClient.clear();
  // A test that picks Global and fails midway must not leave it picked for the next one.
  pickAccountsPlace('realm');
});

describe('where the reads go', () => {
  it('each read names the folder: its computer, its realm and its path (X-Hoody-Cwd), from the folder, never the context', () => {
    for (const key of ['status', 'log', 'branches', 'identity'] as const) {
      expect(repoTable.reads[key]!.input!(AT as never)).toEqual({ target: AT.target, realm: REALM, cwd: '/home/ada/shop' });
    }
    expect(repoTable.reads.diff!.input!({ ...AT, staged: true } as never)).toEqual({ target: AT.target, realm: REALM, cwd: '/home/ada/shop', query: { staged: 'true' } });
    expect(repoTable.reads.diff!.input!({ ...AT, staged: false } as never)).toEqual({ target: AT.target, realm: REALM, cwd: '/home/ada/shop', query: {} });
  });
  it('a folder that is not one leaves the status read idle (not sent, not failed)', async () => {
    bootFixtureCore({ rules: repoRules() });
    const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    for (const bad of [{ ...AT, realm: 'all' }, { ...AT, cwd: 'shop' }, null]) {
      const { result, unmount } = renderHook(() => useRepoStatus(bad), { wrapper: wrap });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect([result.current.fetchStatus, result.current.status]).toEqual(['idle', 'pending']);
      unmount();
    }
  });
  it('every route takes the folder (cwd) and a realm', () => {
    for (const r of Object.values(repoTable.reads)) expect([r.route.cwd, r.route.realm, r.route.method]).toEqual([true, 'realm', 'GET']);
  });
  it('a folder must be an absolute path on a named computer in one realm or global (never All realms)', () => {
    expect(folderOk(AT)).toBe(true);
    expect(folderOk({ ...AT, realm: 'global' })).toBe(true);
    for (const bad of [{ ...AT, cwd: 'shop' }, { ...AT, cwd: '' }, { ...AT, realm: 'all' }, { ...AT, realm: '' }, { ...AT, target: { project: { id: 'p' }, container: { id: '' } } }]) expect(folderOk(bad)).toBe(false);
    expect(folderOk(null)).toBe(false);
  });
  it('the tab reads the folder computer on the wire; a folder that is not one reads nothing', async () => {
    await show();
    await screen.findByText(fill(strings['repo.branchTag'], { branch: 'main', ahead: 1, behind: 2 }));
    expect(sent.length).toBeGreaterThan(0);
    expect([FIXTURE_TARGET.container.id, FIXTURE_REALM]).not.toEqual([BOREALIS.id, REALM]);
    // The realm rides the URL core builds after the fixture's view of the request (core/kit.ts): the input test above proves it.
    for (const r of sent) expect([r.path, r.target?.container.id]).toEqual([r.path, BOREALIS.id]);
    cleanup();
    await show({}, { ...AT, cwd: 'relative' });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(sent).toEqual([]);
  });
});

describe('the Repository tab', () => {
  it('while the diffs are pending the tab claims nothing; one diff alone is never shown as the change', async () => {
    for (const first of ['staged', 'unstaged'] as const) {
      const u = gate(), st = gate();
      await show({ unstagedGate: u.p, stagedGate: st.p });
      await screen.findByText(/^Local view/);
      await settle();
      expect(screen.queryByText(strings['changes.empty'])).toBeNull();
      expect(screen.queryByText(fill(strings['changes.count_other'], { count: 0 }))).toBeNull();
      await act(async () => { (first === 'staged' ? st : u).open(); });
      await settle();
      expect(screen.queryByText(first === 'staged' ? 'src/helpers.ts' : 'src/app.ts')).toBeNull();
      expect(screen.queryByText(strings['changes.empty'])).toBeNull();
      await act(async () => { (first === 'staged' ? u : st).open(); });
      await screen.findByText('src/helpers.ts');
      screen.getByText('src/app.ts');
      cleanup();
      queryClient.clear();
    }
  });
  it.each(['staged', 'unstaged'] as const)('Read again: while the diffs read again nothing old mixes with new, %s answering first', async (first) => {
    const user = userEvent.setup();
    // Before: app.ts unstaged, nothing staged. Then it is staged outside: unstaged empty, staged holds it.
    let after = false;
    let u = gate(), st = gate();
    u.open(); st.open();
    await show({
      unstagedGate: () => u.p,
      stagedGate: () => st.p,
      diffs: () => (after ? { unstaged: '', staged: UNSTAGED_DIFF } : { unstaged: UNSTAGED_DIFF, staged: '' }),
    });
    await screen.findByText('src/app.ts');
    after = true;
    u = gate(); st = gate();
    await user.click(screen.getByRole('button', { name: strings['repo.refresh'] }));
    await act(async () => { (first === 'staged' ? st : u).open(); });
    await settle();
    expect(screen.queryByText(strings['changes.empty'])).toBeNull();
    expect(screen.queryByText('src/app.ts')).toBeNull();
    await act(async () => { (first === 'staged' ? u : st).open(); });
    await screen.findByText('src/app.ts');
    expect(screen.getByText(strings['changes.group.staged'])).toBeInTheDocument();
  });
  it('a picked file’s diff goes away when a later diff read fails', async () => {
    const user = userEvent.setup();
    let failing = false;
    await show({ diffs: () => { if (failing) throw new Error('down'); return { unstaged: UNSTAGED_DIFF, staged: STAGED_DIFF }; } });
    await user.click(await screen.findByText('src/app.ts'));
    await screen.findByRole('figure', { name: fill(strings['changes.diffOf'], { path: 'src/app.ts' }) });
    failing = true;
    await user.click(screen.getByRole('button', { name: strings['repo.refresh'] }));
    await waitFor(() => expect(screen.queryByRole('figure', { name: fill(strings['changes.diffOf'], { path: 'src/app.ts' }) })).toBeNull());
  });
  it('Read again reads the changes too: a file changed since shows', async () => {
    const user = userEvent.setup();
    let changed = false;
    await show({ diffs: () => (changed ? { unstaged: UNSTAGED_DIFF, staged: '' } : { unstaged: '', staged: '' }) });
    await screen.findByText(strings['changes.empty']);
    changed = true;
    await user.click(screen.getByRole('button', { name: strings['repo.refresh'] }));
    await screen.findByText('src/app.ts');
    expect(screen.queryByText(strings['changes.empty'])).toBeNull();
  });
  it('Read again on History reads the log again', async () => {
    const user = userEvent.setup();
    await show();
    await screen.findByText(/^Local view/);
    await user.click(screen.getByRole('radio', { name: new RegExp(strings['repo.history']) }));
    await screen.findByText('Read the port from the environment');
    const before = sent.filter((r) => r.path.endsWith('/github/log')).length;
    await user.click(screen.getByRole('button', { name: strings['repo.refresh'] }));
    await waitFor(() => expect(sent.filter((r) => r.path.endsWith('/github/log')).length).toBe(before + 1));
  });
  it('a merge conflict section shows as its own file, kind Merge conflict', async () => {
    await show({ conflicts: 1, diffs: () => ({ unstaged: 'diff --cc src/app.ts\nindex 1,2..0\n--- a/src/app.ts\n+++ b/src/app.ts\n@@@ -1 -1 +1,3 @@@\n++<<<<<<< HEAD\n++=======\n++>>>>>>> theirs\n', staged: '' }) });
    await screen.findByText('src/app.ts');
    screen.getByLabelText(strings['changes.kind.U']);
    expect(screen.queryByText(strings['changes.empty'])).toBeNull();
  });
  it('a file with spaces and no ---/+++ lines shows; the change is never read as none', async () => {
    await show({ diffs: () => ({ unstaged: 'diff --git a/assets/my logo.png b/assets/my logo.png\nBinary files a/assets/my logo.png and b/assets/my logo.png differ\n', staged: '' }) });
    await screen.findByText('assets/my logo.png');
    expect(screen.queryByText(strings['changes.empty'])).toBeNull();
  });
  it.each(['changes', 'history', 'branches'] as const)('an account failure on the %s read after a good status keeps its typed words and way out', async (view) => {
    const user = userEvent.setup();
    await show({ readsAccount: 'token_invalid' });
    await screen.findByText(/^Local view/);
    if (view !== 'changes') await user.click(screen.getByRole('radio', { name: new RegExp(strings[view === 'history' ? 'repo.history' : 'repo.branches']) }));
    await screen.findByText(strings['account.title']);
    screen.getByText(strings['account.token_invalid']);
    expect(screen.getByRole('link', { name: strings['account.open'] }).getAttribute('href')).toBe(connectionsHref(AT));
  });
  it('the recovery always names the folder’s computer: Repository takes it', async () => {
    await show({ readsAccount: 'not_linked' });
    await screen.findByText(strings['account.title']);
    screen.getByText(new RegExp(fill(strings['account.where'], { computer: 'borealis', realm: REALM }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  it('the failure\'s body is its cause alone; where it is fixed stays in sight as a band after it', async () => {
    await show({ readsAccount: 'not_linked' }, AT, { computer: 'borealis', realm: 'Acme client' });
    await screen.findByText(strings['account.title']);
    const where = fill(strings['account.where'], { computer: 'borealis', realm: 'Acme client' });
    // The state's own sentence is the cause, and only it: the computer to choose is not in it.
    const cause = screen.getByText(strings['account.not_linked']);
    expect(cause.closest('p')!.textContent).toBe(strings['account.not_linked']);
    // The computer to choose is a band of its own, shown at once (Open Connections picks the place, never the computer).
    const band = screen.getByText(where).closest('[role="status"]');
    expect(band).not.toBeNull();
    expect(band!.contains(cause)).toBe(false);
    expect(cause.closest('p')!.contains(band)).toBe(false);
    // A pinned session's Global folder: the reason it cannot be fixed here is in sight too, with no button.
    cleanup(); queryClient.clear();
    await show({ account: 'token_invalid' }, { ...AT, realm: 'global' }, { computer: 'borealis' }, REALM);
    await screen.findByText(strings['account.title']);
    expect(screen.getByText(strings['account.where.pinned']).closest('[role="status"]')).not.toBeNull();
    // Read again (the store is unreadable for now) has no place to fix: no band.
    cleanup(); queryClient.clear();
    await show({ readsAccount: 'store_unavailable' });
    await screen.findByText(strings['account.title']);
    expect(screen.queryByText(/top bar/)).toBeNull();
  });
  it('a Global folder\'s account failure has an Open Connections BUTTON with no href; pressing it picks Global and goes to All realms', async () => {
    const user = userEvent.setup();
    pickAccountsPlace('realm');
    const place = renderHook(() => useAccountsPlace());
    expect(place.result.current.picked).toBe('realm');
    const router = await show({ account: 'token_invalid' }, { ...AT, realm: 'global' }, { computer: 'borealis' });
    await screen.findByText(strings['account.title']);
    // No link to copy or open in a new tab: the place is memory, so the control is a button.
    expect(screen.queryByRole('link', { name: strings['account.open'] })).toBeNull();
    const btn = screen.getByRole('button', { name: strings['account.open'] });
    expect(btn.getAttribute('href')).toBeNull();
    expect(btn.closest('a')).toBeNull();
    screen.getByText(new RegExp(fill(strings['account.where.global'], { computer: 'borealis' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    // Drawing the button changes nothing; the press does.
    expect(place.result.current.picked).toBe('realm');
    await user.click(btn);
    expect(place.result.current.picked).toBe('global');
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/connections'));
    expect(router.state.location.search).toEqual({ open_realm: 'all' });
    place.unmount();
    pickAccountsPlace('realm');
    // store_unavailable keeps its Read again in Global too.
    cleanup(); queryClient.clear();
    await show({ account: 'store_unavailable' }, { ...AT, realm: 'global' }, { computer: 'borealis' });
    await screen.findByText(strings['account.title']);
    screen.getByRole('button', { name: strings['repo.refresh'] });
  });
  it('a shared-access session pinned to one realm cannot reach Global: a Global folder shows plain words and no button; pinned to every realm and the unpinned path offer the button', async () => {
    await show({ account: 'token_invalid' }, { ...AT, realm: 'global' }, { computer: 'borealis' }, REALM);
    await screen.findByText(strings['account.title']);
    await screen.findByText(strings['account.where.pinned']);
    screen.getByText(strings['account.global.token_invalid']);
    expect(screen.queryByRole('button', { name: strings['account.open'] })).toBeNull();
    expect(screen.queryByRole('link', { name: strings['account.open'] })).toBeNull();
    expect(document.body.textContent).not.toContain('Connections opens');
    // Pinned to every realm (an access key with no realm limit): its agent calls send the realm each names (core
    // kit.ts agentRealm), as an account session's do, so Connections offers Global and so does the folder: the button.
    cleanup(); queryClient.clear();
    await show({ account: 'token_invalid' }, { ...AT, realm: 'global' }, { computer: 'borealis' }, 'all');
    await screen.findByText(strings['account.title']);
    screen.getByRole('button', { name: strings['account.open'] });
    expect(screen.queryByText(strings['account.where.pinned'])).toBeNull();
    // The unpinned session, same folder: the button and the Connections words (the test above), not the pinned words.
    cleanup(); queryClient.clear();
    await show({ account: 'token_invalid' }, { ...AT, realm: 'global' }, { computer: 'borealis' });
    await screen.findByText(strings['account.title']);
    screen.getByRole('button', { name: strings['account.open'] });
    expect(screen.queryByText(strings['account.where.pinned'])).toBeNull();
    // A realm folder in a pinned session keeps its link (unchanged).
    cleanup(); queryClient.clear();
    await show({ account: 'not_linked' }, AT, { computer: 'borealis', realm: 'Acme client' }, REALM);
    await screen.findByText(strings['account.title']);
    expect(screen.getByRole('link', { name: strings['account.open'] }).getAttribute('href')).toBe(`/ai/connections?open_realm=${REALM}`);
  });
  it.each(['not_linked', 'account_missing', 'token_invalid', 'token_forbidden', 'store_corrupt'] as const)('a Global folder\'s %s says only the cause, never "in Settings → Connections" (the button and the words after it give the way)', async (kind) => {
    await show({ account: kind }, { ...AT, realm: 'global' }, { computer: 'borealis' });
    await screen.findByText(strings['account.title']);
    screen.getByText(strings[`account.global.${kind}`]);
    expect(strings[`account.global.${kind}`]).not.toMatch(/Connections/);
    expect(screen.queryByText(strings[`account.${kind}`])).toBeNull();
    expect(document.body.textContent).not.toMatch(/in Settings → Connections/);
    screen.getByText(new RegExp(fill(strings['account.where.global'], { computer: 'borealis' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  it('account recovery goes to the folder’s realm and names its computer, not the top bar’s', async () => {
    await show({ account: 'not_linked' }, AT, { computer: 'borealis', realm: 'Acme client' });
    await screen.findByText(strings['account.title']);
    const link = screen.getByRole('link', { name: strings['account.open'] });
    expect(link.getAttribute('href')).toBe(`/ai/connections?open_realm=${REALM}`);
    expect(REALM).not.toBe(FIXTURE_REALM);
    screen.getByText(new RegExp(fill(strings['account.where'], { computer: 'borealis', realm: 'Acme client' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    // Global has a button (its place is memory), not a link; any other value has no way there either.
    for (const realm of ['global', '', 'all', 'Global', REALM.toUpperCase(), REALM.slice(1)]) expect(connectionsHref({ ...AT, realm })).toBe('');
    expect(GLOBAL_CONNECTIONS_TO).toBe('/ai/connections?open_realm=all');
  });
  it('a realm folder\'s link goes to its realm and picks the realm place, even after Global was picked', async () => {
    const user = userEvent.setup();
    // Global stays picked across realms: the link must not land on it, or a token linked there
    // would serve Global, not the folder's realm.
    pickAccountsPlace('global');
    const place = renderHook(() => useAccountsPlace());
    await show({ account: 'not_linked' }, AT, { computer: 'borealis', realm: 'Acme client' });
    await screen.findByText(strings['account.title']);
    const link = screen.getByRole('link', { name: strings['account.open'] });
    expect(link.getAttribute('href')).toBe(`/ai/connections?open_realm=${REALM}`);
    screen.getByText(strings['account.not_linked']);
    // Drawing the link changes nothing, nor does a modified click (another tab, which starts on the realm place); the press does.
    expect(place.result.current.picked).toBe('global');
    await user.keyboard('{Control>}'); await user.click(link); await user.keyboard('{/Control}');
    expect(place.result.current.picked).toBe('global');
    await user.click(link);
    expect(place.result.current.picked).toBe('realm');
    // Off Apple a Meta click opens no other tab: it is this tab's click, and it picks.
    pickAccountsPlace('global');
    await user.keyboard('{Meta>}'); await user.click(link); await user.keyboard('{/Meta}');
    expect(place.result.current.picked).toBe('realm');
    // From the keyboard too.
    pickAccountsPlace('global');
    link.focus();
    // The pick lands on keydown: in the browser the anchor's click (and the hash route) comes before keyup.
    await user.keyboard('{Enter>}');
    expect(place.result.current.picked).toBe('realm');
    await user.keyboard('{/Enter}');
    expect(place.result.current.picked).toBe('realm');
    // Ctrl+Enter (another tab, off Apple) keeps this tab's pick.
    pickAccountsPlace('global');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(place.result.current.picked).toBe('global');
    expect(link.getAttribute('href')).toBe(`/ai/connections?open_realm=${REALM}`);
    place.unmount();
  });
  it('labels the status as this computer’s own view with the time it was read, never a check with GitHub', async () => {
    await show();
    const label = await screen.findByText(/^Local view, not checked with GitHub · read at /);
    expect(label.textContent).toMatch(/read at \d{1,2}[:.]\d{2}/);
    expect(label.getAttribute('title')).toBe(strings['repo.localHelp']);
  });
  it('a detached head is labelled so', async () => {
    await show({ detached: true });
    await screen.findByText(fill(strings['repo.detachedTag'], { ahead: 1, behind: 2 }));
  });
  it('groups the changed files Not staged / Staged and shows a file’s diff when picked', async () => {
    const user = userEvent.setup();
    await show();
    const table = await screen.findByRole('grid', { name: strings['changes.table'] }).catch(() => screen.findByRole('table', { name: strings['changes.table'] }));
    await within(table).findByText('src/app.ts');
    for (const name of ['src/app.ts', 'docs/old.md', 'src/helpers.ts', 'assets/logo.png']) within(table).getByText(name);
    within(table).getByText(strings['changes.group.unstaged']);
    within(table).getByText(strings['changes.group.staged']);
    within(table).getByText(fill(strings['changes.renamed'], { from: 'src/util.ts' }).trim());
    within(table).getByText(strings['changes.binary']);
    screen.getByText(fill(strings['changes.count_other'], { count: 4 }));
    within(table).getByText(fill(strings['changes.lineCount'], { added: 2, removed: 1 }));
    expect(screen.getByText(strings['changes.pick'])).toBeTruthy();
    await user.click(within(table).getByText('src/app.ts'));
    const block = await screen.findByRole('figure', { name: fill(strings['changes.diffOf'], { path: 'src/app.ts' }) });
    expect(block.textContent).toContain('+start(port);');
    expect(block.textContent).not.toContain('Old notes');
  });
  it('notes untracked files (in no diff) and a diff cut at the agent’s cap', async () => {
    await show({ truncated: true });
    await screen.findByText(fill(strings['changes.untracked_one'], { count: 1 }));
    await screen.findByText(strings['changes.truncated']);
  });
  it('notes merge conflicts, counted', async () => {
    await show({ conflicts: 2 });
    await screen.findByText(fill(strings['changes.conflicts_other'], { count: 2 }));
  });
  it('a clean checkout says no changes', async () => {
    await show({ clean: true });
    await screen.findByText(strings['changes.empty']);
  });
  it('a failed diff read shows the table’s error with retry, never an empty list', async () => {
    await show({ diffFails: true });
    await screen.findByRole('button', { name: /try again|retry/i });
    expect(screen.queryByText(strings['changes.empty'])).toBeNull();
    // Half a list would read as the whole change: the staged files that did load are not shown either.
    expect(screen.queryByText('src/helpers.ts')).toBeNull();
  });
  it('History and Branches', async () => {
    const user = userEvent.setup();
    await show();
    await screen.findByText(fill(strings['repo.branchTag'], { branch: 'main', ahead: 1, behind: 2 }));
    await user.click(screen.getByRole('radio', { name: new RegExp(strings['repo.history']) }));
    await screen.findByText('Read the port from the environment');
    screen.getByText('a1b2c3d');
    screen.getByText(strings['history.note']);
    await user.click(screen.getByRole('radio', { name: new RegExp(strings['repo.branches']) }));
    await screen.findByText('try-port');
    screen.getByText('origin/main');
    screen.getByText(strings['branches.current']);
    screen.getByText(strings['branches.noUpstream']);
  });
  it('a repository with no commits yet says so', async () => {
    const user = userEvent.setup();
    await show({ noCommits: true });
    await screen.findByText(fill(strings['repo.branchTag'], { branch: 'main', ahead: 1, behind: 2 }));
    await user.click(screen.getByRole('radio', { name: new RegExp(strings['repo.history']) }));
    await screen.findByText(strings['history.empty']);
  });
  it('not a repository', async () => {
    await show({ none: true });
    await screen.findByText(strings['repo.none.title']);
    expect(screen.queryByText(/^Local view/)).toBeNull();
  });
  it.each(ACCOUNT_FAILURES)('the account failure %s shows its own words and the way out, never the agent text', async (kind) => {
    await show({ account: kind });
    await screen.findByText(strings['account.title']);
    screen.getByText(strings[`account.${kind}`]);
    if (kind === 'store_unavailable') {
      expect(screen.queryByRole('link', { name: strings['account.open'] })).toBeNull();
      screen.getByRole('button', { name: strings['repo.refresh'] });
    } else {
      expect(screen.getByRole('link', { name: strings['account.open'] }).getAttribute('href')).toBe(connectionsHref(AT));
    }
    expect(screen.queryByText(strings['repo.failed.title'])).toBeNull();
  });
  it('another failure is not an account failure: Couldn’t read, and retry reads again', async () => {
    const user = userEvent.setup();
    await show({ statusFails: true });
    await screen.findByText(strings['repo.failed.title']);
    expect(screen.queryByText(strings['account.title'])).toBeNull();
    const before = sent.filter((r) => r.path.endsWith('/github/status')).length;
    await user.click(screen.getByRole('button', { name: /try again|retry/i }));
    await waitFor(() => expect(sent.filter((r) => r.path.endsWith('/github/status')).length).toBeGreaterThan(before));
  });
  it('Read again reads the status again', async () => {
    const user = userEvent.setup();
    await show();
    await screen.findByText(/^Local view/);
    const before = sent.filter((r) => r.path.endsWith('/github/status')).length;
    await user.click(screen.getByRole('button', { name: strings['repo.refresh'] }));
    await waitFor(() => expect(sent.filter((r) => r.path.endsWith('/github/status')).length).toBe(before + 1));
  });
});
