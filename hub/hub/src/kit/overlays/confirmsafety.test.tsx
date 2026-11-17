// Confirm safety: Enter confirms only from a one-line text field, never from a tick box, a radio or any
// other control that is not text, and a danger dialog never confirms on Enter at all: only its own button confirms it.
// Focus on open (and the rescue when the focused control goes) never lands a danger dialog on a tick box or on its
// destructive button. The account wipe was the live case: its tick box took focus, Space ticked it, Enter wiped.
// Same group: DangerConfirm compares the trimmed text on both sides and never arms on an empty one; the consequences are
// part of the alertdialog's description; identical consequence lines are fine; closeFocus wins over the invoker.
// A confirm or a danger dialog never opens on its primary, whatever initialFocus asks: with no text
// field and no enabled Cancel it opens on the dialog itself, and its rescue never falls back to the primary either.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Checkbox } from '../forms/fields';
import { ConfirmDialog, DangerConfirm, Dialog } from './Overlays';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const frames = () =>
  act(async () => {
    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => setTimeout(r, 5));
  });

const enter = (el: Element) =>
  act(async () => {
    fireEvent.keyDown(el, { key: 'Enter' });
    fireEvent.keyUp(el, { key: 'Enter' });
  });

/** The wipe's shape: a danger confirm whose tick box arms the button. */
function Ticked({ tone, onConfirm }: { tone: 'default' | 'danger'; onConfirm: () => void }) {
  const [ticked, setTicked] = useState(false);
  return (
    <ConfirmDialog isOpen onOpenChange={() => undefined} title="Remove all local data" tone={tone} confirmLabel="Remove" onConfirm={onConfirm} confirmDisabled={!ticked} body={<p>Signs you out.</p>}>
      <Checkbox label="I understand" isSelected={ticked} onChange={setTicked} />
    </ConfirmDialog>
  );
}

const tickBox = () => screen.getByRole('checkbox', { name: 'I understand' });

describe('Enter never confirms from a tick box (the account wipe)', () => {
  it('a danger confirm with a tick box opens on Cancel, never on the box', async () => {
    render(<Ticked tone="danger" onConfirm={() => undefined} />);
    await frames();
    expect(document.activeElement).not.toBe(tickBox());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it.each(['danger', 'default'] as const)('%s: Space ticks the box, then Enter on it confirms nothing', async (tone) => {
    const onConfirm = vi.fn();
    render(<Ticked tone={tone} onConfirm={onConfirm} />);
    await frames();
    const box = tickBox();
    box.focus();
    await act(async () => {
      fireEvent.click(box);
    });
    expect(box).toBeChecked();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
    await enter(box);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('Enter presses the primary only from a one-line text field', () => {
  it('a radio or a checkbox in an ordinary dialog: no; a text or number field: yes', async () => {
    const onPrimary = vi.fn();
    render(
      <Dialog isOpen onOpenChange={() => undefined} title="Export" primaryLabel="Export" onPrimary={onPrimary} size="lg">
        <input type="radio" aria-label="Readable" name="how" />
        <input type="checkbox" aria-label="Include notes" />
        <input aria-label="File name" defaultValue="vault" />
        <input type="number" aria-label="Copies" defaultValue="1" />
      </Dialog>,
    );
    await frames();
    await enter(screen.getByRole('radio', { name: 'Readable' }));
    await enter(screen.getByRole('checkbox', { name: 'Include notes' }));
    expect(onPrimary).not.toHaveBeenCalled();
    await enter(screen.getByRole('textbox', { name: 'File name' }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    await enter(screen.getByRole('spinbutton', { name: 'Copies' }));
    expect(onPrimary).toHaveBeenCalledTimes(2);
  });

  it('a danger dialog never confirms on Enter, even from its text field; its own button does', async () => {
    const onPrimary = vi.fn();
    render(
      <Dialog isOpen onOpenChange={() => undefined} title="Delete atlas" tone="danger" primaryLabel="Delete" onPrimary={onPrimary} size="lg">
        <input aria-label="Reason" defaultValue="old" />
      </Dialog>,
    );
    await frames();
    await enter(screen.getByRole('textbox', { name: 'Reason' }));
    expect(onPrimary).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('DangerConfirm: Enter in the typed name confirms nothing, even armed; the button confirms', async () => {
    const onConfirm = vi.fn();
    render(<DangerConfirm isOpen onOpenChange={() => undefined} title="Delete atlas" confirmLabel="Delete computer" confirmText="atlas" onConfirm={onConfirm} />);
    await frames();
    const field = screen.getByRole('textbox');
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: 'atlas' } });
    expect(screen.getByRole('button', { name: 'Delete computer' })).toBeEnabled();
    await enter(field);
    expect(onConfirm).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete computer' }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

const shell = () => document.querySelector<HTMLElement>('[role="alertdialog"], [role="dialog"]');

describe('a guarded dialog never opens on its primary, and Enter there sends nothing', () => {
  it('the primary itself confirms from the keyboard (so the cases below would see a keyboard confirm)', async () => {
    const onPrimary = vi.fn();
    render(<Dialog isOpen onOpenChange={() => undefined} title="Delete atlas" tone="danger" primaryLabel="Delete" onPrimary={onPrimary} />);
    await frames();
    screen.getByRole('button', { name: 'Delete' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['initialFocus="primary" on an alertdialog', { role: 'alertdialog' as const, initialFocus: 'primary' as const }, 'Cancel'],
    ['initialFocus="primary" on a danger dialog', { tone: 'danger' as const, initialFocus: 'primary' as const }, 'Cancel'],
    ['no Cancel (hideCancel)', { tone: 'danger' as const, hideCancel: true, isDismissable: false }, 'shell'],
    ['Cancel disabled (a check is reading)', { tone: 'danger' as const, onCheck: () => undefined, checking: true }, 'shell'],
  ])('%s: opens off the primary', async (_n, props, where) => {
    const onPrimary = vi.fn();
    render(<Dialog isOpen onOpenChange={() => undefined} title="Delete atlas" primaryLabel="Delete" onPrimary={onPrimary} {...props} />);
    await frames();
    const primary = screen.getByRole('button', { name: 'Delete' });
    expect(primary).toBeEnabled();
    expect(document.activeElement).not.toBe(primary);
    expect(document.activeElement).toBe(where === 'shell' ? shell() : screen.getByRole('button', { name: 'Cancel' }));
    if (where === 'shell') await userEvent.keyboard('{Enter}');
    else await enter(document.activeElement as Element);
    expect(onPrimary).not.toHaveBeenCalled();
  });

  it('an ordinary dialog still honours initialFocus="primary"', async () => {
    render(<Dialog isOpen onOpenChange={() => undefined} title="Password changed" primaryLabel="Sign in again" onPrimary={() => undefined} hideCancel isDismissable={false} initialFocus="primary" />);
    await frames();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sign in again' }));
  });

  it('no Cancel: the rescue parks on the dialog, never the primary', async () => {
    function Rescue() {
      const [more, setMore] = useState(true);
      return (
        <Dialog isOpen onOpenChange={() => undefined} title="Delete atlas" tone="danger" primaryLabel="Delete" onPrimary={() => undefined} hideCancel isDismissable={false}>
          {more && <button onClick={() => setMore(false)}>Hide the list</button>}
        </Dialog>
      );
    }
    render(<Rescue />);
    await frames();
    const hide = screen.getByRole('button', { name: 'Hide the list' });
    hide.focus();
    await act(async () => {
      fireEvent.click(hide);
    });
    await frames();
    expect(document.activeElement).toBe(shell());
  });
});

describe('the rescue never parks a danger dialog on a tick box or its destructive button', () => {
  it('the focused control goes away: focus moves to Cancel', async () => {
    function Rescue() {
      const [more, setMore] = useState(true);
      return (
        <ConfirmDialog isOpen onOpenChange={() => undefined} title="Remove all local data" tone="danger" confirmLabel="Remove" onConfirm={() => undefined} body={<p>Signs you out.</p>}>
          {more && <button onClick={() => setMore(false)}>Hide the list</button>}
          <Checkbox label="I understand" />
        </ConfirmDialog>
      );
    }
    render(<Rescue />);
    await frames();
    const hide = screen.getByRole('button', { name: 'Hide the list' });
    hide.focus();
    await act(async () => {
      fireEvent.click(hide);
    });
    await frames();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });
});

describe('DangerConfirm compares the trimmed text on both sides', () => {
  it('a name with spaces around it arms on the name typed without them', async () => {
    render(<DangerConfirm isOpen onOpenChange={() => undefined} title="Delete atlas" confirmLabel="Delete computer" confirmText=" atlas " onConfirm={() => undefined} />);
    await frames();
    expect(screen.getByText('Type atlas to confirm')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'atlas' } });
    expect(screen.getByRole('button', { name: 'Delete computer' })).toBeEnabled();
  });

  it.each(['', '   '])('an empty name (%j) never arms', async (text) => {
    render(<DangerConfirm isOpen onOpenChange={() => undefined} title="Delete" confirmLabel="Delete computer" confirmText={text} onConfirm={() => undefined} />);
    await frames();
    expect(screen.getByRole('button', { name: 'Delete computer' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: ' ' } });
    expect(screen.getByRole('button', { name: 'Delete computer' })).toBeDisabled();
  });
});

describe('consequences', () => {
  const described = () => {
    const d = screen.getByRole('alertdialog');
    return (d.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' | ');
  };

  it('are part of the alertdialog description, after the body', async () => {
    render(<ConfirmDialog isOpen onOpenChange={() => undefined} title="Delete atlas" tone="danger" onConfirm={() => undefined} body="It cannot be undone." consequences={['Every file on the disk is erased.', 'Its links stop working.']} />);
    await frames();
    expect(described()).toBe('It cannot be undone. | Every file on the disk is erased.Its links stop working.');
  });

  it('describe the dialog on their own when there is no body', async () => {
    render(<ConfirmDialog isOpen onOpenChange={() => undefined} title="Delete atlas" tone="danger" onConfirm={() => undefined} consequences={['Every file on the disk is erased.']} />);
    await frames();
    expect(described()).toBe('Every file on the disk is erased.');
  });

  it('two identical lines both show, with no duplicate-key warning', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<ConfirmDialog isOpen onOpenChange={() => undefined} title="Delete" onConfirm={() => undefined} consequences={['A link stops working.', 'A link stops working.']} />);
    await frames();
    expect(within(screen.getByRole('alertdialog')).getAllByText('A link stops working.')).toHaveLength(2);
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key/);
  });
});

describe('closeFocus', () => {
  it('wins over the invoker on close, focused without a scroll', async () => {
    const heading = document.createElement('h2');
    heading.tabIndex = -1;
    document.body.append(heading);
    vi.spyOn(heading, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    const toHeading = vi.spyOn(heading, 'focus');
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Dialog isOpen={open} onOpenChange={setOpen} title="Note" body="Hi." primaryLabel="OK" onPrimary={() => undefined} closeFocus={() => heading} />
        </>
      );
    }
    render(<Harness />);
    const open = screen.getByRole('button', { name: 'Open' });
    open.focus();
    await act(async () => {
      fireEvent.click(open);
    });
    await frames();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    await frames();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(toHeading).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(heading);
    heading.remove();
  });
});
