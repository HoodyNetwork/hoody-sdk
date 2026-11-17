// A page may stay loaded while the person is on another page (useKeepPage; the Board's "keep tiles
// loaded"). Kept, it is hidden with its DOM and state (a program frame never reloads), its effects and keys stop, it
// reads the location it last had and navigates nowhere; a page that does not ask unloads on leave, as before.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createContext, type ReactElement, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useGo, useSearchParam, useSubPath } from '@kit/nav';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';
import { focusPage } from './AskDock';
import { frameOwnsKeys, overlayOpen } from './keygate';
import { pageTitle } from '../kit/overlays/shared';
import kitStrings from '../kit/strings.en.json';
import { useKeepPage, usePageShown } from './pageHost';
import { usePageShortcuts } from './pageShortcuts';

const Tick = createContext(0);
let keepIt = true;
let goLater: ((to: string) => void) | null = null;
let setTabLater: ((v: string) => void) | null = null;
let effects = { mounts: 0, cleanups: 0 };
let pressed = 0;
let subs: string[] = [];

function Board() {
  useKeepPage(keepIt);
  const shown = usePageShown();
  const sub = useSubPath('/board');
  const tick = useContext(Tick);
  const go = useGo();
  const [, setTab] = useSearchParam('tab');
  const [bad] = useSearchParam('bad');
  const [count, setCount] = useState(0);
  const [dialog, setDialog] = useState(false);
  subs.push(sub.join('/'));
  if (bad === '1') throw new Error('the board failed');
  useEffect(() => {
    goLater = go;
    setTabLater = (v) => setTab(v);
  }, [go, setTab]);
  useEffect(() => {
    effects.mounts += 1;
    return () => {
      effects.cleanups += 1;
    };
  }, []);
  usePageShortcuts([{ key: 'x', label: 'Close tile', run: () => (pressed += 1) }]);
  return (
    <div>
      <h1 data-hub-title tabIndex={-1}>
        Board
      </h1>
      <iframe title="tile" />
      {sub[0] === 'open' ? <iframe title="program" /> : null}
      <input data-hub-search aria-label="Board search" />
      <p data-testid="board-state">{`sub=${sub.join('/') || '-'} tick=${tick} shown=${shown}`}</p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>{`count ${count}`}</button>
      <button type="button" onClick={() => setDialog(true)}>
        open dialog
      </button>
      {dialog &&
        createPortal(
          <div role="dialog" aria-label="Board dialog">
            <button type="button">inside</button>
          </div>,
          document.body,
        )}
    </div>
  );
}

function Home() {
  return (
    <>
      <h1 data-hub-title tabIndex={-1}>
        Home
      </h1>
      <input data-hub-search aria-label="Home search" />
    </>
  );
}

function Intro() {
  return (
    <h1 data-hub-title tabIndex={-1}>
      Intro
    </h1>
  );
}

const strings = { title: 'Page' } as const;
const page = (id: string, component: () => ReactElement, layout: PageManifest['layout']): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout, load: async () => ({ default: component }), status: 'ready', sensitive: false, strings });
// The Board comes before Home, so its slot sits before Home's in the content area; Intro comes before both.
const PAGES = [page('intro', Intro, 'settings'), page('board', Board, 'canvas'), page('home', Home, 'settings')];

let bump: () => void = () => undefined;
function Frame({ children }: { children: ReactElement }) {
  const [tick, setTick] = useState(0);
  bump = () => setTick((t) => t + 1);
  return <Tick value={tick}>{children}</Tick>;
}

async function open(path: string, shell = false) {
  const router = buildRouter(PAGES, { queryClient: new QueryClient(), shell, history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Frame>
          <RouterProvider router={router} />
        </Frame>
      </QueryClientProvider>,
    );
    await router.load();
  });
  await screen.findByRole('heading', { level: 1 });
  const go = async (href: string) => {
    await act(async () => {
      await router.navigate({ href } as never);
    });
  };
  return { router, go };
}

const frame = () => document.querySelector('iframe[title="tile"]');
const slot = (id: string) => document.querySelector(`[data-hub-page="${id}"]`);
const nextFrame = () =>
  act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  });
const key = (k: string) =>
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });

beforeEach(() => {
  keepIt = true;
  goLater = null;
  setTabLater = null;
  effects = { mounts: 0, cleanups: 0 };
  pressed = 0;
  subs = [];
});
afterEach(() => {
  // Unmount first: a portal the Board opened lives in body.
  cleanup();
  document.body.innerHTML = '';
});

describe('pages kept loaded (useKeepPage)', () => {
  it('a page that does not ask unloads when the person leaves, as before', async () => {
    keepIt = false;
    const { go } = await open('/board/main');
    const first = frame();
    expect(first).not.toBeNull();
    await go('/home');
    await screen.findByRole('heading', { name: 'Home' });
    expect(frame()).toBeNull();
    expect(slot('board')).toBeNull();
    await go('/board/main');
    await screen.findByRole('heading', { name: 'Board' });
    expect(frame()).not.toBe(first);
  });

  it('a kept page keeps its frame and state, hidden, while another page shows, and shows them again', async () => {
    const { go } = await open('/board/main');
    fireEvent.click(screen.getByRole('button', { name: 'count 0' }));
    const first = frame();
    await go('/home');
    await screen.findByRole('heading', { name: 'Home' });
    expect(frame()).toBe(first);
    expect(slot('board')).toHaveAttribute('data-hub-page-hidden');
    expect(first).not.toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Board' })).toBeNull();
    await go('/board/main');
    expect(frame()).toBe(first);
    expect(first).toBeVisible();
    expect(slot('board')).not.toHaveAttribute('data-hub-page-hidden');
    expect(screen.getByRole('button', { name: 'count 1' })).toBeInTheDocument();
  });

  it('while hidden its effects stop and its keys are off; shown again they are back', async () => {
    const { go } = await open('/board/main');
    expect(effects).toEqual({ mounts: 1, cleanups: 0 });
    key('x');
    expect(pressed).toBe(1);
    await go('/home');
    expect(effects).toEqual({ mounts: 1, cleanups: 1 });
    key('x');
    expect(pressed).toBe(1);
    await go('/board/main');
    expect(effects).toEqual({ mounts: 2, cleanups: 1 });
    key('x');
    expect(pressed).toBe(2);
  });

  it('while hidden it reads the location it last had: a re-render meanwhile never sees the other page\'s path', async () => {
    const { go } = await open('/board/main');
    await go('/home');
    act(() => bump());
    expect(screen.getByTestId('board-state')).toHaveTextContent('sub=main tick=1 shown=false');
    await go('/board/second');
    expect(screen.getByTestId('board-state')).toHaveTextContent('sub=second tick=1 shown=true');
  });

  it('a navigation it makes while hidden goes nowhere: neither a move nor a search change', async () => {
    const { router, go } = await open('/board/main');
    const later = goLater;
    const setTab = setTabLater;
    await go('/home');
    await act(async () => {
      later?.('/board/elsewhere');
      setTab?.('pinned');
    });
    expect(router.state.location.pathname).toBe('/home');
    expect(router.state.location.search).toEqual({});
  });

  it('leaving, it never renders the next page\'s path: a view chosen by sub-path keeps its frame through the move', async () => {
    const { go } = await open('/board/open/demo');
    const program = document.querySelector('iframe[title="program"]');
    expect(program).not.toBeNull();
    subs = [];
    await go('/home');
    await screen.findByRole('heading', { name: 'Home' });
    expect(document.querySelector('iframe[title="program"]')).toBe(program);
    await go('/board/open/demo');
    expect(document.querySelector('iframe[title="program"]')).toBe(program);
    expect(subs.filter((x) => x !== 'open/demo')).toEqual([]);
  });

  it('a page that failed renders again after a search-only move (as the router\'s own boundary did), without remounting a healthy one', async () => {
    keepIt = false;
    const { go } = await open('/home');
    await go('/board/main?bad=1');
    expect(await screen.findByText(kitStrings['page.loadError'])).toBeInTheDocument();
    await go('/board/main?bad=0');
    expect(await screen.findByRole('heading', { name: 'Board' })).toBeInTheDocument();
    const mounts = effects.mounts;
    await go('/board/main?bad=0&tab=x');
    expect(effects.mounts).toBe(mounts);
  });

  it('a page that does not ask to be kept keeps today\'s navigation: a go captured before it unloaded still moves', async () => {
    keepIt = false;
    const { router, go } = await open('/board/main');
    const later = goLater;
    await go('/home');
    await screen.findByRole('heading', { name: 'Home' });
    await act(async () => {
      later?.('/board/elsewhere');
    });
    expect(router.state.location.pathname).toBe('/board/elsewhere');
  });

  it('the overlay fallback title is the shown page\'s, not a kept page\'s before it', async () => {
    const { go } = await open('/board/main', true);
    await go('/home');
    expect(pageTitle()).toBe(screen.getByRole('heading', { name: 'Home' }));
  });

  it('slots keep the page order: a page before the kept one shows before it, and the kept page never moves', async () => {
    const { go } = await open('/board/main');
    const first = frame();
    await go('/intro');
    await screen.findByRole('heading', { name: 'Intro' });
    expect(Array.from(document.querySelectorAll('[data-hub-page]')).map((el) => el.getAttribute('data-hub-page'))).toEqual(['intro', 'board']);
    await go('/home');
    expect(Array.from(document.querySelectorAll('[data-hub-page]')).map((el) => el.getAttribute('data-hub-page'))).toEqual(['board', 'home']);
    expect(frame()).toBe(first);
  });

  it('in the shell, leaving with focus inside the kept page, the shown page\'s title gets focus', async () => {
    const { go } = await open('/board/main', true);
    act(() => screen.getByRole('button', { name: 'count 0' }).focus());
    await go('/home');
    // Hidden, the kept page let go of focus at once (no frame later).
    expect(slot('board')?.contains(document.activeElement)).toBe(false);
    await nextFrame();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Home' }));
  });

  it('in the shell, a kept page\'s frame and open dialog never hold the keys while it is hidden', async () => {
    const { go } = await open('/board/main', true);
    fireEvent.click(screen.getByRole('button', { name: 'open dialog' }));
    act(() => (frame() as HTMLElement).focus());
    await go('/home');
    await nextFrame();
    expect(overlayOpen()).toBe(false);
    expect(frameOwnsKeys(frame())).toBe(false);
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    key('/');
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Home search' }));
  });

  it('turned off while shown, it unloads when the person leaves', async () => {
    const { go } = await open('/board/main');
    keepIt = false;
    act(() => bump());
    await go('/home');
    await screen.findByRole('heading', { name: 'Home' });
    expect(frame()).toBeNull();
  });

  it('in the shell, a route change focuses the shown page\'s title, not the kept page\'s before it', async () => {
    const { go } = await open('/board/main', true);
    await go('/home');
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Home' }));
    expect(slot('board')).toHaveAttribute('data-hub-page-hidden');
  });

  it('in the shell, "/" and the Ask dock\'s return to the page reach the shown page, not the kept page before it', async () => {
    const { go } = await open('/board/main', true);
    await go('/home');
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    key('/');
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Home search' }));
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    act(() => focusPage());
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Home' }));
  });
});
