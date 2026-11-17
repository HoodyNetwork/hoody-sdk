// The Ask dock in the real AppShell: opening it by any entry puts focus in the
// dock (the composer, as Ctrl/⌘J does) and closing puts focus back on what opened it, else on the page, never on
// <body>. On a phone the dock is a full-screen sheet: a reload never brings it back open, Esc closes it, and the
// chrome under it is inert. From 768 to 1279 the dock overlays the page and always leaves a strip of the page.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { Activity, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAskDock } from '@kit/ask';
import { Dialog } from '@kit/overlays/Dialog';
import { showToast } from '@kit/states/Toast';
import { restoreChrome, useChromeHidden } from './chrome';
import { useShellPrefs } from './prefs';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';

// A stand-in Ask conversation: a composer and the panel's own Close, as the Ask panel draws them.
// `panel.composer` false: a panel with no composer yet (no account, no computer), only its Close.
const panel = vi.hoisted(() => ({ composer: true }));
vi.mock('../ask', async () => {
  const { useAskDock: dock } = await import('@kit/ask');
  let composer: HTMLTextAreaElement | null = null;
  function AskPanel() {
    const ask = dock();
    return (
      <div>
        {panel.composer && <textarea aria-label="Message to your agent" ref={(e) => { composer = e; }} />}
        <button type="button" onClick={ask.close}>Close Agent</button>
      </div>
    );
  }
  return {
    AskPanel,
    focusAsk: () => {
      if (!composer?.isConnected) return false;
      composer.focus();
      return true;
    },
    askHasFocus: () => !!composer && composer === document.activeElement,
    useAskWaiting: () => false,
    useAskActivityLabel: () => ({ activity: null, label: '' }),
  };
});

// The viewport: matchMedia answers the shell's width queries against `vw`, as a browser of that width would, and
// resizeViewport tells every listener, as a window resize does.
let vw = 1024;
const mediaListeners = new Set<() => void>();
function setViewport(w: number) {
  vw = w;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  vi.stubGlobal('matchMedia', (q: string) => {
    const m = /\(width\s*(<|>=)\s*(\d+)px\)/.exec(q);
    const matches = m ? (m[1] === '<' ? vw < Number(m[2]) : vw >= Number(m[2])) : false;
    return {
      matches,
      media: q,
      addEventListener: (_: string, l: () => void) => mediaListeners.add(l),
      removeEventListener: (_: string, l: () => void) => mediaListeners.delete(l),
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    };
  });
}
async function resizeViewport(w: number) {
  setViewport(w);
  await act(async () => {
    for (const l of [...mediaListeners]) l();
    window.dispatchEvent(new Event('resize'));
  });
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}
const frame = () => act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });

function Home() {
  return (
    <h1 data-hub-title tabIndex={-1}>
      Home
    </h1>
  );
}
const page = (id: string, component: () => ReactElement): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout: 'settings', load: async () => ({ default: component }), status: 'ready', sensitive: false, strings: { title: 'Home' } });

async function shell() {
  const router = buildRouter([page('home', Home)], { queryClient: new QueryClient(), history: createMemoryHistory({ initialEntries: ['/home'] }) });
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

const topAsk = () => screen.getAllByRole('button', { name: 'AI' }).find((b) => b.closest('header')) as HTMLElement;
const dock = () => document.querySelector<HTMLElement>('[data-hub-dock]');
const composer = () => screen.getByRole('textbox', { name: 'Message to your agent' });

beforeEach(() => {
  setViewport(1024);
  panel.composer = true;
});
afterEach(() => {
  cleanup();
  const { result } = renderHook(() => useAskDock());
  act(() => {
    result.current.close();
    result.current.setWidth(undefined);
  });
  cleanup();
  vi.unstubAllGlobals();
  mediaListeners.clear();
  localStorage.clear();
});

describe('Ask dock focus', () => {
  it('the top bar Ask button opens the dock with focus in its composer; Close puts focus back on the button', async () => {
    await shell();
    topAsk().focus();
    fireEvent.click(topAsk());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    fireEvent.click(screen.getByRole('button', { name: 'Close Agent' }));
    expect(dock()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(topAsk()));
  });

  it('opened with Ctrl J from the page: closing returns to the page title, never to <body>', async () => {
    await shell();
    const h1 = screen.getByRole('heading', { level: 1, name: 'Home' });
    h1.focus();
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    fireEvent.click(screen.getByRole('button', { name: 'Close Agent' }));
    await waitFor(() => expect(document.activeElement).toBe(h1));
  });

  it('a panel with no composer yet: focus goes to its first control, never the hidden grip or <body>', async () => {
    for (const w of [390, 1024]) {
      setViewport(w);
      panel.composer = false;
      await shell();
      fireEvent.click(topAsk());
      await waitFor(() => expect(document.activeElement, `width ${w}`).toBe(screen.getByRole('button', { name: 'Close Agent' })));
      fireEvent.click(screen.getByRole('button', { name: 'Close Agent' }));
      cleanup();
    }
  });

  it('closed while focus is on the page already: focus stays where it is', async () => {
    await shell();
    fireEvent.click(topAsk());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    const h1 = screen.getByRole('heading', { level: 1, name: 'Home' });
    h1.focus();
    const { result } = renderHook(() => useAskDock());
    act(() => result.current.close());
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });
    expect(document.activeElement).toBe(h1);
  });
});

describe('Ask on a phone (a full-screen sheet)', () => {
  it('Esc closes the sheet and focus goes back to what opened it', async () => {
    setViewport(390);
    await shell();
    topAsk().focus();
    fireEvent.click(topAsk());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    fireEvent.keyDown(composer(), { key: 'Escape' });
    expect(dock()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(topAsk()));
  });

  it('Esc closes the sheet even when a tap on blank sheet left focus on <body>; Ctrl J closes it too', async () => {
    setViewport(390);
    await shell();
    fireEvent.click(topAsk());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    // Esc that ends an IME composition is the composition's.
    fireEvent.keyDown(composer(), { key: 'Escape', isComposing: true });
    expect(dock()).not.toBeNull();
    // A dialog over the sheet keeps its Esc, even one that does not close on it.
    const over = document.createElement('div');
    over.setAttribute('role', 'dialog');
    document.body.append(over);
    fireEvent.keyDown(over, { key: 'Escape' });
    expect(dock()).not.toBeNull();
    over.remove();
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(dock()).toBeNull();
    fireEvent.click(topAsk());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(dock()).toBeNull();
  });

  it('while the sheet is open the chrome under it is inert and page keys are held; closed, both lift', async () => {
    setViewport(390);
    await shell();
    const main = document.getElementById('hub-main') as HTMLElement;
    const bar = topAsk().closest('header') as HTMLElement;
    fireEvent.click(topAsk());
    await waitFor(() => expect(dock()).not.toBeNull());
    expect(main.inert).toBe(true);
    expect(bar.inert).toBe(true);
    expect((screen.getByText(/skip to/i) as HTMLElement).inert).toBe(true);
    expect(document.querySelector('[data-hub-overlay]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close Agent' }));
    expect(main.inert).toBe(false);
    expect(bar.inert).toBe(false);
    expect(document.querySelector('[data-hub-overlay]')).toBeNull();
  });

  it('wider than a phone the dock is a region: Esc returns focus to the page and the dock stays open', async () => {
    await shell();
    fireEvent.click(topAsk());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    fireEvent.keyDown(composer(), { key: 'Escape' });
    expect(dock()).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Home' }));
    expect((document.getElementById('hub-main') as HTMLElement).inert).toBe(false);
  });

  it('a dock remembered open is not reopened over the page on a phone; wider, it is', async () => {
    for (const [w, open] of [[390, false], [1024, true]] as const) {
      setViewport(w);
      localStorage.setItem('hub.v3.ask', JSON.stringify({ open: true }));
      vi.resetModules();
      const fresh = await import('@kit/ask');
      const { result, unmount } = renderHook(() => fresh.useAskDock());
      expect(result.current.isOpen, `width ${w}`).toBe(open);
      unmount();
    }
  });
});

describe('Ask dock width', () => {
  const grip = () => screen.getByRole('separator', { name: /resize/i });

  it('768-1279 (overlay): a wide remembered width is drawn narrower so the page keeps a strip; the grip says so', async () => {
    setViewport(768);
    const { result } = renderHook(() => useAskDock());
    act(() => result.current.setWidth(560));
    await shell();
    fireEvent.click(topAsk());
    await waitFor(() => expect(dock()).not.toBeNull());
    // 768 - 56 (rail) - 288 (page strip) = 424.
    expect(dock()?.style.getPropertyValue('--dock-cur')).toBe('424px');
    expect(grip().getAttribute('aria-valuenow')).toBe('424');
    expect(grip().getAttribute('aria-valuemax')).toBe('424');
    fireEvent.keyDown(grip(), { key: 'ArrowLeft' });
    expect(grip().getAttribute('aria-valuenow')).toBe('424');
  });

  it('>= 1280 (push): the remembered width is drawn as is', async () => {
    setViewport(1440);
    const { result } = renderHook(() => useAskDock());
    act(() => result.current.setWidth(560));
    await shell();
    fireEvent.click(topAsk());
    await waitFor(() => expect(dock()).not.toBeNull());
    expect(dock()?.style.getPropertyValue('--dock-cur')).toBe('560px');
    expect(grip().getAttribute('aria-valuemax')).toBe('560');
  });

  it('768-1279 with the sidebar expanded: the strip is kept beside the full sidebar; the asked width is kept for wider', async () => {
    setViewport(1024);
    const { result } = renderHook(() => useShellPrefs());
    act(() => result.current.setCollapsed(false));
    const dockHook = renderHook(() => useAskDock());
    act(() => dockHook.result.current.setWidth(560));
    await shell();
    fireEvent.click(topAsk());
    await waitFor(() => expect(dock()).not.toBeNull());
    // 1024 - 240 (sidebar) - 288 (page strip) = 496.
    expect(dock()?.style.getPropertyValue('--dock-cur')).toBe('496px');
    expect(grip().getAttribute('aria-valuemax')).toBe('496');
    // A move starts from the drawn width; what is remembered is what was asked (wider shows it), drawn within the cap.
    fireEvent.keyDown(grip(), { key: 'ArrowLeft' });
    expect(dockHook.result.current.width).toBe(512);
    expect(grip().getAttribute('aria-valuenow')).toBe('496');
    fireEvent.keyDown(grip(), { key: 'ArrowRight' });
    expect(dockHook.result.current.width).toBe(480);
    expect(grip().getAttribute('aria-valuenow')).toBe('480');
    act(() => result.current.setCollapsed(true));
  });
});

describe('the Ask dock as a sheet: focus, composition, Esc and width', () => {
  it('the open dock becoming the sheet (a resize below 768) takes focus from the page; wider again, the page is live', async () => {
    await shell();
    fireEvent.click(topAsk());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    const h1 = screen.getByRole('heading', { level: 1, name: 'Home' });
    h1.focus();
    await resizeViewport(390);
    const main = document.getElementById('hub-main') as HTMLElement;
    expect(main.inert).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    // Another resize while it is a sheet moves nothing: focus the person put on the panel's Close stays there.
    screen.getByRole('button', { name: 'Close Agent' }).focus();
    await resizeViewport(375);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close Agent' }));
    await resizeViewport(1024);
    expect(main.inert).toBe(false);
    expect(dock()).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close Agent' }));
  });

  it('focus mode ending on a phone with the dock open brings focus into the sheet', async () => {
    setViewport(390);
    await shell();
    fireEvent.click(topAsk());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    const hide = renderHook(() => useChromeHidden(true));
    await frame();
    expect((document.getElementById('hub-main') as HTMLElement).inert).toBe(false);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Home' });
    h1.focus();
    act(() => restoreChrome());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    hide.unmount();
  });

  it('Ctrl J inside an IME composition is the composition\'s: the sheet stays and the key is not taken', async () => {
    setViewport(390);
    await shell();
    fireEvent.click(topAsk());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    const notTaken = fireEvent.keyDown(composer(), { key: 'j', ctrlKey: true, isComposing: true });
    expect(notTaken).toBe(true);
    expect(dock()).not.toBeNull();
    const taken = !fireEvent.keyDown(composer(), { key: 'j', ctrlKey: true });
    expect(taken).toBe(true);
    expect(dock()).toBeNull();
  });

  it('a busy dialog over the sheet keeps Esc even when focus fell to <body>; with it gone, Esc closes', async () => {
    setViewport(390);
    await shell();
    fireEvent.click(topAsk());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    const over = document.createElement('div');
    over.setAttribute('role', 'alertdialog');
    over.innerHTML = '<button type="button">Working</button>';
    document.body.append(over);
    (over.querySelector('button') as HTMLButtonElement).focus();
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(dock()).not.toBeNull();
    over.remove();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(dock()).toBeNull();
  });

  it('at 768 with the sidebar expanded the dock is drawn within the page strip (240), below DOCK_MIN; the grip agrees', async () => {
    setViewport(768);
    const prefs = renderHook(() => useShellPrefs());
    act(() => prefs.result.current.setCollapsed(false));
    const dockHook = renderHook(() => useAskDock());
    act(() => dockHook.result.current.setWidth(400));
    await shell();
    fireEvent.click(topAsk());
    await waitFor(() => expect(dock()).not.toBeNull());
    const grip = screen.getByRole('separator', { name: /resize/i });
    // 768 - 240 (sidebar) - 288 (page strip) = 240.
    expect(dock()?.style.getPropertyValue('--dock-cur')).toBe('240px');
    expect(grip.getAttribute('aria-valuenow')).toBe('240');
    expect(grip.getAttribute('aria-valuemax')).toBe('240');
    expect(grip.getAttribute('aria-valuemin')).toBe('240');
    expect(dockHook.result.current.width).toBe(400);
    act(() => prefs.result.current.setCollapsed(true));
  });

  it('focus the person moves before the dock has drawn stays where they put it', async () => {
    await shell();
    const h1 = screen.getByRole('heading', { level: 1, name: 'Home' });
    topAsk().focus();
    fireEvent.click(topAsk());
    h1.focus();
    await frame();
    expect(document.activeElement).toBe(h1);
  });

  it('an opener that is gone by the close: focus goes to the page title, never <body>', async () => {
    await shell();
    const opener = document.createElement('button');
    opener.textContent = 'Ask about this';
    (document.getElementById('hub-main') as HTMLElement).append(opener);
    opener.focus();
    const { result } = renderHook(() => useAskDock());
    act(() => result.current.open());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    opener.remove();
    fireEvent.click(screen.getByRole('button', { name: 'Close Agent' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Home' })));
  });

  it('a sticky toast is no dialog over the sheet: Esc still closes it', async () => {
    setViewport(390);
    await shell();
    fireEvent.click(topAsk());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    act(() => {
      showToast({ title: 'That change may have gone through', tone: 'unknown', action: { label: 'Check', onAction: () => undefined } });
    });
    await screen.findByRole('alertdialog');
    composer().focus();
    fireEvent.keyDown(composer(), { key: 'Escape' });
    expect(dock()).toBeNull();
  });

  it('a dialog of a page kept hidden (an Activity) is no dialog over the sheet; shown, it keeps Esc', async () => {
    setViewport(390);
    await shell();
    fireEvent.click(topAsk());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    const host = document.createElement('div');
    document.body.append(host);
    const kept = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <Dialog isOpen onOpenChange={() => {}} title="Kept page dialog" isDismissable={false} />
      </Activity>
    );
    const r = render(kept('visible'), { container: host });
    await screen.findByRole('dialog', { name: 'Kept page dialog' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(dock()).not.toBeNull();
    r.rerender(kept('hidden'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Kept page dialog' })).toBeNull());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    composer().focus();
    fireEvent.keyDown(composer(), { key: 'Escape' });
    expect(dock()).toBeNull();
    r.unmount();
    host.remove();
  });
});
