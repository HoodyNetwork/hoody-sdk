// Vitest: a Bot's computer is one step away from its row and its page: Open computer (this computer on Computers) and
// Logs (the computer's Bot logs) through the shell's page links: a Hub link inside the Hub, and nothing at all when this
// Hub hides that page (there is no classic page to fall back to).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Kit from '@kit';
import type { PageLink } from '@kit';
import { links as computersLinks } from '../computers/links';
import { logsLinkFor } from '../logs/links';
import page from './page';
import strings from './strings.en.json';

const links = vi.hoisted(() => ({ computers: undefined as PageLink | null | undefined, logs: undefined as PageLink | null | undefined }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  return {
    ...kit,
    usePageLink: (id: string) => {
      const mocked = id === 'computers' ? links.computers : id === 'logs' ? links.logs : undefined;
      return mocked !== undefined ? mocked : kit.usePageLink(id);
    },
  };
});

const HANDLE = 'atlas.tlas';
const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

async function openRowMenu() {
  const table = await screen.findByRole('table');
  const row = await within(table).findByRole('row', { name: /Chief/ });
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
}

afterEach(() => {
  links.computers = undefined;
  links.logs = undefined;
  vi.restoreAllMocks();
});

describe('bots: row menu Open computer and Logs', () => {
  it('Hub links open this Bot\'s computer on Computers and its Bot logs', async () => {
    links.computers = { kind: 'hub', href: '/computers' };
    links.logs = { kind: 'hub', href: '/logs' };
    const { router } = await renderPage(page);
    await openRowMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['row.openComputer'] }));
    const want = new URL(computersLinks.item(HANDLE), 'http://x');
    await waitFor(() => expect(router.state.location.pathname).toBe(want.pathname));
    expect(router.state.location.href).toBe(want.pathname + want.search);
    act(() => router.history.push('/bots'));
    await openRowMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['row.logs'] }));
    const logs = new URL(logsLinkFor({ computer: HANDLE, source: 'bots' }), 'http://x');
    await waitFor(() => expect(router.state.location.pathname).toBe(logs.pathname));
    expect(router.state.location.href).toBe(logs.pathname + logs.search);
  });

  it('a Hub that hides the pages drops both entries and keeps the rest', async () => {
    links.computers = null;
    links.logs = null;
    await renderPage(page);
    await openRowMenu();
    // Settings is always in ⋯ (Copy link is a hover icon at a fine pointer, so not listed again).
    await screen.findByRole('menuitem', { name: strings['bot.settings'] });
    expect(screen.queryByRole('menuitem', { name: strings['row.openComputer'] })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: strings['row.logs'] })).toBeNull();
  });

  it('a Hub that hides only Logs keeps Open computer', async () => {
    links.computers = { kind: 'hub', href: '/computers' };
    links.logs = null;
    await renderPage(page);
    await openRowMenu();
    await screen.findByRole('menuitem', { name: strings['row.openComputer'] });
    expect(screen.queryByRole('menuitem', { name: strings['row.logs'] })).toBeNull();
  });
});

describe('bots: the Bot pane menu has Logs', () => {
  it('opens the computer\'s Bot logs, and is absent where Logs is hidden', async () => {
    links.logs = { kind: 'hub', href: '/logs' };
    const { router } = await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['row.logs'] }));
    const logs = new URL(logsLinkFor({ computer: HANDLE, source: 'bots' }), 'http://x');
    await waitFor(() => expect(router.state.location.pathname).toBe(logs.pathname));
  });

  it('is absent where this Hub hides Logs', async () => {
    links.logs = null;
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await screen.findByRole('menuitem', { name: strings['conv.reset'] });
    expect(screen.queryByRole('menuitem', { name: strings['row.logs'] })).toBeNull();
  });
});
