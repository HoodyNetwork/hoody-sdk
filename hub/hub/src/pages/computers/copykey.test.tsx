// Vitest: Computers has no `c` page key. It was listed ("Copy its terminal link") and copied nothing; a page key has no
// kit way to copy, so the key is gone and the menus' Copy terminal URL copies the link. That item copies once: it copies
// on its own and then calls the page's action, which copies nothing more.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { interpolate } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's page-key reader, a test harness for the key list, not page code
import { livePageShortcuts } from '@shell/pageShortcuts.pure';
import { computers } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import { programUrl } from './urls';

const atlas = computers.find((c) => c.name === 'atlas');
if (!atlas) throw new Error('fixture computer atlas');

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (written.push(s), Promise.resolve()) } });
});
afterEach(() => vi.restoreAllMocks());

const head = async () => (await screen.findByRole('heading', { level: 2, name: 'atlas' }, { timeout: 20000 })).closest('header') as HTMLElement;

describe('computers: no c key; the menu copies the terminal link', () => {
  it('with a computer open, no plain c key is offered, and a press writes nothing', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    await head();
    // The page's own keys are listed (t opens the terminal), so the list read is the page's.
    await waitFor(() => expect(livePageShortcuts().some((s) => s.key === 't')).toBe(true));
    expect(livePageShortcuts().filter((s) => s.key === 'c' && !s.mods?.length)).toEqual([]);
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    await userEvent.keyboard('c');
    await act(() => new Promise((r) => setTimeout(r, 100)));
    expect(written).toEqual([]);
  }, 40000);

  it('the menu\'s Copy terminal URL copies once, never a second time from the page\'s action', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const hd = await head();
    await userEvent.click(within(hd).getByRole('button', { name: interpolate(strings['menu.actions'], { name: 'atlas' }) }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp('^' + strings['menu.copyTerminal']) }));
    await waitFor(() => expect(written).toEqual([programUrl(atlas, 'terminal')]));
    await act(() => new Promise((r) => setTimeout(r, 100)));
    expect(written).toHaveLength(1);
  }, 40000);
});
