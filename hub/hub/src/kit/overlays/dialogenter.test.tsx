// Enter and focus rules of the kit Dialog, case by case: which controls count as
// a text field for Enter-to-confirm and for where a confirm opens, and that focus never opens on, or is rescued onto, a
// control inside an aria-hidden box in the dialog, out of the Tab order or an <input type="hidden">. React Aria's Select
// with up to 300 options keeps a <select tabindex="-1"> in an aria-hidden box for forms and autofill; an ordinary dialog
// opened there, unseen, and arrow keys could change the choice. Its field is its own button.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Switch } from '../forms/fields';
import { Select } from '../forms/more';
import { ConfirmDialog, Dialog } from './Overlays';

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

const enter = (el: Element, init: Partial<KeyboardEventInit> & { keyCode?: number } = {}) =>
  act(async () => {
    fireEvent.keyDown(el, { key: 'Enter', ...init });
    fireEvent.keyUp(el, { key: 'Enter', ...init });
  });

const active = () => document.activeElement as HTMLElement | null;
const regions = [
  { value: 'eu', label: 'Europe' },
  { value: 'us', label: 'Americas' },
] as const;

/** A kit Select first, then a text field, in an ordinary dialog. */
function WithSelect({ field = true, onPrimary = () => undefined }: { field?: boolean; onPrimary?: () => void }) {
  const [region, setRegion] = useState<'eu' | 'us'>('eu');
  return (
    <Dialog isOpen onOpenChange={() => undefined} title="Move" primaryLabel="Move" onPrimary={onPrimary} size="lg">
      <Select label="Region" options={regions} value={region} onChange={setRegion} />
      {field && <input aria-label="Note" defaultValue="" />}
    </Dialog>
  );
}

describe('focus never opens on a control hidden from people', () => {
  it('the Select keeps a hidden <select> (so the cases below are real)', async () => {
    render(<WithSelect />);
    await frames();
    const hidden = document.querySelector('[data-dialog-body] select');
    expect(hidden).not.toBeNull();
    expect(hidden!.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('an ordinary dialog whose first field is a Select opens on its button, never on its hidden <select>', async () => {
    render(<WithSelect />);
    await frames();
    expect(active()?.tagName).toBe('BUTTON');
    expect(active()?.getAttribute('aria-haspopup')).toBe('listbox');
    expect(active()?.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('a Select alone opens on its button too', async () => {
    render(<WithSelect field={false} />);
    await frames();
    expect(active()?.getAttribute('aria-haspopup')).toBe('listbox');
  });

  it('the rescue (the focused control goes away) never lands on the hidden <select>', async () => {
    function Going() {
      const [shown, setShown] = useState(true);
      const [region, setRegion] = useState<'eu' | 'us'>('eu');
      return (
        <Dialog isOpen onOpenChange={() => undefined} title="Move" primaryLabel="Move" onPrimary={() => undefined} initialFocus="primary">
          {shown && (
            <button type="button" onClick={() => setShown(false)}>
              Hide me
            </button>
          )}
          <Select label="Region" options={regions} value={region} onChange={setRegion} />
        </Dialog>
      );
    }
    render(<Going />);
    await frames();
    const hide = screen.getByRole('button', { name: 'Hide me' });
    hide.focus();
    await act(async () => {
      fireEvent.click(hide);
    });
    await frames();
    expect(active()?.getAttribute('aria-haspopup')).toBe('listbox');
    expect(active()?.closest('[aria-hidden="true"]')).toBeNull();
  });
});

describe('nor on a field taken out of reach on purpose', () => {
  const Fields = ({ first }: { first: ReactElement }) => (
    <Dialog isOpen onOpenChange={() => undefined} title="Move" primaryLabel="Move" onPrimary={() => undefined}>
      {first}
      <input aria-label="Note" defaultValue="" />
    </Dialog>
  );

  it('a field out of the Tab order (tabindex -1): focus opens on the next field', async () => {
    render(<Fields first={<input aria-label="Kept" tabIndex={-1} />} />);
    await frames();
    expect(active()).toBe(screen.getByRole('textbox', { name: 'Note' }));
  });

  it('a field in an aria-hidden box: focus opens on the next field', async () => {
    render(
      <Fields
        first={
          <div aria-hidden="true">
            <input aria-label="Kept" />
          </div>
        }
      />,
    );
    await frames();
    expect(active()).toBe(screen.getByRole('textbox', { name: 'Note' }));
  });

  it('an <input type="hidden"> (a form value, never a control): focus opens on the next field', async () => {
    render(<Fields first={<input type="hidden" name="kept" defaultValue="1" />} />);
    await frames();
    expect(active()).toBe(screen.getByRole('textbox', { name: 'Note' }));
  });
});

describe('a Switch is no text field', () => {
  it('a confirm with only a Switch opens on Cancel, and Enter on the switch confirms nothing', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog isOpen onOpenChange={() => undefined} title="Turn on sync" confirmLabel="Turn on" onConfirm={onConfirm}>
        <Switch label="Also on this computer" />
      </ConfirmDialog>,
    );
    await frames();
    expect(active()).toBe(screen.getByRole('button', { name: 'Cancel' }));
    await enter(screen.getByRole('switch', { name: 'Also on this computer' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('an ordinary dialog: Enter on its switch presses nothing', async () => {
    const onPrimary = vi.fn();
    render(
      <Dialog isOpen onOpenChange={() => undefined} title="Sync" primaryLabel="Save" onPrimary={onPrimary}>
        <Switch label="Sync" />
      </Dialog>,
    );
    await frames();
    await enter(screen.getByRole('switch', { name: 'Sync' }));
    expect(onPrimary).not.toHaveBeenCalled();
  });
});

describe('every input type that is not text', () => {
  const types = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'hidden', 'image', 'range', 'color'] as const;

  it.each(types)('type=%s: a confirm never opens on it, and Enter on it confirms nothing', async (type) => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog isOpen onOpenChange={() => undefined} title="Apply" confirmLabel="Apply" onConfirm={onConfirm}>
        <input type={type} aria-label="Control" data-testid="control" />
      </ConfirmDialog>,
    );
    await frames();
    const control = screen.getByTestId('control');
    expect(active()).not.toBe(control);
    expect(active()).toBe(screen.getByRole('button', { name: 'Cancel' }));
    await enter(control);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a mixed-case type is the same type: type="CheckBox" is no text field either', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog isOpen onOpenChange={() => undefined} title="Apply" confirmLabel="Apply" onConfirm={onConfirm}>
        <input type="CheckBox" aria-label="Control" data-testid="control" />
      </ConfirmDialog>,
    );
    await frames();
    const control = screen.getByTestId('control');
    expect(active()).toBe(screen.getByRole('button', { name: 'Cancel' }));
    await enter(control);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a type the browser does not know is a text field: a confirm opens on it, and Enter there confirms', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog isOpen onOpenChange={() => undefined} title="Apply" confirmLabel="Apply" onConfirm={onConfirm}>
        <input type="bogus" aria-label="Control" data-testid="control" />
      </ConfirmDialog>,
    );
    await frames();
    const control = screen.getByTestId('control');
    expect(active()).toBe(control);
    await enter(control);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('Enter that is not a confirm', () => {
  const Named = ({ onPrimary }: { onPrimary: () => void }) => (
    <Dialog isOpen onOpenChange={() => undefined} title="Rename" primaryLabel="Rename" onPrimary={onPrimary}>
      <input aria-label="Name" defaultValue="atlas" />
    </Dialog>
  );

  it('Enter that picks an IME candidate (isComposing, or the keyCode 229 some browsers send) presses nothing', async () => {
    const onPrimary = vi.fn();
    render(<Named onPrimary={onPrimary} />);
    await frames();
    const field = screen.getByRole('textbox', { name: 'Name' });
    await enter(field, { isComposing: true });
    await enter(field, { keyCode: 229 });
    expect(onPrimary).not.toHaveBeenCalled();
    await enter(field);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('a field inside its own form submits that form, never the dialog primary', async () => {
    const onPrimary = vi.fn();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <Dialog isOpen onOpenChange={() => undefined} title="Code" primaryLabel="Verify" onPrimary={onPrimary}>
        <form onSubmit={onSubmit}>
          <input aria-label="Code" defaultValue="123456" />
        </form>
      </Dialog>,
    );
    await frames();
    const field = screen.getByRole('textbox', { name: 'Code' });
    field.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onPrimary).not.toHaveBeenCalled();
  });
});
