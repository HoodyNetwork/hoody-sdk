// Logs goes through the shell's page link and the Logs page's own logsLinkFor: a Hub link
// opens that program's output on this computer, a hidden one drops Logs (there is no classic page).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld } from '@core';
import type * as Kit from '@kit';
import type { PageLink } from '@kit';
import kitStrings from '@kit/strings.en.json';
import { logsLinkFor } from '../logs/links';
import type * as Data from './data';
import page from './page';

const link = vi.hoisted(() => ({ current: undefined as PageLink | null | undefined }));
// A computer whose name has not come yet: no handle, so no Logs link with a bare '.abcd'.
const unnamed = vi.hoisted(() => ({ on: false }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  return { ...real, useComputer: () => (unnamed.on ? { data: { name: '', handle: '', running: true } } : real.useComputer()) };
});
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  return {
    ...kit,
    usePageLink: (id: string) => (id === 'logs' && link.current !== undefined ? link.current : kit.usePageLink(id)),
  };
});

/** The inspector's Logs, an item of its header's ⋯ menu (the list row shows a Logs button too). */
const inspectorLogs = async () => {
  await userEvent.click(await within(await screen.findByRole('region', { name: kitStrings['listDetail.detail'] })).findByRole('button', { name: 'More actions' }));
  return within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Logs of web' });
};
/** No Logs anywhere: no button, and the inspector header's ⋯ menu (web is a program the person added, so the menu
 *  still holds Edit and Remove) has no Logs item. */
const expectNoLogs = async () => {
  expect(screen.queryByRole('button', { name: 'Logs of web' })).toBeNull();
  await userEvent.click(within(screen.getByRole('region', { name: kitStrings['listDetail.detail'] })).getByRole('button', { name: 'More actions' }));
  const menu = await screen.findByRole('menu');
  expect(within(menu).queryByRole('menuitem', { name: 'Logs of web' })).toBeNull();
  expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Edit web…', 'Remove web…']);
};

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas');

describe('programs: Logs through the Logs page link', () => {
  afterEach(() => {
    link.current = undefined;
    unnamed.on = false;
    vi.restoreAllMocks();
  });

  it("a Hub link opens the program's output on this computer (logsLinkFor, the Logs link contract)", async () => {
    if (!atlas) throw new Error('no atlas');
    link.current = { kind: 'hub', href: '/logs' };
    const { router } = await renderPage(page, { path: '/programs?sel=prog%3A1' });
    await userEvent.click(await inspectorLogs());
    const want = new URL(logsLinkFor({ computer: `atlas.${atlas.id.slice(-4)}`, program: '1' }), 'http://x');
    await waitFor(() => expect(router.state.location.pathname).toBe(want.pathname));
    expect(router.state.location.href).toBe(want.pathname + want.search);
  });

  it('a hidden Logs page drops every Logs control', async () => {
    link.current = null;
    await renderPage(page, { path: '/programs?sel=prog%3A1' });
    await screen.findAllByRole('button', { name: 'Restart web' });
    await expectNoLogs();
  });

  it('a computer without a name yet has no Logs control, even on a Hub link', async () => {
    link.current = { kind: 'hub', href: '/logs' };
    unnamed.on = true;
    await renderPage(page, { path: '/programs?sel=prog%3A1' });
    await screen.findAllByRole('button', { name: 'Restart web' });
    await expectNoLogs();
  });
});
