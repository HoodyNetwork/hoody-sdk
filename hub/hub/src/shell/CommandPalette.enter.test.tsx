// Whenever the field holds text, the first match is the active row, so Enter acts on it: after typing forward, after
// deleting back to a list that did not change, and after a paste.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { CommandPalette } from './CommandPalette';

const pages = [
  { id: 'home', path: '/home', title: 'home', strings: {}, status: 'ready', nav: { icon: 'home', group: 'main' } },
  {
    id: 'ai',
    path: '/ai',
    title: 'ai',
    strings: { 'cmd.spend': 'Spend', 'cmd.other': 'Other' },
    status: 'ready',
    nav: { icon: 'home', group: 'main' },
    commands: [
      { id: 'spend', label: 'cmd.spend', to: '/ai?section=spending' },
      { id: 'other', label: 'cmd.other', to: '/home?section=x' },
    ],
  },
] as unknown as PageManifest[];

async function open() {
  const onOpenChange = vi.fn();
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <CommandPalette pages={pages} isOpen onOpenChange={onOpenChange} /> }),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  const navigate = vi.spyOn(router, 'navigate');
  const field = screen.getByRole('searchbox');
  // jsdom does not run the field's autoFocus on a portal mount: put the caret there as the open does.
  await userEvent.click(field);
  expect(field).toHaveFocus();
  return { onOpenChange, navigate, field };
}

/** The id of the row Enter would act on: the one marked active. */
function active(): string | null {
  const on = screen.getAllByRole('menuitem').filter((e) => e.getAttribute('data-focused') === 'true');
  expect(on.length).toBeLessThanOrEqual(1);
  return on[0]?.id ?? null;
}

const spend = () => screen.getByRole('menuitem', { name: 'Spend' }).id;

describe('CommandPalette Enter', () => {
  it('typing forward makes the first match active and Enter runs it', async () => {
    const { navigate, onOpenChange } = await open();
    await userEvent.keyboard('Spend');
    expect(active()).toBe(spend());
    await userEvent.keyboard('{Enter}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigate.mock.calls[0]?.[0]).toMatchObject({ href: '/ai?section=spending' });
  });

  it('deleting back to a list that did not change keeps a first match active, and Enter runs it', async () => {
    const { navigate, onOpenChange } = await open();
    // Two letters off: past what the typo tolerance forgives in a six-letter word (one), so nothing matches.
    await userEvent.keyboard('Spendzq');
    expect(screen.queryByRole('menuitem', { name: 'Spend' })).toBeNull();
    await userEvent.keyboard('{Backspace}{Backspace}');
    expect(active()).toBe(spend());
    await userEvent.keyboard('{Enter}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigate.mock.calls[0]?.[0]).toMatchObject({ href: '/ai?section=spending' });
  });

  it('deleting one letter of a one-row list keeps that row active', async () => {
    await open();
    await userEvent.keyboard('Spen{Backspace}');
    expect(active()).toBe(spend());
  });

  it('a paste makes the first match active', async () => {
    const { navigate } = await open();
    await userEvent.paste('Spend');
    expect(active()).toBe(spend());
    await userEvent.keyboard('{Enter}');
    expect(navigate.mock.calls[0]?.[0]).toMatchObject({ href: '/ai?section=spending' });
  });

  it('an empty field has no active row', async () => {
    await open();
    await userEvent.keyboard('S{Backspace}');
    expect(active()).toBeNull();
  });

  it('a palette closed and opened again starts on an empty field with every row', async () => {
    let setOpen: (v: boolean) => void = () => {};
    function Host() {
      const [isOpen, set] = useState(true);
      setOpen = set;
      return <CommandPalette pages={pages} isOpen={isOpen} onOpenChange={set} />;
    }
    const router = createRouter({
      routeTree: createRootRoute({ component: Host }),
      history: createMemoryHistory({ initialEntries: ['/home'] }),
    });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    await userEvent.click(screen.getByRole('searchbox'));
    await userEvent.keyboard('Spend');
    expect(screen.queryByRole('menuitem', { name: 'Other' })).toBeNull();
    act(() => setOpen(false));
    act(() => setOpen(true));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByRole('menuitem', { name: 'Other' })).toBeTruthy();
  });
});
