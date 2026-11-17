// The palette and the `?` sheet list the current page's keys (usePageShortcuts) under "This page";
// choosing one in the palette closes the palette, then runs it.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { CommandPalette } from './CommandPalette';
import { usePageShortcuts } from './pageShortcuts';
import { ShortcutsSheet } from './ShortcutsSheet';

const pages = [{ id: 'home', path: '/home', title: 'home', strings: {}, status: 'ready', nav: { icon: 'home', group: 'main' } }] as unknown as PageManifest[];

function Page({ run }: { run: () => void }) {
  usePageShortcuts([{ key: 'n', label: 'New thing', run }, { key: 'r', label: 'Hidden one', run, enabled: false }]);
  return null;
}

async function mount(ui: React.ReactNode) {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <>{ui}</> }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

describe('page keys in the palette and the sheet', () => {
  it('palette: listed under This page; choosing closes, then runs', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
    try {
      const run = vi.fn();
      const onOpenChange = vi.fn();
      await mount(<><Page run={run} /><CommandPalette pages={pages} isOpen onOpenChange={onOpenChange} /></>);
      const item = screen.getByRole('menuitem', { name: /New thing/ });
      expect(screen.queryByRole('menuitem', { name: /Hidden one/ })).toBeNull();
      expect(screen.getByText('This page')).toBeInTheDocument();
      fireEvent.click(item);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(run).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersToNextFrame(); });
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sheet: This page group first, with only the enabled keys', async () => {
    await mount(<><Page run={() => {}} /><ShortcutsSheet isOpen onOpenChange={() => {}} /></>);
    const dialog = screen.getByRole('dialog');
    const groups = within(dialog).getAllByRole('heading', { level: 3 });
    expect(groups[0]).toHaveTextContent('This page');
    expect(within(dialog).getByText('New thing')).toBeInTheDocument();
    expect(within(dialog).queryByText('Hidden one')).toBeNull();
  });
});
