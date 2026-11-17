// Vitest: the Bot pane names the server its computer runs on (server names are public),
// linked to the Servers list on Computers; where this Hub hides Computers it is a plain label.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import type * as Kit from '@kit';
import type { PageLink } from '@kit';
import { links as computersLinks } from '../computers/links';
import page from './page';

const links = vi.hoisted(() => ({ computers: undefined as PageLink | null | undefined }));
const pick = (id: string, orig: (id: string) => PageLink | null) => (id === 'computers' && links.computers !== undefined ? links.computers : orig(id));
// The page asks through the kit barrel; the kit's PageLinkTo (the server chip) asks the shell itself, so both are mocked.
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  return { ...kit, usePageLink: (id: string) => pick(id, kit.usePageLink) };
});
vi.mock('../../shell/pageLinks', async (orig) => {
  const shell = await orig<{ usePageLink: (id: string) => PageLink | null }>();
  return { ...shell, usePageLink: (id: string) => pick(id, shell.usePageLink) };
});

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const serverTag = async () => (await screen.findAllByText(/n12 Singapore/)).find((e) => e.textContent?.trim() === 'n12 Singapore');
// The server sits behind the header meta's "+N", with the realm and where the Bot lives.
const openMore = async () => userEvent.click(await screen.findByRole('button', { name: /^\+\d+ more: n12 Singapore/ }));

afterEach(() => {
  links.computers = undefined;
  vi.restoreAllMocks();
});

describe('bots: the Bot pane shows its server', () => {
  it('names the server, linked to the Servers list', async () => {
    links.computers = { kind: 'hub', href: '/computers' };
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    await openMore();
    const a = (await screen.findAllByRole('link')).find((l) => l.textContent?.includes('n12 Singapore'));
    expect(a?.getAttribute('href')).toMatch(new RegExp(`${computersLinks.servers}$`));
  });

  it('is a plain label where this Hub hides Computers', async () => {
    links.computers = null;
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    await openMore();
    const tag = await serverTag();
    expect(tag).toBeTruthy();
    expect(tag?.closest('a')).toBeNull();
  });
});
