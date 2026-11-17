// The collapse control is one small button on the sidebar's edge (no whole row of its
// own), and the edge is a resize handle (kit PaneSeparator) whose width this device remembers. Dragged or keyed under
// the snap point it draws the rail; out of the rail it draws the sidebar again, never narrower than its minimum.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';
import strings from './strings.en.json';

vi.mock('../ask', () => ({
  AskPanel: () => null,
  focusAsk: () => false,
  askHasFocus: () => false,
  useAskWaiting: () => false,
  useAskActivityLabel: () => ({ activity: null, label: '' }),
}));

const KEY = 'hub.v3.pane.sidebar.w';

function setViewport(w: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  vi.stubGlobal('matchMedia', (q: string) => {
    const m = /\(width\s*(<|>=)\s*(\d+)px\)/.exec(q);
    return {
      matches: m ? (m[1] === '<' ? w < Number(m[2]) : w >= Number(m[2])) : false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    };
  });
}

const titled = (name: string) =>
  function Page(): ReactElement {
    return (
      <h1 data-hub-title tabIndex={-1}>
        {name}
      </h1>
    );
  };
const page = (id: string, name: string): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout: 'settings', load: async () => ({ default: titled(name) }), status: 'ready', sensitive: false, strings: { title: name } });

async function shell(width: number) {
  setViewport(width);
  const router = buildRouter([page('home', 'Home')], { queryClient: new QueryClient(), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await screen.findByRole('heading', { level: 1, name: 'Home' });
}

const edge = () => screen.getByRole('separator', { name: strings['nav.resize'] });
const isRail = () => !!screen.queryByRole('button', { name: strings['nav.expand'] });
/** The width the shell's grid draws the expanded sidebar at (its --sidebar-w, set on the shell element). */
const drawn = () => (edge().closest('nav')!.parentElement as HTMLElement).style.getPropertyValue('--sidebar-w');
const key = (k: string) => fireEvent.keyDown(edge(), { key: k });
/** A drag through every point of `path` (the first is where it starts), as a pointer sends its moves. */
const drag = (...path: number[]) => {
  fireEvent.pointerDown(edge(), { pointerId: 1, clientX: path[0] });
  for (const x of path.slice(1)) fireEvent.pointerMove(edge(), { pointerId: 1, clientX: x });
  fireEvent.pointerUp(edge(), { pointerId: 1, clientX: path[path.length - 1] });
};

beforeEach(() => {
  window.localStorage.clear();
  // jsdom has no pointer capture; the separator only needs the calls to exist.
  for (const m of ['setPointerCapture', 'releasePointerCapture'] as const)
    if (!(m in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, m, { configurable: true, value: () => {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('sidebar edge', () => {
  it('one collapse control, on the edge: no foot row for it; it still collapses and expands', async () => {
    await shell(1440);
    expect(screen.getAllByRole('button', { name: strings['nav.collapse'] })).toHaveLength(1);
    expect(screen.getByRole('button', { name: strings['nav.collapse'] }).closest('[class*="foot"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: strings['nav.collapse'] }));
    expect(isRail()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: strings['nav.expand'] }));
    expect(isRail()).toBe(false);
  });

  it('the collapse control works by keyboard too: Enter and Space on the button, and the [ shortcut', async () => {
    await shell(1440);
    const user = userEvent.setup();
    screen.getByRole('button', { name: strings['nav.collapse'] }).focus();
    await user.keyboard('{Enter}');
    expect(isRail()).toBe(true);
    // the same button, now Expand, keeps the focus
    expect(document.activeElement).toBe(screen.getByRole('button', { name: strings['nav.expand'] }));
    await user.keyboard(' ');
    expect(isRail()).toBe(false);
    (document.activeElement as HTMLElement | null)?.blur(); // '[[' is user-event's escape for the [ key
    await user.keyboard('[[');
    expect(isRail()).toBe(true);
    await user.keyboard('[[');
    expect(isRail()).toBe(false);
  });

  it('a remembered width wider than the window allows is drawn narrower, so the page keeps 480 px; kept for a wider window', async () => {
    window.localStorage.setItem(KEY, '360');
    await shell(800);
    // 800 is the overlay range (768-1279): the sidebar is a rail by default there, so expand it
    if (isRail()) fireEvent.click(screen.getByRole('button', { name: strings['nav.expand'] }));
    expect(drawn()).toBe('320px');
    expect(edge()).toHaveAttribute('aria-valuenow', '320');
    expect(window.localStorage.getItem(KEY)).toBe('360');
    cleanup();
    await shell(1440);
    expect(drawn()).toBe('360px');
  });

  it('never under the minimum for a narrow window: 768 draws 288 (the page 480), not less than 200', async () => {
    window.localStorage.setItem(KEY, '360');
    await shell(768);
    if (isRail()) fireEvent.click(screen.getByRole('button', { name: strings['nav.expand'] }));
    expect(drawn()).toBe('288px');
  });

  it('the edge is a separator at the drawn width; keys move it 16 px and the width is remembered', async () => {
    await shell(1440);
    expect(edge()).toHaveAttribute('aria-valuenow', '240');
    expect(drawn()).toBe('240px');
    key('ArrowRight');
    expect(edge()).toHaveAttribute('aria-valuenow', '256');
    expect(drawn()).toBe('256px');
    expect(window.localStorage.getItem(KEY)).toBe('256');
    key('End');
    expect(drawn()).toBe('360px');
    key('Enter');
    expect(drawn()).toBe('240px');
  });

  it('a remembered width is drawn on the next load; one outside 200-360 reads as 240', async () => {
    window.localStorage.setItem(KEY, '300');
    await shell(1440);
    expect(drawn()).toBe('300px');
    cleanup();
    window.localStorage.setItem(KEY, '500');
    await shell(1440);
    expect(drawn()).toBe('240px');
  });

  it('a key step crosses the gap at once: under 200 is the rail, out of the rail the remembered width; RTL mirrored', async () => {
    window.localStorage.setItem(KEY, '200');
    await shell(1440);
    key('ArrowLeft');
    expect(isRail()).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe('200');
    key('ArrowRight');
    expect(isRail()).toBe(false);
    expect(drawn()).toBe('200px');
    // repeated steps go back and forth, never stuck at either side of the gap
    for (let i = 0; i < 3; i++) {
      key('ArrowLeft');
      expect(isRail()).toBe(true);
      key('ArrowRight');
      expect(isRail()).toBe(false);
    }
    document.documentElement.dir = 'rtl';
    try {
      key('ArrowRight');
      expect(isRail(), 'RTL: the sidebar is on the right of its edge, so → narrows it').toBe(true);
      key('ArrowLeft');
      expect(isRail()).toBe(false);
      expect(drawn()).toBe('200px');
    } finally {
      document.documentElement.dir = '';
    }
  });

  it('dragged under the snap point it is the rail, the remembered width kept; dragged out it is the sidebar again', async () => {
    window.localStorage.setItem(KEY, '280');
    await shell(1440);
    drag(280, 100);
    expect(isRail()).toBe(true);
    expect(edge()).toHaveAttribute('aria-valuenow', '56');
    expect(window.localStorage.getItem(KEY)).toBe('280');
    // a short pull out of the rail stays the rail
    drag(56, 100);
    expect(isRail()).toBe(true);
    // past the snap point: the sidebar, at its minimum when drawn narrower
    drag(56, 150);
    expect(isRail()).toBe(false);
    expect(drawn()).toBe('200px');
  });

  it('a drag into the rail through the widths on the way keeps the width it started from', async () => {
    window.localStorage.setItem(KEY, '280');
    await shell(1440);
    drag(280, 260, 230, 205, 180, 150, 120, 90);
    expect(isRail()).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe('280');
    fireEvent.click(screen.getByRole('button', { name: strings['nav.expand'] }));
    expect(drawn()).toBe('280px');
  });

  it('one drag back and forth across the snap point ends where the pointer ends', async () => {
    await shell(1440);
    drag(240, 100, 200, 90, 300);
    expect(isRail()).toBe(false);
    expect(drawn()).toBe('300px');
    drag(300, 100, 260, 90);
    expect(isRail()).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe('300');
  });

  it('Home draws the rail; Enter from the rail draws the default width', async () => {
    await shell(1440);
    key('Home');
    expect(isRail()).toBe(true);
    key('Enter');
    expect(isRail()).toBe(false);
    expect(drawn()).toBe('240px');
  });

  it('the phone drawer has neither the edge button nor the handle', async () => {
    await shell(390);
    expect(screen.queryByRole('separator', { name: strings['nav.resize'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['nav.collapse'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['nav.expand'] })).toBeNull();
  });
});
