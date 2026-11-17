// Vitest: an Add link that names what a files or notes tile opens on
// (links.ts BoardOpen) puts that tile on the active Board on that folder, file or note, stored that way, through the
// real router and page. A link whose place the tile cannot open is not a whole Add link: nothing is added, a notice says so.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, waitFor } from '@app/testing';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { storedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { resetFixtureSessions, setListDown } from './fixtures';
import { boardAddPath, type BoardAddAt } from './links';
import type { RealmBoards } from './model/boards';
import page from './page';

const toasts: Array<{ title: string }> = [];
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string }) => { toasts.push(c); return 'toast-1'; } }));

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const target = { project: { id: atlas.project_id }, container: { id: atlas.id, server_name: atlas.server_name } };
const USER = 'u0000000000000000000000a1';
const NODE = 'n0000000000000000000000b2';
const tiles = async () => {
  const st = (await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards | null;
  return st ? st.boards.flatMap((b) => Object.values(b.tiles).filter(Boolean)) : [];
};
const add = async (at: BoardAddAt) => {
  const href = boardAddPath(target, at);
  expect(href).not.toBe('');
  const r = await renderPage(page, { path: href });
  await waitFor(() => expect(r.router.state.location.search).toEqual({}));
  return r;
};

beforeEach(() => {
  resetFixtureSessions();
  setListDown(false);
  resetBoardsForTests();
  toasts.length = 0;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});

describe('Board: an Add link that opens a files or notes tile on one place', () => {
  it('a folder: the files tile opens on it, and is stored on it', async () => {
    await add({ kind: 'files', session: 1, open: { view: 'folder', path: '/srv/my app' } });
    const f = await screen.findByTitle(/^files-1 on atlas/);
    await waitFor(() => expect(f.getAttribute('src')).toContain('/srv/my%20app'));
    await waitFor(async () => expect(await tiles()).toEqual([expect.objectContaining({ program: 'files', session: 1, view: 'folder', params: { path: '/srv/my app' } })]));
    expect(toasts).toEqual([]);
  });

  it('a file: the files tile opens it in the editor', async () => {
    await add({ kind: 'files', session: 1, open: { view: 'editor', path: '/etc/app/config.yml' } });
    await screen.findByTitle(/^files-1 on atlas/);
    await waitFor(async () => expect(await tiles()).toEqual([expect.objectContaining({ program: 'files', view: 'editor', params: { path: '/etc/app/config.yml' } })]));
  });

  it('one note: the notes tile opens on its page, not on the Notes home, with the notebook sidebar hidden', async () => {
    await add({ kind: 'notes', session: 1, open: { view: 'node', userId: USER, nodeId: NODE } });
    const f = await screen.findByTitle(/^notes-1 on atlas/);
    await waitFor(() => expect(f.getAttribute('src')).toContain(`/notebook/${USER}/${NODE}`));
    expect(f.getAttribute('src')).toMatch(/[?&]sidebar=hidden(&|$)/);
    await waitFor(async () => expect(await tiles()).toEqual([expect.objectContaining({ program: 'notes', view: 'node', params: { userId: USER, nodeId: NODE, sidebar: 'hidden' } })]));
  });

  it('without open: the program\'s start view, as before', async () => {
    await add({ kind: 'files', session: 1 });
    await screen.findByTitle(/^files-1 on atlas/);
    await waitFor(async () => expect(await tiles()).toEqual([expect.objectContaining({ program: 'files', view: 'root' })]));
    const [t] = await tiles();
    expect(t && 'params' in t).toBe(false);
  });

  it.each([
    ['a folder for a notes tile', 'notes-1', 'open=folder&at=%2Fsrv'],
    ['a note for a files tile', 'files-1', `open=node&user=${USER}&node=${NODE}`],
    ['a relative path', 'files-1', 'open=folder&at=srv'],
    ['a place without its value', 'files-1', 'open=editor'],
  ])('%s: nothing is added, a notice says so', async (_, add, q) => {
    const r = await renderPage(page, { path: `/board?add=${add}&cid=${atlas.id}&${q}` });
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    await waitFor(() => expect(toasts.map((x) => x.title)).toEqual(["This Board link isn't complete, so nothing was added."]));
    expect(await tiles()).toEqual([]);
  });
});
