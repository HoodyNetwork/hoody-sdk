// Drawer `topNote`: the body goes back to its top when what stands there changes (the notice of a refused send, put
// above a review whose Confirm was pressed at the body's end). Not on open, not for the same value, not when the value
// goes back to null.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { Drawer } from './Overlays';

async function inRouter(Component: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

let setNote: (v: string | null) => void = () => undefined;
function Case({ first = null }: { first?: string | null }) {
  const [note, set] = useState<string | null>(first);
  setNote = set;
  return (
    <Drawer resizeKey="test-top-note-web" isOpen onOpenChange={() => undefined} title="A purchase" topNote={note}>
      <input aria-label="Name" />
    </Drawer>
  );
}

/** The body, scrolled down: jsdom lays nothing out, so the position is a plain value the Drawer may write. */
function scrolledBody(): HTMLElement {
  const el = screen.getByRole('dialog').querySelector<HTMLElement>('[data-drawer-body]')!;
  Object.defineProperty(el, 'scrollTop', { value: 300, writable: true, configurable: true });
  return el;
}

describe('Drawer topNote', () => {
  it('a value that appears sends the body to its top', async () => {
    await inRouter(() => <Case />);
    const body = scrolledBody();
    await act(async () => setNote('requote 1400'));
    expect(body.scrollTop).toBe(0);
  });

  it('another value does so again; the same value and null do not', async () => {
    await inRouter(() => <Case first="notice a" />);
    const body = scrolledBody();
    // Open with a value: nothing moved.
    expect(body.scrollTop).toBe(300);
    await act(async () => setNote('notice a'));
    expect(body.scrollTop).toBe(300);
    await act(async () => setNote(null));
    expect(body.scrollTop).toBe(300);
    await act(async () => setNote('notice b'));
    expect(body.scrollTop).toBe(0);
  });
});
