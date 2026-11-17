// A Dialog or Drawer belongs to the context it was opened in;
// when that context ends without a reload (realm fallback, realm removed, a switch), the overlay closes,
// without a "Discard changes?" ask. A late answer ('late') changes nothing on screen.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { bump } from '@core/ctx';
import { boot } from '@core/test/env';
import { Dialog, Drawer } from './Overlays';

beforeEach(() => {
  boot();
});

async function inRouter(Component: () => ReactElement) {
  const history = createMemoryHistory({ initialEntries: ['/'] });
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

function DialogHost() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Dialog isOpen={open} onOpenChange={setOpen} title="Rename atlas" primaryLabel="Rename" onPrimary={() => undefined} />
      {!open && <p>closed</p>}
    </>
  );
}

function DrawerHost() {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState('');
  return open ? (
    <Drawer resizeKey="test-bump-test" isOpen onOpenChange={setOpen} title="New computer" dirty={name !== ''}>
      <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
    </Drawer>
  ) : (
    <p>closed</p>
  );
}

describe('overlays end with their context', () => {
  it('a realm fallback closes an open dialog', async () => {
    render(<DialogHost />);
    await act(async () => { bump('fallback'); });
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it('a late answer leaves the dialog open', async () => {
    render(<DialogHost />);
    await act(async () => { bump('late'); });
    expect(screen.queryByText('closed')).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a switch closes a dirty drawer at once, with no "Discard changes?"', async () => {
    await inRouter(() => <DrawerHost />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'KEY=VALUE' } });
    });
    await act(async () => { bump('switch'); });
    expect(screen.queryByText(/Discard changes/)).toBeNull();
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it('a closed overlay ignores later bumps', async () => {
    let calls = 0;
    function Closed() {
      return <Dialog isOpen={false} onOpenChange={() => { calls++; }} title="Rename atlas" />;
    }
    render(<Closed />);
    await act(async () => { bump('switch'); });
    expect(calls).toBe(0);
  });
});
