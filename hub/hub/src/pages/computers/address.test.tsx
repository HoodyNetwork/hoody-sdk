// Computers shows port and alias addresses through the kit's AddressField, the same one Programs
// uses: masked on screen, Copy taking the whole address as before, plus Open in a new tab and a QR code. The alias
// drawer and the Connect links mask with the same core rule.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld } from '@core';
import page from './page';
import strings from './strings.en.json';

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas');
const address = (port: number) => `https://${atlas?.project_id}-${atlas?.id}-http-${port}.${atlas?.server_name}.fixture.invalid`;
const masked = (id: string) => `${id.slice(0, 4)}…${id.slice(-4)}`;
const ALIAS = 'https://shop.example.test';

// A program row names its program in the list; its address button says only the scheme and bullets.
const terminalAddress = () => within(screen.getByText(strings['program.terminal']).closest('li') as HTMLElement).getByRole('button', { name: /^https:\/\/••••/ });

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (written.push(s), Promise.resolve()) } });
});
afterEach(() => vi.restoreAllMocks());

describe('computers: addresses through the shared AddressField', () => {
  it('Advanced: web ports and aliases show masked; Copy copies the whole address; Open and QR are there', async () => {
    if (!atlas) throw new Error('no atlas');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=advanced' });
    await waitFor(() => expect(screen.getAllByRole('button', { name: `Copy ${strings['ports.col.address']}` })).toHaveLength(3), { timeout: 8000 });
    const text = document.body.textContent ?? '';
    expect(text).not.toContain(atlas.id);
    expect(text).not.toContain(atlas.project_id);
    // A program address shows only its scheme and bullets (it grants access); an alias on the user's own domain shows whole.
    expect(text).not.toContain(masked(atlas.id));
    expect(screen.getAllByRole('button', { name: /^https:\/\/••••/ }).length).toBeGreaterThanOrEqual(2);
    expect(text).toContain('shop.example.test');
    for (const b of screen.getAllByRole('button', { name: `Copy ${strings['ports.col.address']}` })) await userEvent.click(b);
    await waitFor(() => expect(written).toEqual([address(3000), address(8080), ALIAS]));
    const opens = screen.getAllByRole('button', { name: `Open ${strings['ports.col.address']} in a new tab` });
    expect(opens).toHaveLength(3);
    await userEvent.click(opens[2] as HTMLElement);
    expect(open).toHaveBeenCalledWith(ALIAS, '_blank', 'noopener');
    expect(screen.getAllByRole('button', { name: 'QR code' }).length).toBeGreaterThanOrEqual(3);
  });

  it('the alias drawer names the current address masked, ids as first and last four', async () => {
    if (!atlas) throw new Error('no atlas');
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=advanced' });
    const table = await screen.findByRole('table', { name: strings['ports.title'] }, { timeout: 8000 });
    // The 3000 row's own button: the section's "Create alias" (no port chosen) comes first on the page.
    const row = (await within(table).findByText('3000', { selector: 'td, td *' })).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: strings['alias.make'] }));
    const dlg = await screen.findByRole('dialog');
    // The plate's sentence, and the address itself as its code value (masked; Copy takes it whole).
    expect(within(dlg).getByText(strings['aliasd.current'])).toBeInTheDocument();
    const now = `${masked(atlas.project_id)}-${masked(atlas.id)}-http-3000.${atlas.server_name}.fixture.invalid`;
    expect(within(dlg).getByText(now)).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: strings['aliasd.copy'] })).toBeInTheDocument();
    expect(dlg.textContent).not.toContain(atlas.id);
    // Close it and let the kit's focus-return checks (up to 800 ms after close) run while the page is still mounted:
    // left open, they fire after cleanup and, when this file ends first, after the DOM is gone.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await act(() => new Promise((r) => setTimeout(r, 900)));
  });

  it('Connect: program links still show masked and copy whole', async () => {
    if (!atlas) throw new Error('no atlas');
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=connect' });
    await screen.findByRole('heading', { name: strings['connect.links'] }, { timeout: 8000 });
    expect(document.body.textContent ?? '').not.toContain(atlas.id);
    // The programs with a page show only scheme and bullets; the ones used from code (no page to open) show
    // the masked text form, as a stopped computer's rows do.
    expect(document.querySelector('section#connect-links')?.textContent ?? '').not.toContain(masked(atlas.id));
    expect(terminalAddress()).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: `Copy ${strings['program.terminal']}` }));
    await waitFor(() => expect(written).toEqual([`https://${atlas.project_id}-${atlas.id}-terminal-1.${atlas.server_name}.fixture.invalid`]));
  });

  it('Connect: a click on a running computer\'s program address opens it in a new tab, with no href in the page', async () => {
    if (!atlas) throw new Error('no atlas');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=connect' });
    await screen.findByRole('heading', { name: strings['connect.links'] }, { timeout: 8000 });
    await userEvent.click(terminalAddress());
    expect(open).toHaveBeenLastCalledWith(`https://${atlas.project_id}-${atlas.id}-terminal-1.${atlas.server_name}.fixture.invalid`, '_blank', 'noopener');
    expect(document.querySelector('a[href*="terminal-1"]')).toBeNull();
  });

  it('Advanced: an alias address is an ordinary new-tab link (it is the user\'s own domain, not a secret)', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=advanced' });
    const a = (await screen.findByText(ALIAS, {}, { timeout: 8000 })).closest('a');
    expect(a?.getAttribute('href')).toBe(ALIAS);
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toContain('noopener');
  });

  it('Connect: a stopped computer\'s addresses open nothing on click (Open is off too)', async () => {
    const cedar = fixtureWorld.computers.find((c) => c.name === 'cedar');
    if (!cedar) throw new Error('no cedar');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderPage(page, { path: '/computers?sel=cedar.00c3&tab=connect' });
    await screen.findByRole('heading', { name: strings['connect.links'] }, { timeout: 8000 });
    const shown = [...document.querySelectorAll('bdi')].filter((b) => b.textContent?.includes(masked(cedar.id)));
    expect(shown.length).toBeGreaterThan(0);
    for (const b of shown) await userEvent.click(b);
    expect(open).not.toHaveBeenCalled();
  });
});
