// A folder's page on real core (fixture transport). The link names everything: the key is decoded once, the
// computer is found by its handle in the account's whole list, the realm is the link's; the top bar's computer (atlas,
// chosen here) never enters a read. Chats is the chat list pinned to the folder; Repository is the tab already on the
// stage; a link that is not complete reads nothing; a computer that cannot be found says why, never a wrong one.
import { bootFixtureCore, chooseComputer, computerHandle, fixtureWorld, queryClient, type FixtureRequest } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the page, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the page, not page code
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { chatRules, chatWorld } from '../parts/fixtures.chats';
import FolderPage from './FolderPage';
import { ACCOUNT_PAGE, accountComputersOf, computerOf, folderAtOf, folderLinkOf, keyOfPath, useFolderComputer } from './folder';
import { folderRules, repoRules, type FolderOpts, type RepoOpts } from './fixtures';
import { folderKey } from './key';
import strings from './strings.en.json';

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const borealis = fixtureWorld.computers.find((c) => c.name === 'borealis')!;
const ACME = borealis.realm_ids[0]!;
const HANDLE = computerHandle(borealis);
const SHOP = '/home/ada/projects/shop';
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const url = (key: string, q: Record<string, string> = { computer: HANDLE, realm: ACME }) => `/ai/f/${key}${Object.keys(q).length ? `?${new URLSearchParams(q).toString()}` : ''}`;

let sent: FixtureRequest[] = [];
async function open(path: string, o: FolderOpts = {}, repo: RepoOpts = {}) {
  sent = [];
  const see = (r: FixtureRequest) => sent.push(r);
  bootFixtureCore({ rules: [...folderRules(Object.assign(o, { onSend: see })), ...chatRules({ onSend: see }), ...repoRules({ ...repo, onSend: see })] });
  act(() => chooseComputer(atlas));
  // The app's shape (app/router.tsx): the tab's splat route, so a search change keeps the path.
  const root = createRootRoute({ component: Outlet });
  const tab = createRoute({ getParentRoute: () => root, path: '/ai/$', component: FolderPage });
  const router = createRouter({ routeTree: root.addChildren([tab]), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  return router;
}
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 40)); }); };
afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('the link', () => {
  it('the key is one base64url segment of the UTF-8 path; a computer handle and one realm or global; anything else is not complete', () => {
    const k = folderKey('/srv/a:b/c');
    expect(k).toBe('L3Nydi9hOmIvYw');
    expect(keyOfPath(`/ai/f/${k}`)).toBe(k);
    expect(keyOfPath(`/ai/f/${k}/`)).toBe(k);
    for (const p of ['/ai/f/', '/ai/f/a/b', '/ai/f/a//', '/ai/c/x', '/ai/f', `/ai/fx/${k}`, `/files/f/${k}`, `/x/ai/f/${k}`]) expect(keyOfPath(p)).toBeNull();
    expect(folderLinkOf(k, HANDLE, ACME)).toEqual({ path: '/srv/a:b/c', handle: HANDLE, realm: ACME });
    expect(folderLinkOf(folderKey('/'), HANDLE, 'global')).toEqual({ path: '/', handle: HANDLE, realm: 'global' });
    // The old escaped form is no key, and nothing is inferred as the root.
    for (const old of ['%2Fsrv', '%2F', '', 'f']) expect(folderLinkOf(old, HANDLE, ACME)).toBeNull();
    const srv = folderKey('/srv');
    for (const [key, h, r] of [['shop', HANDLE, ACME], [srv, '', ACME], [srv, null, ACME], [srv, HANDLE, 'all'], [srv, HANDLE, ''], [srv, HANDLE, ACME.toUpperCase()], [null, HANDLE, ACME]] as const) {
      expect(folderLinkOf(key, h, r)).toBeNull();
    }
  });
  it('the computer is the one whose handle the link names; none is missing, two are twins; a full last page is unchecked', () => {
    // The routing node is the flat server_name only: borealis's nested server.name (a subserver display
    // name) never replaces it, and atlas, with only a nested display name, has no address (its target names no server).
    const rows = accountComputersOf({ data: { computers: [{ id: borealis.id, name: 'borealis', project_id: 'p1', server_name: 'n12', server: { name: 'ash-3' } }, { id: atlas.id, name: 'atlas', project_id: 'p2', server: { name: 'fra-7' } }, { id: atlas.id, name: 'dup' }, { name: 'no-id' }, { id: 'x' }] } });
    expect(rows.full).toBe(false);
    expect(rows.rows.map((c) => [c.name, c.target])).toEqual([
      ['borealis', { project: { id: 'p1' }, container: { id: borealis.id, server_name: 'n12' } }],
      ['atlas', { project: { id: 'p2' }, container: { id: atlas.id } }],
    ]);
    const last = (r: typeof rows.rows, full = false) => [{ rows: r, full }];
    expect(computerOf(last(rows.rows), HANDLE)).toMatchObject({ kind: 'found', computer: { id: borealis.id } });
    expect(computerOf(last(rows.rows), 'nobody.0000')).toEqual({ kind: 'missing' });
    // The name alone is not the computer: the handle's last four must match its id.
    expect(computerOf(last(rows.rows), 'borealis.0000')).toEqual({ kind: 'missing' });
    expect(computerOf(last(rows.rows, true), 'nobody.0000')).toEqual({ kind: 'unchecked' });
    const twin = { ...rows.rows[0]!, id: `ffff${borealis.id.slice(4)}` };
    expect(computerOf(last([...rows.rows, twin]), HANDLE)).toEqual({ kind: 'twin' });
    // A full last page proves neither a match nor its absence.
    expect(computerOf(last(rows.rows, true), HANDLE)).toEqual({ kind: 'unchecked' });
    expect(computerOf(last([...rows.rows, twin], true), HANDLE)).toEqual({ kind: 'unchecked' });
    expect(accountComputersOf({ data: { computers: Array.from({ length: ACCOUNT_PAGE }, (_, i) => ({ id: `c${i}`, name: 'n' })) } }).full).toBe(true);
    expect(accountComputersOf(null)).toEqual({ rows: [], full: false });
  });
});

describe('the reads', () => {
  it('the folder reads go to the link realm on the found computer, never its own realm or global', () => {
    const c = accountComputersOf({ data: { computers: [{ id: borealis.id, name: 'borealis', project_id: 'p1' }] } }).rows[0]!;
    const link = folderLinkOf(folderKey('/srv'), HANDLE, ACME)!;
    expect(folderAtOf(link, c)).toEqual({ target: c.target, realm: ACME, cwd: '/srv' });
    expect(folderAtOf({ ...link, realm: 'global' }, c).realm).toBe('global');
  });
  it('without a complete link the account list is not read', async () => {
    sent = [];
    bootFixtureCore({ rules: folderRules({ onSend: (r) => sent.push(r) }) });
    const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useFolderComputer(null), { wrapper: wrap });
    await settle();
    expect(result.current.state).toEqual({ kind: 'missing' });
    expect(sent).toEqual([]);
  });
});

describe('the page', () => {
  it('names the folder and its computer, offers the four tabs with Chats open, and reads only the link computer and realm', async () => {
    await open(url(folderKey(SHOP)));
    // The region is drawn first while the computer is found, then again with the tabs: read it once they are there.
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
    const page = screen.getByRole('region', { name: fill(strings['folder.label'], { name: 'shop' }) });
    expect(within(page).getByRole('heading', { level: 1, name: 'shop' })).toBeTruthy();
    await within(page).findByText(fill(strings['folder.line'], { path: SHOP, computer: 'borealis' }));
    const tabs = within(page).getByRole('tablist', { name: strings['folder.tabs'] });
    expect(within(tabs).getAllByRole('tab').map((t) => [t.textContent, t.getAttribute('aria-selected')])).toEqual([
      [strings['folder.tab.chats'], 'true'], [strings['folder.tab.repository'], 'false'], [strings['folder.tab.memory'], 'false'], [strings['folder.tab.automations'], 'false'],
    ]);
    await waitFor(() => expect(sent.some((r) => r.path.endsWith('/sessions'))).toBe(true));
    const agentReads = sent.filter((r) => r.target !== null);
    expect(agentReads.length).toBeGreaterThan(0);
    for (const r of agentReads) expect(r.target!.container.id).toBe(borealis.id);
    const account = sent.filter((r) => r.target === null && r.path === '/computers');
    expect(account.map((r) => r.query)).toEqual([{ page: '1', limit: String(ACCOUNT_PAGE) }]);
  });
  it('the repository tag shows in the header once the status read says it is a repository', async () => {
    await open(url(folderKey(SHOP)));
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
    const head = screen.getByRole('heading', { level: 1 }).closest('header')!;
    await within(head).findByText(/main/);
  });
  it('Chats lists this folder only (the chat list, its folder filter not offered)', async () => {
    await open(url(folderKey(SHOP)));
    const world = chatWorld();
    const here = world.sessions.filter((s) => s.cwd === SHOP).map((s) => s.name ?? s.first_message!.split('\n')[0]!);
    const elsewhere = world.sessions.filter((s) => s.cwd !== SHOP && s.first_message).map((s) => s.first_message!.split('\n')[0]!);
    for (const title of here) await screen.findByText(title);
    // The chat reads take the link's realm (the fixture transport carries no realm, so read it from the reads' keys).
    const keys = queryClient.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey)).filter((k) => k.includes('chats.sessions'));
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k).toContain(ACME);
    for (const title of elsewhere) expect(screen.queryByText(title)).toBeNull();
  });
  it('a colon in the path is kept as written', async () => {
    await open(url(folderKey('/srv/a:b/c')));
    expect(await screen.findByRole('heading', { level: 1, name: 'c' })).toBeTruthy();
    await screen.findByText(fill(strings['folder.line'], { path: '/srv/a:b/c', computer: 'borealis' }));
  });
  it('the root folder is headed "/"', async () => {
    await open(url(folderKey('/')));
    expect(await screen.findByRole('heading', { level: 1, name: '/' })).toBeTruthy();
  });
  it('the Repository tab is the folder repository on the link computer, named in its words', async () => {
    const router = await open(url(folderKey(SHOP)));
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
    await userEvent.click(screen.getByRole('tab', { name: strings['folder.tab.repository'] }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'repository' }));
    expect(router.state.location.pathname).toBe(`/ai/f/${folderKey(SHOP)}`);
    expect(screen.getByRole('tab', { name: strings['folder.tab.repository'] }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(sent.some((r) => r.path.endsWith('/github/log') || r.path.endsWith('/github/diff'))).toBe(true));
    const status = sent.filter((r) => r.path.endsWith('/github/status'));
    expect(status.length).toBeGreaterThan(0);
    for (const r of status) expect(r.target!.container.id).toBe(borealis.id);
  });
  it('switching tabs keeps the link exactly (a key with a space, a non-ASCII name, a percent and a colon); Chats leaves the URL clean', async () => {
    const key = folderKey('/srv/a b/é/100%/x:y');
    const router = await open(url(key));
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
    const before = router.state.location.href;
    await userEvent.click(screen.getByRole('tab', { name: strings['folder.tab.memory'] }));
    await screen.findByText(strings['folder.memory.title']);
    expect(router.history.location.pathname).toBe(`/ai/f/${key}`);
    expect(router.state.location.search).toEqual({ computer: HANDLE, realm: ACME, tab: 'memory' });
    await userEvent.click(screen.getByRole('tab', { name: strings['folder.tab.chats'] }));
    await waitFor(() => expect(router.state.location.href).toBe(before));
    expect(screen.getByRole('heading', { level: 1, name: 'x:y' })).toBeTruthy();
  });
  it('a search in the chat list (the router rebuilds the path) keeps the same folder open', async () => {
    const router = await open(url(folderKey(SHOP)));
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
    await act(async () => { await router.navigate({ to: '.', search: (p: Record<string, string>) => ({ ...p, q: 'deploy' }) } as never); });
    expect(router.state.location.pathname).toBe(`/ai/f/${folderKey(SHOP)}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'shop' })).toBeTruthy();
    await screen.findByText(fill(strings['folder.line'], { path: SHOP, computer: 'borealis' }));
    expect(screen.queryByText(strings['folder.incomplete.title'])).toBeNull();
  });
  it('the Repository tab names the realm by its name in an account failure', async () => {
    await open(`${url(folderKey(SHOP))}&tab=repository`, {}, { account: 'not_linked' });
    const acme = fixtureWorld.realms.find((r) => r.id === ACME)!.name;
    await screen.findByText(fill(strings['account.where'], { computer: 'borealis', realm: acme }));
  });
  it('Memory and Automations say where those live: the title and the sentence that says where', async () => {
    await open(`${url(folderKey(SHOP))}&tab=memory`);
    expect(await screen.findByText(strings['folder.memory.title'])).toBeTruthy();
    expect(screen.getByText(strings['folder.memory.body'])).toBeTruthy();
    cleanup();
    queryClient.clear();
    await open(`${url(folderKey(SHOP))}&tab=automations`);
    expect(await screen.findByText(strings['folder.automations.title'])).toBeTruthy();
    expect(screen.getByText(strings['folder.automations.body'])).toBeTruthy();
  });
});

describe('a link that is not complete', () => {
  for (const [what, path] of [
    ['a key that is not a path', url('shop')],
    ['the old escaped key', url('%2Fhome%2Fada%2Fshop')],
    ['a relative path', url(folderKey('home/ada'))],
    ['a padded key', url(`${folderKey('/srv')}=`)],
    ['no computer', url(folderKey(SHOP), { realm: ACME })],
    ['All realms', url(folderKey(SHOP), { computer: HANDLE, realm: 'all' })],
    ['no realm', url(folderKey(SHOP), { computer: HANDLE })],
  ] as const) {
    it(`${what}: says so, links Open AI, and reads nothing`, async () => {
      await open(path);
      const region = await screen.findByRole('region', { name: strings['folder.region'] });
      expect(within(region).getByText(strings['folder.incomplete.title'])).toBeTruthy();
      expect(within(region).getByRole('link', { name: strings['folder.openAi'] }).getAttribute('href')).toBe('/ai');
      await settle();
      expect(sent).toEqual([]);
    });
  }
});

describe('a computer that cannot be found', () => {
  it('no computer of the account has the handle: says so and reads nothing on any computer', async () => {
    await open(url(folderKey(SHOP), { computer: 'gone.0000', realm: ACME }));
    await screen.findByText(strings['folder.missing.title']);
    expect(screen.getByText(fill(strings['folder.missing.body'], { handle: 'gone.0000' }))).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'shop' })).toBeTruthy();
    await settle();
    expect(sent.filter((r) => r.target !== null)).toEqual([]);
  });
  it('a full first page without it reads the next page before it says "not in your account"', async () => {
    const many = Array.from({ length: ACCOUNT_PAGE }, (_, i) => ({ id: `c${String(i).padStart(23, '0')}`, name: `pc${i}` }));
    await open(url(folderKey(SHOP)), { computers: many });
    await screen.findByText(strings['folder.missing.title']);
    expect(sent.filter((r) => r.target === null && r.path === '/computers').map((r) => r.query.page)).toEqual(['1', '2']);
  });
  it('a failed list read offers Try again, and the page opens once it answers', async () => {
    let down = true;
    const opts: FolderOpts = {};
    Object.defineProperty(opts, 'computersFail', { get: () => down });
    await open(url(folderKey(SHOP)), opts);
    await screen.findByText(strings['folder.computers.failed']);
    expect(sent.filter((r) => r.target !== null)).toEqual([]);
    down = false;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('tablist', { name: strings['folder.tabs'] })).toBeTruthy();
  });
});
