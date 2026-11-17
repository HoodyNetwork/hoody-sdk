// Vitest: every note has Copy link and Copy read-only link, in its row menu and in the open note's
// menu. Copy link copies the note's own address in its computer's Notes (what Open note opens, the notes- program address),
// never the Hub's own address; Copy read-only link adds Notes' read-only view and says what it does not stop.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld } from '@core';
import page from './page';
import strings from './strings.en.json';

afterEach(() => { vi.restoreAllMocks(); });

const clipboard = () => {
  const written: string[] = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (written.push(s), Promise.resolve()) } });
  return written;
};
const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
async function rowOf(title: RegExp, realm?: string) {
  const r = await renderPage(page, realm ? { realm } : {});
  const table = await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
  const row = await within(table).findByRole('row', { name: title }, { timeout: 8000 });
  return { r, row };
}

async function copyFromMenu(menuButton: HTMLElement, label: string) {
  const written = clipboard();
  await userEvent.click(menuButton);
  fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${label}`) }));
  await waitFor(() => expect(written.length).toBe(1));
  // The item shows "Copied", then the menu closes by itself (kit COPIED_MS); a click before that lands on the menu's outside.
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull(), { timeout: 4000 });
  return written[0]!;
}
const copyFromRow = (row: HTMLElement, label = strings['action.copyLink']) => copyFromMenu(within(row).getByRole('button', { name: 'Row actions' }), label);
const detailMenu = async () => {
  const tab = await screen.findByRole('button', { name: strings['action.openNoteTab'] }, { timeout: 8000 });
  const detail = tab.closest('section, aside, [role="dialog"], [role="region"]') as HTMLElement;
  return within(detail).getAllByRole('button', { name: /actions|more/i })[0]!;
};
// The address the open note's frame shows, without the frame's own sidebar option: the note's page in its computer's Notes.
const frameNote = (title: string) => screen.getByTitle(strings['note.frame'].replace('{{title}}', title)).getAttribute('src')!.replace('?sidebar=hidden', '');

describe('Notes: Copy link', () => {
  it('the row menu copies the note\'s own address in its computer\'s Notes (the notes- program address), never the Hub\'s', async () => {
    const { row } = await rowOf(/Weekly plan/);
    const link = await copyFromRow(row);
    const u = new URL(link);
    expect(u.origin).not.toBe(window.location.origin);
    expect(u.hostname).toContain('-notes-');
    expect(u.pathname).toMatch(/^\/notebook\/[0-9a-z]{24,28}\/[0-9a-z]{24,28}$/);
    expect(u.search + u.hash).toBe('');
    await userEvent.click(within(row).getByText('Weekly plan'));
    await detailMenu();
    expect(link).toBe(frameNote('Weekly plan'));
  });

  it('Copy read-only link copies that address with Notes\' read-only view, and says editing can be turned back on', async () => {
    const { row } = await rowOf(/Weekly plan/);
    const link = await copyFromRow(row);
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    const item = await screen.findByRole('menuitem', { name: new RegExp(`^${strings['action.copyReadOnly']}`) });
    expect(item.textContent).toContain(strings['action.copyReadOnlyHint']);
    const written = clipboard();
    fireEvent.click(item);
    await waitFor(() => expect(written).toEqual([`${link}?mode=readonly`]));
  });

  it('the open note\'s own menu has both, copying the same links', async () => {
    const { row } = await rowOf(/Weekly plan/);
    const fromRow = await copyFromRow(row);
    await userEvent.click(within(row).getByText('Weekly plan'));
    expect(await copyFromMenu(await detailMenu(), strings['action.copyLink'])).toBe(fromRow);
    expect(await copyFromMenu(await detailMenu(), strings['action.copyReadOnly'])).toBe(`${fromRow}?mode=readonly`);
  });

  it('a note of another computer links into that computer\'s Notes', async () => {
    const { row: a } = await rowOf(/Weekly plan/, 'all');
    const atlasLink = new URL(await copyFromRow(a));
    const table = screen.getByRole('table', { name: strings.table });
    const b = await within(table).findByRole('row', { name: /Staging release notes/ });
    const borealisLink = new URL(await copyFromRow(b));
    expect(borealisLink.hostname).toContain('-notes-');
    expect(borealisLink.origin).not.toBe(atlasLink.origin);
  });

  it('a linked note that is not among the recent notes copies its own address too', async () => {
    const id = '0f0e0d0c0b0a090807060504';
    await renderPage(page, { path: `/notes?sel=${atlas.id}~${id}` });
    const menu = await detailMenu();
    const frame = screen.getByTitle(strings['note.frame'].replace('{{title}}', strings['note.title']));
    expect(frame.getAttribute('src')).toContain(`/${id}?sidebar=hidden`);
    expect(screen.queryByText(/not among the recent notes/)).toBeNull();
    const link = await copyFromMenu(menu, strings['action.copyLink']);
    expect(link).toBe(frameNote(strings['note.title']));
    expect(link.endsWith(`/${id}`)).toBe(true);
  });

  it('a note whose computer\'s Notes has no web address shows Open note and both copy items disabled with one reason, and copies or opens nothing', async () => {
    await renderPage(page, { state: 'noAddress' });
    const table = await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
    const row = await within(table).findByRole('row', { name: /Weekly plan/ }, { timeout: 8000 });
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    const written = clipboard();
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    for (const label of [strings['action.openNote'], strings['action.copyLink'], strings['action.copyReadOnly']]) {
      const item = await screen.findByRole('menuitem', { name: new RegExp(`^${label}`) });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      // One reason for both: the kit menu says it once, as a note both items are described by.
      expect(item).toHaveAccessibleDescription(strings['action.noAddress']);
      fireEvent.click(item);
    }
    expect(within(screen.getByRole('menu')).getAllByText(strings['action.noAddress'])).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(written).toEqual([]);
    expect(opened).not.toHaveBeenCalled();
    // The open note's own Open in a new tab says the same.
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull(), { timeout: 4000 }).catch(() => userEvent.keyboard('{Escape}'));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(row).getByText('Weekly plan'));
    const tab = await screen.findByRole('button', { name: strings['action.openNoteTab'] }, { timeout: 8000 });
    expect(tab).toHaveAttribute('aria-disabled', 'true');
    expect(tab).toHaveAccessibleDescription(strings['action.noAddress']);
    // The pane says why, never "open it in a new tab" beside a disabled new-tab button.
    expect(screen.queryByText(strings['note.cantShow'])).toBeNull();
    expect(screen.getByText(strings['note.noAddressBody'])).toBeInTheDocument();
    fireEvent.click(tab);
    expect(opened).not.toHaveBeenCalled();
  });
});
