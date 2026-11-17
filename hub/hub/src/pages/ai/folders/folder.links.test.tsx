// Three folder-link cases. (1) A full first page never proves a match:
// the next page is read first.
// (2) A chat search, then a tab switch, then Chats, then a reload keeps the folder and the other search parameters.
// (3) The root folder survives consecutive search edits and a reload. The key is base64url(UTF-8 path).
import { bootFixtureCore, chooseComputer, computerHandle, fixtureWorld, queryClient } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the page, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the page, not page code
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { chatRules } from '../parts/fixtures.chats';
import FolderPage from './FolderPage';
import { ACCOUNT_PAGE, accountComputersOf, computerOf } from './folder';
import { folderRules, repoRules, type FolderOpts } from './fixtures';
import strings from './strings.en.json';

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const borealis = fixtureWorld.computers.find((c) => c.name === 'borealis')!;
const ACME = borealis.realm_ids[0]!;
const HANDLE = computerHandle(borealis);
const SHOP = '/home/ada/projects/shop';
/** base64url of the UTF-8 path, no padding: the folder key (written out here so the repro does not lean on the code). */
const b64 = (p: string) => btoa(String.fromCharCode(...new TextEncoder().encode(p))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

function harness(href: string) {
  const root = createRootRoute({ component: Outlet });
  const tab = createRoute({ getParentRoute: () => root, path: '/ai/$', component: FolderPage });
  return createRouter({ routeTree: root.addChildren([tab]), history: createMemoryHistory({ initialEntries: [href] }) });
}
async function open(href: string, o: FolderOpts = {}) {
  bootFixtureCore({ rules: [...folderRules(o), ...chatRules(), ...repoRules()] });
  act(() => chooseComputer(atlas));
  const router = harness(href);
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  return router;
}
/** A reload: the same href in a fresh router (the page's state gone). */
async function reload(href: string) {
  cleanup();
  queryClient.clear();
  return open(href);
}
/** A search that arrives as a link's ?q= (useDataView adopts it, then strips it with navigate to '.', so the router
 *  rebuilds the path, which cases 2 and 3 exercise). The typed text never stays in the URL. */
async function search(router: ReturnType<typeof harness>, q: string) {
  await act(async () => { await router.navigate({ to: '.', search: (p: Record<string, string>) => ({ ...p, q }) } as never); });
}
afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('case 1: a full first page', () => {
  it('one match on a full page is unchecked, never found (a computer on a later page may share the handle)', () => {
    const page = Array.from({ length: ACCOUNT_PAGE - 1 }, (_, i) => ({ id: `c${String(i).padStart(23, '0')}`, name: `pc${i}` }));
    const rows = accountComputersOf({ data: { computers: [{ id: borealis.id, name: 'borealis' }, ...page] } });
    expect(rows.full).toBe(true);
    expect(computerOf([rows], HANDLE)).toEqual({ kind: 'unchecked' });
  });
  it('the page reads the next page before it opens the folder on the one it found', async () => {
    const many = [{ id: borealis.id, name: 'borealis', project_id: borealis.project_id }, ...Array.from({ length: ACCOUNT_PAGE - 1 }, (_, i) => ({ id: `c${String(i).padStart(23, '0')}`, name: `pc${i}` }))];
    const pages: string[] = [];
    await open(`/ai/f/${b64(SHOP)}?computer=${HANDLE}&realm=${ACME}`, { computers: many, onSend: (r) => { if (r.path === '/computers') pages.push(String(r.query.page)); } });
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
    expect(pages).toEqual(['1', '2']);
  });
});

describe('case 2: search, tab switch, Chats, reload', () => {
  it('keeps the folder, the computer and the realm through all of it; the search stays in the box, never in the URL', async () => {
    const router = await open(`/ai/f/${b64(SHOP)}?computer=${HANDLE}&realm=${ACME}`);
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
    await search(router, 'deploy');
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue('deploy'));
    await userEvent.click(screen.getByRole('tab', { name: strings['folder.tab.repository'] }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'repository' }));
    expect(screen.queryByText(strings['folder.incomplete.title'])).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: strings['folder.tab.chats'] }));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('tab'));
    const href = router.state.location.href;
    expect(router.state.location.pathname).toBe(`/ai/f/${b64(SHOP)}`);
    expect(router.state.location.search).toEqual({ computer: HANDLE, realm: ACME });
    expect(screen.getByRole('searchbox')).toHaveValue('deploy');
    await reload(href);
    expect(await screen.findByRole('tablist', { name: strings['folder.tabs'] })).toBeTruthy();
    await screen.findByText(fill(strings['folder.line'], { path: SHOP, computer: 'borealis' }));
  });
});

describe('case 3: the root folder', () => {
  it('survives two search edits and a reload', async () => {
    const router = await open(`/ai/f/${b64('/')}?computer=${HANDLE}&realm=${ACME}`);
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
    await search(router, 'a');
    await search(router, 'ab');
    expect(router.state.location.pathname).toBe(`/ai/f/${b64('/')}`);
    expect(await screen.findByRole('heading', { level: 1, name: '/' })).toBeTruthy();
    expect(screen.queryByText(strings['folder.incomplete.title'])).toBeNull();
    await reload(router.state.location.href);
    expect(await screen.findByRole('heading', { level: 1, name: '/' })).toBeTruthy();
    await screen.findByRole('tablist', { name: strings['folder.tabs'] });
  });
});
