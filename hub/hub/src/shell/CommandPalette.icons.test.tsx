// In the palette a page shows its filled brand icon; a command (an action into the page) shows its
// own icon, or an outline, never the page's brand icon.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PageManifest } from '@kit/page';
import { CommandPalette } from './CommandPalette';

const pages = [
  {
    id: 'keys',
    path: '/keys',
    title: 'title',
    strings: { title: 'Keys', 'cmd.new': 'Make an API key', 'cmd.add': 'Add a key' },
    status: 'ready',
    nav: { icon: 'hoody-private-key', group: 'main' },
    commands: [
      { id: 'new', label: 'cmd.new', to: '/keys?new=1' },
      { id: 'add', label: 'cmd.add', to: '/keys?add=1', icon: 'plus' },
    ],
  },
] as unknown as PageManifest[];

const iconOf = (name: string) => screen.getByRole('menuitem', { name: new RegExp(name) }).querySelector('svg')!;

describe('palette icons', () => {
  it('the page is its brand icon; its commands are outlines (their own, or the default)', async () => {
    const router = createRouter({
      routeTree: createRootRoute({ component: () => <CommandPalette pages={pages} isOpen onOpenChange={() => {}} /> }),
      history: createMemoryHistory({ initialEntries: ['/home'] }),
    });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    expect(iconOf('^Keys').getAttribute('viewBox')).toBe('0 0 16 16');
    for (const cmd of ['Make an API key', 'Add a key']) {
      const svg = iconOf(cmd);
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(svg.getAttribute('class')).toMatch(/\bstroke\b/);
    }
  });
});
