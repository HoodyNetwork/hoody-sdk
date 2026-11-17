// Vitest: the kit Tooltip, like IconButton's, must not swallow the Escape that closes
// the drawer it sits in: the short inline row action of a DataTable wraps its button in it.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { Button } from '../controls/Button';
import { DataTable } from '../data/DataTable';
import { Drawer } from './Overlays';
import { Tooltip } from './Popover';

beforeEach(() => {
  boot();
});

interface Row {
  id: string;
  name: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } })];

function Host({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return open ? (
    <Drawer resizeKey="test-tooltip-escape-test" isOpen onOpenChange={setOpen} title="Keys">
      {children}
    </Drawer>
  ) : (
    <p>closed</p>
  );
}
async function mount(children: ReactNode) {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Host>{children}</Host> }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}
async function focusByTab(b: HTMLElement) {
  for (let i = 0; i < 40 && document.activeElement !== b; i++) await userEvent.tab();
  expect(document.activeElement).toBe(b);
}

describe('kit Tooltip and Escape inside a drawer', () => {
  it('a Button in a Tooltip: one Escape closes the drawer while keyboard focus shows the tooltip', async () => {
    await mount(
      <Tooltip content="Save the draft">
        <Button>Save</Button>
      </Tooltip>,
    );
    const b = await screen.findByRole('button', { name: 'Save' });
    await focusByTab(b);
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Save the draft'));
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('closed')).toBeInTheDocument();
  });

  it("a DataTable's short inline action: its tooltip shows, and one Escape closes the drawer", async () => {
    await mount(
      <DataTable
        label="Things"
        presentation="table"
        data={[{ id: 'a', name: 'alpha' }]}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        actions={() => [{ id: 'open', label: 'Open settings for alpha', short: 'Open', inline: true, onAction: () => undefined }]}
      />,
    );
    const row = (await screen.findByText('alpha')).closest('tr') as HTMLElement;
    const b = within(row).getByRole('button', { name: 'Open settings for alpha' });
    await focusByTab(b);
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Open settings for alpha'));
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('closed')).toBeInTheDocument();
  });
});
