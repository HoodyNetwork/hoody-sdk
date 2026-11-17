// Overlay parity: the phone Sheet (and a Popover's phone sheet) and ActionMenu's phone tray follow the same plumbing as
// Dialog and Drawer: they are counted by the overlay stack, close when the context they were opened in ends (a realm
// switch, sign-out) and give focus back to the page title when their invoker is gone. A sheet opened over a Dialog sits
// above it. A Drawer refusing Escape while busy says why, as Dialog does.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bump } from '@core/ctx';
import { boot } from '@core/test/env';
import { Button } from '../controls/Button';
import { ActionMenu, Dialog, Drawer, Popover, Sheet } from './Overlays';
import { openCount } from './shared';
import strings from './strings.en.json';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

function setPhone(phone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => ({ matches: phone && q.includes('600'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 900));
  });

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  setPhone(true);
});
afterEach(() => {
  cleanup();
  setPhone(false);
  window.dispatchEvent(new Event('blur'));
  document.body.replaceChildren();
});

function ControlledSheet({ start = true, onClose }: { start?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(start);
  return (
    <>
      <h1 data-hub-title="" tabIndex={-1}>
        Page
      </h1>
      <Sheet
        isOpen={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) onClose?.();
        }}
        title="Pick a realm"
      >
        <p>rows</p>
      </Sheet>
    </>
  );
}

describe('Sheet joins the overlay plumbing', () => {
  it('is counted while open', async () => {
    const { unmount } = render(<ControlledSheet />);
    expect(screen.getByRole('dialog', { name: 'Pick a realm' })).toBeInTheDocument();
    expect(openCount('sheet')).toBe(1);
    unmount();
    expect(openCount('sheet')).toBe(0);
  });

  for (const reason of ['switch', 'signout'])
    it(`closes when the context ends ('${reason}')`, async () => {
      const onClose = vi.fn();
      render(<ControlledSheet onClose={onClose} />);
      act(() => {
        bump(reason);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

  it("a late answer ('late') closes nothing", async () => {
    const onClose = vi.fn();
    render(<ControlledSheet onClose={onClose} />);
    act(() => {
      bump('late');
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('gives focus to the page title when its invoker is gone', async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      const [gone, setGone] = useState(false);
      return (
        <>
          <h1 data-hub-title="" tabIndex={-1}>
            Page
          </h1>
          {!gone && (
            <button type="button" onClick={() => setOpen(true)}>
              Open sheet
            </button>
          )}
          <Sheet isOpen={open} onOpenChange={setOpen} title="Filters">
            <button
              type="button"
              onClick={() => {
                setGone(true);
                setOpen(false);
              }}
            >
              Remove and close
            </button>
          </Sheet>
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Open sheet' });
    act(() => opener.focus());
    await act(async () => {
      fireEvent.click(opener);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove and close' }));
    });
    await settle();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Page' }));
  });

  it('opened over a Dialog, it sits above the Dialog', async () => {
    function Host() {
      const [sheet, setSheet] = useState(false);
      return (
        <Dialog isOpen onOpenChange={() => undefined} title="Move">
          <button type="button" onClick={() => setSheet(true)}>
            Choose
          </button>
          <Sheet isOpen={sheet} onOpenChange={setSheet} title="Places">
            <p>rows</p>
          </Sheet>
        </Dialog>
      );
    }
    render(<Host />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose' }));
    });
    const scrim = screen.getByRole('dialog', { name: 'Places' }).closest('[data-over-dialog]');
    expect(scrim).not.toBeNull();
  });

  it('opened with no Dialog open, it stays at the drawer layer', async () => {
    render(<ControlledSheet />);
    expect(screen.getByRole('dialog', { name: 'Pick a realm' }).closest('[data-over-dialog]')).toBeNull();
  });
});

describe("Popover's phone sheet joins the overlay plumbing", () => {
  it('is counted and closes when the context ends', async () => {
    render(
      <Popover trigger={<Button>Pick</Button>} label="Pick a model" phone="sheet">
        <p>models</p>
      </Popover>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    });
    expect(screen.getByRole('dialog', { name: 'Pick a model' })).toBeInTheDocument();
    expect(openCount('sheet')).toBe(1);
    act(() => {
      bump('switch');
    });
    await settle();
    expect(screen.queryByRole('dialog', { name: 'Pick a model' })).toBeNull();
    expect(openCount('sheet')).toBe(0);
  });
});

describe('ActionMenu phone tray joins the overlay plumbing', () => {
  const ITEMS = [{ id: 'open', label: 'Open', onAction: () => undefined }];

  it('is counted while open and closes when the context ends', async () => {
    render(<ActionMenu label="Row actions" items={ITEMS} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Row actions' }));
    });
    expect(screen.getByRole('dialog', { name: 'Row actions' })).toBeInTheDocument();
    expect(openCount('tray')).toBe(1);
    act(() => {
      bump('signout');
    });
    await settle();
    expect(screen.queryByRole('dialog', { name: 'Row actions' })).toBeNull();
    expect(openCount('tray')).toBe(0);
  });

  it('a desktop menu is not a tray: not counted', async () => {
    setPhone(false);
    render(<ActionMenu label="Row actions" items={ITEMS} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Row actions' }));
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(openCount('tray')).toBe(0);
  });

  it('gives focus to the page title when its trigger is gone', async () => {
    function Host() {
      const [gone, setGone] = useState(false);
      return (
        <>
          <h1 data-hub-title="" tabIndex={-1}>
            Page
          </h1>
          {!gone && <ActionMenu label="Row actions" items={[{ id: 'del', label: 'Delete', onAction: () => setGone(true) }]} />}
        </>
      );
    }
    render(<Host />);
    const trigger = screen.getByRole('button', { name: 'Row actions' });
    act(() => trigger.focus());
    await act(async () => {
      fireEvent.click(trigger);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    });
    await settle();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Page' }));
  });
});

describe('Drawer: a refused Escape says why', () => {
  function Busy({ busy }: { busy: boolean }) {
    return (
      <Drawer resizeKey="test-parity-drawer" isOpen onOpenChange={() => undefined} title="Rename" busy={busy}>
        <p>body</p>
      </Drawer>
    );
  }

  it('Escape while busy announces the reason; the drawer stays; the line goes once the change settles', async () => {
    setPhone(false);
    const { rerender } = render(<Busy busy />);
    const dialog = screen.getByRole('dialog', { name: 'Rename' });
    expect(screen.queryByText(strings.busyHint, { selector: 'p' })).toBeNull();
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'Escape' });
      fireEvent.keyUp(dialog, { key: 'Escape' });
    });
    expect(screen.getByRole('dialog', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.getByText(strings.busyHint, { selector: 'p' })).toHaveAttribute('role', 'status');
    rerender(<Busy busy={false} />);
    expect(screen.queryByText(strings.busyHint, { selector: 'p' })).toBeNull();
    // A later busy spell nobody pressed Escape in shows no line left over.
    rerender(<Busy busy />);
    expect(screen.queryByText(strings.busyHint, { selector: 'p' })).toBeNull();
  });

  it('Escape while not busy closes as before and shows no line', async () => {
    setPhone(false);
    const onOpenChange = vi.fn();
    render(
      <Drawer resizeKey="test-parity-drawer-2" isOpen onOpenChange={onOpenChange} title="Rename">
        <p>body</p>
      </Drawer>,
    );
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog', { name: 'Rename' }), { key: 'Escape' });
      fireEvent.keyUp(screen.getByRole('dialog', { name: 'Rename' }), { key: 'Escape' });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText(strings.busyHint, { selector: 'p' })).toBeNull();
  });
});

describe('the close button has one name in every overlay', () => {
  it('a Dialog, a Drawer and a Sheet each name their x "Close"', async () => {
    setPhone(false);
    const { unmount } = render(
      <Dialog isOpen onOpenChange={() => undefined} title="Rename">
        <p>body</p>
      </Dialog>,
    );
    expect(document.querySelector('[data-dialog-close]')).toHaveAccessibleName(strings.close);
    unmount();
    const drawer = render(
      <Drawer resizeKey="test-parity-drawer-3" isOpen onOpenChange={() => undefined} title="Details">
        <p>body</p>
      </Drawer>,
    );
    // A drawer has two (the phone back arrow and the x): both carry the one name.
    expect(screen.getAllByRole('button', { name: strings.close }).length).toBeGreaterThan(0);
    drawer.unmount();
    setPhone(true);
    render(<ControlledSheet />);
    expect(screen.getAllByRole('button', { name: strings.close }).length).toBeGreaterThan(0);
  });

  it('the strings hold one close name', () => {
    expect(Object.entries(strings).filter(([, v]) => /^close\b/i.test(v))).toEqual([['close', 'Close']]);
  });
});
