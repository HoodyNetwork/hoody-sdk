// C9 for overlays: a Dialog that closes on a
// "may have gone through" outcome moves it to the sticky toast with Check again (the shell stays
// silent while the dialog shows it); a Drawer holding a pending change never asks "Discard changes?"
// (nothing can be discarded) and leaves exactly one toast.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Button } from '../controls/Button';
import { FormFooter } from '../forms/more';
import { ActionMenu, ConfirmDialog, Dialog, Drawer } from './Overlays';

const toasts = vi.hoisted(() => [] as Array<{ title: string; tone?: string; action?: { label: string; onAction: () => void } }>);
vi.mock('../states/Toast', () => ({
  showToast: (c: { title: string; tone?: string; action?: { label: string; onAction: () => void } }) => {
    toasts.push(c);
    return 'k';
  },
}));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  toasts.length = 0;
});

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
// Initial focus lands a frame after open; Esc goes to the focused element.
const focused = () => act(async () => { await new Promise((r) => window.requestAnimationFrame(() => r(undefined))); });
const press = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el); }); };
const escape = async () => {
  const el = document.activeElement ?? document.body;
  await act(async () => {
    fireEvent.keyDown(el, { key: 'Escape' });
    fireEvent.keyUp(el, { key: 'Escape' });
  });
};
const button = (name: string | RegExp) => screen.getByRole('button', { name });

async function inRouter(Component: () => ReactElement) {
  const history = createMemoryHistory({ initialEntries: ['/'] });
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

function PendingDialog({ onCheck, checking }: { onCheck: () => void; checking?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Dialog isOpen={open} onOpenChange={setOpen} title="Rename atlas" primaryLabel="Rename" onPrimary={() => undefined} outcome={{ kind: 'pending' }} onCheck={onCheck} {...(checking ? { checking } : {})}>
        <input aria-label="Name" defaultValue="atlas" />
      </Dialog>
      {!open && <p>closed</p>}
    </>
  );
}

describe('Dialog: a pending outcome is never lost (C9)', () => {
  it('Cancel on a pending dialog leaves the sticky toast with Check again', async () => {
    const onCheck = vi.fn();
    render(<PendingDialog onCheck={onCheck} />);
    await press(button('Cancel'));
    await tick();
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.tone).toBe('unknown');
    expect(toasts[0]?.action?.label).toBe('Check again');
    toasts[0]?.action?.onAction();
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it('Esc on a pending dialog leaves the toast too', async () => {
    render(<PendingDialog onCheck={() => undefined} />);
    await focused();
    await escape();
    await tick();
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(toasts).toHaveLength(1);
  });

  it('while Check again reads, the dialog cannot be dismissed', async () => {
    render(<PendingDialog onCheck={() => undefined} checking />);
    expect(button('Cancel')).toBeDisabled();
    await focused();
    await escape();
    await tick();
    expect(screen.queryByText('closed')).toBeNull();
    expect(toasts).toHaveLength(0);
  });

  it('a dialog with no pending outcome leaves no toast', async () => {
    function Plain() {
      const [open, setOpen] = useState(true);
      return <Dialog isOpen={open} onOpenChange={setOpen} title="Rename atlas" primaryLabel="Rename" onPrimary={() => undefined} />;
    }
    render(<Plain />);
    await press(button('Cancel'));
    await tick();
    expect(toasts).toHaveLength(0);
  });
});

describe('Drawer: a pending change is never "discarded"', () => {
  it('Close on a dirty drawer with a pending save closes at once and leaves one toast', async () => {
    function Host() {
      const [open, setOpen] = useState(true);
      const [name, setName] = useState('');
      const [pending, setPending] = useState(false);
      useEffect(() => undefined, []);
      return open ? (
        <Drawer resizeKey="test-pending-test"
          isOpen
          onOpenChange={setOpen}
          title="Rename"
          dirty={name !== ''}
          footer={<FormFooter dirty={name !== ''} outcome={pending ? 'pending' : undefined} onCheck={() => undefined} onDiscard={() => undefined} />}
        >
          <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onPress={() => setPending(true)}>Make pending</Button>
        </Drawer>
      ) : (
        <p>closed</p>
      );
    }
    await inRouter(() => <Host />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'atlas-2' } });
    });
    await press(button('Make pending'));
    await tick();
    await press(screen.getAllByRole('button', { name: /^Close/ })[0] as HTMLElement);
    await tick();
    expect(screen.queryByText(/Discard changes/)).toBeNull();
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(toasts).toHaveLength(1);
  });
});

describe('overlay keyboard and focus details', () => {
  it('Enter that picks an IME candidate does not press the primary', async () => {
    const onPrimary = vi.fn();
    render(<Dialog isOpen onOpenChange={() => undefined} title="Rename atlas" primaryLabel="Rename" onPrimary={onPrimary}><input aria-label="Name" defaultValue="atlas" /></Dialog>);
    const input = screen.getByLabelText('Name');
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter', isComposing: true }); });
    expect(onPrimary).not.toHaveBeenCalled();
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('a confirm with a field (rename) opens on the field, a plain confirm on Cancel', async () => {
    const { unmount } = render(
      <ConfirmDialog isOpen onOpenChange={() => undefined} title="Rename atlas" confirmLabel="Rename" onConfirm={() => undefined}>
        <input aria-label="Name" defaultValue="atlas" />
      </ConfirmDialog>,
    );
    await focused();
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
    unmount();
    render(<ConfirmDialog isOpen onOpenChange={() => undefined} title="Restart atlas?" confirmLabel="Restart" onConfirm={() => undefined} />);
    await focused();
    expect(document.activeElement).toBe(button('Cancel'));
  });

  it('a menu closed during "Copied" is not closed again by the old timer when reopened', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } });
    await inRouter(() => <ActionMenu label="Row actions" items={[{ id: 'url', label: 'Copy URL', icon: 'copy', copy: 'https://example.com/t', onAction: () => undefined }]} />);
    await press(button('Row actions'));
    await press(screen.getByRole('menuitem', { name: 'Copy URL' }));
    await tick();
    await escape();
    await tick();
    await press(button('Row actions'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await act(async () => { await new Promise((r) => setTimeout(r, 1700)); });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('a drawer unmounted while open gives focus back to its opener (React Aria\'s focus scope)', async () => {
    function Host() {
      const [editing, setEditing] = useState(false);
      return (
        <>
          <Button onPress={() => setEditing(true)}>Edit</Button>
          <Button onPress={() => undefined}>Other</Button>
          {editing && (
            <Drawer resizeKey="test-pending-test-2" isOpen onOpenChange={() => undefined} title="Rename">
              <Button onPress={() => setEditing(false)}>Done</Button>
            </Drawer>
          )}
        </>
      );
    }
    await inRouter(() => <Host />);
    const edit = button('Edit');
    edit.focus();
    await press(edit);
    await focused();
    await press(button('Done'));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(document.activeElement).toBe(edit);
  });

  it('a second Esc over an open "Discard changes?" keeps the field Keep editing returns to', async () => {
    function Host() {
      const [a, setA] = useState('');
      return (
        <Drawer resizeKey="test-pending-test-3" isOpen onOpenChange={() => undefined} title="Rename" dirty={a !== ''}>
          <input aria-label="First" value={a} onChange={(e) => setA(e.target.value)} />
          <input aria-label="Second" defaultValue="" />
        </Drawer>
      );
    }
    await inRouter(() => <Host />);
    await act(async () => { fireEvent.change(screen.getByLabelText('First'), { target: { value: 'x' } }); });
    const second = screen.getByLabelText('Second');
    second.focus();
    await escape();
    await focused();
    await escape();
    await focused();
    await press(button('Keep editing'));
    await focused();
    expect(document.activeElement).toBe(second);
  });
});

describe('Dialog: the header x (OP-G) is Cancel', () => {
  const closeX = () => screen.getByRole('button', { name: 'Close' });

  it('the header x on a pending dialog leaves the sticky toast with Check again, as Cancel does', async () => {
    const onCheck = vi.fn();
    render(<PendingDialog onCheck={onCheck} />);
    await press(closeX());
    await tick();
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.tone).toBe('unknown');
    expect(toasts[0]?.action?.label).toBe('Check again');
    toasts[0]?.action?.onAction();
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it('while Check again reads, the header x is disabled and the dialog stays', async () => {
    render(<PendingDialog onCheck={() => undefined} checking />);
    expect(closeX()).toBeDisabled();
    await press(closeX());
    await tick();
    expect(screen.queryByText('closed')).toBeNull();
    expect(toasts).toHaveLength(0);
  });

  it('the header x on an idle dialog closes it with no toast', async () => {
    function Plain() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Dialog isOpen={open} onOpenChange={setOpen} title="Rename atlas" primaryLabel="Rename" onPrimary={() => undefined} />
          {!open && <p>closed</p>}
        </>
      );
    }
    render(<Plain />);
    await press(closeX());
    await tick();
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(toasts).toHaveLength(0);
  });

  it('a dialog that refuses Esc and the scrim (isDismissable false) but has Cancel keeps its x, which closes it', async () => {
    function Held() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Dialog isOpen={open} isDismissable={false} onOpenChange={setOpen} title="Leave the realm?" primaryLabel="Leave" onPrimary={() => undefined} />
          {!open && <p>closed</p>}
        </>
      );
    }
    render(<Held />);
    expect(closeX()).toBeEnabled();
    await press(closeX());
    await tick();
    expect(screen.getByText('closed')).toBeInTheDocument();
  });
});
