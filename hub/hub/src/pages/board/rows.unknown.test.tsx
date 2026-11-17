// Vitest: the Board never infers "not there" from rows that are not a proven whole list. A computer missing from the
// rows of a read that failed since, or from a first page that is not the whole list (more pages), is unknown, never gone,
// "doesn't match a computer here" or "nothing was added". A computer the rows do list stays what its row says.
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { fixtureWorld } from '@core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from './embed/catalog';
import catalog from './embed/catalog.ui.json';
import type { BoardComputer } from './computers';
import { resetBoardsForTests } from './data';
import { resetFixtureSessions, setListDown } from './fixtures';
import page from './page';
import { infoFor, type InfoCtx, type RealmCtx } from './parts/tileInfo';
import strings from './strings.en.json';

const toasts: Array<{ title: string }> = [];
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string }) => { toasts.push(c); return 'toast-1'; } }));

const S = strings as Record<string, string>;
const t = (k: string, v: Record<string, unknown> = {}) => (S[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(v[x]));
const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const handle = `atlas.${atlas.id.slice(-4)}`;
const others = fixtureWorld.computers.filter((c) => c.name !== 'atlas');
const FAILED = 'The computers could not be read.';

beforeEach(() => {
  resetBoardsForTests();
  resetFixtureSessions();
  setListDown(false);
  toasts.length = 0;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});
afterEach(() => { setListDown(false); });

const put = (r: { queryClient: unknown }, key: unknown, data: unknown) => { (r.queryClient as { setQueryData(k: unknown, d: unknown): void }).setQueryData(key, data); };
const listQueries = (r: { queryClient: { getQueryCache(): { getAll(): Array<{ queryKey: unknown; state: { data?: unknown } }> } } }) =>
  r.queryClient.getQueryCache().getAll().filter((q) => !!(q.state.data as { data?: { computers?: unknown } } | undefined)?.data?.computers);

describe('tile state: rows that are not a proven whole list', () => {
  const pc = (id: string, name: string, status: string) => ({ id, name, status, project_id: 'p1', server_name: 'n12', realm_ids: [] }) as unknown as BoardComputer;
  const ctx: InfoCtx = { computers: [pc('c1', 'atlas', 'running')], failed: false, cat: catalog as unknown as Catalog, domain: 'hoody.example', origin: 'https://hub.example', scheme: 'light', t };
  const tile = { project: 'p1', computer: 'c9', program: 'terminal' as const, session: 1 };
  const listed = { project: 'p1', computer: 'c1', program: 'terminal' as const, session: 1 };
  const one: RealmCtx = { selected: '0123456789abcdef01234567', rows: null };

  it('rows that listed others but not this computer, with the last read failed: unknown, not gone', () => {
    expect(infoFor('s', tile, { ...ctx, failed: true }, one).state).toBe('unknown');
  });
  it('an incomplete first page that lacks the computer: unknown, not gone', () => {
    expect(infoFor('s', tile, { ...ctx, complete: false }, one).state).toBe('unknown');
    expect(infoFor('s', tile, { ...ctx, computers: [], complete: false }, one).state).toBe('unknown');
  });
  it('no answer yet is loading, and a first read that failed is unknown', () => {
    expect(infoFor('s', tile, { ...ctx, computers: null }, one).state).toBe('loading');
    expect(infoFor('s', tile, { ...ctx, computers: null, failed: true }, one).state).toBe('unknown');
  });
  it('a complete answer without the computer is gone; a context that says nothing about completeness keeps that', () => {
    expect(infoFor('s', tile, { ...ctx, complete: true }, one).state).toBe('gone');
    expect(infoFor('s', tile, ctx, one).state).toBe('gone');
  });
  it('a computer the rows do list keeps what its row says, incomplete or failed since (the tile is flagged unchecked when failed)', () => {
    expect(infoFor('s', listed, { ...ctx, complete: false }, one).state).toBe('live');
    const f = infoFor('s', listed, { ...ctx, failed: true }, one);
    expect(f.state).toBe('live');
    expect(f.unchecked).toBe(true);
  });
  it('a computer listed under another project is still gone: the row says so', () => {
    expect(infoFor('s', { ...listed, project: 'p-other' }, { ...ctx, complete: false }, one).state).toBe('gone');
  });
});

describe('program view: rows that are not a proven whole list', () => {
  it('rows that listed others, then a failed read: could not be read with Try again, never "doesn\'t match"', async () => {
    const r = await renderPage(page, { state: 'flaky', path: `/board/open/${handle}/terminal-1` });
    await screen.findByRole('heading', { name: /terminal-1/ });
    const lists = listQueries(r);
    expect(lists.length).toBeGreaterThan(0);
    act(() => { for (const q of lists) put(r, q.queryKey, { data: { computers: others } }); });
    setListDown(true);
    await act(async () => { await r.queryClient.refetchQueries(); });
    expect(await screen.findByText(FAILED)).toBeInTheDocument();
    expect(screen.queryByText(/doesn't match a computer here/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('a first page of a longer list that lacks the computer: not called missing', async () => {
    const r = await renderPage(page, { state: 'flaky', path: `/board/open/${handle}/terminal-1` });
    await screen.findByRole('heading', { name: /terminal-1/ });
    act(() => { for (const q of listQueries(r)) put(r, q.queryKey, { data: { computers: others, pagination: { totalPages: 2 } } }); });
    expect(await screen.findByText(t('view.listPartial'))).toBeInTheDocument();
    expect(screen.queryByText(/doesn't match a computer here/)).toBeNull();
  });

  it('a whole list that lacks the computer still says it does not match', async () => {
    const r = await renderPage(page, { state: 'flaky', path: `/board/open/${handle}/terminal-1` });
    await screen.findByRole('heading', { name: /terminal-1/ });
    act(() => { for (const q of listQueries(r)) put(r, q.queryKey, { data: { computers: others, pagination: { totalPages: 1 } } }); });
    expect(await screen.findByText(/doesn't match a computer here/)).toBeInTheDocument();
  });
});

describe('Board: an Add link whose computer is not in rows that are not a proven whole list', () => {
  const link = `/board?add=terminal-3&cid=${atlas.id}`;

  async function addWith(data: unknown, failedSince = false) {
    const r = await renderPage(page, { state: 'flaky', path: '/board' });
    await waitFor(() => expect(listQueries(r).length).toBeGreaterThan(0));
    act(() => { for (const q of listQueries(r)) put(r, q.queryKey, data); });
    if (failedSince) {
      setListDown(true);
      await act(async () => { await r.queryClient.refetchQueries(); });
    }
    await act(() => r.router.navigate({ href: link } as never));
    return r;
  }

  it('a first page of a longer list: the notice says it could not be told, never "nothing was added"', async () => {
    await addWith({ data: { computers: others, pagination: { totalPages: 2 } } });
    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    expect(toasts.map((x) => x.title)).toEqual([t('add.listPartial')]);
  });

  it('a first page of a longer list whose read then failed: the notice says the list could not be read (it waits for a read), not "could not be told"', async () => {
    await addWith({ data: { computers: others, pagination: { totalPages: 2 } } }, true);
    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    expect(toasts.map((x) => x.title)).toEqual([S['add.listFailed_one']]);
  });

  it('a whole list without it: "does not match a computer here, so nothing was added"', async () => {
    await addWith({ data: { computers: others, pagination: { totalPages: 1 } } });
    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    expect(toasts.map((x) => x.title)).toEqual([t('add.notFound')]);
  });
});

describe('Board: Add a program on a first page that is not the whole list', () => {
  it('a search with no match says the computer may be further down the list', async () => {
    const user = userEvent.setup();
    const r = await renderPage(page, { state: 'flaky', path: '/board' });
    await waitFor(() => expect(listQueries(r).length).toBeGreaterThan(0));
    act(() => { for (const q of listQueries(r)) put(r, q.queryKey, { data: { computers: others, pagination: { totalPages: 2 } } }); });
    await user.click(await screen.findByRole('button', { name: /Add a program/ }));
    await user.type(await screen.findByRole('searchbox'), 'zebra');
    // The empty search's state: no match for the words, and its body says only the first page was searched (never a
    // count of "your computers", which this first page is not).
    expect(await screen.findByText(t('picker.noMatchTitle', { q: 'zebra' }))).toBeInTheDocument();
    expect(screen.getByText(S['picker.noMatchPartialBody']!)).toBeInTheDocument();
    expect(screen.queryByText(/None of your|computer does not match/)).toBeNull();
  });
});

describe('Board: a tile whose computer is missing from rows that are not a proven whole list', () => {
  const put1 = async (data: unknown, failedSince = false) => {
    const r = await renderPage(page, { state: 'flaky', path: `/board?add=terminal-3&cid=${atlas.id}` });
    await screen.findByTitle('terminal-3 on atlas');
    act(() => { for (const q of listQueries(r)) put(r, q.queryKey, data); });
    if (failedSince) {
      setListDown(true);
      await act(async () => { await r.queryClient.refetchQueries(); });
    }
  };

  it('a first page of a longer list that lacks it: Couldn\'t check, never "no longer in this realm"', async () => {
    await put1({ data: { computers: others, pagination: { totalPages: 2 } } });
    expect(await screen.findByText(/Couldn't check/)).toBeInTheDocument();
    expect(screen.queryByText(/no longer in this realm/)).toBeNull();
  });

  it('rows that listed others, then a failed read: Couldn\'t check', async () => {
    await put1({ data: { computers: others, pagination: { totalPages: 1 } } }, true);
    expect(await screen.findByText(/Couldn't check/)).toBeInTheDocument();
    expect(screen.queryByText(/no longer in this realm/)).toBeNull();
  });

  it('a whole list that lacks it: no longer in this realm', async () => {
    await put1({ data: { computers: others, pagination: { totalPages: 1 } } });
    expect(await screen.findByText(/no longer in this realm/)).toBeInTheDocument();
  });
});
