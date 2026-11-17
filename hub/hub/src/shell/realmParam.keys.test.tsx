// The Keys share link with the real shell mounted, on fixture core.
// The shell switches on ?open_realm= and drops it before the page mounts; the page judges what is left:
// - a new link opens the drawer for the realm the shell switched to;
// - open_realm and realm naming different realms contradict each other: the shell still switches to open_realm, and
//   nothing opens, whether the page mounts after a switch or at once (the realm already shown) on a slow page read;
//   the shell drops share with open_realm, so nothing opens either
//   when the realm menu switches again before the page loads (the page's loader held back here); realm= stays;
// - an old link (?share=1&realm=<id>) never switches the shell, and opens only for the realm the shell shows.
import { bootFixtureCore, capture, queryClient } from '@core';
import { switchRealm } from '@core/shell';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fixtureStore, LATENCY_MS, type Latency, loadCoreRules } from '../app/fixtures';
import { buildRouter } from '../app/router';
import keysPage from '../pages/keys/page';
import { REALM_A, REALM_B } from '../pages/keys/fixtures';
import { links } from '../pages/keys/links';
import keysStrings from '../pages/keys/strings.en.json';

async function mount(path: string, realm: string, latency: Latency = 'instant', page = keysPage) {
  fixtureStore.set({ state: 'shared', latency });
  const rules = await loadCoreRules(['keys'], 'shared');
  bootFixtureCore({ rules, realm }).setExtraDelay(LATENCY_MS[latency]);
  queryClient.clear();
  const router = buildRouter([page], { queryClient, shell: true, history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  return router;
}
// The page's chunk loaded once before the first test: on a loaded host its first import alone can outlast a find's wait,
// and these tests are about the link, not about how long the module takes to compile.
beforeAll(() => keysPage.load(), 60_000);
const search = (r: Awaited<ReturnType<typeof mount>>) => r.state.location.search as Record<string, string>;
const drawer = () => screen.findByRole('dialog', {}, { timeout: 8000 });
// The page has read the link once the share key has left the address.
const linkRead = (r: Awaited<ReturnType<typeof mount>>) => waitFor(() => expect(search(r)).not.toHaveProperty('share'), { timeout: 8000 });

afterEach(async () => {
  cleanup();
  document.body.innerHTML = '';
  await switchRealm('all');
});

describe('the Keys share link with the shell', () => {
  it('a new link from All realms: the shell switches, and the drawer opens for that realm', async () => {
    const r = await mount(links.shareRealm(REALM_B), 'all');
    const d = await drawer();
    expect(capture().realm).toBe(REALM_B);
    expect(within(d).getByRole('heading', { name: /Acme client/ })).toBeInTheDocument();
    await linkRead(r);
    expect(search(r)).not.toHaveProperty('open_realm');
  });

  it('open_realm and realm naming different realms, after a switch: the shell shows open_realm, nothing opens', async () => {
    const r = await mount(`${links.shareRealm(REALM_A)}&realm=${REALM_B}`, 'all');
    await linkRead(r);
    expect(capture().realm).toBe(REALM_A);
    // The shell takes out its own param (and the contradicting share) once the address is committed; the Keys page may
    // read the link first and take its own realm= with it, and the shell puts nothing back.
    expect(search(r)).not.toHaveProperty('open_realm');
    expect(search(r)).not.toHaveProperty('share');
    expect([{}, { realm: REALM_B }]).toContainEqual(search(r));
    await screen.findByRole('button', { name: keysStrings['action.share'] }, { timeout: 8000 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('open_realm and realm naming different realms, open_realm already shown, slow page read: nothing opens', async () => {
    const r = await mount(`${links.shareRealm(REALM_A)}&realm=${REALM_B}`, REALM_A, 'normal');
    await linkRead(r);
    expect(capture().realm).toBe(REALM_A);
    // The shell takes out only its own param (and the contradicting share), from the address as it is then: when the
    // Keys page read the link first, its own realm= left with it and the shell puts nothing back.
    expect(search(r)).not.toHaveProperty('open_realm');
    expect(search(r)).not.toHaveProperty('share');
    expect([{}, { realm: REALM_B }]).toContainEqual(search(r));
    await screen.findByRole('button', { name: keysStrings['action.share'] }, { timeout: 8000 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('open_realm and realm naming the same realm: the shell switches, and the drawer opens for it', async () => {
    const r = await mount(`${links.shareRealm(REALM_B)}&realm=${REALM_B}`, 'all');
    const d = await drawer();
    expect(capture().realm).toBe(REALM_B);
    expect(within(d).getByRole('heading', { name: /Acme client/ })).toBeInTheDocument();
    await linkRead(r);
    expect(search(r)).toEqual({});
  });

  it('an old link naming another realm: no switch, nothing opens', async () => {
    const r = await mount(`${links.shared}?share=1&realm=${REALM_B}`, REALM_A);
    await linkRead(r);
    expect(capture().realm).toBe(REALM_A);
    expect(search(r)).toEqual({});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('an old link naming the realm shown opens the drawer for it', async () => {
    await mount(`${links.shared}?share=1&realm=${REALM_A}`, REALM_A);
    const d = await drawer();
    expect(within(d).getByRole('heading', { name: /Personal/ })).toBeInTheDocument();
    expect(capture().realm).toBe(REALM_A);
  });
});

describe('a Keys link read late: the page loader held back until the realm menu has switched again', () => {
  function held() {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const page = { ...keysPage, load: () => gate.then(() => keysPage.load()) } as typeof keysPage;
    return { page, release: () => act(async () => release()) };
  }

  it('control: a new link read late still opens the drawer for the realm the shell switched to', async () => {
    const h = held();
    const r = await mount(links.shareRealm(REALM_B), 'all', 'instant', h.page);
    await waitFor(() => expect(capture().realm).toBe(REALM_B), { timeout: 8000 });
    await waitFor(() => expect(search(r)).toEqual({ share: '1' }));
    await h.release();
    const d = await drawer();
    expect(within(d).getByRole('heading', { name: /Acme client/ })).toBeInTheDocument();
  });

  it.each([
    ['the realm the old key names', () => REALM_B],
    ['All realms', () => 'all'],
  ])('open_realm and realm naming different realms, then the menu picks %s before the page loads: nothing opens', async (_l, to) => {
    const h = held();
    const r = await mount(`${links.shareRealm(REALM_A)}&realm=${REALM_B}`, 'all', 'instant', h.page);
    await waitFor(() => expect(capture().realm).toBe(REALM_A), { timeout: 8000 });
    await waitFor(() => expect(search(r)).toEqual({ realm: REALM_B }));
    await act(async () => {
      await switchRealm(to());
    });
    await h.release();
    await screen.findByRole('button', { name: keysStrings['action.share'] }, { timeout: 8000 });
    await act(async () => {});
    expect(capture().realm).toBe(to());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
