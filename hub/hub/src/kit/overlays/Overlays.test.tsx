import { createBrowserHistory, createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../controls/Button';
import { useEffect } from 'react';
import { ActionMenu, ConfirmDialog, DangerConfirm, Dialog, Drawer, DrawerCancel, Popover, useDrawer, useDrawerParam } from './Overlays';
import { openCount } from './shared';

async function inRouter(Component: () => ReactElement, path = '/') {
  const history = createMemoryHistory({ initialEntries: [path] });
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
const clickOutside = () => {
  const el = document.body;
  act(() => {
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, pointerType: 'mouse' });
    fireEvent.mouseDown(el, { button: 0 });
    fireEvent.pointerUp(el, { button: 0, pointerId: 1, pointerType: 'mouse' });
    fireEvent.mouseUp(el, { button: 0 });
    fireEvent.click(el);
  });
};
const wait = (ms = 30) => act(async () => new Promise((r) => window.setTimeout(r, ms)));
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const type = async (label: string, value: string) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
};

function setPhone(phone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => ({ matches: phone && q.includes('600'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}

beforeEach(() => setPhone(false));
afterEach(() => vi.restoreAllMocks());

// ── Drawer ──────────────────────────────────────────────────────────────────────────

interface EditProps {
  busy?: boolean;
  pending?: boolean;
  discardText?: string;
}

function EditDrawer({ busy = false, pending = false, discardText }: EditProps) {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState('');
  return (
    <>
      <h1 tabIndex={-1} data-hub-title="">
        Page
      </h1>
      <Drawer resizeKey="test-overlays-test"
        isOpen={open}
        onOpenChange={setOpen}
        title="Rename"
        dirty={name !== ''}
        busy={busy}
        {...(discardText ? { discardText } : {})}
        outcome={pending ? <span>Unknown outcome</span> : undefined}
        primary={
          <Button variant="primary" onPress={() => setOpen(false)}>
            Save
          </Button>
        }
      >
        <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      </Drawer>
      {!open && <p>closed</p>}
    </>
  );
}

describe('Drawer footer', () => {
  it('a structured footer has Cancel just left of the primary; a clean Cancel closes at once', async () => {
    await inRouter(() => <EditDrawer />);
    const names = Array.from(screen.getByRole('dialog').querySelectorAll('footer button')).map((b) => b.textContent);
    expect(names).toEqual(['Cancel', 'Save']);
    await press(button('Cancel'));
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it('the Outcome slot sits on the left of the footer', async () => {
    await inRouter(() => <EditDrawer pending />);
    const foot = screen.getByRole('dialog').querySelector('footer');
    expect(foot?.firstElementChild?.textContent).toBe('Unknown outcome');
  });

  it('a string relabels Cancel ("Close" once a secret was shown)', async () => {
    await inRouter(() => (
      <Drawer resizeKey="test-overlays-test-2" isOpen onOpenChange={() => undefined} title="Key" cancel="Close" primary={<Button>Done</Button>}>
        body
      </Drawer>
    ));
    const names = Array.from(screen.getByRole('dialog').querySelectorAll('footer button')).map((b) => b.textContent);
    expect(names).toEqual(['Close', 'Done']);
  });

  it('a legacy free-form footer gets no automatic Cancel', async () => {
    await inRouter(() => (
      <Drawer resizeKey="test-overlays-test-3" isOpen onOpenChange={() => undefined} title="Key" footer={<Button>Done</Button>}>
        body
      </Drawer>
    ));
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
});

describe('Drawer dirty guard', () => {
  it('×, Esc and Cancel on a dirty drawer ask inline; Keep editing keeps the input and takes focus first', async () => {
    await inRouter(() => <EditDrawer />);
    await type('Name', 'atlas-2');
    const ways: Array<[string, () => Promise<void>]> = [
      ['×', () => press(screen.getAllByRole('button', { name: 'Close' }).at(-1) as HTMLElement)],
      ['Esc', escape],
      ['Cancel', () => press(button('Cancel'))],
    ];
    for (const [way, close] of ways) {
      await close();
      expect(screen.queryByRole('alert'), way).not.toBeNull();
      await wait();
      expect(screen.getByRole('alert')).toHaveTextContent('Discard changes?');
      expect(document.activeElement).toBe(button('Keep editing'));
      await press(button('Keep editing'));
      await wait();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
      expect(screen.getByLabelText('Name')).toHaveValue('atlas-2');
    }
  });

  it('Discard closes; the ask text can say why (shown-once secrets)', async () => {
    await inRouter(() => <EditDrawer discardText="Close? These won't be shown again" />);
    await type('Name', 'x');
    await press(button('Cancel'));
    expect(screen.getByRole('alert')).toHaveTextContent("Close? These won't be shown again");
    await press(button('Discard'));
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it('a clean drawer closes on Esc without asking', async () => {
    await inRouter(() => <EditDrawer />);
    await escape();
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it('a page-level DrawerCancel inside a custom footer goes through the same guard', async () => {
    function Custom() {
      const [open, setOpen] = useState(true);
      return open ? (
        <Drawer resizeKey="test-overlays-test-4" isOpen onOpenChange={setOpen} title="T" dirty footer={<DrawerCancel />}>
          body
        </Drawer>
      ) : (
        <p>closed</p>
      );
    }
    await inRouter(() => <Custom />);
    await press(button('Cancel'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('a primary DrawerCancel (a Done) is the same guarded close, drawn as the primary', async () => {
    function Custom() {
      const [open, setOpen] = useState(true);
      return open ? (
        <Drawer resizeKey="test-overlays-test-4b" isOpen onOpenChange={setOpen} title="T" dirty footer={<DrawerCancel variant="primary" label="Done" />}>
          body
        </Drawer>
      ) : (
        <p>closed</p>
      );
    }
    await inRouter(() => <Custom />);
    expect(button('Done')).toHaveAttribute('data-variant', 'primary');
    await press(button('Done'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('leaving the page from a dirty drawer asks; Discard then lets the navigation through', async () => {
    const router = await inRouter(() => <EditDrawer />, '/computers');
    await type('Name', 'y');
    await act(async () => {
      void router.navigate({ to: '/bots' as never });
    });
    await wait(50);
    expect(screen.getByRole('alert')).toHaveTextContent('Discard changes?');
    expect(router.state.location.pathname).toBe('/computers');
    await press(button('Discard'));
    await wait(50);
    expect(router.state.location.pathname).toBe('/bots');
  });

  it('busy and not dirty: leaving the page is refused while the change runs, then allowed once it settles', async () => {
    let setBusy: (b: boolean) => void = () => undefined;
    function BusyDrawer() {
      const [busy, sb] = useState(true);
      setBusy = sb;
      return (
        <Drawer resizeKey="test-overlays-test-5" isOpen onOpenChange={() => undefined} title="Rename" busy={busy}>
          <p>body</p>
        </Drawer>
      );
    }
    const router = await inRouter(() => <BusyDrawer />, '/computers');
    await act(async () => {
      void router.navigate({ to: '/bots' as never });
    });
    await wait(50);
    expect(router.state.location.pathname).toBe('/computers');
    expect(screen.getByRole('status')).toHaveTextContent('Wait until this finishes');
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    act(() => setBusy(false));
    await wait(20);
    expect(screen.queryByText(/Wait until this finishes/)).toBeNull();
    await act(async () => {
      void router.navigate({ to: '/bots' as never });
    });
    await wait(50);
    expect(router.state.location.pathname).toBe('/bots');
  });

  it('busy and dirty: no Discard while busy; Discard is offered only after it settles', async () => {
    let setBusy: (b: boolean) => void = () => undefined;
    function BusyDirty() {
      const [busy, sb] = useState(false);
      const [name, setName] = useState('');
      setBusy = sb;
      return (
        <Drawer resizeKey="test-overlays-test-6" isOpen onOpenChange={() => undefined} title="Rename" busy={busy} dirty={name !== ''}>
          <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        </Drawer>
      );
    }
    const router = await inRouter(() => <BusyDirty />, '/computers');
    await type('Name', 'y');
    // An ask that was already open when the change started cannot discard any more.
    await act(async () => {
      void router.navigate({ to: '/bots' as never });
    });
    await wait(50);
    expect(button('Discard')).toBeInTheDocument();
    act(() => setBusy(true));
    await wait(20);
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    expect(router.state.location.pathname).toBe('/computers');
    await act(async () => {
      void router.navigate({ to: '/bots' as never });
    });
    await wait(50);
    expect(router.state.location.pathname).toBe('/computers');
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    act(() => setBusy(false));
    await wait(20);
    await act(async () => {
      void router.navigate({ to: '/bots' as never });
    });
    await wait(50);
    await press(button('Discard'));
    await wait(50);
    expect(router.state.location.pathname).toBe('/bots');
  });

  it('Keep editing after a blocked navigation stays put', async () => {
    const router = await inRouter(() => <EditDrawer />, '/computers');
    await type('Name', 'y');
    await act(async () => {
      void router.navigate({ to: '/bots' as never });
    });
    await wait(50);
    await press(button('Keep editing'));
    await wait(50);
    expect(router.state.location.pathname).toBe('/computers');
    expect(screen.getByLabelText('Name')).toHaveValue('y');
  });

  it('browser Back from a dirty URL-kept drawer asks first (popstate)', async () => {
    window.history.replaceState(null, '', '/computers');
    const router = createRouter({ routeTree: createRootRoute({ component: () => <EditDrawer /> }), history: createBrowserHistory() });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    await act(async () => {
      await router.navigate({ to: '/computers' as never, search: { edit: '1' } as never });
    });
    await type('Name', 'y');
    await act(async () => {
      window.history.back();
    });
    await wait(100);
    expect(screen.getByRole('alert')).toHaveTextContent('Discard changes?');
    await press(button('Discard'));
    await wait(100);
    expect(router.state.location.search).toEqual({});
  });

  it('same-page URL writes by the page (closing after a save) pass the guard', async () => {
    const router = await inRouter(() => <EditDrawer />, '/');
    await type('Name', 'z');
    await act(async () => {
      await router.navigate({ to: '/', search: { tab: 'b' } as never, replace: true });
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(router.state.location.search).toEqual({ tab: 'b' });
  });
});

describe('Drawer in flight (C9)', () => {
  it('busy: ×, Esc, scrim and Cancel do not close it', async () => {
    await inRouter(() => <EditDrawer busy />);
    expect(button('Cancel')).toBeDisabled();
    await escape();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('closed')).toBeNull();
  });
});

describe('Drawer seam for a footer (FormFooter)', () => {
  it('a reported busy refuses closing until it clears', async () => {
    let report: ((busy: boolean) => void) | undefined;
    function Footer() {
      const d = useDrawer();
      useEffect(() => {
        report = (busy) => d?.reportOutcome('footer', { pending: false, busy });
      }, [d]);
      return <DrawerCancel />;
    }
    function Host() {
      const [open, setOpen] = useState(true);
      return open ? (
        <Drawer resizeKey="test-overlays-test-7" isOpen onOpenChange={setOpen} title="T" footer={<Footer />}>
          body
        </Drawer>
      ) : (
        <p>closed</p>
      );
    }
    await inRouter(() => <Host />);
    await act(async () => report?.(true));
    expect(button('Cancel')).toBeDisabled();
    await escape();
    expect(screen.queryByText('closed')).toBeNull();
    await act(async () => report?.(false));
    await press(button('Cancel'));
    expect(screen.getByText('closed')).toBeInTheDocument();
  });
});

describe('Drawer focus and stacking', () => {
  it('focus goes to the page title when the invoker is gone', async () => {
    function Gone() {
      const [open, setOpen] = useState(false);
      const [row, setRow] = useState(true);
      return (
        <>
          <h1 tabIndex={-1} data-hub-title="">
            Page
          </h1>
          {row && (
            <button type="button" onClick={() => setOpen(true)}>
              row
            </button>
          )}
          <Drawer resizeKey="test-overlays-test-8"
            isOpen={open}
            onOpenChange={setOpen}
            title="Delete"
            primary={
              <Button
                onPress={() => {
                  setRow(false);
                  setOpen(false);
                }}
              >
                Delete it
              </Button>
            }
          >
            body
          </Drawer>
        </>
      );
    }
    await inRouter(() => <Gone />);
    const row = button('row');
    row.focus();
    await press(row);
    await press(button('Delete it'));
    await wait(350);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Page' }));
  });

  it('a second open drawer is reported in dev', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await inRouter(() => (
      <>
        <Drawer resizeKey="test-overlays-test-9" isOpen onOpenChange={() => undefined} title="A">
          a
        </Drawer>
        <Drawer resizeKey="test-overlays-test-10" isOpen onOpenChange={() => undefined} title="B">
          b
        </Drawer>
      </>
    ));
    expect(openCount('drawer')).toBe(2);
    expect(err.mock.calls.some((c) => String(c[0]).includes('never opens a second drawer'))).toBe(true);
  });
});

describe('useDrawerParam', () => {
  it('open pushes ?edit=; close steps back over that entry so Back does not reopen it', async () => {
    let api: ReturnType<typeof useDrawerParam> | undefined;
    function Url() {
      api = useDrawerParam('edit');
      return <p>{api[0] ?? 'none'}</p>;
    }
    const router = await inRouter(() => <Url />, '/?tab=a');
    await act(async () => api?.[1]('k1'));
    await wait();
    expect(router.state.location.search).toEqual({ tab: 'a', edit: 'k1' });
    await act(async () => api?.[2]());
    await wait(50);
    expect(router.state.location.search).toEqual({ tab: 'a' });
    expect(router.history.canGoBack()).toBe(false);
  });

  it('a drawer opened by a link closes in place (replace)', async () => {
    let api: ReturnType<typeof useDrawerParam> | undefined;
    function Url() {
      api = useDrawerParam('edit');
      return <p>{api[0] ?? 'none'}</p>;
    }
    const router = await inRouter(() => <Url />, '/?edit=k9');
    expect(screen.getByText('k9')).toBeInTheDocument();
    await act(async () => api?.[2]());
    await wait();
    expect(router.state.location.search).toEqual({});
  });
});

// ── Dialog ──────────────────────────────────────────────────────────────────────────

describe('Dialog', () => {
  it('focuses the first field; Enter presses the primary', async () => {
    const onPrimary = vi.fn();
    await inRouter(() => (
      <Dialog isOpen onOpenChange={() => undefined} title="Rename" primaryLabel="Rename" onPrimary={onPrimary} size="lg">
        <input aria-label="New name" defaultValue="atlas" />
      </Dialog>
    ));
    await wait();
    expect(document.activeElement).toBe(screen.getByLabelText('New name'));
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText('New name'), { key: 'Enter' });
    });
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('an outside click closes an ordinary dialog (proves the click simulation)', async () => {
    const change = vi.fn();
    await inRouter(() => <Dialog isOpen onOpenChange={change} title="Note" body="Hi." primaryLabel="OK" onPrimary={() => undefined} />);
    await wait();
    clickOutside();
    expect(change).toHaveBeenCalledWith(false);
  });

  it('a forced single action: no Cancel, no ×, Esc and outside clicks do nothing', async () => {
    const change = vi.fn();
    await inRouter(() => <Dialog isOpen onOpenChange={change} title="Password changed" body="Sign in again." primaryLabel="Sign in again" onPrimary={() => undefined} hideCancel isDismissable={false} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    await wait();
    expect(document.activeElement).toBe(button('Sign in again'));
    await escape();
    clickOutside();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    // No header x either.
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
    expect(document.querySelector('[data-dialog-close]')).toBeNull();
    expect(change).not.toHaveBeenCalled();
  });

  it('pending (C9) locks the primary and offers a read-only check; Enter cannot resend', async () => {
    const onPrimary = vi.fn();
    const onCheck = vi.fn();
    await inRouter(() => (
      <Dialog isOpen onOpenChange={() => undefined} title="Code" primaryLabel="Confirm" onPrimary={onPrimary} outcome={{ kind: 'pending' }} onCheck={onCheck}>
        <input aria-label="Six-digit code" />
      </Dialog>
    ));
    expect(button('Confirm')).toBeDisabled();
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText('Six-digit code'), { key: 'Enter' });
    });
    expect(onPrimary).not.toHaveBeenCalled();
    await press(button(/check/i));
    expect(onCheck).toHaveBeenCalled();
  });

  it('a done outcome closes it', async () => {
    const change = vi.fn();
    await inRouter(() => <Dialog isOpen onOpenChange={change} title="T" primaryLabel="Go" onPrimary={() => undefined} outcome={{ kind: 'done' }} />);
    expect(change).toHaveBeenCalledWith(false);
  });
});

describe('ConfirmDialog / DangerConfirm', () => {
  it('a plain destructive confirm focuses Cancel, never the action', async () => {
    await inRouter(() => <ConfirmDialog isOpen onOpenChange={() => undefined} title="End session?" tone="danger" confirmLabel="End" onConfirm={() => undefined} />);
    await wait();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(document.activeElement).toBe(button('Cancel'));
  });

  it('busy: Cancel waits and Esc does not close', async () => {
    const change = vi.fn();
    await inRouter(() => <ConfirmDialog isOpen onOpenChange={change} title="Stop?" confirmLabel="Stop" onConfirm={() => undefined} busy />);
    expect(button('Cancel')).toBeDisabled();
    await escape();
    expect(change).not.toHaveBeenCalled();
  });

  it('DangerConfirm focuses the typed name and arms only on an exact match', async () => {
    const onConfirm = vi.fn();
    await inRouter(() => <DangerConfirm isOpen onOpenChange={() => undefined} title="Delete atlas?" confirmText="atlas" confirmLabel="Delete" onConfirm={onConfirm} consequences={['Every file is erased.']} />);
    await wait();
    const input = screen.getByLabelText('Type atlas to confirm');
    expect(document.activeElement).toBe(input);
    expect(button('Delete')).toBeDisabled();
    await type('Type atlas to confirm', 'atla');
    expect(button('Delete')).toBeDisabled();
    await type('Type atlas to confirm', 'atlas');
    expect(button('Delete')).toBeEnabled();
    await press(button('Delete'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

// ── Menu, Popover ───────────────────────────────────────────────────────────────────

describe('ActionMenu', () => {
  it('an item that opens a dialog ends with "…" exactly once', async () => {
    await inRouter(() => (
      <ActionMenu
        label="Row actions"
        items={[
          { id: 'r', label: 'Rename', opens: true, onAction: () => undefined },
          { id: 'd', label: 'Delete…', opens: true, tone: 'danger', onAction: () => undefined },
        ]}
      />
    ));
    await press(button('Row actions'));
    expect(screen.getByRole('menuitem', { name: 'Rename…' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete…' })).toBeInTheDocument();
  });

  it('a copy item copies, says Copied on the item, then closes after 1.5 s with no toast', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (x: string) => (written.push(x), Promise.resolve()) } });
    await inRouter(() => <ActionMenu label="Row actions" items={[{ id: 'url', label: 'Copy terminal URL', icon: 'copy', copy: 'https://example.com/t', onAction: () => undefined }]} />);
    await press(button('Row actions'));
    await press(screen.getByRole('menuitem', { name: 'Copy terminal URL' }));
    await wait();
    expect(written).toEqual(['https://example.com/t']);
    expect(screen.getByRole('menuitem', { name: 'Copied' })).toBeInTheDocument();
    await wait(1700);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows a disabled item with its reason', async () => {
    await inRouter(() => <ActionMenu label="Row actions" items={[{ id: 'start', label: 'Start', isDisabled: true, disabledReason: 'It is already running', onAction: () => undefined }]} />);
    await press(button('Row actions'));
    expect(screen.getByRole('menuitem', { name: /Start/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('It is already running')).toBeInTheDocument();
  });
});

describe('Popover', () => {
  it('a picker becomes a full-screen sheet on phones', async () => {
    setPhone(true);
    await inRouter(() => (
      <Popover trigger={<Button>Pick</Button>} label="Computers" phone="sheet" width="picker">
        <p>list</p>
      </Popover>
    ));
    await press(button('Pick'));
    expect(screen.getByRole('dialog', { name: 'Computers' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Computers' })).toBeInTheDocument();
  });

  it('children can close it (a picker closes after a choice)', async () => {
    await inRouter(() => (
      <Popover trigger={<Button>Pick</Button>} label="Realms" width="lg">
        {(close) => <Button onPress={close}>Personal</Button>}
      </Popover>
    ));
    await press(button('Pick'));
    await press(button('Personal'));
    await wait(200);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
