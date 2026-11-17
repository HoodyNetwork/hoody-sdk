// InfoTip Escape with focus below the tip: a hover-opened tip leaves
// focus in another field. Escape closes the tip, focus stays in that field, and the Escape goes no further, so a
// dialog under the tip stays open. With no tip open, Escape still reaches the dialog.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Dialog } from './Overlays';
import { ActionMenu } from './Menu';
import { Popover } from './Popover';
import { InfoTip } from './InfoTip';
import strings from './InfoTip.strings.en.json';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});
afterEach(() => {
  vi.useRealTimers();
});

const TEXT = 'A realm is a separate space for your computers, keys and settings.';
const about = (subject: string) => strings['info.about'].replace('{{subject}}', subject);
const tipText = () => screen.queryByText(TEXT);

/** Rests a mouse on the trigger until the tip opens (400 ms); focus is not moved. */
function hoverOpen(b: HTMLElement) {
  fireEvent.pointerOver(b, { pointerType: 'mouse' });
  fireEvent.pointerEnter(b, { pointerType: 'mouse' });
  act(() => void vi.advanceTimersByTime(400));
}

function InDialog({ withTip = true }: { withTip?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog isOpen={open} onOpenChange={setOpen} title="Rename realm" primaryLabel="Rename" onPrimary={() => undefined}>
      <input aria-label="Name" />
      {withTip && <InfoTip text={TEXT} subject="Realm" />}
    </Dialog>
  );
}

describe('InfoTip Escape with focus in another field', () => {
  it('a hover-opened tip: Escape closes it, the field keeps focus, and the Escape goes no further', () => {
    vi.useFakeTimers();
    const outer = vi.fn();
    const onOuter = (e: KeyboardEvent) => e.key === 'Escape' && outer();
    document.addEventListener('keydown', onOuter);
    render(
      <>
        <input aria-label="Name" />
        <InfoTip text={TEXT} subject="Realm" />
      </>,
    );
    const field = screen.getByRole('textbox', { name: 'Name' });
    act(() => field.focus());
    const b = screen.getByRole('button', { name: about('Realm') });
    hoverOpen(b);
    expect(tipText()).not.toBeNull();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(tipText()).toBeNull();
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(field);
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener('keydown', onOuter);
  });

  it('inside a Dialog: Escape closes the hover-opened tip, the Dialog stays open and the field keeps focus', () => {
    vi.useFakeTimers();
    render(<InDialog />);
    const field = screen.getByRole('textbox', { name: 'Name' });
    act(() => field.focus());
    hoverOpen(screen.getByRole('button', { name: about('Realm') }));
    expect(tipText()).not.toBeNull();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(tipText()).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Rename realm' })).toBeInTheDocument();
    expect(document.activeElement).toBe(field);
  });

  it('inside a Dialog with no tip open, Escape still reaches the Dialog and closes it', () => {
    render(<InDialog />);
    const field = screen.getByRole('textbox', { name: 'Name' });
    act(() => field.focus());
    expect(tipText()).toBeNull();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Rename realm' })).toBeNull();
  });
});

// A menu or popover opened above a hover-opened tip owns the
// Escape. It closes that layer only; the tip stays open until its own Escape.
describe('InfoTip Escape with a higher menu or popover', () => {
  function Above({ kind }: { kind: 'menu' | 'popover' }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <InfoTip text={TEXT} subject="Realm" />
        {kind === 'menu' ? (
          <ActionMenu label="Row actions" items={[{ id: 'a', label: 'Rename', onAction: () => undefined }, { id: 'b', label: 'Delete', onAction: () => undefined }]} isOpen={open} onOpenChange={setOpen} />
        ) : (
          <Popover trigger={<button type="button">Filters</button>} label="Filters" isOpen={open} onOpenChange={setOpen}>
            <input aria-label="Filter text" />
          </Popover>
        )}
        <button type="button" onClick={() => setOpen(true)}>Open above</button>
      </>
    );
  }

  it.each(['menu', 'popover'] as const)('a %s opened above the tip: Escape closes it, the tip stays; the next Escape closes the tip', async (kind) => {
    vi.useFakeTimers();
    render(<Above kind={kind} />);
    hoverOpen(screen.getByRole('button', { name: about('Realm') }));
    expect(tipText()).not.toBeNull();
    act(() => screen.getByRole('button', { name: 'Open above' }).click());
    act(() => void vi.advanceTimersByTime(50));
    const layer = kind === 'menu' ? screen.getByRole('menu') : screen.getByRole('textbox', { name: 'Filter text' }).closest('[data-trigger]') as HTMLElement;
    expect(layer).toBeTruthy();
    const inside = kind === 'menu' ? screen.getAllByRole('menuitem')[0]! : screen.getByRole('textbox', { name: 'Filter text' });
    act(() => inside.focus());
    expect(layer.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    act(() => void vi.advanceTimersByTime(400));
    expect(kind === 'menu' ? screen.queryByRole('menu') : screen.queryByRole('textbox', { name: 'Filter text' })).toBeNull();
    expect(tipText()).not.toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(tipText()).toBeNull();
  });
});

// Focus on the page body is the tip's own only when a press on the
// trigger opened it. A hover-opened tip closes without moving focus onto the trigger.
describe('InfoTip close with focus on the page body', () => {
  function Alone() {
    return (
      <>
        <p>Page text</p>
        <InfoTip text={TEXT} subject="Realm" />
      </>
    );
  }
  const onBody = () => {
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(document.activeElement).toBe(document.body);
  };
  const pressOutside = () => {
    fireEvent.pointerDown(screen.getByText('Page text'));
    act(() => void vi.advanceTimersByTime(10));
  };

  it('a hover-opened tip: Escape closes it and focus stays on the body', () => {
    vi.useFakeTimers();
    render(<Alone />);
    const b = screen.getByRole('button', { name: about('Realm') });
    onBody();
    hoverOpen(b);
    expect(tipText()).not.toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    act(() => void vi.advanceTimersByTime(10));
    expect(tipText()).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('a hover-opened tip: a press outside closes it and focus stays on the body', () => {
    vi.useFakeTimers();
    render(<Alone />);
    const b = screen.getByRole('button', { name: about('Realm') });
    onBody();
    hoverOpen(b);
    expect(tipText()).not.toBeNull();
    pressOutside();
    expect(tipText()).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('a press-opened tip: Escape with focus on the body closes it and returns focus to the trigger', () => {
    vi.useFakeTimers();
    render(<Alone />);
    const b = screen.getByRole('button', { name: about('Realm') });
    fireEvent.click(b);
    expect(tipText()).not.toBeNull();
    onBody();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    act(() => void vi.advanceTimersByTime(10));
    expect(tipText()).toBeNull();
    expect(document.activeElement).toBe(b);
  });

  it('a hover-opened tip pinned by a press: Escape with focus on the body closes it and returns focus to the trigger', () => {
    vi.useFakeTimers();
    render(<Alone />);
    const b = screen.getByRole('button', { name: about('Realm') });
    onBody();
    hoverOpen(b);
    expect(tipText()).not.toBeNull();
    fireEvent.click(b);
    act(() => void vi.advanceTimersByTime(10));
    expect(tipText()).not.toBeNull();
    onBody();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    act(() => void vi.advanceTimersByTime(10));
    expect(tipText()).toBeNull();
    expect(document.activeElement).toBe(b);
  });

  it('a press-opened tip: a press outside with focus on the body closes it and leaves focus on the trigger', () => {
    vi.useFakeTimers();
    render(<Alone />);
    const b = screen.getByRole('button', { name: about('Realm') });
    fireEvent.click(b);
    expect(tipText()).not.toBeNull();
    onBody();
    pressOutside();
    expect(tipText()).toBeNull();
    expect(document.activeElement).toBe(b);
  });
});
