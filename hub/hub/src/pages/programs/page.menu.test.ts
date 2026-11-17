// The row menu carries Copy id and Open computer: Copy id copies the program's id, Open
// computer goes through the shell's Computers page link (a Hub link this computer there, a hidden one no entry;
// there is no classic page).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld } from '@core';
import type * as Kit from '@kit';
import type { PageLink } from '@kit';
import { links as computersLinks } from '../computers/links';
import page from './page';
import strings from './strings.en.json';

const link = vi.hoisted(() => ({ current: undefined as PageLink | null | undefined }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  return {
    ...kit,
    usePageLink: (id: string) => (id === 'computers' && link.current !== undefined ? link.current : kit.usePageLink(id)),
  };
});

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas');

async function openRowMenu() {
  await screen.findAllByRole('button', { name: 'Restart web' });
  const row = screen.getAllByText('web').map((el) => el.closest('tr')).find((tr): tr is HTMLTableRowElement => !!tr);
  if (!row) throw new Error('no row');
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
}

describe('programs: row menu Copy id and Open computer', () => {
  afterEach(() => {
    link.current = undefined;
    vi.restoreAllMocks();
  });

  it("Copy id copies the program's id", async () => {
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    await renderPage(page, { path: '/programs' });
    await openRowMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.copyId'] }));
    await waitFor(() => expect(write).toHaveBeenCalledWith('1'));
  });

  it('a Hub link opens this computer on Computers', async () => {
    if (!atlas) throw new Error('no atlas');
    link.current = { kind: 'hub', href: '/computers' };
    const { router } = await renderPage(page, { path: '/programs' });
    await openRowMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.openComputer'] }));
    const want = new URL(computersLinks.item(`atlas.${atlas.id.slice(-4)}`), 'http://x');
    await waitFor(() => expect(router.state.location.pathname).toBe(want.pathname));
    expect(router.state.location.href).toBe(want.pathname + want.search);
  });

  it('a hidden Computers page drops Open computer, and Copy id stays', async () => {
    link.current = null;
    await renderPage(page, { path: '/programs' });
    await openRowMenu();
    await screen.findByRole('menuitem', { name: strings['action.copyId'] });
    expect(screen.queryByRole('menuitem', { name: strings['action.openComputer'] })).toBeNull();
  });
});
