// The ghost buttons inside kit parts are kit buttons, so the Button CSS alone draws them: an icon-only one frameless, one
// with words the grey plate. Through each real component: the button is the kit's (its variant, size and classes, never
// the end glyph), its name is its label, and the slot or context React Aria wires into it works (the toast's close
// dismisses, the calendar pages, the search clear clears). CopyButton keeps `label` as its name and tooltip: the check
// icon and its polite status line carry "copied".
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeBlock, CopyButton } from '../data/Ids';
import { DatePickButton } from '../forms/DatePickButton';
import { SearchField } from '../forms/fields';
import { Toaster, closeToast, showToast } from '../states/Toast';

const press = async (el: Element) => {
  await act(async () => {
    fireEvent.click(el);
  });
};
// md is the kit Button's default size: it has no class of its own (no sm, no xs).
const isKitGhost = (el: Element, size: 'xs' | 'sm' | 'md', iconOnly: boolean) => {
  expect(el).toHaveClass('button', 'ghost');
  if (size === 'md') {
    expect(el).not.toHaveClass('sm');
    expect(el).not.toHaveClass('xs');
  } else expect(el).toHaveClass(size);
  if (iconOnly) expect(el).toHaveClass('iconOnly');
  else expect(el).not.toHaveClass('iconOnly');
  // A frameless icon ghost is exactly an icon-only ghost that is not a three-dot, a toolbar control or a strip button.
  for (const framed of ['more', 'toolbar', 'inStrip']) expect(el).not.toHaveClass(framed);
  // Words mark a ghost as a plate (data-words); a ghost never carries the end glyph.
  expect(el.hasAttribute('data-words')).toBe(!iconOnly);
  expect(el).not.toHaveAttribute('data-glyph');
  expect(el.querySelector('[data-glyph-mark]')).toBeNull();
};

describe('the Toast action and close are the kit ghost Button sm and IconButton sm', () => {
  const open: string[] = [];
  afterEach(() => {
    for (const k of open.splice(0)) act(() => closeToast(k));
  });

  it('the action is a ghost Button sm that goes busy while its promise runs; the close is an IconButton sm named Dismiss that closes the toast', async () => {
    let answer: (v: boolean) => void = () => undefined;
    render(<Toaster />);
    act(() => {
      open.push(showToast({ tone: 'error', title: 'Couldn\'t save notes', action: { label: 'Try again', onAction: () => new Promise<boolean>((r) => (answer = r)) } }));
    });
    const action = screen.getByRole('button', { name: 'Try again' });
    isKitGhost(action, 'sm', false);
    expect(action).toHaveAttribute('data-variant', 'ghost');
    await press(action);
    expect(action).toHaveAttribute('data-pending', 'true');
    await act(async () => answer(false));
    const close = screen.getByRole('button', { name: 'Dismiss' });
    isKitGhost(close, 'sm', true);
    expect(close).toHaveAttribute('slot', 'close');
    await press(close);
    expect(screen.queryByText('Couldn\'t save notes')).toBeNull();
  });
});

describe('CopyButton is the kit IconButton (or ghost Button with its label)', () => {
  let written: string[] = [];
  beforeEach(() => {
    written = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => (written.push(t), Promise.resolve()) } });
  });

  it('sm and md are the kit IconButton at that size; withLabel is the ghost Button at the same size, label shown', () => {
    render(
      <>
        <CopyButton text="a" label="Copy a" />
        <CopyButton text="b" label="Copy b" size="md" />
        <CopyButton text="c" label="Copy c" withLabel />
        <CopyButton text="d" label="Copy d" withLabel size="md" />
      </>,
    );
    isKitGhost(screen.getByRole('button', { name: 'Copy a' }), 'sm', true);
    isKitGhost(screen.getByRole('button', { name: 'Copy b' }), 'md', true);
    isKitGhost(screen.getByRole('button', { name: 'Copy c' }), 'sm', false);
    isKitGhost(screen.getByRole('button', { name: 'Copy d' }), 'md', false);
    // Every copy keeps aria-label = its label: callers find it by that (keys MintPanels' `c` key).
    for (const name of ['Copy a', 'Copy b', 'Copy c', 'Copy d']) expect(screen.getByRole('button', { name }), name).toHaveAttribute('aria-label', name);
  });

  it('a copy is announced in the polite status line and the icon turns into a check; the name and the tooltip stay the label', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<CopyButton text="https://hoody.com/x" label="Copy the address" />);
      const btn = screen.getByRole('button', { name: 'Copy the address' });
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent(/^$/);
      const glyph = () => [...btn.querySelectorAll('svg path')].map((x) => x.getAttribute('d')).join('|');
      const before = glyph();
      await act(async () => {
        fireEvent.focus(btn);
        fireEvent.click(btn);
      });
      expect(written).toEqual(['https://hoody.com/x']);
      expect(status).toHaveTextContent('Copied to clipboard');
      expect(status.closest('[aria-live="off"]')).toBeNull();
      expect(glyph()).not.toBe(before);
      expect(btn).toHaveAccessibleName('Copy the address');
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(glyph(), 'back to the copy icon').toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the tooltip says the label, never "copied"', async () => {
    render(<CopyButton text="x" label="Copy the key" />);
    const btn = screen.getByRole('button', { name: 'Copy the key' });
    const user = userEvent.setup();
    // user-event puts its own clipboard stub on navigator: put this file's recorder back over it.
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => (written.push(t), Promise.resolve()) } });
    await user.tab();
    expect(document.activeElement).toBe(btn);
    expect(await screen.findByRole('tooltip'), 'the label tooltip shows on keyboard focus').toHaveTextContent(/^Copy the key$/);
    await user.keyboard('{Enter}');
    expect(written, 'the copy ran').toEqual(['x']);
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
    // Copied: the tooltip (open, or shown again on the next focus) still says the label.
    await user.tab({ shift: true });
    await user.tab();
    expect(await screen.findByRole('tooltip'), 'shown again while copied').toHaveTextContent(/^Copy the key$/);
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
  });

  it('a code block\'s refused step copy is a soft-disabled IconButton: focusable, named, its reason its description, nothing copied', async () => {
    render(<CodeBlock lang="shell" lines={[{ code: ['echo ', { placeholder: 'token' }] }]} placeholderReason="Fill the token in first" />);
    const all = screen.getByRole('button', { name: 'Copy all' });
    isKitGhost(all, 'sm', false);
    expect(all).toHaveAttribute('aria-disabled', 'true');
    const line = screen.getAllByRole('button').find((b) => b !== all) as HTMLElement;
    isKitGhost(line, 'sm', true);
    expect(line).toHaveAttribute('aria-disabled', 'true');
    expect(line).toHaveAccessibleDescription(/Fill the token in first/);
    await press(line);
    await press(all);
    expect(written).toEqual([]);
  });
});

describe('the calendar\'s month arrows are kit IconButtons sm, wired to the calendar', () => {
  it('Previous and Next keep their names and page the month', async () => {
    render(<DatePickButton value="2026-11-09" onChange={() => undefined} />);
    await press(screen.getByRole('button', { name: 'Pick a date' }));
    const dialog = await screen.findByRole('dialog');
    // React Aria also draws a hidden, untabbable Next for screen readers at the grid's end; the arrows are the slotted ones.
    const arrow = (name: string, slot: string) => {
      const found = within(dialog).getAllByRole('button', { name }).filter((b) => b.getAttribute('slot') === slot);
      expect(found, `one ${slot} arrow`).toHaveLength(1);
      return found[0] as HTMLElement;
    };
    const prev = arrow('Previous', 'previous');
    const next = arrow('Next', 'next');
    isKitGhost(prev, 'sm', true);
    isKitGhost(next, 'sm', true);
    const heading = () => within(dialog).getByRole('heading').textContent;
    expect(heading()).toMatch(/November 2026/);
    await press(next);
    expect(heading()).toMatch(/December 2026/);
    await press(prev);
    await press(prev);
    expect(heading()).toMatch(/October 2026/);
  });
});

describe('the SearchField clear is the kit IconButton xs, wired to the field', () => {
  it('named Clear search, out of the tab order, and a press empties the field', async () => {
    const changes: string[] = [];
    render(<SearchField defaultValue="needle" onChange={(v) => changes.push(v)} />);
    const clear = screen.getByRole('button', { name: 'Clear search' });
    isKitGhost(clear, 'xs', true);
    expect(clear).toHaveAttribute('tabindex', '-1');
    await press(clear);
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(changes).toEqual(['']);
  });
});
