// Vitest: a chat's path link opens Files with `select=<name>` and
// `open=preview|here` (startHref: asel, aopen). Pane A acts on the ask once its folder answers: Preview of the named
// file, or Open with's Open terminal here for the folder, which the person still confirms. The ask then leaves the
// address with a replace, so a reload, Back or a shared copy never asks again; an ask it can't answer is dropped.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld } from '@core';
import { Toaster, closeToast, showToast } from '@kit';
import { render } from '@testing-library/react';
import page from './page';
import { byIdAsked, resetFiles } from './fixtures';
import strings from './strings.en.json';
import ts from './transfers/transfers.strings.en.json';

// atlas, the fixture world's running computer (handle atlas.00a1).
const ATLAS_ID = fixtureWorld.computers.find((c) => c.name === 'atlas')!.id;
// The kit's toasts draw in their own Toaster, which a page render does not mount.
const toasts = () => render(<Toaster />);
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const link = (path: string, q: Record<string, string>) => `/files?computer=atlas.00a1&path=${encodeURIComponent(path)}&${new URLSearchParams(q).toString()}`;
const table = async () => within(await screen.findByRole('region', { name: strings['pane.a'] })).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });

beforeAll(async () => {
  await import('./view');
}, 30000);
// Each test starts with no "can't tell which" toast up (the kit shows one per id and counts repeats), so a toast a test
// finds is its own.
beforeEach(() => {
  resetFiles();
  closeToast(showToast({ id: 'files-ask-which', title: '-' }));
  closeToast(showToast({ id: 'files-ask-hidden', title: '-' }));
});

describe("a chat path link's ask", () => {
  it('opens the named file in Preview once, then drops the ask from the address', async () => {
    const { router, unmount } = await renderPage(page, { path: link('/srv/app', { select: 'package.json', open: 'preview' }) });
    expect(await screen.findByRole('dialog', { name: /package\.json/ }, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('aopen'));
    expect(router.state.location.search).toMatchObject({ a: 'atlas.00a1', ap: '/srv/app', asel: 'package.json' });
    expect(router.history.length).toBe(1);
    // A reload of the address it left asks nothing.
    const after = router.state.location.href;
    unmount();
    await renderPage(page, { path: after });
    await within(await table()).findByRole('row', { name: /package\.json/ });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("asks Open with's Open terminal here for the folder, which still waits for the person", async () => {
    const { router } = await renderPage(page, { path: link('/srv/app', { open: 'here' }) });
    // Open with's own title for it names the folder ("Terminal in “app”"). Open with is its own chunk, loaded on first
    // use: under host load that alone can pass a few seconds.
    expect(await screen.findByRole('dialog', { name: /“app”/ }, { timeout: 30_000 })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('aopen'));
  });

  it('drops an ask it cannot answer without acting: a missing row, or a folder to preview', async () => {
    for (const [path, sel] of [['/srv/app', 'nope.txt'], ['/srv', 'app']] as const) {
      const { router, unmount } = await renderPage(page, { path: link(path, { select: sel, open: 'preview' }) });
      await table();
      await waitFor(() => expect(router.state.location.search).not.toHaveProperty('aopen'));
      expect(screen.queryByRole('dialog')).toBeNull();
      unmount();
    }
  });

  it('opens no terminal for a folder that did not list (refused, missing), and drops the ask', async () => {
    for (const path of ['/root', '/srv/nope']) {
      const { router, unmount } = await renderPage(page, { path: link(path, { open: 'here' }) });
      // The link has no aopen before startHref turns it into pane A's ask, so wait for that first, then for the ask to be
      // used up: it leaves only once the folder has answered.
      await waitFor(() => {
        expect(router.state.location.search).toMatchObject({ a: 'atlas.00a1', ap: path });
        expect(router.state.location.search).not.toHaveProperty('open');
        expect(router.state.location.search).not.toHaveProperty('aopen');
      }, { timeout: 5000 });
      expect(screen.queryByRole('dialog')).toBeNull();
      unmount();
    }
  });

  it('drops the ask of a pane that shows no folder: a computer not in the list, or a bad path', async () => {
    for (const path of ['/files?a=ghost.0000&aopen=here', '/files?a=atlas.00a1&ap=..%2Fx&aopen=here']) {
      const { router, unmount } = await renderPage(page, { path });
      await waitFor(() => expect(router.state.location.search).not.toHaveProperty('aopen'), { timeout: 5000 });
      expect(screen.queryByRole('dialog')).toBeNull();
      unmount();
    }
  });

  it("two panes' asks answered together are both dropped; neither puts the other's back", async () => {
    const { router } = await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&asel=package.json&aopen=preview&b=atlas.00a1&bp=%2Froot&bopen=here' });
    expect(await screen.findByRole('dialog', { name: /package\.json/ }, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.search).not.toHaveProperty('aopen');
      expect(router.state.location.search).not.toHaveProperty('bopen');
    });
    expect(router.state.location.search).toMatchObject({ a: 'atlas.00a1', b: 'atlas.00a1', bp: '/root' });
  });

  it('drops the ask when the page shows no panes: the computer list failed, or the realm has none', async () => {
    for (const state of ['listError', 'none']) {
      const { router, unmount } = await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&asel=package.json&aopen=preview', state });
      await waitFor(() => expect(router.state.location.search).not.toHaveProperty('aopen'), { timeout: 5000 });
      expect(screen.queryByRole('dialog')).toBeNull();
      unmount();
    }
  });

  it("acts only when Files' own list of computers is whole: a list read in parts drops the ask and says it can't tell which", async () => {
    toasts();
    const { router } = await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&asel=package.json&aopen=preview', state: 'pages' });
    await table();
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('aopen'), { timeout: 5000 });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText(strings['ask.whichComputer'])).toBeInTheDocument();
  });

  it("says it can't tell which computer when the link's computer is not in the list", async () => {
    toasts();
    const { router } = await renderPage(page, { path: '/files?a=ghost.0000&aopen=here' });
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('aopen'), { timeout: 5000 });
    expect(await screen.findByText(strings['ask.whichComputer'])).toBeInTheDocument();
  });

  it('a link naming its computer by id opens it where the list is past what Files reads (more than 100 computers)', async () => {
    const { router } = await renderPage(page, { path: `/files?computer=atlas.00a1&cid=${ATLAS_ID}&path=%2Fsrv%2Fapp&select=package.json&open=preview`, state: 'pagesCapped' });
    expect(await screen.findByRole('dialog', { name: /package\.json/ }, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('aopen'));
    expect(router.state.location.search).toMatchObject({ a: 'atlas.00a1', acid: ATLAS_ID });
    // atlas is past every page Files reads: only the read by id found it.
    expect(byIdAsked).toContain(ATLAS_ID);
  });

  it('a link by id in a realm read in parts acts without the whole list', async () => {
    await renderPage(page, { path: `/files?computer=atlas.00a1&cid=${ATLAS_ID}&path=%2Fsrv%2Fapp&select=package.json&open=preview`, state: 'pages' });
    expect(await screen.findByRole('dialog', { name: /package\.json/ }, { timeout: 8000 })).toBeInTheDocument();
  });

  it('a computer recreated with the same handle but another id is not the one the link meant: the ask drops, saying so', async () => {
    toasts();
    const other = 'f'.repeat(20) + '00a1';
    const { router } = await renderPage(page, { path: `/files?computer=atlas.00a1&cid=${other}&path=%2Fsrv%2Fapp&select=package.json&open=preview` });
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('aopen'), { timeout: 8000 });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText(strings['ask.whichComputer'])).toBeInTheDocument();
  });
  it('a pane id that is no id never lets the handle stand in: the folder browses, the ask drops, saying so', async () => {
    toasts();
    expect(screen.queryByText(strings['ask.whichComputer'])).toBeNull();
    const { router } = await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&asel=package.json&aopen=preview&acid=..%2Fx' });
    await table();
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('aopen'), { timeout: 5000 });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText(strings['ask.whichComputer'])).toBeInTheDocument();
  });

  it('a computer read by id earlier and deleted since is not opened from that old read: the ask waits for a fresh one, then drops', async () => {
    toasts();
    const to = `/files?computer=atlas.00a1&cid=${ATLAS_ID}&path=%2Fsrv%2Fapp&select=package.json&open=preview`;
    const { router, queryClient } = await renderPage(page, { path: to, state: 'pagesCappedGone' });
    expect(await screen.findByRole('dialog', { name: /package\.json/ }, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(strings['ask.whichComputer'])).toBeNull();
    // The same link again while the read by id is fetched afresh: the earlier answer is no proof.
    act(() => {
      void queryClient.invalidateQueries();
      router.history.push(to);
    });
    // The link first becomes pane A's ask (startHref), then the ask is consumed.
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('computer'));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('aopen'), { timeout: 8000 });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText(strings['ask.whichComputer'])).toBeInTheDocument();
    expect(byIdAsked.length).toBeGreaterThanOrEqual(2);
  });

  it('a fresh read by id still going holds the ask: the earlier answer does not act for it', async () => {
    const to = `/files?computer=atlas.00a1&cid=${ATLAS_ID}&path=%2Fsrv%2Fapp&select=package.json&open=preview`;
    const { router, queryClient } = await renderPage(page, { path: to, state: 'pagesCappedSlow' });
    expect(await screen.findByRole('dialog', { name: /package\.json/ }, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    act(() => {
      void queryClient.invalidateQueries();
      router.history.push(to);
    });
    await waitFor(() => expect(router.state.location.search).toMatchObject({ a: 'atlas.00a1', aopen: 'preview' }));
    await waitFor(() => expect(byIdAsked.length).toBeGreaterThanOrEqual(2));
    await act(async () => { await Promise.resolve(); });
    expect(router.state.location.search).toMatchObject({ aopen: 'preview' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('an ask for a pane under another tab drops unacted, says why, and never fires back on Browse', async () => {
    toasts();
    const { router } = await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&asel=package.json&aopen=preview&tab=storage' });
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('aopen'), { timeout: 5000 });
    expect(await screen.findByText(strings['ask.hidden'])).toBeInTheDocument();
    act(() => router.history.push('/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&asel=package.json'));
    await table();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('an ask for pane B in one-pane view drops unacted, says why, and never fires when pane B shows', async () => {
    toasts();
    const two = await renderPage(page, { path: '/files?panes=one&a=atlas.00a1&b=atlas.00a1&bp=%2Fsrv%2Fapp&bsel=package.json&bopen=preview' });
    await waitFor(() => expect(two.router.state.location.search).not.toHaveProperty('bopen'), { timeout: 5000 });
    expect(await screen.findByText(strings['ask.hidden'])).toBeInTheDocument();
    act(() => two.router.history.push('/files?panes=two&a=atlas.00a1&b=atlas.00a1&bp=%2Fsrv%2Fapp&bsel=package.json'));
    await within(await screen.findByRole('region', { name: strings['pane.b'] })).findByRole('table');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("a hidden pane's ask with an id that is no id says it can't tell which computer", async () => {
    toasts();
    const { router } = await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&asel=package.json&aopen=preview&acid=..%2Fx&tab=storage' });
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('aopen'), { timeout: 5000 });
    expect(await screen.findByText(strings['ask.whichComputer'])).toBeInTheDocument();
    expect(screen.queryByText(strings['ask.hidden'])).toBeNull();
  });

  it('a link with no id, to a handle two computers share, opens neither and acts on neither: the pane asks which one', async () => {
    toasts();
    for (const path of ['/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&asel=package.json&aopen=preview', '/files?computer=atlas.00a1&path=%2Fsrv%2Fapp&select=package.json&open=preview']) {
      const { router, unmount } = await renderPage(page, { path, state: 'twins' });
      const pane = await screen.findByRole('region', { name: strings['pane.a'] });
      expect(await within(pane).findByText(fill(strings['pick.twins'], { name: 'atlas' }), {}, { timeout: 8000 })).toBeInTheDocument();
      await waitFor(() => {
        expect(router.state.location.search).toMatchObject({ a: 'atlas.00a1', ap: '/srv/app' });
        expect(router.state.location.search).not.toHaveProperty('aopen');
      }, { timeout: 5000 });
      // No folder of either twin is listed, and nothing opened.
      expect(within(pane).queryByRole('table')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(await screen.findByText(strings['ask.whichComputer'])).toBeInTheDocument();
      unmount();
      closeToast(showToast({ id: 'files-ask-which', title: '-' }));
    }
  });

  it('picking one of two computers that share a handle names it by id, and the pane opens that one', async () => {
    const TWIN = 'f' + ATLAS_ID.slice(1);
    const { router } = await renderPage(page, { path: '/files?a=atlas.00a1', state: 'twins' });
    const pane = await screen.findByRole('region', { name: strings['pane.a'] });
    await within(pane).findByText(fill(strings['pick.twins'], { name: 'atlas' }), {}, { timeout: 8000 });
    const label = fill(strings['pick.label'], { pane: strings['pane.a'] });
    await userEvent.click(within(pane).getByRole('button', { name: `${strings['pick.placeholder']} ${label}` }));
    const list = await screen.findByRole('dialog', { name: label });
    const twins = within(list).getAllByText('atlas');
    expect(twins).toHaveLength(2);
    await userEvent.click(twins[1]!);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ a: 'atlas.00a1', acid: TWIN }));
    await table();
    expect(within(pane).queryByText(fill(strings['pick.twins'], { name: 'atlas' }))).toBeNull();
  });

  it('the Storage tab of a handle two computers share shows neither computer', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=storage', state: 'twins' });
    expect(await screen.findByText(ts['storage.pick.title'], {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('a pane whose computer is still being read by id says so, never that it is missing', async () => {
    await renderPage(page, { path: `/files?computer=atlas.00a1&cid=${ATLAS_ID}&path=%2Fsrv%2Fapp&select=package.json&open=preview`, state: 'pagesCappedHeld' });
    const pane = await screen.findByRole('region', { name: strings['pane.a'] });
    expect(await within(pane).findByText(strings['pick.readingId'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(byIdAsked).toContain(ATLAS_ID);
    expect(within(pane).queryByText(strings['pick.unknown'])).toBeNull();
    expect(within(pane).queryByText(strings['pick.gone'])).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
