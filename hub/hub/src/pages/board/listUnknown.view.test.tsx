// Vitest: a program link and a saved tile never call a computer missing from a list that is not known. A failed
// first read, or the empty list an earlier read left with the last read failed, says the computers could not be read
// (Try again); "doesn't match a computer here" and "no longer in this realm" come only from a read that answered.
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { fixtureWorld } from '@core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Catalog } from './embed/catalog';
import catalog from './embed/catalog.ui.json';
import type { BoardComputer } from './computers';
import { resetBoardsForTests } from './data';
import { setListDown } from './fixtures';
import page from './page';
import { infoFor, type InfoCtx, type RealmCtx } from './parts/tileInfo';
import strings from './strings.en.json';

const S = strings as Record<string, string>;
const t = (k: string, v: Record<string, unknown> = {}) => (S[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(v[x]));
const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const handle = `atlas.${atlas.id.slice(-4)}`;

beforeEach(() => { resetBoardsForTests(); });
afterEach(() => { setListDown(false); });

describe('program view: a computer list that is not known', () => {
  it('a failed first read: could not be read with Try again, never "doesn\'t match a computer here"', async () => {
    await renderPage(page, { state: 'failed', path: `/board/open/${handle}/terminal-1` });
    expect(await screen.findByText('The computers could not be read.')).toBeInTheDocument();
    expect(screen.queryByText(/doesn't match a computer here/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('Try again reads the list again: once it answers, the program opens', async () => {
    setListDown(true);
    await renderPage(page, { state: 'flaky', path: `/board/open/${handle}/terminal-1` });
    await screen.findByText('The computers could not be read.');
    setListDown(false);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText('The computers could not be read.')).toBeNull());
    expect(await screen.findByRole('heading', { name: /terminal-1/ })).toBeInTheDocument();
    expect(screen.queryByText(/doesn't match a computer here/)).toBeNull();
  });

  it('the empty list an earlier read left, with the last read failed: could not be read, never "doesn\'t match"', async () => {
    const r = await renderPage(page, { state: 'flaky', path: `/board/open/${handle}/terminal-1` });
    await screen.findByRole('heading', { name: /terminal-1/ });
    // The computer list read answered an empty list (as a whole list of zero would), then the next read fails.
    const lists = r.queryClient.getQueryCache().getAll().filter((q) => !!(q.state.data as { data?: { computers?: unknown } } | undefined)?.data?.computers);
    expect(lists.length).toBeGreaterThan(0);
    act(() => { for (const q of lists) r.queryClient.setQueryData(q.queryKey, { data: { computers: [] } }); });
    setListDown(true);
    await act(async () => { await r.queryClient.refetchQueries(); });
    expect(await screen.findByText('The computers could not be read.')).toBeInTheDocument();
    expect(screen.queryByText(/doesn't match a computer here/)).toBeNull();
  });
});

describe('tile state: a computer list that is not known', () => {
  const pc = (id: string, name: string, status: string) => ({ id, name, status, project_id: 'p1', server_name: 'n12', realm_ids: [] }) as unknown as BoardComputer;
  const ctx: InfoCtx = { computers: [], failed: false, cat: catalog as unknown as Catalog, domain: 'hoody.example', origin: 'https://hub.example', scheme: 'light', t };
  const one: RealmCtx = { selected: '0123456789abcdef01234567', rows: null };
  const tile = { project: 'p1', computer: 'c9', program: 'terminal' as const, session: 1 };
  it('the empty list an earlier read left, with the last read failed: unknown, not gone', () => {
    expect(infoFor('s', tile, { ...ctx, computers: [], failed: true }, one).state).toBe('unknown');
  });
  it('a read that answered without that computer: gone (an empty list, or one that lists others)', () => {
    expect(infoFor('s', tile, { ...ctx, computers: [], failed: false }, one).state).toBe('gone');
    expect(infoFor('s', tile, { ...ctx, computers: [pc('c1', 'atlas', 'running')], failed: false }, one).state).toBe('gone');
    // An earlier read that listed other computers but not this one no longer proves it gone once a later read fails.
    expect(infoFor('s', tile, { ...ctx, computers: [pc('c1', 'atlas', 'running')], failed: true }, one).state).toBe('unknown');
  });
});
