// Vitest: the empty Board's welcome. One sentence, Add a program, and one quick action under it: Open a terminal, a new
// terminal on the current computer by the Board's own new-terminal Add link. No current computer in the Board's list:
// no Open a terminal. A current computer that is not running: Open a terminal is off and says why. Add a program is
// there in every case.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld } from '@core';
import { setTarget } from '@core/ctx';
import { cryptIdleForTests } from '@core/cryptStore';
import { resetBoardsForTests } from './data';
import { resetFixtureSessions, setListDown } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const S = strings as Record<string, string>;
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: () => 'toast-1' }));

const byName = (name: string) => fixtureWorld.computers.find((c) => c.name === name)!;
// The fixture world starts on atlas; a test chooses after the page is drawn, as the top bar would.
const choose = (name: string | null) => act(() => {
  const c = name ? byName(name) : null;
  setTarget(c ? { project: { id: c.project_id }, container: { id: c.id } } : null);
});
const welcome = () => screen.findByRole('group', { name: S['empty.chip'] });
const quick = (slot: HTMLElement) => within(slot).queryByRole('button', { name: new RegExp(S['empty.terminal']!) });

beforeEach(() => {
  resetFixtureSessions();
  setListDown(false);
  resetBoardsForTests();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});
afterEach(() => {
  setTarget(null);
  vi.restoreAllMocks();
});

describe('Board: the welcome\'s Open a terminal', () => {
  it('one sentence, Add a program, then Open a terminal; pressing it puts a new terminal on the current computer in the slot', async () => {
    await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    await choose('atlas');
    const slot = await welcome();
    expect(within(slot).getByText(S['empty.first']!)).toBeInTheDocument();
    expect(within(slot).getByRole('button', { name: new RegExp(S['empty.add']!) })).toBeInTheDocument();
    const open = await waitFor(() => { const b = quick(slot); expect(b).not.toBeNull(); return b!; });
    expect(open).not.toHaveAttribute('aria-disabled');
    // Add a program comes first, Open a terminal right after it.
    const order = within(slot).getAllByRole('button').map((b) => b.textContent ?? '');
    expect(order.findIndex((x) => x.includes(S['empty.add']!))).toBeLessThan(order.findIndex((x) => x.includes(S['empty.terminal']!)));
    await userEvent.setup().click(open);
    expect(await screen.findByTitle(/^terminal-\d+ on atlas$/)).toBeInTheDocument();
    // The tile took the slot: the welcome is gone.
    await waitFor(() => expect(screen.queryByText(S['empty.first']!)).toBeNull());
  });

  it('a current computer that is not running: Open a terminal is off and names why; Add a program works as before', async () => {
    await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    await choose('cedar');
    const slot = await welcome();
    const open = await waitFor(() => { const b = quick(slot); expect(b).not.toBeNull(); return b!; });
    expect(open).toHaveAttribute('aria-disabled', 'true');
    expect(open).toHaveAccessibleDescription(S['empty.terminalOff']!.replace('{{name}}', 'cedar'));
    await userEvent.setup().click(open);
    expect(screen.queryByTitle(/^terminal-\d+ on cedar$/)).toBeNull();
    expect(within(slot).getByRole('button', { name: new RegExp(S['empty.add']!) })).not.toHaveAttribute('aria-disabled');
  });

  it('no current computer: no Open a terminal, Add a program alone', async () => {
    await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    await choose(null);
    const slot = await welcome();
    expect(within(slot).getByRole('button', { name: new RegExp(S['empty.add']!) })).toBeInTheDocument();
    expect(quick(slot)).toBeNull();
  });

  it('a Board with a tile and an empty slot beside it shows no welcome and no Open a terminal there', async () => {
    await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    await choose('atlas');
    const slot = await welcome();
    await waitFor(() => expect(quick(slot)).not.toBeNull());
    await userEvent.setup().click(quick(slot)!);
    expect(await screen.findByTitle(/^terminal-\d+ on atlas$/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /Tile menu/ }));
    await userEvent.setup().click(await screen.findByRole('menuitem', { name: /^Split right/ }));
    const empty = await screen.findByRole('group', { name: S['empty.chip'] });
    expect(quick(empty)).toBeNull();
    expect(within(empty).queryByText(S['empty.first']!)).toBeNull();
  });
});
