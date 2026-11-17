// Vitest: Files' Put on Board puts one folder or file on the Board (a
// files tile opened on it), not the whole Files app. A row's menu puts that row; the pane bar's More menu
// puts the folder that pane shows. A path the tile cannot keep (control characters, a name the listing could not read) offers nothing.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { answers, reply } from '@core';
import type * as Kit from '@kit';
import type * as Fixtures from './fixtures';
import page from './page';
import { rootRoute } from './routes';
import strings from './strings.en.json';

const S = vi.hoisted(() => ({ went: [] as string[] }));
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return {
    ...real,
    usePageLink: (id: string) => (id === 'board' ? { kind: 'hub' } : real.usePageLink(id)),
    useGo: () => {
      const go = real.useGo();
      return (to: string, opts?: Parameters<typeof go>[1]) => { if (to.startsWith('/board')) S.went.push(to); else go(to, opts); };
    },
  };
});

// Test-local fixture state rootFile: atlas's top folder also holds a file (the shared / listing has folders only, and
// other tests and shots read it). Core takes the first matching rule, so this answer for / goes before the default's.
vi.mock('./fixtures', async (orig) => {
  const real = await orig<typeof Fixtures>();
  const fx = real.default as unknown as { default: string; states: Record<string, unknown[]> };
  const top = reply(rootRoute, (r) => (r.query.json === '' && r.target?.container.id === 'c0a7150000000000000000a1'
    ? answers.ok({ kind: 'Index', href: '/', uri_prefix: '/', dir_exists: true, paths: [
      { path_type: 'Dir', name: 'srv', mtime: 1_761_200_000_000, size: 3 },
      { path_type: 'File', name: 'readme.txt', mtime: 1_761_200_000_000, size: 12 },
    ] })
    : answers.refused(404, 'NOT_FOUND')));
  return { ...real, default: { ...fx, states: { ...fx.states, rootFile: [top, ...fx.states[fx.default]!] } } };
});

const at = (p: string) => `/files?a=atlas.00a1&ap=${encodeURIComponent(p)}`;
const ATLAS = 'c0a7150000000000000000a1';
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const pane = (side = strings['pane.a']) => screen.findByRole('region', { name: side });
const table = async (side?: string) => within(await pane(side)).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) }, { timeout: 8000 });
/** Put on Board in a pane bar's More menu: the menu is that pane's, so the item is plain "Put on Board". */
async function barPut(side?: string) {
  await table(side);
  await userEvent.click(within(await pane(side)).getByRole('button', { name: new RegExp(`^${strings['action.more']}$`) }));
  await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Put on Board' }));
}
async function menuOf(name: RegExp, side?: string) {
  const r = await within(await table(side)).findByRole('row', { name }, { timeout: 8000 });
  await userEvent.click(within(r).getByRole('button', { name: /actions|more/i }));
  return screen.findByRole('menu');
}
const added = () => {
  expect(S.went).toHaveLength(1);
  const q = new URLSearchParams(S.went[0]!.slice('/board?'.length));
  return { add: q.get('add'), open: q.get('open'), at: q.get('at'), cid: q.get('cid') };
};

describe('Files: Put on Board for one folder or file', () => {
  it("a folder row's menu puts that folder on the Board", async () => {
    S.went = [];
    await renderPage(page, { path: at('/home/ada') });
    const menu = await menuOf(/\bprojects\b/);
    expect(S.went).toEqual([]);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Put on Board' }));
    expect(added()).toEqual({ add: 'files-1', open: 'folder', at: '/home/ada/projects', cid: ATLAS });
  });

  it("a file row's menu puts that file on the Board, opened in the editor tile", async () => {
    S.went = [];
    await renderPage(page, { path: at('/home/ada') });
    const menu = await menuOf(/notes\.txt/);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Put on Board' }));
    expect(added()).toEqual({ add: 'files-1', open: 'editor', at: '/home/ada/notes.txt', cid: ATLAS });
  });

  it('a name with a control character, or one the listing could not read, offers no Put on Board', async () => {
    S.went = [];
    await renderPage(page, { path: at('/home/ada') });
    let menu = await menuOf(/bell/);
    expect(within(menu).queryByRole('menuitem', { name: 'Put on Board' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    menu = await menuOf(/caf/);
    expect(within(menu).queryByRole('menuitem', { name: 'Put on Board' })).toBeNull();
    expect(S.went).toEqual([]);
  });

  it("the pane bar's More menu puts the folder it shows", async () => {
    S.went = [];
    await renderPage(page, { path: at('/home/ada') });
    await table();
    expect(S.went).toEqual([]);
    await barPut();
    expect(added()).toEqual({ add: 'files-1', open: 'folder', at: '/home/ada', cid: ATLAS });
  });

  it('the top folder: a row puts /srv, and the bar puts /', async () => {
    S.went = [];
    await renderPage(page, { path: at('/') });
    const menu = await menuOf(/\bsrv\b/);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Put on Board' }));
    expect(added()).toEqual({ add: 'files-1', open: 'folder', at: '/srv', cid: ATLAS });
    S.went = [];
    await userEvent.keyboard('{Escape}');
    await barPut();
    expect(added()).toEqual({ add: 'files-1', open: 'folder', at: '/', cid: ATLAS });
  });

  it('a file directly in the top folder puts /<file> on the Board, opened in the editor tile, only when picked', async () => {
    S.went = [];
    await renderPage(page, { path: at('/'), state: 'rootFile' });
    const menu = await menuOf(/readme\.txt/);
    expect(S.went).toEqual([]);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Put on Board' }));
    expect(added()).toEqual({ add: 'files-1', open: 'editor', at: '/readme.txt', cid: ATLAS });
  });

  it('the right pane puts its own rows', async () => {
    S.went = [];
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv&b=atlas.00a1&bp=%2Fsrv' });
    const right = strings['pane.b'];
    const menu = await menuOf(/\bmedia\b/, right);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Put on Board' }));
    expect(added()).toEqual({ add: 'files-1', open: 'folder', at: '/srv/media', cid: ATLAS });
  });

  it('a folder core cannot open (a ninth level, a name with %) offers no Put on Board', async () => {
    S.went = [];
    await renderPage(page, { path: at('/srv/a/b/c/d/e/f/g') });
    const menu = await menuOf(/\bh\b/);
    expect(within(menu).queryByRole('menuitem', { name: 'Put on Board' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(S.went).toEqual([]);
  });

  it('a folder whose name holds % offers no Put on Board', async () => {
    S.went = [];
    await renderPage(page, { path: at('/home/ada') });
    const menu = await menuOf(/odd%dir/);
    expect(within(menu).queryByRole('menuitem', { name: 'Put on Board' })).toBeNull();
    expect(S.went).toEqual([]);
  });

  it("the right pane's bar puts the right pane's folder, once", async () => {
    S.went = [];
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv&b=atlas.00a1&bp=%2Fsrv%2Fapp' });
    const right = strings['pane.b'];
    await table(right);
    expect(S.went).toEqual([]);
    await barPut(right);
    expect(added()).toEqual({ add: 'files-1', open: 'folder', at: '/srv/app', cid: ATLAS });
  });
});
