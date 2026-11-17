// Through the real FormFooter: a `nested` footer (a key setup inside a drawer's own form) reports nested to the
// drawer, so its unknown outcome does not stand for the drawer's unsaved changes and closing still asks to discard them.
// A footer that is not nested is the drawer's own form: its unknown outcome closes without asking.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Drawer } from '../overlays/Overlays';
import overlayStrings from '../overlays/strings.en.json';
import { FormFooter } from './more';

async function inRouter(Component: () => ReactElement) {
  const history = createMemoryHistory({ initialEntries: ['/'] });
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}
const escape = async () => {
  const el = document.activeElement ?? document.body;
  await act(async () => {
    fireEvent.keyDown(el, { key: 'Escape' });
    fireEvent.keyUp(el, { key: 'Escape' });
  });
};

function Host({ nested }: { nested: boolean }) {
  const [open, setOpen] = useState(true);
  return open ? (
    <Drawer resizeKey="test-formfooter-nested" isOpen onOpenChange={setOpen} title="Settings" dirty>
      <FormFooter nested={nested} dirty outcome={{ kind: 'pending' }} toastOnLeave={false} submitLabel="Save" />
    </Drawer>
  ) : (
    <p>closed</p>
  );
}

describe('FormFooter nested inside a drawer with unsaved changes', () => {
  it("a nested footer's unknown outcome still asks before discarding the drawer's changes", async () => {
    await inRouter(() => <Host nested />);
    await escape();
    expect(screen.queryByText('closed')).toBeNull();
    expect(screen.getByText(overlayStrings.discardAsk)).toBeInTheDocument();
  });

  it("the drawer's own footer with an unknown outcome closes without asking (nothing can be discarded)", async () => {
    await inRouter(() => <Host nested={false} />);
    await escape();
    expect(screen.getByText('closed')).toBeInTheDocument();
  });
});
