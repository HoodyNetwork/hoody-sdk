// A kept Board shown again for an Add link, then left with Back, must not take that link a
// second time. Drawn a step behind, the page host gives the Board its own last location while the route has already
// popped to the page before (the Add link's entry): the link the Board took for that entry must stay taken, or its
// address drop (a replace to /board) lands on the page the person went back to. The same link pushed again is a new
// entry and is taken again. Here beside the page host, whose hold it drives (as realmParam.keys.test does for Keys).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, type ParsedLocation, RouterProvider, useRouterState } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { type ReactElement, useContext, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageNavHoldContext, type PageNavHold } from '@kit/nav';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';
import { useKeepPage } from './pageHost';
import boardStrings from '../pages/board/strings.en.json';
import { TAKEN_KEEP, useAddLinks } from '../pages/board/parts/BoardView';

// A history that gives no entry key: useLocationEntry reads '' and the Board falls back to today's rule.
const K = vi.hoisted(() => ({ none: false }));
vi.mock('@kit/nav', async (orig) => {
  const m = await orig<{ useLocationEntry: () => string }>();
  return { ...m, useLocationEntry: () => { const e = m.useLocationEntry(); return K.none ? '' : e; } };
});

const taken: number[] = [];
// The transition the browser showed: the route has popped to the folder, the host still draws the Board
// as shown (hidden() false) and gives it its own last location, the Add link's entry. `stale` puts the Board there.
const T = { stale: false, link: null as ParsedLocation | null, links: [] as ParsedLocation[], bump: () => undefined as void };
const keyOf = (l: ParsedLocation) => (l.state as { __TSR_key?: string }).__TSR_key;

function Board() {
  useKeepPage(true);
  // Draws the Board again with nothing else changed (the test's way to show it a changed hold).
  const [, setDraw] = useState(0);
  T.bump = () => setDraw((n) => n + 1);
  const host = useContext(PageNavHoldContext);
  const live = useRouterState({ select: (x) => x.location });
  if (live.search && (live.search as Record<string, string>).add && !T.stale) {
    T.link = live;
    if (!T.links.some((l) => keyOf(l) === keyOf(live))) T.links.push(live);
  }
  const hold: PageNavHold | null = T.stale && T.link && host ? { location: T.link, owns: () => false, hidden: () => false } : host;
  return <PageNavHoldContext value={hold}><Adds /></PageNavHoldContext>;
}
function Adds() {
  const adds = useAddLinks();
  const last = adds.queue.at(-1)?.n;
  if (last !== undefined && !taken.includes(last)) taken.push(last);
  return <h1 data-hub-title tabIndex={-1}>Board</h1>;
}
function Files() {
  return <h1 data-hub-title tabIndex={-1}>Files</h1>;
}

const page = (id: string, component: () => ReactElement, strings: Record<string, string>): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout: 'settings', load: async () => ({ default: component }), status: 'ready', sensitive: false, strings });
const PAGES = [page('board', Board, boardStrings as Record<string, string>), page('files', Files, { title: 'Files' })];
const ADD = '/board?add=terminal-8001&cid=c0a7150000000000000000a1&for=ow%3Anano&label=Nano';
const FOLDER = '/files?ap=%2Fsrv%2Fapp';
const router = (r: { router: unknown }) => r.router as { history: { back: () => void; forward: () => void } };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const shownTitle = () => document.querySelector('[data-hub-page]:not([data-hub-page-hidden]) h1')?.textContent;

async function open(path: string) {
  const router = buildRouter(PAGES, { queryClient: new QueryClient(), shell: false, history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  await screen.findByRole('heading', { level: 1 });
  const settle = async () => { await act(async () => { await tick(20); }); };
  const go = async (href: string) => { await act(async () => { await router.navigate({ href } as never); }); await settle(); };
  const back = async () => { await act(async () => { router.history.back(); await tick(0); }); await settle(); };
  const at = () => `${router.state.location.pathname}${router.state.location.searchStr}`;
  return { router, go, back, at, settle };
}

afterEach(() => {
  K.none = false;
  T.stale = false;
  T.link = null;
  T.links = [];
  T.bump = () => undefined;
  cleanup();
  document.body.innerHTML = '';
  taken.length = 0;
});

describe('an Add link on a kept Board is taken once per history entry', () => {
  it('Back after each of two visits returns to the folder; each push of the link is taken once', async () => {
    const r = await open(FOLDER);
    for (let visit = 1; visit <= 3; visit++) {
      await r.go(ADD);
      expect(r.at()).toBe('/board');
      expect(shownTitle()).toBe('Board');
      expect(taken).toHaveLength(visit);
      await r.back();
      // Settled: the route stays on the folder and the history entry before it is still the folder's.
      await act(async () => { await tick(200); });
      expect(r.at()).toBe(FOLDER);
      expect(shownTitle()).toBe('Files');
      expect(taken).toHaveLength(visit);
    }
  });

  it('the same link pushed again while the Board is shown is a new entry and is taken again', async () => {
    const r = await open(FOLDER);
    await r.go(ADD);
    await r.go(ADD);
    expect(r.at()).toBe('/board');
    expect(taken).toHaveLength(2);
  });

  it('the Board drawn shown on its own last location (the taken entry) while the route popped away takes nothing', async () => {
    const r = await open(FOLDER);
    await r.go(ADD);
    expect(taken).toHaveLength(1);
    await r.back();
    await r.go(ADD);
    expect(r.at()).toBe('/board');
    expect(taken).toHaveLength(2);
    // Back: the route is on the folder before the host draws the switch; the Board re-renders on its own last location.
    await act(async () => { T.stale = true; router(r).history.back(); await tick(0); });
    await act(async () => { await tick(200); });
    expect(r.at()).toBe(FOLDER);
    expect(taken).toHaveLength(2);
    // Forward onto the entry the link was in: the Board replaced it with /board, so it holds no link and adds nothing.
    T.stale = false;
    await act(async () => { router(r).history.forward(); await tick(0); });
    await act(async () => { await tick(200); });
    expect(r.at()).toBe('/board');
    expect(shownTitle()).toBe('Board');
    expect(taken).toHaveLength(2);
    // And Back again still reaches the folder.
    await r.back();
    await act(async () => { await tick(200); });
    expect(r.at()).toBe(FOLDER);
    expect(taken).toHaveLength(2);
  });
});

describe('older locations the page host may still hold', () => {
  it('an older taken entry, held after a newer one was taken, adds nothing and navigates nowhere', async () => {
    const r = await open(FOLDER);
    await r.go(ADD);
    await r.go(ADD);
    expect(taken).toHaveLength(2);
    expect(T.links).toHaveLength(2);
    await r.back();
    await r.back();
    expect(r.at()).toBe(FOLDER);
    // Forward: the Board shows again (its entry was replaced with /board); then Back, with the host still drawing it
    // shown on the first link's entry (not the last one taken).
    await act(async () => { router(r).history.forward(); await tick(0); });
    await r.settle();
    expect(r.at()).toBe('/board');
    T.link = T.links[0]!;
    await act(async () => { T.stale = true; router(r).history.back(); await tick(0); });
    await act(async () => { await tick(200); });
    expect(r.at()).toBe(FOLDER);
    expect(taken).toHaveLength(2);
  });

  it(`the bound keeps the newest ${TAKEN_KEEP} links: after more than that, the link still current is never taken again`, async () => {
    const r = await open(FOLDER);
    for (let i = 0; i < TAKEN_KEEP + 1; i++) await r.go(ADD);
    expect(taken).toHaveLength(TAKEN_KEEP + 1);
    await r.back();
    T.link = T.links.at(-1)!;
    await act(async () => { T.stale = true; router(r).history.back(); await tick(0); });
    await act(async () => { await tick(200); });
    // Nothing taken again (taking it would queue a tile and replace the entry with /board).
    expect(taken).toHaveLength(TAKEN_KEEP + 1);
  });
});

describe('a new entry is a new link, even with every Add value the same', () => {
  it('the Board shown on the same link values under a new entry key, with no address between, takes it again', async () => {
    const r = await open(FOLDER);
    await r.go(ADD);
    expect(r.at()).toBe('/board');
    expect(taken).toHaveLength(1);
    // Shown, the Board is drawn on the link's own entry: already taken, nothing happens.
    T.stale = true;
    await act(async () => { T.bump(); await tick(0); });
    await r.settle();
    expect(taken).toHaveLength(1);
    // Then on the same values under another entry key, with no location without a link in between: only the key
    // changed, and it is a new link.
    T.link = { ...T.link!, state: { ...(T.link!.state as object), __TSR_key: 'a-new-entry' } } as ParsedLocation;
    await act(async () => { T.bump(); await tick(0); });
    await r.settle();
    expect(taken).toHaveLength(2);
  });
});

describe("with no entry key the Board keeps today's rule: a link is never swallowed", () => {
  it('the same link pushed again while the Board is shown is taken again', async () => {
    K.none = true;
    const r = await open(FOLDER);
    await r.go(ADD);
    await r.go(ADD);
    await r.go(ADD);
    expect(r.at()).toBe('/board');
    expect(taken).toHaveLength(3);
  });

  it('each visit after Back takes its link once and Back returns to the folder', async () => {
    K.none = true;
    const r = await open(FOLDER);
    for (let visit = 1; visit <= 2; visit++) {
      await r.go(ADD);
      expect(taken).toHaveLength(visit);
      await r.back();
      await act(async () => { await tick(200); });
      expect(r.at()).toBe(FOLDER);
    }
  });
});
