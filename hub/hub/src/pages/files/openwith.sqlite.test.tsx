// Vitest: with this key unable to start programs (computers.actions.exec off), a database in Files still
// opens in the computer's SQLite Studio, from its row menu and from its Preview, through the real Open with entry
// (pages/apps/links.ts). It is a link: no program check and no launch is sent, and Open with… stays off.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type { RowActionEntry } from '@kit';
import type { FilesComputer } from './data';
import { rootListingOf } from './logic';
import { useReadActions } from './ReadActions';
import type * as Core from '@core';
import { addFile, resetFiles } from './fixtures';
import page from './page';
import strings from './strings.en.json';

vi.mock('@core', async (importOriginal) => {
  const m = await importOriginal<typeof Core>();
  return { ...m, useCan: (cap: string) => (cap === 'computers.actions.exec' ? false : m.useCan(cap)) };
});

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Renders atlas at /home/ada with `name` added, and opens that row's menu. */
async function menuOf(name: string, state?: string) {
  resetFiles();
  addFile(`/home/ada/${name}`, 8192);
  const r = await renderPage(page, { path: `/files?a=atlas.00a1&ap=${encodeURIComponent('/home/ada')}`, ...(state ? { state } : {}) });
  const pane = await screen.findByRole('region', { name: strings['pane.a'] });
  const table = await within(pane).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
  const row = await within(table).findByRole('row', { name: new RegExp(esc(name)) });
  await userEvent.click(within(row).getByRole('button', { name: /actions|more/i }));
  return r;
}
/** Every query the page asked: a program check or a launch would be one of them. */
const keys = (r: Awaited<ReturnType<typeof renderPage>>) => r.queryClient.getQueryCache().findAll().map((q) => JSON.stringify(q.queryKey));

afterEach(() => vi.restoreAllMocks());

describe('Files: a database opens in SQLite Studio without the right to run programs', () => {
  it('the row menu offers Open in SQLite Studio (enabled) while Open with… stays off; pressing it opens the studio, nothing is checked or launched', async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    const r = await menuOf('shop.db');
    const studio = await screen.findByRole('menuitem', { name: new RegExp('^' + esc(strings['ow.sqlite'])) });
    expect(studio).not.toHaveAttribute('aria-disabled', 'true');
    const off = screen.getByRole('menuitem', { name: new RegExp('^' + esc(strings['ow.openWith'])) });
    expect(off).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(studio);
    expect(opened).toHaveBeenCalledTimes(1);
    const url = opened.mock.calls[0]![0] as string;
    expect(url).toContain('-sqlite-1.');
    expect(url).toMatch(/\/\?db=%2Fhome%2Fada%2Fshop\.db$/);
    expect(opened.mock.calls[0]![1]).toBe('_blank');
    expect(keys(r).some((k) => k.includes('ow-probe'))).toBe(false);
    expect(screen.queryByRole('dialog', { name: /open with/i })).toBeNull();
  });

  it("the Preview's top action is Open in SQLite Studio, a new-tab link, with Open with… still off; nothing is checked", async () => {
    const r = await menuOf('shop.db');
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp('^' + esc(strings['action.preview'])) }));
    // The first Preview in the file loads its chunks; under host load that alone can pass the 5 s default.
    const link = await screen.findByRole('link', { name: /Open in SQLite Studio/ }, { timeout: 30_000 });
    expect(link.getAttribute('href')).toMatch(/-sqlite-1\..*\/\?db=%2Fhome%2Fada%2Fshop\.db$/);
    expect(link).toHaveAttribute('target', '_blank');
    // Off the kit's way: it stays focusable and says why (aria-disabled), and a press does nothing.
    expect(screen.getByRole('button', { name: strings['ow.openWith'] })).toHaveAttribute('aria-disabled', 'true');
    await waitFor(() => expect(keys(r).some((k) => k.includes('ow-probe'))).toBe(false));
  });

  it("an older files program (no skipped list, no kinds) is not read at all: no row, so no studio link and no guessed kind", async () => {
    resetFiles();
    addFile('/home/ada/shop.db', 8192);
    await renderPage(page, { path: `/files?a=atlas.00a1&ap=${encodeURIComponent('/home/ada')}`, state: 'oldFiles' });
    const pane = await screen.findByRole('region', { name: strings['pane.a'] });
    expect(await within(pane).findByText(strings['pr.unreadable'])).toBeInTheDocument();
    expect(within(pane).getByText(strings['pr.unreadableBody'])).toBeInTheDocument();
    expect(within(pane).queryByRole('row', { name: /shop\.db/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Open in SQLite Studio/ })).toBeNull();
  });

  it('a name the studio refuses (#) gets no studio item: Open with… (off here) is the way, as for any file', async () => {
    await menuOf('a#b.db');
    expect(await screen.findByRole('menuitem', { name: new RegExp('^' + esc(strings['ow.openWith'])) })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('menuitem', { name: new RegExp('^' + esc(strings['ow.sqlite'])) })).toBeNull();
  });

  it('a file that is not a database has no studio item', async () => {
    await menuOf('notes.db.txt');
    expect(await screen.findByRole('menuitem', { name: new RegExp('^' + esc(strings['ow.openWith'])) })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: new RegExp('^' + esc(strings['ow.sqlite'])) })).toBeNull();
  });
});

// The top folder's listing (GET /?json) names a link by path_type only. Its kind reaches Open with, so a
// link named .db at / gets no studio; an entry whose kind Files only guessed gets none either (programs still take it).
describe('Files: the top folder and guessed kinds', () => {
  const c: FilesComputer = { id: 'c0a7150000000000000000a1', name: 'atlas', project_id: 'a'.repeat(24), server_name: 'n1', status: 'running', rules: 'open' } as FilesComputer;
  const ids = (rows: RowActionEntry[]) => rows.map((r) => (r === '-' ? '-' : r.id));
  // renderPage boots core (its query client and fixture world) first; the hook then reads through it.
  const at = (path: string) => ({ hook: () => renderHook(() => useReadActions({ c, path, canChange: true, onMove: () => undefined })).result.current });
  const root = rootListingOf({ kind: 'Index', paths: [
    { path_type: 'File', name: 'shop.db', mtime: 1, size: 9 },
    { path_type: 'SymlinkFile', name: 'link.db', mtime: 1, size: 9 },
  ] })!;

  it('a root link named .db has no studio item; a root regular .db has it (its kind is read, not guessed)', async () => {
    resetFiles();
    const h = at('/');
    await renderPage(page, { path: `/files?a=atlas.00a1&ap=${encodeURIComponent('/home/ada')}` });
    const a = h.hook();
    const [file, link] = root.entries;
    expect(link!.type).toBe('symlink');
    expect(ids(a.rowActions(file!))).toContain('ow-sqlite');
    expect(ids(a.rowActions(link!))).not.toContain('ow-sqlite');
  });

  it('an entry of unknown kind (an older files program) gets no studio item', async () => {
    resetFiles();
    const h = at('/home/ada');
    await renderPage(page, { path: `/files?a=atlas.00a1&ap=${encodeURIComponent('/home/ada')}` });
    const a = h.hook();
    expect(ids(a.rowActions({ name: 'shop.db', dir: false, size: 1, modified: null, lossy: false }))).not.toContain('ow-sqlite');
    expect(ids(a.rowActions({ name: 'shop.db', dir: false, size: 1, modified: null, lossy: false, type: 'file' }))).toContain('ow-sqlite');
  });
});
