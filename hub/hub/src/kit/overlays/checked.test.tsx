// Check again in a Dialog: a check that proves the change
// leaves no "may have gone through" toast behind (the dialog's outcome line saw the outcome leave pending
// before it unmounted), and a dialog whose Check again is still reading cannot be closed, whether or not the
// page passes `checking` (the dialog tracks a check that returns a promise itself).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import type { OutcomeLike } from '../outcome';
import { Dialog } from './Overlays';

const toasts = vi.hoisted(() => [] as Array<{ title: string; tone?: string }>);
vi.mock('../states/Toast', () => ({
  showToast: (c: { title: string; tone?: string }) => {
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
const press = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el); }); };
const button = (name: string | RegExp) => screen.getByRole('button', { name });

/** A pending dialog whose Check again resolves to `after` (and closes the dialog with it when `closeToo`). */
function Checked({ after, closeToo, gate }: { after: OutcomeLike | undefined; closeToo?: boolean; gate?: Promise<void> }) {
  const [open, setOpen] = useState(true);
  const [outcome, setOutcome] = useState<OutcomeLike | undefined>({ kind: 'pending' });
  return (
    <>
      <Dialog
        isOpen={open}
        onOpenChange={setOpen}
        title="Rename atlas"
        primaryLabel="Rename"
        onPrimary={() => undefined}
        outcome={outcome}
        onCheck={async () => {
          if (gate) await gate;
          setOutcome(after);
          if (closeToo) setOpen(false);
        }}
      />
      {!open && <p>closed</p>}
    </>
  );
}

describe('Dialog: Check again', () => {
  it('a check that proves the change closes the dialog with no toast', async () => {
    render(<Checked after={{ kind: 'done' }} />);
    await press(button(/Check again/));
    await tick();
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(toasts).toHaveLength(0);
  });

  it('a check that clears the outcome, then Cancel: no toast', async () => {
    render(<Checked after={undefined} />);
    await press(button(/Check again/));
    await tick();
    await press(button('Cancel'));
    await tick();
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(toasts).toHaveLength(0);
  });

  it('a page that closes the dialog in the same update as the proof: no toast', async () => {
    render(<Checked after={{ kind: 'done' }} closeToo />);
    await press(button(/Check again/));
    await tick();
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(toasts).toHaveLength(0);
  });

  it('a page that proves the change, then closes the dialog and clears its outcome in one update: no toast', async () => {
    render(<Checked after={undefined} closeToo />);
    await press(button(/Check again/));
    await tick();
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(toasts).toHaveLength(0);
  });

  it('while its own check reads, Cancel is disabled (no checking prop)', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    render(<Checked after={{ kind: 'done' }} gate={gate} />);
    await press(button(/Check again/));
    expect(button('Cancel')).toBeDisabled();
    await act(async () => { open(); await gate; });
    await tick();
    expect(toasts).toHaveLength(0);
  });

  it('Cancel on a pending dialog whose page clears the outcome on close still leaves the toast', async () => {
    function ClearsOnClose() {
      const [open, setOpen] = useState(true);
      const [outcome, setOutcome] = useState<OutcomeLike | undefined>({ kind: 'pending' });
      return (
        <>
          <Dialog
            isOpen={open}
            onOpenChange={(o) => { setOpen(o); if (!o) setOutcome(undefined); }}
            title="Delete key"
            primaryLabel="Delete"
            onPrimary={() => undefined}
            outcome={outcome}
            onCheck={() => undefined}
          />
          {!open && <p>closed</p>}
        </>
      );
    }
    render(<ClearsOnClose />);
    await press(button('Cancel'));
    await tick();
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.tone).toBe('unknown');
  });
});

describe('Dialog: the header x while Check again runs (OP-G)', () => {
  it('while its own check reads, the header x is disabled too (no checking prop)', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    render(<Checked after={{ kind: 'done' }} gate={gate} />);
    await press(button(/Check again/));
    expect(button('Close')).toBeDisabled();
    await act(async () => { open(); await gate; });
    await tick();
    expect(toasts).toHaveLength(0);
  });

  it('the header x on a pending dialog whose page clears the outcome on close still leaves the toast', async () => {
    function ClearsOnClose() {
      const [open, setOpen] = useState(true);
      const [outcome, setOutcome] = useState<OutcomeLike | undefined>({ kind: 'pending' });
      return (
        <>
          <Dialog
            isOpen={open}
            onOpenChange={(o) => { setOpen(o); if (!o) setOutcome(undefined); }}
            title="Delete key"
            primaryLabel="Delete"
            onPrimary={() => undefined}
            outcome={outcome}
            onCheck={() => undefined}
          />
          {!open && <p>closed</p>}
        </>
      );
    }
    render(<ClearsOnClose />);
    await press(button('Close'));
    await tick();
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(toasts).toHaveLength(1);
  });
});
