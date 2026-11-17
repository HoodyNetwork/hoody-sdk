// Vitest: "Put on Board" on the Apps list (a running app's row must offer more than "Open display" in a new tab,
// and the Board could not be found from it). Every running launch with a place offers Put on Board (the Board's own
// link for that place, board links boardAddPath) beside its new-tab link; the place is the one the launcher would place
// right away (placementOf(...).now; the launcher's other choices, such as a held Open's terminal, are its own); a place the Board refuses (tileHostFits) says why and keeps the new tab.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type * as Kit from '@kit';
import type { RunOpen } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as BoardLinks from '../board/links';
import type * as Data from './data';

const S = vi.hoisted(() => ({
  /** Whether the Board can address a tile (undefined: the Board's real rule). */
  fits: undefined as boolean | undefined,
  /** What the list asked the Board for: [computer, placement] per call. */
  asked: [] as [string, unknown][],
  went: [] as string[],
  /** The Board's own link builder instead of the recording one ('real'), or one refusing every place ('none'). */
  add: undefined as 'real' | 'none' | undefined,
  /** The Board page's link as the shell gives it (undefined: the real one). */
  boardLink: undefined as Kit.PageLink | null | undefined,
}));
const CID = 'b'.repeat(24);
const PID = 'a'.repeat(24);

vi.mock('./data', async (orig) => ({ ...(await orig<typeof Data>()), LIVE: true }));
vi.mock('../board/links', async (orig) => {
  const real = await orig<typeof BoardLinks>();
  return {
    ...real,
    tileHostFits: (...a: Parameters<typeof real.tileHostFits>) => S.fits ?? real.tileHostFits(...a),
    boardAddPath: (t: Core.Target, at: Parameters<typeof real.boardAddPath>[1]) => {
      if (S.add === 'real') return real.boardAddPath(t, at);
      if (S.add === 'none') return '';
      S.asked.push([t.container.id, at]);
      return `/board?add=test-${S.asked.length}`;
    },
  };
});
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return {
    ...real,
    useGo: () => (to: string) => void S.went.push(to),
    usePageLink: (id: string) => (id === 'board' && S.boardLink !== undefined ? S.boardLink : real.usePageLink(id)),
  };
});
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const { useEffect, useState } = await import('react');
  const t = { project: { id: 'a'.repeat(24) }, container: { id: 'b'.repeat(24), server_name: 'n1' } };
  const never = () => new Promise(() => {});
  const machine = { open: never, status: never, close: never, watch: never } as unknown as RunOpen;
  return {
    ...real,
    useCurrentComputer: () => t,
    useRunOpen: () => {
      const [m, setM] = useState<RunOpen | null>(null);
      useEffect(() => setM(machine), []);
      return m;
    },
  };
});

const { harness: page } = await import('./launch/harness');
const { default: strings } = await import('./strings.en.json');
const { ops } = await import('./parts/ops');
const { fromHandle } = await import('./parts/recent');

const SCREEN = `https://${PID}-${CID}-display-15001.n1.example`;
const TERM = `https://${PID}-${CID}-t-15001.n1.example`;

/** A launch listed and bound to its run, as live reads leave it. */
function launch(key: string, name: string, opensIn: 'screen' | 'terminal' | 'web', state = 'running', web?: { port: number; path: string }, code = '', urls: { screen?: string; terminal?: string } = { screen: SCREEN, terminal: TERM }) {
  const tag = [...key].map((c) => c.charCodeAt(0).toString(16)).join('').padEnd(16, '0').slice(0, 16);
  const row = fromHandle(
    { v: 1, terminal_id: 15001, incarnation: 'c'.repeat(32), command_id: 7, display: 15001, launch_tag: tag, opens_in: opensIn === 'screen' ? ('window' as never) : opensIn, computer: { project: PID, computer_id: CID }, ...(web ? { web } : {}) },
    { name, catalogId: name, app: name },
    1,
  )!;
  ops.addLaunch({ key, name, catalogId: name, app: name, opensIn, state: state as 'running', code, terminal: 15001, handle: tag, source: '', command: '', settings: [], urls, startedAt: 1, computer: CID });
  ops.bind(key, row);
}

async function rowOf(name: RegExp) {
  const table = await screen.findByRole('table', { name: strings['tab.open'] });
  return within(table).findByRole('row', { name });
}

beforeEach(() => {
  ops.reset();
  S.fits = undefined;
  S.asked.length = 0;
  S.went.length = 0;
  S.boardLink = undefined;
  S.add = undefined;
});

describe('Put on Board on the Apps list (every running program offers the Board)', () => {
  it("a running screen app's details offer Put on Board for its display, beside Open display in a new tab", async () => {
    launch('k1', 'firefox', 'screen');
    await renderPage(page, { path: '/apps?appsel=k1' });
    const put = await screen.findByRole('link', { name: strings['act.board'] });
    // An in-app link (hash routing): the Board's own page, never a new tab.
    expect(put.getAttribute('href')).toMatch(/^#\/board\?add=test-\d+$/);
    expect(put).not.toHaveAttribute('target', '_blank');
    expect(S.asked).toContainEqual([CID, { kind: 'display', session: 15001 }]);
    expect(screen.getAllByRole('link', { name: new RegExp(strings['act.screen']) }).some((l) => l.getAttribute('href') === SCREEN)).toBe(true);
  });

  it("with the Board's own link builder the link names the place and the computer by its id", async () => {
    S.add = 'real';
    launch('k1', 'firefox', 'screen');
    launch('k2', 'jupyter', 'web', 'running', { port: 8888, path: '/lab' });
    await renderPage(page, { path: '/apps?appsel=k1' });
    expect((await screen.findByRole('link', { name: strings['act.board'] })).getAttribute('href')).toBe(`#/board?add=display-15001&cid=${CID}`);
    await userEvent.click(within(await rowOf(/jupyter/)).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['act.board'] }));
    await waitFor(() => expect(S.went).toEqual([`/board?add=port-8888&cid=${CID}&path=%2Flab`]));
  });

  it('a place the Board cannot link offers no Put on Board', async () => {
    S.add = 'none';
    launch('k1', 'firefox', 'screen');
    await renderPage(page, { path: '/apps?appsel=k1' });
    await screen.findAllByRole('link', { name: new RegExp(strings['act.screen']) });
    expect(screen.queryByRole('link', { name: strings['act.board'] })).toBeNull();
    await userEvent.click(within(await rowOf(/firefox/)).getByRole('button', { name: 'Row actions' }));
    expect(screen.queryByRole('menuitem', { name: new RegExp(strings['act.board']) })).toBeNull();
  });

  it("the row's menu puts it on the Board in one step", async () => {
    launch('k1', 'firefox', 'screen');
    await renderPage(page, { path: '/apps' });
    await userEvent.click(within(await rowOf(/firefox/)).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['act.board'] }));
    await waitFor(() => expect(S.went).toHaveLength(1));
    expect(S.went[0]).toMatch(/^\/board\?add=test-\d+$/);
  });

  it('a terminal app goes on as its terminal, a web app with a port as its port', async () => {
    launch('k1', 'htop', 'terminal');
    launch('k2', 'jupyter', 'web', 'running', { port: 8888, path: '/lab' });
    await renderPage(page, { path: '/apps?appsel=k2' });
    await screen.findByRole('link', { name: strings['act.board'] });
    expect(S.asked).toContainEqual([CID, { kind: 'terminal', session: 15001 }]);
    expect(S.asked).toContainEqual([CID, { kind: 'port', port: 8888, path: '/lab' }]);
  });

  it('a place the Board refuses says why, offers no Board link, and keeps the new tab', async () => {
    S.fits = false;
    launch('k1', 'firefox', 'screen');
    await renderPage(page, { path: '/apps?appsel=k1' });
    expect(await screen.findByText(strings['launcher.noTile'].replace('{{name}}', 'firefox'))).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: strings['act.board'] })).toBeNull();
    expect(screen.getAllByRole('link', { name: new RegExp(strings['act.screen']) }).some((l) => l.getAttribute('href') === SCREEN)).toBe(true);
    await userEvent.click(within(await rowOf(/firefox/)).getByRole('button', { name: 'Row actions' }));
    const item = await screen.findByRole('menuitem', { name: new RegExp(strings['act.board']) });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(within(item).getByText(strings['board.cantTile'])).toBeInTheDocument();
    // The header's Open display is the new-tab link: no second one beside the note.
    expect(screen.queryByRole('link', { name: strings['launcher.openTab'] })).toBeNull();
  });

  // A starting, checking or unconfirmed launch has Check or nothing in the header: the note brings its own new-tab link.
  it.each([
    ['starting', 'screen', 'starting', '', SCREEN, 'launcher.noTile'],
    ['checking', 'screen', 'unknown', 'checking', SCREEN, 'launcher.noTile'],
    ['an unconfirmed Open', 'screen', 'unknown', 'start_unconfirmed', SCREEN, 'launcher.noTile'],
    ['an unconfirmed web Open (its terminal)', 'web', 'unknown', 'start_unconfirmed', TERM, 'launcher.noTileTerminal'],
    ['a starting terminal app', 'terminal', 'starting', '', TERM, 'launcher.noTile'],
  ] as const)('a refused place of %s says why and offers its own new-tab link', async (_what, opensIn, state, code, url, words) => {
    S.fits = false;
    launch('k1', 'myapp', opensIn, state, undefined, code);
    await renderPage(page, { path: '/apps?appsel=k1' });
    expect(await screen.findByText(strings[words].replace('{{name}}', 'myapp'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: strings['launcher.openTab'] })).toHaveAttribute('href', url);
    expect(screen.queryByRole('link', { name: strings['act.board'] })).toBeNull();
  });

  // The header's link opens another place (Open terminal on a started or lost screen app): the refused display still
  // gets its own new-tab link, to its screen.
  it.each([
    ['started', 'started', ''],
    ['whose tracker was lost', 'unknown', 'tracker_lost'],
    ['opened by another user', 'unknown', 'other_user'],
  ] as const)('a refused display of a screen app %s keeps its own screen link beside the header terminal', async (_what, state, code) => {
    S.fits = false;
    launch('k1', 'myapp', 'screen', state, undefined, code);
    await renderPage(page, { path: '/apps?appsel=k1' });
    expect(await screen.findByText(strings['launcher.noTile'].replace('{{name}}', 'myapp'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: strings['launcher.openTab'] })).toHaveAttribute('href', SCREEN);
  });

  // No address for the refused place: the note says why, and promises no new tab it cannot give.
  it.each([
    ['display', 'screen', 'starting', '', { terminal: TERM }, 'board.noTileBare'],
    ['terminal', 'terminal', 'starting', '', { screen: SCREEN }, 'board.noTileBare'],
    ['web app\'s terminal', 'web', 'unknown', 'start_unconfirmed', { screen: SCREEN }, 'board.noTileTerminalBare'],
  ] as const)('a refused %s with no address says why without offering a new tab', async (_what, opensIn, state, code, urls, words) => {
    S.fits = false;
    launch('k1', 'myapp', opensIn, state, undefined, code, urls);
    await renderPage(page, { path: '/apps?appsel=k1' });
    expect(await screen.findByText(strings[words].replace('{{name}}', 'myapp'))).toBeInTheDocument();
    for (const k of ['launcher.noTile', 'launcher.noTileTerminal'] as const) expect(screen.queryByText(strings[k].replace('{{name}}', 'myapp'))).toBeNull();
    expect(screen.queryByRole('link', { name: strings['launcher.openTab'] })).toBeNull();
  });

  it('where this Hub does not serve the Board (no link), no Put on Board shows', async () => {
    for (const link of [null] as (Kit.PageLink | null)[]) {
      S.boardLink = link;
      launch('k1', 'firefox', 'screen');
      const { unmount } = await renderPage(page, { path: '/apps?appsel=k1' });
      await screen.findAllByRole('link', { name: new RegExp(strings['act.screen']) });
      expect(screen.queryByRole('link', { name: strings['act.board'] })).toBeNull();
      expect(S.asked).toHaveLength(0);
      unmount();
      ops.reset();
    }
  });

  it('a launch with no place (it never started) offers no Put on Board anywhere', async () => {
    launch('k1', 'firefox', 'screen', 'not_started');
    await renderPage(page, { path: '/apps?appsel=k1' });
    await screen.findByRole('table', { name: strings['tab.open'] });
    expect(screen.queryByRole('link', { name: strings['act.board'] })).toBeNull();
    await userEvent.click(within(await rowOf(/firefox/)).getByRole('button', { name: 'Row actions' }));
    expect(screen.queryByRole('menuitem', { name: new RegExp(strings['act.board']) })).toBeNull();
    expect(S.went).toHaveLength(0);
  });
});
