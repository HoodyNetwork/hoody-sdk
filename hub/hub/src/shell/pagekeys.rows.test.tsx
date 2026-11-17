// A page with many keys stays readable. Page keys are grouped (`group`), keys that do the same
// thing share one row (same label: ← and h for "Move left"), named keys show their symbol (←, not
// "ArrowLeft"), and navigation keys can stay out of the palette (`palette: false`).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PageManifest } from '@kit/page';
import { CommandPalette } from './CommandPalette';
import { type PageShortcut, pageShortcutKeys, usePageShortcuts } from './pageShortcuts';
import { ShortcutsSheet } from './ShortcutsSheet';

const noop = () => {};
const BOARD: PageShortcut[] = [
  { key: 'ArrowLeft', label: 'Move left', group: 'Tiles', palette: false, run: noop },
  { key: 'h', label: 'Move left', group: 'Tiles', palette: false, run: noop },
  { key: 'ArrowRight', label: 'Move right', group: 'Tiles', palette: false, run: noop },
  { key: 'l', label: 'Move right', group: 'Tiles', palette: false, run: noop },
  { key: 'ArrowLeft', mods: ['shift'], label: 'Swap left', group: 'Tiles', palette: false, run: noop },
  { key: 'z', label: 'Maximise', group: 'Tiles', run: noop },
  { key: 'f', label: 'Focus mode', run: noop },
];

function Page() {
  usePageShortcuts(BOARD);
  return null;
}

const pages = [{ id: 'home', path: '/home', title: 'home', strings: {}, status: 'ready', nav: { icon: 'home', group: 'main' } }] as unknown as PageManifest[];

afterEach(() => {
  cleanup();
});

describe('page key rows', () => {
  it('named keys show their symbol, single or in a chord', () => {
    expect(pageShortcutKeys({ key: 'ArrowLeft', label: 'x', run: noop })).toEqual(['←']);
    expect(pageShortcutKeys({ key: 'ArrowDown', label: 'x', run: noop })).toEqual(['↓']);
    expect(pageShortcutKeys({ key: 'ArrowUp', mods: ['shift'], label: 'x', run: noop })).toEqual(['Shift', '↑']);
  });

  it('the ? sheet: one section per group, same-label keys on one row, symbols not key names', () => {
    render(
      <>
        <Page />
        <ShortcutsSheet isOpen onOpenChange={noop} />
      </>,
    );
    const dialog = screen.getByRole('dialog');
    const titles = within(dialog).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles.slice(0, 2)).toEqual(['This page', 'This page · Tiles']);
    expect(within(dialog).getAllByText('Move left')).toHaveLength(1);
    const row = within(dialog).getByText('Move left').closest('div') as HTMLElement;
    expect(row.textContent).toContain('←');
    expect(row.textContent).toContain('h');
    expect(dialog.textContent).not.toContain('ArrowLeft');
  });

  it('the palette offers only keys meant for it, one item per row', async () => {
    const router = createRouter({
      routeTree: createRootRoute({ component: () => (<><Page /><CommandPalette pages={pages} isOpen onOpenChange={noop} /></>) }),
      history: createMemoryHistory({ initialEntries: ['/home'] }),
    });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    expect(screen.getByRole('menuitem', { name: /Maximise/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Focus mode/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Move left/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Swap left/ })).toBeNull();
  });
});
