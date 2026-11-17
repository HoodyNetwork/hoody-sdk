// Where the Toaster puts toasts (pure toastPlacement) and the gallery's ToastPreview.
// The browser check of the measured inputs (dock, dialog footers, phone) is Toast.placement.spec.ts.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastPreview, toastPlacement, type Box } from './Toast';

const desk = {
  viewW: 1440,
  viewH: 900,
  base: 16,
  stack: 84,
  width: 360,
  gap: 16,
  dock: null as Box | null,
  controls: [] as Box[],
};
const phone = {
  viewW: 390,
  viewH: 844,
  base: 80,
  stack: 84,
  width: 0,
  gap: 16,
  dock: null as Box | null,
  controls: [] as Box[],
};
const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });

describe('toastPlacement', () => {
  it('with nothing in the way the toasts stay bottom-right where the CSS puts them', () => {
    expect(toastPlacement(desk)).toEqual({ end: 0, lift: 0, top: false });
    expect(toastPlacement(phone)).toEqual({ end: 0, lift: 0, top: false });
  });

  it('a dock docked at the right edge moves the toasts into the content area beside it', () => {
    expect(toastPlacement({ ...desk, dock: box(1040, 0, 1440, 900) })).toEqual({ end: 400, lift: 0, top: false });
  });

  it('a dock not at the right edge, or too wide to leave room for a toast, moves nothing sideways', () => {
    expect(toastPlacement({ ...desk, dock: box(600, 0, 1000, 900) }).end).toBe(0);
    expect(toastPlacement({ ...desk, viewW: 700, dock: box(320, 0, 700, 900) }).end).toBe(0);
  });

  it('a control under the toast column (a dialog footer button) lifts the toasts just above it', () => {
    // Footer buttons at y 848-888 under a toast that would span y 800-884.
    const r = toastPlacement({
      ...desk,
      controls: [box(1200, 848, 1300, 888)],
    });
    expect(r).toEqual({ end: 0, lift: 900 - 848 + 16 - 16, top: false });
  });

  it('a control beside the column, or above the stack, lifts nothing', () => {
    expect(toastPlacement({ ...desk, controls: [box(100, 848, 400, 888)] }).lift).toBe(0);
    expect(toastPlacement({ ...desk, controls: [box(1200, 200, 1300, 240)] }).lift).toBe(0);
  });

  it('on a phone the full-width toasts rise above a sheet footer anywhere across the width', () => {
    const r = toastPlacement({ ...phone, controls: [box(16, 700, 120, 740)] });
    expect(r).toEqual({ end: 0, lift: 844 - 700 + 16 - 80, top: false });
  });

  it('stacked controls lift step by step, never past half the screen', () => {
    const stepped = toastPlacement({
      ...desk,
      controls: [box(1200, 848, 1300, 888), box(1200, 770, 1300, 810)],
    });
    expect(stepped.lift).toBe(900 - 770 + 16 - 16);
    const capped = toastPlacement({
      ...desk,
      controls: [box(1200, 10, 1300, 888)],
    });
    expect(capped.lift).toBe(900 / 2 - 16);
  });
});

describe('toastPlacement: right-to-left, bounds and the top edge', () => {
  it('right to left mirrors everything: a dock docked at the left edge moves the toasts right of it', () => {
    expect(toastPlacement({ ...desk, rtl: true, dock: box(0, 0, 400, 900) })).toEqual({ end: 400, lift: 0, top: false });
    expect(toastPlacement({ ...desk, rtl: true, dock: box(1040, 0, 1440, 900) }).end).toBe(0);
  });

  it('right to left, a control under the left-hand column lifts; one under the right-hand side does not', () => {
    expect(toastPlacement({ ...desk, rtl: true, controls: [box(140, 848, 240, 888)] }).lift).toBe(900 - 848 + 16 - 16);
    expect(toastPlacement({ ...desk, rtl: true, controls: [box(1200, 848, 1300, 888)] }).lift).toBe(0);
  });

  it('never lifts the stack off the screen (a short phone with a tall stack)', () => {
    // For example: 390x400, base 64, stack 268, a button at y 250-290: lifting 102 put the stack's top at -34.
    const short = { ...phone, viewH: 400, base: 64, stack: 268 };
    const r = toastPlacement({ ...short, controls: [box(16, 250, 120, 290), box(16, 0, 60, 40)] });
    expect(r.top).toBe(false);
    expect(400 - (64 + r.lift) - 268).toBeGreaterThanOrEqual(16);
  });

  it('when the half-screen cap stops the lift short of clearing, the toasts go to the top edge if it is clear', () => {
    expect(toastPlacement({ ...desk, controls: [box(1200, 100, 1300, 888)] })).toEqual({ end: 0, lift: 0, top: true });
  });

  it('when neither a lift nor the top edge clears, they keep the highest lift on screen', () => {
    expect(toastPlacement({ ...desk, controls: [box(1200, 10, 1300, 888)] })).toEqual({ end: 0, lift: 900 / 2 - 16, top: false });
  });
});

describe('ToastPreview', () => {
  const toasts = [
    { tone: 'ok' as const, title: 'First' },
    {
      tone: 'warn' as const,
      title: 'Second',
      action: { label: 'Review', onAction: () => undefined },
    },
    { tone: 'unknown' as const, title: 'Third' },
  ];

  it('renders every toast in the given order, inside a labelled group, with the live toast parts', () => {
    render(<ToastPreview toasts={toasts} label="Samples" />);
    const group = screen.getByRole('group', { name: 'Samples' });
    const titles = within(group)
      .getAllByText(/First|Second|Third/)
      .map((n) => n.textContent);
    expect(titles).toEqual(['First', 'Second', 'Third']);
    expect(within(group).getByRole('button', { name: 'Review' })).toBeInTheDocument();
    expect(within(group).getAllByRole('alertdialog')).toHaveLength(3);
  });

  it('closing a preview toast removes only that one and leaves the live queue alone', async () => {
    render(<ToastPreview toasts={toasts} label="Samples" />);
    const group = screen.getByRole('group', { name: 'Samples' });
    const first = within(group).getAllByRole('alertdialog')[0]!;
    await act(async () => {
      fireEvent.click(within(first).getByRole('button', { name: /close|dismiss/i }));
    });
    expect(within(group).queryByText('First')).toBeNull();
    expect(within(group).getByText('Second')).toBeInTheDocument();
  });

  it('an action that answers closes its preview toast through the preview queue', async () => {
    render(<ToastPreview toasts={toasts} label="Samples" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    });
    expect(screen.queryByText('Second')).toBeNull();
    expect(screen.getByText('First')).toBeInTheDocument();
  });
});
