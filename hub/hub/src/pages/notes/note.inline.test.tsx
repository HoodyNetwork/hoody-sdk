// Vitest: a note opens inside the Notes page. Selecting a row shows the note's own Notes page in a frame beside the table
// (over it on a phone); Open note opens that address in a new tab; a selection the table does not hold says it is not among the
// recent notes (never "deleted"), and says it is still reading while the notes load.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import { noteUrl } from './logic';
import { fixtureWorld } from '@core';

const idOf = (name: string): string => (fixtureWorld.computers.find((c) => c.name === name) as { id: string }).id;

const USER = 'a1b2c3d4e5f6a7b8c9d0e1f2';
const NODE = '0a1b2c3d4e5f6a7b8c9d0e1f2b';
// Literal texts, so a run on the old strings fails on behaviour, not on a missing key.
const OPEN_TAB = 'Open in a new tab';
// A selection the page cannot open says no note has that address; never for a note that is only older than the recent list.
const NOT_RECENT = strings['note.gone'];

describe('noteUrl', () => {
  const base = 'https://p1-c1-notes-1.n1.example.test/';
  it('is the note page route of the Notes program, with the sidebar hidden when embedded', () => {
    expect(noteUrl(base, USER, NODE)).toBe(`https://p1-c1-notes-1.n1.example.test/notebook/${USER}/${NODE}`);
    expect(noteUrl(base, USER, NODE, true)).toBe(`https://p1-c1-notes-1.n1.example.test/notebook/${USER}/${NODE}?sidebar=hidden`);
  });
  it('links nothing for a base that is not https, not an address, or an id that is not a Notes id', () => {
    expect(noteUrl(null, USER, NODE)).toBeNull();
    expect(noteUrl('http://h.example.test/', USER, NODE)).toBeNull();
    expect(noteUrl('javascript:alert(1)', USER, NODE)).toBeNull();
    expect(noteUrl('not a url', USER, NODE)).toBeNull();
    expect(noteUrl(base, 'short', NODE)).toBeNull();
    expect(noteUrl(base, USER, '../../x')).toBeNull();
    expect(noteUrl(base, USER, NODE.toUpperCase())).toBeNull();
  });
  it('keeps only the origin of the base: a path or query on it never reaches the note address', () => {
    expect(noteUrl('https://h.example.test/x/y?z=1#f', USER, NODE)).toBe(`https://h.example.test/notebook/${USER}/${NODE}`);
  });
});

describe('a note opened inside the Notes page', () => {
  afterEach(() => vi.restoreAllMocks());
  const rowOf = async (name: RegExp) => within(await screen.findByRole('table', { name: strings.table }, { timeout: 8000 })).findByRole('row', { name }, { timeout: 8000 });

  it('selecting a row shows that note in a sandboxed frame at its own Notes address, beside the table', async () => {
    await renderPage(page, {});
    await userEvent.click(await rowOf(/Weekly plan/));
    const frame = (await screen.findByTitle('Note: Weekly plan')) as HTMLIFrameElement;
    expect(frame.src).toMatch(new RegExp(`^https://[^/]+/notebook/${USER}/[0-9a-z]{24,28}\\?sidebar=hidden$`));
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(screen.getByRole('table', { name: strings.table })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: OPEN_TAB })).toBeInTheDocument();
  });

  it('Open note in the row menu opens the note itself in a new tab, not the computer\'s Notes home', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderPage(page, {});
    const row = await rowOf(/Weekly plan/);
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.openNote'] }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(String(open.mock.calls[0]?.[0])).toMatch(new RegExp(`/notebook/${USER}/[0-9a-z]{24,28}$`));
    expect(open.mock.calls[0]?.[2]).toBe('noopener,noreferrer');
  });

  it('the detail\'s Open in a new tab opens the same address', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderPage(page, {});
    await userEvent.click(await rowOf(/Weekly plan/));
    await userEvent.click(await screen.findByRole('button', { name: OPEN_TAB }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(String(open.mock.calls[0]?.[0])).toMatch(new RegExp(`/notebook/${USER}/[0-9a-z]{24,28}$`));
  });

  // A copied link to an older note opens it; the note is addressed by its id alone.
  it('a selection whose computer is read and answered without that note opens it by its id, never says it was deleted', async () => {
    await renderPage(page, { path: `/notes?sel=${idOf('atlas')}~0a1b2c3d4e5f6a7b8c9d0e1fff` });
    expect(await screen.findByRole('button', { name: OPEN_TAB }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByTitle(strings['note.frame'].replace('{{title}}', strings['note.title'])).getAttribute('src')).toContain('/0a1b2c3d4e5f6a7b8c9d0e1fff?sidebar=hidden');
    expect(screen.queryByText(NOT_RECENT)).toBeNull();
  });

  it('a selection whose computer is not in the list says so, not that the note is absent', async () => {
    await renderPage(page, { path: '/notes?sel=nocomputer~0a1b2c3d4e5f6a7b8c9d0e1fff' });
    expect(await screen.findByText("This note's computer is not in this list.", undefined, { timeout: 8000 })).toBeInTheDocument();
    // Not a dead end: where the computer may be, and where to look.
    expect(screen.getByText(strings['note.noComputerBody'])).toBeInTheDocument();
    expect(screen.queryByText(NOT_RECENT)).toBeNull();
  });

  it('a selection on a stopped computer says the computer is stopped, not that the note is absent', async () => {
    await renderPage(page, { path: `/notes?sel=${idOf('cedar')}~0a1b2c3d4e5f6a7b8c9d0e1fff` });
    // Once in the table's group row for the computer, once in the detail.
    await waitFor(() => expect(screen.getAllByText(strings['state.stopped']).length).toBeGreaterThan(1), { timeout: 8000 });
    expect(screen.queryByText(NOT_RECENT)).toBeNull();
  });

  it('a selection on a computer whose Notes could not be read says what Notes said, with Try again, not that the note is absent', async () => {
    await renderPage(page, { state: 'error', path: `/notes?sel=${idOf('atlas')}~0a1b2c3d4e5f6a7b8c9d0e1fff` });
    expect((await screen.findAllByText(strings['state.unreachable'], undefined, { timeout: 8000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText(NOT_RECENT)).toBeNull();
    expect(screen.getAllByRole('button', { name: strings['action.tryAgain'] }).length).toBeGreaterThan(1);
  });
  it('a selection on a computer whose recent list is partial opens the note too, never says it is absent', async () => {
    await renderPage(page, { state: 'long', path: `/notes?sel=${idOf('atlas')}~0a1b2c3d4e5f6a7b8c9d0e1fff` });
    expect(await screen.findByRole('button', { name: OPEN_TAB }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByTitle(strings['note.frame'].replace('{{title}}', strings['note.title']))).toBeInTheDocument();
    expect(screen.queryByText(NOT_RECENT)).toBeNull();
  });

  it('with the list hidden (?list=0) a note that is not in the list still has the header control to bring the list back', async () => {
    await renderPage(page, { path: `/notes?sel=${idOf('atlas')}~0a1b2c3d4e5f6a7b8c9d0e1fff&list=0` });
    expect(await screen.findByRole('button', { name: OPEN_TAB }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show list' })).toBeInTheDocument();
  });
});
