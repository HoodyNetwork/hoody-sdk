// The folder link's computer is looked up in the account's whole list, page after page, not in
// its first page only. Found needs the last page read to be not full and exactly one computer with the handle across
// every page read (handles are unique only within a project, so a match on page 1 proves nothing while a later page is
// unread). Two or more is its own state, never "not in your account". A failed page is an error (C9); past the cap of
// ACCOUNT_PAGES pages the link is unchecked.
import { bootFixtureCore, chooseComputer, computerHandle, fixtureWorld, queryClient, type FixtureRequest } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the page, not page code
import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the page, not page code
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { chatRules } from '../parts/fixtures.chats';
import FolderPage from './FolderPage';
import { ACCOUNT_PAGE, ACCOUNT_PAGES, accountComputersOf, computerOf } from './folder';
import { folderRules, repoRules, type FolderOpts } from './fixtures';
import { folderKey } from './key';
import strings from './strings.en.json';

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const borealis = fixtureWorld.computers.find((c) => c.name === 'borealis')!;
const ACME = borealis.realm_ids[0]!;
const HANDLE = computerHandle(borealis);
const SHOP = '/home/ada/projects/shop';
const BOREALIS = { id: borealis.id, name: 'borealis', project_id: borealis.project_id, server_name: borealis.server_name };
/** Another project's computer with the same handle: the same name and the same last four of its id. */
const TWIN = { ...BOREALIS, id: `ffff${borealis.id.slice(4)}`, project_id: 'p-other' };
const others = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `c${String(from + i).padStart(23, '0')}`, name: `pc${from + i}` }));
const pageOf = (rows: readonly Record<string, unknown>[]) => accountComputersOf({ data: { computers: rows } });
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

function harness(href: string) {
  const root = createRootRoute({ component: Outlet });
  const tab = createRoute({ getParentRoute: () => root, path: '/ai/$', component: FolderPage });
  return createRouter({ routeTree: root.addChildren([tab]), history: createMemoryHistory({ initialEntries: [href] }) });
}
let sent: FixtureRequest[] = [];
async function open(o: FolderOpts = {}) {
  sent = [];
  const see = (r: FixtureRequest) => sent.push(r);
  bootFixtureCore({ rules: [...folderRules({ ...o, onSend: see }), ...chatRules({ onSend: see }), ...repoRules({ onSend: see })] });
  act(() => chooseComputer(atlas));
  const router = harness(`/ai/f/${folderKey(SHOP)}?computer=${HANDLE}&realm=${ACME}`);
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
}
/** The page again in a fresh router, the query cache kept (a link opened again while its pages are cached). */
async function remount() {
  cleanup();
  const router = harness(`/ai/f/${folderKey(SHOP)}?computer=${HANDLE}&realm=${ACME}`);
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
}
const accountPages = () => sent.filter((r) => r.target === null && r.path === '/computers').map((r) => Number(r.query.page));
/** Whether the folder (its tabs: the found state) is drawn at any moment from now on, until stop(). */
function watchFound() {
  const drawn = () => document.querySelector('[role="tablist"]') !== null;
  const seen = { ever: drawn() };
  const mo = new MutationObserver(() => { if (drawn()) seen.ever = true; });
  mo.observe(document.body, { childList: true, subtree: true });
  return { seen, stop: () => mo.disconnect() };
}
afterEach(() => {
  onlineManager.setOnline(true);
  cleanup();
  queryClient.clear();
});

describe('computerOf over every page read', () => {
  it('a match on a later page is found once the last page read is not full', () => {
    expect(computerOf([pageOf(others(ACCOUNT_PAGE)), pageOf([BOREALIS])], HANDLE)).toMatchObject({ kind: 'found', computer: { id: borealis.id } });
  });
  it('a match on page 1 with a full last page proves nothing: unchecked', () => {
    expect(computerOf([pageOf([BOREALIS, ...others(ACCOUNT_PAGE - 1)])], HANDLE)).toEqual({ kind: 'unchecked' });
  });
  it('two computers with the handle, on one page or on two, are twins, never missing', () => {
    expect(computerOf([pageOf([BOREALIS, TWIN])], HANDLE)).toEqual({ kind: 'twin' });
    expect(computerOf([pageOf([BOREALIS, ...others(ACCOUNT_PAGE - 1)]), pageOf([TWIN])], HANDLE)).toEqual({ kind: 'twin' });
  });
  it('the same computer listed on two pages (the list moved between reads) is one computer', () => {
    expect(computerOf([pageOf([...others(ACCOUNT_PAGE - 1), BOREALIS]), pageOf([BOREALIS])], HANDLE)).toMatchObject({ kind: 'found' });
  });
  it('no match across the pages read, the last not full: missing', () => {
    expect(computerOf([pageOf(others(ACCOUNT_PAGE)), pageOf(others(3, ACCOUNT_PAGE))], HANDLE)).toEqual({ kind: 'missing' });
  });
});

describe('the page reads the account list page after page', () => {
  it('the computer on page 2 of 101: the folder opens, after reading pages 1 and 2 only', async () => {
    await open({ computers: [...others(ACCOUNT_PAGE), BOREALIS] });
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
    expect(accountPages()).toEqual([1, 2]);
  });
  it('two computers with the handle across the pages: says so, never "not in your account", and opens nothing', async () => {
    await open({ computers: [BOREALIS, ...others(ACCOUNT_PAGE - 1), TWIN] });
    await screen.findByText(strings['folder.twin.title']);
    expect(screen.getByText(fill(strings['folder.twin.body'], { handle: HANDLE }))).toBeTruthy();
    expect(screen.queryByText(strings['folder.missing.title'])).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(sent.filter((r) => r.target !== null)).toEqual([]);
  });
  it('a failed page 2 is an error with Try again, never missing; after it answers the folder opens', async () => {
    let down = true;
    await open({ computers: [...others(ACCOUNT_PAGE), BOREALIS], pageFails: (p) => p === 2 && down });
    await screen.findByText(strings['folder.computers.failed']);
    expect(screen.queryByText(strings['folder.missing.title'])).toBeNull();
    down = false;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
  });
  it(`past ${ACCOUNT_PAGES} full pages the link is unchecked, and no page past the cap is read`, async () => {
    await open({ computers: [...others(ACCOUNT_PAGE * ACCOUNT_PAGES), BOREALIS] });
    await screen.findByText(strings['folder.unchecked.title'], undefined, { timeout: 15_000 });
    await waitFor(() => expect(accountPages()).toHaveLength(ACCOUNT_PAGES));
    expect(accountPages()).toEqual(Array.from({ length: ACCOUNT_PAGES }, (_, i) => i + 1));
  }, 30_000);
  it('Try again reads only the failed page again', async () => {
    let down = true;
    await open({ computers: [...others(ACCOUNT_PAGE * 2), BOREALIS], pageFails: (p) => p === 2 && down });
    await screen.findByText(strings['folder.computers.failed']);
    const before = accountPages().length;
    down = false;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
    expect(accountPages().slice(before)).toEqual([2, 3]);
  });
});

describe('cached pages', () => {
  it('pages 1 and 2 cached full: the link opened again still reaches page 3 and opens the folder', async () => {
    await open({ computers: [...others(ACCOUNT_PAGE * 2), BOREALIS] });
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
    expect(accountPages()).toEqual([1, 2, 3]);
    await remount();
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
  });
  it('a cached short page 2 that refetches full: page 3 is read and its twin is found; nothing is decided on the old page 2', async () => {
    const rows: Record<string, unknown>[] = [BOREALIS, ...others(ACCOUNT_PAGE + 10)];
    await open({ computers: rows });
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
    expect(accountPages()).toEqual([1, 2]);
    // The account grew: page 2 is now full, and page 3 holds a computer with the same handle.
    rows.push(...others(ACCOUNT_PAGE - 10, ACCOUNT_PAGE + 10), TWIN);
    await act(async () => { await queryClient.invalidateQueries({ refetchType: 'none' }); });
    sent = [];
    cleanup();
    const watch = watchFound();
    await remount();
    await screen.findByText(strings['folder.twin.title']);
    watch.stop();
    expect(accountPages()).toEqual(expect.arrayContaining([1, 2, 3]));
    // The found state never showed on the cached pages: never drawn, and no read went to any computer.
    expect(watch.seen.ever).toBe(false);
    expect(sent.filter((r) => r.target !== null)).toEqual([]);
  });
  it('a refetch paused offline is not settled: neither found nor missing until it answers online', async () => {
    await open({ computers: [BOREALIS, ...others(ACCOUNT_PAGE + 10)] });
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
    await act(async () => { await queryClient.invalidateQueries({ refetchType: 'none' }); });
    act(() => onlineManager.setOnline(false));
    cleanup();
    const watch = watchFound();
    await remount();
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(watch.seen.ever).toBe(false);
    expect(screen.queryByText(strings['folder.missing.title'])).toBeNull();
    watch.stop();
    act(() => onlineManager.setOnline(true));
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
  });
  it('a page whose refetch failed, its old full answer still cached, adds no page: only the error shows', async () => {
    let down = false;
    await open({ computers: [...others(ACCOUNT_PAGE * 2), BOREALIS], pageFails: (p) => p === 1 && down });
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
    await act(async () => { await queryClient.invalidateQueries({ refetchType: 'none' }); });
    down = true;
    sent = [];
    await remount();
    await screen.findByText(strings['folder.computers.failed']);
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(accountPages()).toEqual([1]);
  });
  it('page 2 failed while page 1 refetches slowly: Try again still works and reads only page 2 again', async () => {
    let down = true;
    let holding = false;
    let free1 = () => {};
    const hold1 = new Promise<void>((r) => { free1 = r; });
    await open({ computers: [...others(ACCOUNT_PAGE), BOREALIS], pageFails: (p) => p === 2 && down, pageHold: (p) => (p === 1 && holding ? hold1 : undefined) });
    await screen.findByText(strings['folder.computers.failed']);
    holding = true;
    // Page 1 refetches and is held; page 2 refetches and fails again.
    act(() => { void queryClient.invalidateQueries(); });
    await waitFor(() => expect(accountPages().filter((p) => p === 2)).toHaveLength(2));
    await screen.findByText(strings['folder.computers.failed']);
    const before = accountPages().length;
    down = false;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(accountPages().slice(before)).toEqual([2]));
    await act(async () => { free1(); await hold1; });
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
  });
});
