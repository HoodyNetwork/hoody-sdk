// Drawer keyboard focus: a drawer opened by URL has no invoker,
// so closing it sends focus to the page title, never <body>; and while it is open focus never sits on nothing:
// a drawer that opens with every control disabled (a save pending), or whose focused field goes away or locks,
// moves focus into itself (the scrolling body when it takes focus, else the drawer; never a field).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Drawer } from './Overlays';

async function inRouter(Component: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const settle = (ms = 5) =>
  act(async () => {
    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => setTimeout(r, ms));
  });

const inDrawer = () => {
  const a = document.activeElement;
  return a !== null && a !== document.body && Boolean(screen.queryByRole('dialog')?.contains(a));
};

afterEach(() => vi.restoreAllMocks());

describe('Drawer: focus never falls to the page', () => {
  it('a drawer opened by URL (no invoker) returns focus to the page title on Escape', async () => {
    function Page() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <h1 tabIndex={-1} data-hub-title="">
            Schedules
          </h1>
          <Drawer resizeKey="test-drawerfocus-test" isOpen={open} onOpenChange={setOpen} title="New schedule">
            <input aria-label="Name" />
          </Drawer>
        </>
      );
    }
    await inRouter(Page);
    await settle();
    await userEvent.keyboard('{Escape}');
    await settle(350);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Schedules' }));
  });

  it('a drawer the page unmounts on close (schedules Editor) still returns focus to the page title', async () => {
    function Page() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <h1 tabIndex={-1} data-hub-title="">
            Schedules
          </h1>
          {open && (
            <Drawer resizeKey="test-drawerfocus-test-2" isOpen onOpenChange={(o) => !o && setOpen(false)} title="New schedule">
              <button>Run a command</button>
            </Drawer>
          )}
        </>
      );
    }
    await inRouter(Page);
    await settle();
    await userEvent.click(screen.getByRole('button', { name: 'Run a command' }));
    await userEvent.keyboard('{Escape}');
    await settle(350);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Schedules' }));
  });

  it('focus that falls to the page late (a slow exit animation) is still sent to the page title', async () => {
    function Page() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <h1 tabIndex={-1} data-hub-title="">
            Bots
          </h1>
          <button>Elsewhere</button>
          <Drawer resizeKey="test-drawerfocus-test-3" isOpen={open} onOpenChange={setOpen} title="New Bot">
            <input aria-label="Name" />
          </Drawer>
        </>
      );
    }
    await inRouter(Page);
    await settle();
    await userEvent.keyboard('{Escape}');
    await settle(350);
    // The overlay's own restore lands after the first checks (under load): focus drops to <body> late.
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    await settle(700);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Bots' }));
  });

  it('a drawer that opens with every control disabled still holds focus', async () => {
    await inRouter(() => (
      <Drawer resizeKey="test-drawerfocus-test-4" isOpen onOpenChange={() => undefined} title="Connect key" busy>
        <input aria-label="Key" disabled />
      </Drawer>
    ));
    await settle(20);
    expect(inDrawer()).toBe(true);
  });

  it('a focused field that goes away while saving does not drop focus to the page', async () => {
    function Form() {
      const [busy, setBusy] = useState(false);
      return (
        <Drawer resizeKey="test-drawerfocus-test-5" isOpen onOpenChange={() => undefined} title="New bot" busy={busy} primary={<button disabled={busy}>Save</button>}>
          {busy ? <p>Saving…</p> : <input aria-label="Name" onKeyDown={(e) => e.key === 'Enter' && setBusy(true)} />}
        </Drawer>
      );
    }
    await inRouter(Form);
    await settle();
    screen.getByRole('textbox', { name: 'Name' }).focus();
    await userEvent.keyboard('{Enter}');
    await settle(20);
    expect(inDrawer()).toBe(true);
  });
});
