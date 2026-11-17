// Vitest: an IconButton's tooltip inside a drawer or dialog must not swallow the Escape that closes it
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { Drawer } from '../overlays/Overlays';
import { IconButton } from './Button';

beforeEach(() => {
  boot();
});

function Host() {
  const [open, setOpen] = useState(true);
  return open ? (
    <Drawer resizeKey="test-button-escape-test" isOpen onOpenChange={setOpen} title="New computer">
      <IconButton icon="copy" label="Copy the name" shortcut="C" />
    </Drawer>
  ) : (
    <p>closed</p>
  );
}

describe('IconButton tooltip and Escape', () => {
  it('one Escape closes the drawer even while keyboard focus shows a tooltip', async () => {
    const router = createRouter({ routeTree: createRootRoute({ component: Host }), history: createMemoryHistory({ initialEntries: ['/'] }) });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    const b = await screen.findByRole('button', { name: 'Copy the name' });
    await userEvent.tab();
    while (document.activeElement !== b) await userEvent.tab();
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeInTheDocument());
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('closed')).toBeInTheDocument();
  });
});
