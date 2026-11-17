// Vitest: the top bar's AI button is a worded button from 1024 px and an icon button below. A window crossing that width
// (a resize, a zoom) while the button has focus keeps focus on the AI button that replaces it.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider } from './context';
import { PagesProvider } from './pageLinks';
import { TopBar } from './TopBar';

vi.mock('../ask', () => ({
  useAskWaiting: () => false,
  useAskActivityLabel: () => ({ activity: null, label: '' }),
}));

// matchMedia answers the width queries against `vw`; resizeViewport tells every listener, as a window resize does.
let vw = 1440;
const listeners = new Set<() => void>();
vi.stubGlobal('matchMedia', (q: string) => {
  const m = /\(width\s*(<|>=)\s*(\d+)px\)/.exec(q);
  return {
    get matches() {
      return m ? (m[1] === '<' ? vw < Number(m[2]) : vw >= Number(m[2])) : false;
    },
    media: q,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  };
});
async function resizeViewport(w: number) {
  vw = w;
  await act(async () => {
    for (const l of [...listeners]) l();
  });
}

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
async function show() {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <PagesProvider pages={[pg('home')]}><TopBar onOpenPalette={() => {}} onOpenShortcuts={() => {}} /></PagesProvider> }),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  });
  await act(async () => {
    render(
      <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [] }}>
        <RouterProvider router={router} />
      </ShellDataProvider>,
    );
    await router.load();
  });
}

afterEach(() => {
  cleanup();
  vw = 1440;
});

describe('TopBar AI button across 1024 px', () => {
  it('a focused AI button keeps focus when the window narrows, and again when it widens', async () => {
    await show();
    const wide = screen.getByRole('button', { name: 'AI' });
    act(() => wide.focus());
    await resizeViewport(800);
    const narrow = screen.getByRole('button', { name: 'AI' });
    expect(narrow).not.toBe(wide);
    expect(document.activeElement).toBe(narrow);
    await resizeViewport(1440);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'AI' }));
  });

  it('an AI button without focus does not take it when the width changes', async () => {
    await show();
    await resizeViewport(800);
    expect(document.activeElement).toBe(document.body);
  });
});
