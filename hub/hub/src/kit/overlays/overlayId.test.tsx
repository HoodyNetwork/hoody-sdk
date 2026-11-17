// Vitest: every kit overlay takes an optional overlayId and writes it as data-hub-overlay
// on its element with the dialog role, so the name exists only while the overlay is open. Open with the prop: exactly one
// [data-hub-overlay] and it is that dialog/alertdialog element. Closed, or open without the prop: none.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { ConfirmDialog, DangerConfirm, Dialog, Drawer, Sheet } from './Overlays';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

async function inRouter(Component: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const none = () => undefined;
type Make = (open: boolean, id?: string) => ReactElement;
const overlays: Array<[string, 'dialog' | 'alertdialog', Make]> = [
  ['Dialog', 'dialog', (open, id) => <Dialog isOpen={open} onOpenChange={none} title="Rename" primaryLabel="Rename" onPrimary={none} overlayId={id} />],
  ['ConfirmDialog', 'alertdialog', (open, id) => <ConfirmDialog isOpen={open} onOpenChange={none} title="Restart?" confirmLabel="Restart" onConfirm={none} overlayId={id} />],
  ['DangerConfirm', 'alertdialog', (open, id) => <DangerConfirm isOpen={open} onOpenChange={none} title="Delete?" confirmText="web-1" confirmLabel="Delete" onConfirm={none} overlayId={id} />],
  ['Drawer', 'dialog', (open, id) => <Drawer resizeKey="test-overlayid-test" isOpen={open} onOpenChange={none} title="Schedule" overlayId={id}><p>Body</p></Drawer>],
  ['Sheet', 'dialog', (open, id) => <Sheet isOpen={open} onOpenChange={none} title="Filters" overlayId={id}><p>Body</p></Sheet>],
];

const marked = () => document.querySelectorAll('[data-hub-overlay]');

describe('kit overlays: overlayId', () => {
  it.each(overlays)('%s open with overlayId: exactly one [data-hub-overlay="t"], and it is the %s element', async (_n, role, make) => {
    await inRouter(() => make(true, 't'));
    const all = marked();
    expect(all).toHaveLength(1);
    expect(all[0]!.getAttribute('data-hub-overlay')).toBe('t');
    expect(all[0]).toBe(screen.getByRole(role));
  });

  it.each(overlays)('%s open without overlayId: no [data-hub-overlay]', async (_n, role, make) => {
    await inRouter(() => make(true));
    expect(screen.getByRole(role)).toBeInTheDocument();
    expect(marked()).toHaveLength(0);
  });

  it.each(overlays)('%s closed with overlayId: no [data-hub-overlay]', async (_n, _role, make) => {
    await inRouter(() => make(false, 't'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(marked()).toHaveLength(0);
  });
});
