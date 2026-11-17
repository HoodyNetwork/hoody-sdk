// Vitest: the Bots page's computer names go through the kit's ComputerLink and PageLinkTo (the page keeps no
// ComputerLink of its own). The name in the list's Computer column is the link and its flag is not; the
// sentence "This Bot runs on <name>" names its computer as a link (it was plain text); the header chip and the server chip still
// go where they went. A load that hides Computers keeps every one of them as text. ("N more stopped computers" needs six
// stopped computers; the fixture world has three, so it is read in the source, a PageLinkTo to the list.)
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, renderPage as renderPageRaw, screen, userEvent, within } from '@app/testing';
import { computerHandle, computerHref, localSetting } from '@core';
import type * as Kit from '@kit';
import type { PageLink } from '@kit';
import { links as computerLinks } from '../computers/links';
import page from './page';
import strings from './strings.en.json';

const link = vi.hoisted(() => ({ current: undefined as PageLink | null | undefined }));
const pick = (id: string, orig: (id: string) => PageLink | null) => (id === 'computers' && link.current !== undefined ? link.current : orig(id));
// A load that does not serve Computers answers null. The page asks through the kit barrel; the kit parts (PageLinkTo,
// ComputerLink) ask the shell itself, so both are mocked.
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  return { ...kit, usePageLink: (id: string) => pick(id, kit.usePageLink) };
});
vi.mock('../../shell/pageLinks', async (orig) => {
  const shell = await orig<{ usePageLink: (id: string) => PageLink | null }>();
  return { ...shell, usePageLink: (id: string) => pick(id, shell.usePageLink) };
});

// These tests read the dense table: the page opens on cards, so each render picks List (the remembered choice; a
// render starts with clean storage, so it is set once the page is up).
const present = () => localSetting('hub.v3.table.present.bots');
const renderPage = async (...a: Parameters<typeof renderPageRaw>) => {
  const r = await renderPageRaw(...a);
  await act(async () => void present().set('list'));
  return r;
};
afterEach(() => void present().set(null));
beforeAll(async () => {
  await import('./view');
}, 30000);

afterEach(() => {
  link.current = undefined;
});

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const ATLAS = computerHref(computerHandle({ id: 'c-atlas', name: 'atlas' }));
const hrefOf = (el: HTMLElement) => el.getAttribute('href') ?? '';
const header = async () => (await screen.findByRole('heading', { level: 2, name: 'Chief' })).closest('header') as HTMLElement;
const hosting = async (h: HTMLElement) => {
  await userEvent.click(within(h).getByRole('button', { name: /^\+2 more:/ }));
  return screen.findByRole('dialog', { name: strings['bot.hostingTitle'] });
};

// The list draws its Computer column only while every Bot is on one computer (oneComputer); across computers it groups by them.
describe('the list: the computer cell', () => {
  it('the name is a link to that computer by its handle; the flag sits beside it, outside the link', async () => {
    await renderPage(page, { state: 'oneComputer', path: '/bots' });
    const a = (await screen.findAllByRole('link', { name: 'atlas' }))[0]!;
    expect(hrefOf(a)).toMatch(new RegExp(`${ATLAS.replace(/[?.]/g, '\\$&')}$`));
    // The link's text is the name alone; the cell still shows the flag before it.
    expect(a.textContent).toBe('atlas');
    const cell = a.closest('td, [role="cell"]') as HTMLElement;
    expect(cell.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(a.contains(cell.querySelector('[aria-hidden="true"]'))).toBe(false);
    // The link sits beside the flag, in no wrapper of its own: it cuts its own name (kit cut), so nothing clips its ring.
    expect(a.parentElement?.querySelector(':scope > [aria-hidden="true"]')).not.toBeNull();
  });

  it('a load that hides Computers shows the name as text', async () => {
    link.current = null;
    await renderPage(page, { state: 'oneComputer', path: '/bots' });
    await screen.findAllByRole('row');
    expect(await screen.findAllByText('atlas')).not.toHaveLength(0);
    expect(screen.queryByRole('link', { name: 'atlas' })).toBeNull();
  });
});

describe('the Bot header', () => {
  it('"This Bot runs on <name>" is one sentence with the name as text: the computer chip beside it is the link', async () => {
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    const pop = await hosting(await header());
    const line = within(pop).getByText((_, el) => el?.tagName === 'P' && /^This Bot runs on atlas\./.test(el.textContent ?? ''));
    // A link inside the sentence split it into columns in the terminal ("This Bot / at… / It starts").
    expect(within(line).queryByRole('link')).toBeNull();
    expect(line.textContent).toBe(strings['bot.hostingBody'].replace('{{computer}}', 'atlas'));
  });

  it('the computer chip goes to the computer and the server chip to Servers', async () => {
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    const h = await header();
    const chip = within(h).getByText(/atlas/).closest('a') as HTMLElement;
    expect(hrefOf(chip)).toMatch(new RegExp(`${ATLAS.replace(/[?.]/g, '\\$&')}$`));
    const pop = await hosting(h);
    const server = within(pop).getByText(/n12 Singapore/).closest('a') as HTMLElement;
    expect(hrefOf(server)).toMatch(new RegExp(`${computerLinks.servers}$`));
  });

  it('a load that hides Computers keeps the sentence, the computer chip and the server chip as text', async () => {
    link.current = null;
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    const h = await header();
    expect(within(h).getByText(/atlas/).closest('a')).toBeNull();
    const pop = await hosting(h);
    // The realm chip stays a link (it goes to this page's own list); the computer and the server do not.
    expect(within(pop).queryByRole('link', { name: 'atlas' })).toBeNull();
    expect(within(pop).getByText(/n12 Singapore/).closest('a')).toBeNull();
    expect(within(pop).getByText(/n12 Singapore/)).toBeInTheDocument();
    expect(within(pop).getByText((_, el) => el?.tagName === 'P' && el.textContent === strings['bot.hostingBody'].replace('{{computer}}', 'atlas'))).toBeInTheDocument();
  });
});
