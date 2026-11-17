// Several footers report to one drawer (its own form's and a step nested in it, such as
// a key setup in the model chooser). Each reports under its own key: one ending never lifts another's busy, and a nested
// step's unknown outcome does not stand for the drawer's unsaved changes.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Drawer, DrawerCancel, useDrawer } from './Overlays';
import type { DrawerReportState } from './Drawer';

async function inRouter(Component: () => ReactElement) {
  const history = createMemoryHistory({ initialEntries: ['/'] });
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}
const press = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};
const escape = async () => {
  const el = document.activeElement ?? document.body;
  await act(async () => {
    fireEvent.keyDown(el, { key: 'Escape' });
    fireEvent.keyUp(el, { key: 'Escape' });
  });
};
const button = (name: string) => screen.getByRole('button', { name });

type Set = (st: DrawerReportState | null) => void;
const reporters: Record<string, Set> = {};
function Reporter({ id }: { id: string }) {
  const report = useDrawer()?.reportOutcome;
  useEffect(() => {
    reporters[id] = (st) => report?.(id, st);
    return () => report?.(id, null);
  }, [report, id]);
  return null;
}

function Host({ dirty = false, both = true }: { dirty?: boolean; both?: boolean }) {
  const [open, setOpen] = useState(true);
  const [nestedUp, setNestedUp] = useState(both);
  return open ? (
    <Drawer resizeKey="test-drawer-reporters" isOpen onOpenChange={setOpen} title="T" dirty={dirty} footer={<DrawerCancel />}>
      <Reporter id="form" />
      {nestedUp && <Reporter id="step" />}
      <button type="button" onClick={() => setNestedUp(false)}>
        Drop step
      </button>
    </Drawer>
  ) : (
    <p>closed</p>
  );
}

describe('Drawer: several footers report', () => {
  it("one footer ending does not lift another's busy", async () => {
    await inRouter(() => <Host />);
    await act(async () => reporters.step?.({ pending: false, busy: true, nested: true }));
    await act(async () => reporters.form?.({ pending: false, busy: false }));
    expect(button('Cancel'), 'the step still holds the drawer').toBeDisabled();
    await act(async () => reporters.form?.(null));
    await escape();
    expect(screen.queryByText('closed')).toBeNull();
    await act(async () => reporters.step?.({ pending: false, busy: false, nested: true }));
    await press(button('Cancel'));
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it("the drawer's own footer stays busy when a nested step goes", async () => {
    await inRouter(() => <Host />);
    await act(async () => reporters.form?.({ pending: false, busy: true }));
    await act(async () => reporters.step?.({ pending: false, busy: false, nested: true }));
    await press(button('Drop step'));
    expect(button('Cancel')).toBeDisabled();
    await escape();
    expect(screen.queryByText('closed')).toBeNull();
  });

  it("a nested step's unknown outcome still asks before discarding the drawer's changes", async () => {
    await inRouter(() => <Host dirty />);
    await act(async () => reporters.step?.({ pending: true, busy: false, nested: true }));
    await press(button('Cancel'));
    expect(screen.queryByText('closed')).toBeNull();
    expect(screen.getAllByRole('button').some((b) => /discard/i.test(b.textContent ?? ''))).toBe(true);
  });

  it("the drawer's own unknown outcome closes without asking (nothing can be discarded)", async () => {
    await inRouter(() => <Host dirty />);
    await act(async () => reporters.form?.({ pending: true, busy: false }));
    await press(button('Cancel'));
    expect(screen.getByText('closed')).toBeInTheDocument();
  });
});
