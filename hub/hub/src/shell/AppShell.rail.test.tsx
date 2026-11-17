// Rail mode in the real AppShell: entering the AI tab under 1560 px draws the sidebar as its
// rail; leaving gives back the person's own setting; a toggle made on the AI tab wins until they leave and is never
// saved. At 1560 and wider the AI tab keeps the person's setting.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';
import { useShellPrefs } from './prefs';
import { onAiTab, railCollapsed } from './railMode';
import strings from './strings.en.json';

vi.mock('../ask', () => ({
  AskPanel: () => null,
  focusAsk: () => false,
  askHasFocus: () => false,
  useAskWaiting: () => false,
  useAskActivityLabel: () => ({ activity: null, label: '' }),
}));

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

async function shell(at: string) {
  const router = buildRouter([page('home', 'Home'), page('ai', 'AI')], { queryClient: new QueryClient(), history: createMemoryHistory({ initialEntries: [at] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  return router;
}
async function go(router: Awaited<ReturnType<typeof shell>>, to: string, name: string) {
  await act(async () => {
    await router.navigate({ to });
  });
  await screen.findByRole('heading', { level: 1, name });
}
/** The sidebar's own toggle: named Expand while it is a rail, Collapse while it is expanded. */
const isRail = () => !!screen.queryByRole('button', { name: strings['nav.expand'] });
const toggle = () => fireEvent.click(screen.getByRole('button', { name: isRail() ? strings['nav.expand'] : strings['nav.collapse'] }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AI tab rail mode', () => {
  it('railCollapsed: off the AI tab the own setting; on it a toggle, else a rail below 1560', () => {
    expect(onAiTab('/ai')).toBe(true);
    expect(onAiTab('/ai/c/x')).toBe(true);
    expect(onAiTab('/aim')).toBe(false);
    expect(onAiTab('/home')).toBe(false);
    for (const own of [true, false]) expect(railCollapsed({ own, onAi: false, xl: false, choice: !own })).toBe(own);
    expect(railCollapsed({ own: false, onAi: true, xl: false, choice: null })).toBe(true);
    expect(railCollapsed({ own: false, onAi: true, xl: true, choice: null })).toBe(false);
    expect(railCollapsed({ own: true, onAi: true, xl: true, choice: null })).toBe(true);
    expect(railCollapsed({ own: false, onAi: true, xl: false, choice: false })).toBe(false);
    expect(railCollapsed({ own: true, onAi: true, xl: true, choice: false })).toBe(false);
  });

  it('under 1560: entering AI draws the rail, leaving gives the expanded sidebar back, and nothing is saved', async () => {
    setViewport(1350);
    const prefs = renderHook(() => useShellPrefs());
    act(() => prefs.result.current.setCollapsed(false));
    const router = await shell('/home');
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    expect(isRail()).toBe(false);
    await go(router, '/ai', 'AI');
    expect(isRail()).toBe(true);
    await go(router, '/home', 'Home');
    expect(isRail()).toBe(false);
    expect(prefs.result.current.collapsed).toBe(false);
  });

  it('a toggle on the AI tab wins there, is forgotten on leaving, and never changes the saved setting', async () => {
    setViewport(1350);
    const prefs = renderHook(() => useShellPrefs());
    act(() => prefs.result.current.setCollapsed(false));
    const router = await shell('/ai');
    await screen.findByRole('heading', { level: 1, name: 'AI' });
    expect(isRail()).toBe(true);
    toggle();
    expect(isRail()).toBe(false);
    toggle();
    expect(isRail()).toBe(true);
    toggle();
    expect(isRail()).toBe(false);
    expect(prefs.result.current.collapsed).toBe(false);
    await go(router, '/home', 'Home');
    expect(isRail()).toBe(false);
    // Back on the AI tab the toggle (expanded) is forgotten: the rail again.
    await go(router, '/ai', 'AI');
    expect(isRail()).toBe(true);
    expect(prefs.result.current.collapsed).toBe(false);
  });

  it('leaving and coming back in one tick (only the last /ai renders) still forgets the toggle', async () => {
    setViewport(1350);
    const prefs = renderHook(() => useShellPrefs());
    act(() => prefs.result.current.setCollapsed(false));
    const router = await shell('/ai');
    await screen.findByRole('heading', { level: 1, name: 'AI' });
    toggle();
    expect(isRail()).toBe(false);
    const before = router.history.length;
    await act(async () => {
      // Not awaited between them: the second navigation starts in the same tick, before React draws /home.
      void router.navigate({ to: '/home' } as never);
      await router.navigate({ to: '/ai' } as never);
    });
    await screen.findByRole('heading', { level: 1, name: 'AI' });
    // Both entries reached the history, though React drew only the last.
    expect(router.history.length).toBe(before + 2);
    expect(isRail()).toBe(true);
    expect(prefs.result.current.collapsed).toBe(false);
  });

  it('at 1560 and wider the AI tab keeps the expanded sidebar', async () => {
    setViewport(1600);
    const prefs = renderHook(() => useShellPrefs());
    act(() => prefs.result.current.setCollapsed(false));
    await shell('/ai');
    await screen.findByRole('heading', { level: 1, name: 'AI' });
    expect(isRail()).toBe(false);
  });

  it('a person who keeps the rail keeps it everywhere, and a toggle off the AI tab is saved as before', async () => {
    setViewport(1350);
    const prefs = renderHook(() => useShellPrefs());
    act(() => prefs.result.current.setCollapsed(true));
    const router = await shell('/home');
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    expect(isRail()).toBe(true);
    await go(router, '/ai', 'AI');
    expect(isRail()).toBe(true);
    await go(router, '/home', 'Home');
    toggle();
    expect(prefs.result.current.collapsed).toBe(false);
    expect(isRail()).toBe(false);
  });
});
