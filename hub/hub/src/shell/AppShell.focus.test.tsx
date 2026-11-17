// Focus mode inside the real AppShell: a canvas page's
// main drops its padding and scroll (.canvas), focus mode marks the shell (.focus) and closes the phone
// More drawer, and a keyboard restore puts focus back where it was before focus mode (else on the
// element the page marks with data-hub-restore-focus, else main), never on <body>.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';
import { restoreChrome, useChromeHidden } from './chrome';
import { openShortcutsSheet } from './shortcutsOpen';

function Board() {
  const [on, setOn] = useState(false);
  useChromeHidden(on, () => setOn(false));
  return (
    <div>
      <h1>Board</h1>
      <div data-hub-restore-focus tabIndex={-1}>
        strip
      </div>
      <button type="button" onClick={() => setOn(true)}>
        Focus
      </button>
      <button type="button" onClick={() => setOn(true)} data-gone>
        Focus and go
      </button>
    </div>
  );
}

function Other() {
  return <h1>Other</h1>;
}

const strings = { title: 'Page' } as const;
const page = (id: string, component: () => ReactElement, layout: PageManifest['layout']): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout, load: async () => ({ default: component }), status: 'ready', sensitive: false, strings });
const PAGES = [page('board', Board, 'canvas'), page('other', Other, 'settings')];

async function open(path: string) {
  const router = buildRouter(PAGES, { queryClient: new QueryClient(), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await screen.findByRole('heading', { level: 1, name: /Board|Other/ });
  return router;
}

const main = () => document.getElementById('hub-main') as HTMLElement;
const classes = (el: Element | null | undefined) => (el ? [...el.classList].join(' ') : '');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  act(() => restoreChrome());
});

describe('AppShell and focus mode', () => {
  it('a canvas page gets the canvas main; another page does not', async () => {
    const router = await open('/board');
    expect(classes(main())).toMatch(/canvas/);
    await act(async () => {
      await router.navigate({ to: '/other' } as never);
    });
    await screen.findByRole('heading', { level: 1, name: 'Other' });
    expect(classes(main())).not.toMatch(/canvas/);
  });

  it('focus mode marks the shell and the restore button brings it back', async () => {
    await open('/board');
    const shell = main().parentElement as HTMLElement;
    expect(classes(shell)).not.toMatch(/focus/);
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    expect(classes(shell)).toMatch(/focus/);
    fireEvent.click(screen.getByRole('button', { name: 'Leave focus mode' }));
    expect(classes(shell)).not.toMatch(/focus/);
  });

  it('focus mode closes the phone More drawer', async () => {
    await open('/board');
    const shell = main().parentElement as HTMLElement;
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(classes(shell)).toMatch(/moreOpen/);
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    expect(classes(shell)).not.toMatch(/moreOpen/);
  });

  it('a keyboard restore puts focus back on what had it before focus mode', async () => {
    await open('/board');
    const btn = screen.getByRole('button', { name: 'Focus' });
    btn.focus();
    fireEvent.click(btn);
    const restore = screen.getByRole('button', { name: 'Leave focus mode' });
    restore.focus();
    act(() => restoreChrome());
    expect(document.activeElement).toBe(btn);
  });

  it('falls back to the element the page marks, when the earlier one is gone', async () => {
    await open('/board');
    const btn = screen.getByRole('button', { name: 'Focus and go' });
    btn.focus();
    fireEvent.click(btn);
    btn.remove();
    screen.getByRole('button', { name: 'Leave focus mode' }).focus();
    act(() => restoreChrome());
    expect(document.activeElement).toBe(document.querySelector('[data-hub-restore-focus]'));
  });

  it('leaves focus alone when the page moved it itself', async () => {
    await open('/board');
    const btn = screen.getByRole('button', { name: 'Focus' });
    btn.focus();
    fireEvent.click(btn);
    const other = screen.getByRole('button', { name: 'Focus and go' });
    other.focus();
    act(() => restoreChrome());
    expect(document.activeElement).toBe(other);
  });
});

describe('openShortcutsSheet', () => {
  it('a page opens the shell’s ? sheet (phones have no ? key)', async () => {
    await open('/board');
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
    act(() => openShortcutsSheet());
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
  });

  it('does nothing without a shell', () => {
    expect(() => openShortcutsSheet()).not.toThrow();
  });
});
