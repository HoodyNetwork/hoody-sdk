// Cancel on a pending dialog whose page drops both its outcome and its onCheck as it closes (setDel(null)):
// the sticky "may have gone through" toast still carries Check again, calling the last onCheck the person saw.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import type { OutcomeLike } from '../outcome';
import { Dialog } from './Overlays';

const toasts = vi.hoisted(() => [] as Array<{ title: string; action?: { label: string; onAction: () => void } }>);
vi.mock('../states/Toast', () => ({
  showToast: (c: { title: string; action?: { label: string; onAction: () => void } }) => {
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

function ClearsOnClose({ onCheck }: { onCheck: () => void }) {
  // The page's whole dialog state is one object; closing nulls it, outcome and onCheck with it.
  const [del, setDel] = useState<{ outcome: OutcomeLike; check: () => void } | null>({ outcome: { kind: 'pending' }, check: onCheck });
  return (
    <Dialog
      isOpen={del !== null}
      onOpenChange={(o) => !o && setDel(null)}
      title="Delete atlas"
      primaryLabel="Delete"
      onPrimary={() => undefined}
      {...(del ? { outcome: del.outcome, onCheck: del.check } : {})}
    >
      <p>body</p>
    </Dialog>
  );
}

function TwoItems({ checkA }: { checkA: () => void }) {
  // Item A has a read-back; item B (opened later in the same Dialog) has none.
  const [item, setItem] = useState<{ name: string; outcome: OutcomeLike; check?: () => void } | null>({ name: 'A', outcome: { kind: 'pending' }, check: checkA });
  return (
    <>
      <button type="button" onClick={() => setItem({ name: 'B', outcome: { kind: 'pending' } })}>open B</button>
      <Dialog
        isOpen={item !== null}
        onOpenChange={(o) => !o && setItem(null)}
        title={`Delete ${item?.name ?? ''}`}
        primaryLabel="Delete"
        onPrimary={() => undefined}
        {...(item ? { outcome: item.outcome } : {})}
        {...(item?.check ? { onCheck: item.check } : {})}
      >
        <p>body</p>
      </Dialog>
    </>
  );
}

function DeadOnClose({ onCheck }: { onCheck: () => boolean }) {
  // Like keys' checkDelete: the page always passes a defined closure, but after Cancel it closes over the
  // cleared state (`if (!del) return false`), so only the one the open dialog had can still read back.
  const [del, setDel] = useState<{ name: string } | null>({ name: 'atlas' });
  const check = () => (del ? onCheck() : false);
  return (
    <Dialog
      isOpen={del !== null}
      onOpenChange={(o) => !o && setDel(null)}
      title="Delete atlas"
      primaryLabel="Delete"
      onPrimary={() => undefined}
      outcome={del ? { kind: 'pending' } : undefined}
      onCheck={check}
    >
      <p>body</p>
    </Dialog>
  );
}

describe('Dialog leave toast keeps Check again', () => {
  it('a page that nulls onCheck on close still gets a toast whose Check again reads back', async () => {
    const onCheck = vi.fn();
    render(<ClearsOnClose onCheck={onCheck} />);
    await tick();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); });
    await tick();
    expect(toasts).toHaveLength(1);
    const action = toasts[0]?.action;
    expect(action).toBeDefined();
    act(() => action?.onAction());
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it('a reopen for another item without a read-back never carries the previous item\'s Check again', async () => {
    const checkA = vi.fn();
    render(<TwoItems checkA={checkA} />);
    await tick();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); });
    await tick();
    expect(toasts).toHaveLength(1);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'open B' })); });
    await tick();
    expect(screen.getByRole('dialog', { name: /Delete B/ })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); });
    await tick();
    expect(toasts).toHaveLength(2);
    act(() => toasts[1]?.action?.onAction());
    expect(checkA).not.toHaveBeenCalled();
  });

  it('a page whose closure goes dead on close (defined, over cleared state): the toast uses the open one', async () => {
    const onCheck = vi.fn(() => true);
    render(<DeadOnClose onCheck={onCheck} />);
    await tick();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); });
    await tick();
    expect(toasts).toHaveLength(1);
    let r: unknown;
    act(() => { r = toasts[0]?.action?.onAction(); });
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(r).toBe(true);
  });
});

describe('Dialog leave toast through the header x (OP-G)', () => {
  it('the header x on a page that nulls onCheck on close leaves a toast whose Check again reads back', async () => {
    const onCheck = vi.fn();
    render(<ClearsOnClose onCheck={onCheck} />);
    await tick();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Close' })); });
    await tick();
    expect(toasts).toHaveLength(1);
    act(() => toasts[0]?.action?.onAction());
    expect(onCheck).toHaveBeenCalledTimes(1);
  });
});
