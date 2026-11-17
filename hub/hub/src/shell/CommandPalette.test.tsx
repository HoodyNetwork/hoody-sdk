// The palette's Close button (the way out on a phone, where it is full screen) closes it. A command to another section of
// the page already open keeps the scroll (resetScroll false); any other command leaves the router's default.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { CommandPalette } from './CommandPalette';

const pages = [
  { id: 'home', path: '/home', title: 'home', strings: {}, status: 'ready', nav: { icon: 'home', group: 'main' } },
  {
    id: 'ai',
    path: '/ai',
    title: 'ai',
    strings: { 'cmd.spend': 'Spend', 'cmd.other': 'Other', 'cmd.form': 'Form' },
    status: 'ready',
    nav: { icon: 'home', group: 'main' },
    commands: [
      { id: 'spend', label: 'cmd.spend', to: '/ai?section=spending' },
      { id: 'other', label: 'cmd.other', to: '/home?section=x' },
      { id: 'form', label: 'cmd.form', to: '/ai?new=1' },
    ],
  },
] as unknown as PageManifest[];

describe('CommandPalette', () => {
  it('Close closes it', async () => {
    const onOpenChange = vi.fn();
    const router = createRouter({
      routeTree: createRootRoute({ component: () => <CommandPalette pages={pages} isOpen onOpenChange={onOpenChange} /> }),
      history: createMemoryHistory({ initialEntries: ['/home'] }),
    });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  async function run(start: string, label: string) {
    const router = createRouter({
      routeTree: createRootRoute({ component: () => <CommandPalette pages={pages} isOpen onOpenChange={() => {}} /> }),
      history: createMemoryHistory({ initialEntries: [start] }),
    });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    const navigate = vi.spyOn(router, 'navigate');
    await userEvent.click(screen.getByRole('menuitem', { name: label }));
    return navigate.mock.calls[0]?.[0] as { resetScroll?: boolean } | undefined;
  }

  it('a command to another section of the open page keeps the scroll', async () => {
    expect(await run('/ai', 'Spend')).toMatchObject({ resetScroll: false });
  });

  it('a command to another page leaves the router default', async () => {
    expect((await run('/ai', 'Other'))?.resetScroll).toBeUndefined();
  });

  it('a command to this page without a section leaves the router default', async () => {
    expect((await run('/ai', 'Form'))?.resetScroll).toBeUndefined();
  });

  it('a section command from another page leaves the router default', async () => {
    expect((await run('/home', 'Spend'))?.resetScroll).toBeUndefined();
  });
});
