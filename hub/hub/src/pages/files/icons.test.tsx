// Vitest: each pane shows List or Icons, its own choice. Icons is the folder grid: a tile per
// item with its kind's icon and its name (shortened in the middle, whole in its tooltip); a click selects, a double
// click or Enter opens, a right click opens the same row menu as the list; Backspace and Alt+Up go up.
import { describe, expect, it } from 'vitest';
import { fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import { fileKind, middleName } from './kind';
import strings from './strings.en.json';

const A = '/files?a=atlas.00a1';
const ADA = `${A}&ap=${encodeURIComponent('/home/ada')}`;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const pane = (k: 'a' | 'b' = 'a') => screen.findByRole('region', { name: strings[k === 'a' ? 'pane.a' : 'pane.b'] });
const table = async (k: 'a' | 'b' = 'a') => within(await pane(k)).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
const tile = async (name: RegExp, k: 'a' | 'b' = 'a') => within(await table(k)).findByRole('row', { name });
const isIcons = async (k: 'a' | 'b' = 'a') => /icons/.test((await table(k)).className);

// The pane's own List / Icons choice: in its toolbar, or in its view menu when the toolbar is tight.
async function show(which: 'list' | 'icons', k: 'a' | 'b' = 'a') {
  const p = await pane(k);
  const label = strings[which === 'icons' ? 'show.icons' : 'show.list'];
  const radio = within(p).queryByRole('radio', { name: label });
  if (radio) {
    await userEvent.click(radio);
    return;
  }
  await userEvent.click(within(p).getByRole('button', { name: /view options/i }));
  await userEvent.click(await screen.findByRole('menuitemradio', { name: label }));
}
async function menuItems(row: HTMLElement, how: 'button' | 'right') {
  if (how === 'button') await userEvent.click(within(row).getByRole('button', { name: /actions/i }));
  else fireEvent.contextMenu(row);
  const items = (await screen.findAllByRole('menuitem')).map((m) => m.textContent);
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryAllByRole('menuitem')).toHaveLength(0));
  return items;
}

describe('kinds and names', () => {
  it('sorts items into folder, image, code or text, archive and other', () => {
    expect(fileKind({ name: 'site', dir: true })).toBe('folder');
    for (const n of ['a.png', 'b.JPG', 'c.jpeg', 'd.gif', 'e.webp', 'f.svg']) expect(fileKind({ name: n, dir: false })).toBe('image');
    for (const n of ['server.js', 'config.yaml', 'deploy.sh', 'notes.txt', 'README.md', 'package.json']) expect(fileKind({ name: n, dir: false })).toBe('text');
    for (const n of ['x.zip', 'y.tar', 'z.tar.gz', 'w.tgz', 'v.7z']) expect(fileKind({ name: n, dir: false })).toBe('archive');
    for (const n of ['report.pdf', 'hosts-link', 'blob', '.env']) expect(fileKind({ name: n, dir: false })).toBe('other');
  });
  it('shortens a long name in the middle, keeping its end (the extension) whole', () => {
    expect(middleName('notes.txt')).toBe('notes.txt');
    const long = 'a-very-long-file-name-that-goes-on-and-on-2026-10-26.tar.gz';
    const cut = middleName(long);
    expect(cut.length).toBeLessThanOrEqual(32);
    expect(cut).toContain('…');
    expect(cut.startsWith('a-very-long')).toBe(true);
    expect(cut.endsWith('.tar.gz')).toBe(true);
  });
});

describe('icons view', () => {
  it('starts as a list; the pane\'s own switch turns it into tiles, and the other pane keeps its own choice', async () => {
    await renderPage(page, { path: `${ADA}&b=atlas.00a1&bp=%2Fsrv%2Fapp` });
    await tile(/notes\.txt/);
    expect(await isIcons('a')).toBe(false);
    await show('icons', 'a');
    await waitFor(async () => expect(await isIcons('a')).toBe(true));
    expect(await isIcons('b')).toBe(false);
    const t = await tile(/notes\.txt/);
    expect(within(t).getByTitle('notes.txt')).toBeInTheDocument();
    // The kind column's size and date are not on a tile.
    expect(within(t).queryByText('1.2 KB')).toBeNull();
    await show('list', 'a');
    await waitFor(async () => expect(await isIcons('a')).toBe(false));
  });

  it('each tile names its kind to a screen reader: a folder and a file without an extension stay told apart', async () => {
    await renderPage(page, { path: ADA });
    await tile(/notes\.txt/);
    await show('icons');
    await waitFor(async () => expect(await isIcons()).toBe(true));
    expect(within(await tile(/projects/)).getByRole('img', { name: strings['kind.folder'] })).toBeInTheDocument();
    expect(within(await tile(/hosts-link/)).getByRole('img', { name: strings['kind.file'] })).toBeInTheDocument();
  });

  it('a click selects a tile (the bulk Delete shows); a double click or Enter opens a folder', async () => {
    const { router } = await renderPage(page, { path: ADA });
    await tile(/notes\.txt/);
    await show('icons');
    await userEvent.click(within(await tile(/notes\.txt/)).getByTitle('notes.txt'));
    expect(await screen.findByRole('button', { name: strings['action.deleteSelected'] })).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ ap: '/home/ada' });
    await userEvent.dblClick(within(await tile(/projects/)).getByTitle('projects'));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ap: '/home/ada/projects' }));
    const site = await tile(/site/);
    site.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ap: '/home/ada/projects/site' }));
  });

  it('a right click opens the same row menu as the list\'s ⋯ button', async () => {
    await renderPage(page, { path: ADA });
    const fromList = await menuItems(await tile(/notes\.txt/), 'button');
    await show('icons');
    await waitFor(async () => expect(await isIcons()).toBe(true));
    const fromTile = await menuItems(await tile(/notes\.txt/), 'right');
    const fromTileButton = await menuItems(await tile(/notes\.txt/), 'button');
    expect(fromTile).toEqual(fromList);
    expect(fromTileButton).toEqual(fromList);
    expect(fromList.length).toBeGreaterThan(3);
  });

  it('Backspace and Alt+Up go up from a tile', async () => {
    const { router } = await renderPage(page, { path: `${A}&ap=${encodeURIComponent('/home/ada/projects/site')}` });
    await tile(/deploy\.sh/);
    await show('icons');
    (await tile(/deploy\.sh/)).focus();
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ap: '/home/ada/projects' }));
    (await tile(/site/)).focus();
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ap: '/home/ada' }));
  });
});
