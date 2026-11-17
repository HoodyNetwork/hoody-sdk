// Vitest: a new terminal goes on the Board it was asked from. The welcome's Open a terminal and a "new terminal" Add
// link wait for the computer's live sessions before they place the tile; when another Board is chosen while that read
// is out, neither Board gets the terminal and a notice says so. A link that names a Board (`b`) puts it there.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { setTarget } from '@core/ctx';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { createBoard, freshRealm, isRefusal, type RealmBoards } from './model/boards';
import { toStored } from './model/persist';
import type * as AddNew from './addNew';
import type { TermSession } from './termSessions';
import { resetFixtureSessions, setListDown } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const S = strings as Record<string, string>;
const toasts: Array<{ title: string }> = [];
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string }) => { toasts.push(c); return 'toast-1'; } }));
// Live reads the test answers by hand.
type Read = { signal: AbortSignal; answer: (rows: readonly TermSession[] | null) => void };
const H = vi.hoisted(() => ({ reads: [] as Read[] }));
vi.mock('./addNew', async (orig) => {
  const real = await orig<typeof AddNew>();
  return {
    ...real,
    readLiveFor: (...a: Parameters<typeof real.readLiveFor>) => new Promise<readonly TermSession[] | null>((answer) => { H.reads.push({ signal: a[1], answer }); }),
  };
});

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const stored = async () => (await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards | null;
const terminalsOn = async () => Object.fromEntries(((await stored())?.boards ?? []).map((b) => [b.name || 'first', Object.values(b.tiles).filter((x) => !!x && 'program' in x && x.program === 'terminal').length]));

// The fixture world starts on atlas; chosen again after the page is drawn, as the top bar would.
const chooseAtlas = () => act(() => { setTarget({ project: { id: atlas.project_id }, container: { id: atlas.id } }); });

// Two empty Boards, the first one active: Main and Two.
async function twoBoards(): Promise<{ first: string; two: string }> {
  let n = 0;
  const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
  const made = createBoard(freshRealm(rand), rand, 'Two');
  if (isRefusal(made)) throw new Error('refused');
  const s: RealmBoards = { ...made, active: made.boards[0]!.id };
  await act(async () => {
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'false'));
  await chooseAtlas();
  return { first: made.boards[0]!.id, two: made.boards[1]!.id };
}

beforeEach(() => {
  resetFixtureSessions();
  setListDown(false);
  resetBoardsForTests();
  toasts.length = 0;
  H.reads.length = 0;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});
afterEach(() => {
  setTarget(null);
  vi.restoreAllMocks();
});

describe('Board: a new terminal goes on the Board it was asked from', () => {
  it('Open a terminal on the first Board, then Two chosen before the live read answers: no Board gets it, and a notice says so', async () => {
    const user = userEvent.setup();
    await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    await twoBoards();
    const slot = await screen.findByRole('group', { name: S['empty.chip'] });
    await user.click(await within(slot).findByRole('button', { name: new RegExp(S['empty.terminal']!) }));
    await waitFor(() => expect(H.reads).toHaveLength(1));
    await user.click(screen.getByRole('tab', { name: 'Two' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true'));
    await act(async () => { H.reads[0]!.answer([]); });
    await waitFor(() => expect(toasts.map((x) => x.title)).toEqual([S['add.moved']]));
    await cryptIdleForTests();
    expect(await terminalsOn()).toEqual({ first: 0, Two: 0 });
    expect(screen.queryByTitle(/^terminal-\d+ on atlas$/)).toBeNull();
    // Two stays the Board shown.
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true');
  });

  it('a "new terminal" Add link with no Board named: the Board active when its read starts, or none', async () => {
    const user = userEvent.setup();
    const r = await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    await twoBoards();
    await act(() => r.router.navigate({ href: `/board?add=terminal-new&cid=${atlas.id}` } as never));
    await waitFor(() => expect(H.reads).toHaveLength(1));
    await user.click(screen.getByRole('tab', { name: 'Two' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true'));
    await act(async () => { H.reads[0]!.answer([]); });
    await waitFor(() => expect(toasts.map((x) => x.title)).toEqual([S['add.moved']]));
    await cryptIdleForTests();
    expect(await terminalsOn()).toEqual({ first: 0, Two: 0 });
  });

  it('a link naming Two (b) puts the terminal on Two', async () => {
    const r = await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    const { two } = await twoBoards();
    await act(() => r.router.navigate({ href: `/board?add=terminal-new&cid=${atlas.id}&b=${two}` } as never));
    await waitFor(() => expect(H.reads).toHaveLength(1));
    await act(async () => { H.reads[0]!.answer([]); });
    expect(await screen.findByTitle(/^terminal-\d+ on atlas$/)).toBeInTheDocument();
    await waitFor(async () => expect(await terminalsOn()).toEqual({ first: 0, Two: 1 }));
    expect(toasts).toEqual([]);
  });
});
