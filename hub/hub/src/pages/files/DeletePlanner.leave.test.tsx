// The delete planner, once a delete that may have gone through is settled, closes or gives way to its plan: proved by
// its own Check again (made, or not made), or settled elsewhere (another tab's proof, a Dismiss). It leaves no "may have
// gone through" toast behind for a delete already settled, also when it was settled elsewhere while its own Check again
// was still reading. A delete NOT proved either way (closed by the person while still unknown, or after a Check again
// whose read proved nothing) still leaves that toast: those cases also show the recorder sees the kit's leave toast at
// all.
// Its reads and sends are stubbed (as changes.planner.test.tsx), the list of what the computer shares included (whole
// and empty, read at once); the page mounts it only while open, as here (Host).
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, userEvent, waitFor, within } from '@app/testing';
import { boot } from '@core/test/env';
import type * as ToastModule from '@kit/states/Toast';
import type * as Data from './data';
import { DeletePlanner } from './DeletePlanner';
import type { DeleteItem } from './plan';
import strings from './strings.en.json';

type Shown = { tone?: string; title?: string };
type Reads = { real: Map<string, string> | null; failed: boolean; mounts: unknown; retry: () => void };
const h = vi.hoisted(() => ({
  held: [] as unknown[], proves: true, notApplied: false, reads: null as unknown, toasts: [] as Shown[],
  // Set, the read-back waits for it: a slow Check again.
  gate: null as Promise<void> | null,
}));
vi.mock('@kit/states/Toast', async (orig) => ({
  ...(await orig<typeof ToastModule>()),
  showToast: (c: Shown) => {
    h.toasts.push(c);
    return `t${h.toasts.length}`;
  },
  closeToast: () => undefined,
}));
vi.mock('./data', async (importOriginal) => {
  const m = await importOriginal<typeof Data>();
  return {
    ...m,
    useHeldOn: () => h.held,
    usePlanReads: () => h.reads,
    useRealPaths: (_c: unknown, _paths: readonly string[], enabled: boolean) => (enabled ? { real: new Map<string, string>() } : undefined),
    useCanChange: () => true,
    useFilesChange: () => ({
      // The read-back frees the shown hold once it proves something, as core does (made, or not made); a read that
      // proves nothing keeps it.
      readBack: async (only?: { hold: string; proof?: { notApplied: boolean } }) => {
        if (h.gate) await h.gate;
        if (h.proves || h.notApplied) h.held = [];
        if (only?.proof && h.notApplied) only.proof.notApplied = true;
        return h.proves;
      },
      // The answer is lost: the delete stays held on its item.
      run: (v: Data.ChangeVars) => {
        h.held = [{ hold: 'd1', at: 1, identity: { kind: 'delete', computer: 'c-atlas', name: 'atlas', path: v.path, dir: false, size: 10, modified: 1000 } }];
        return Promise.resolve({ outcome: 'pending' });
      },
    }),
  };
});
// This computer shares nothing: a whole list, read since the dialog opened.
vi.mock('./shares/data', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useShares: () => ({ data: { rows: [], dropped: 0, of: 'given:c-atlas' }, isError: false, error: null, isFetchedAfterMount: true, refetch: () => Promise.resolve(undefined) }),
}));

const ATLAS = { id: 'c-atlas', name: 'atlas', project_id: 'p', server_name: 's', status: 'running', rules: 'open' } as Data.FilesComputer;
const ITEMS: DeleteItem[] = [{ path: '/home/ada/a.txt', name: 'a.txt', dir: false, size: 10, modified: 1000 }];
const ready = (paths: string[]): Reads => ({ real: new Map(paths.map((p) => [p, p])), failed: false, mounts: { complete: true, items: [] }, retry: () => undefined });
const HELD_A = () => [{ hold: 'd1', at: 1, identity: { kind: 'delete', computer: 'c-atlas', name: 'atlas', path: '/home/ada/a.txt', dir: false, size: 10, modified: 1000 } }];
// The kit's leave toast is the only "unknown" toast here.
const leaveToasts = () => h.toasts.filter((c) => c.tone === 'unknown');
// The leave toast opens a tick after its place goes.
const aTick = () => act(async () => { await new Promise((r) => setTimeout(r, 50)); });

/** Mounted only while open, as the page does: closing unmounts it. */
function Host() {
  const [open, setOpen] = useState(true);
  return open ? <DeletePlanner c={ATLAS} items={ITEMS} onClose={() => setOpen(false)} /> : <p>closed</p>;
}
const closed = () => waitFor(() => expect(screen.getByText('closed')).toBeInTheDocument());
/** A slow read: the next Check again waits until `release()`. */
function slowRead(): () => void {
  let release = (): void => undefined;
  h.gate = new Promise<void>((r) => { release = () => r(); });
  return () => release();
}
const planShown = () => waitFor(() => expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['action.delete'] })).toBeInTheDocument());

/** Delete pressed, its answer lost: the frozen plan shows "may have gone through". */
async function sentPending() {
  const view = render(<Host />);
  const d = screen.getByRole('alertdialog');
  await userEvent.click(within(d).getByRole('button', { name: strings['action.delete'] }));
  expect(await within(d).findAllByText(/may have gone through/i)).not.toHaveLength(0);
  return { d, view };
}
/** Opened on an item whose earlier delete may have gone through. */
function heldOpen() {
  h.held = HELD_A();
  const view = render(<Host />);
  const d = screen.getByRole('alertdialog');
  expect(within(d).getByText(strings['delete.heldBody'])).toBeInTheDocument();
  return { d, view };
}

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  h.held = [];
  h.proves = true;
  h.notApplied = false;
  h.gate = null;
  h.reads = ready([ITEMS[0]!.path]);
  h.toasts.length = 0;
});

describe('the delete planner leaves no "may have gone through" toast for a settled delete', () => {
  it('sent here, then proved made by its own Check again: it closes, and no toast follows', async () => {
    const { d } = await sentPending();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await closed();
    await aTick();
    expect(leaveToasts()).toEqual([]);
  });

  it('sent here, then settled elsewhere: it closes, and no toast follows', async () => {
    const { view } = await sentPending();
    h.held = [];
    view.rerender(<Host />);
    await closed();
    await aTick();
    expect(leaveToasts()).toEqual([]);
  });

  it('opened on a held delete, its own Check again proves it made: it closes, and no toast follows', async () => {
    const { d } = heldOpen();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await closed();
    await aTick();
    expect(leaveToasts()).toEqual([]);
  });

  it('opened on a held delete, its own Check again proves it not made: the plan takes its place, and no toast follows', async () => {
    h.proves = false;
    h.notApplied = true;
    const { d } = heldOpen();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await planShown();
    await aTick();
    expect(leaveToasts()).toEqual([]);
  });

  it('opened on a held delete settled elsewhere: the plan takes its place, and no toast follows', async () => {
    const { view } = heldOpen();
    h.held = [];
    view.rerender(<Host />);
    await planShown();
    await aTick();
    expect(leaveToasts()).toEqual([]);
  });

  it('sent here, settled elsewhere while its own Check again still reads, the read proving nothing: it closes once the read ends, and no toast follows', async () => {
    h.proves = false;
    const { d, view } = await sentPending();
    const release = slowRead();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    h.held = [];
    view.rerender(<Host />);
    await aTick();
    // Never closed under its own read.
    expect(d.isConnected).toBe(true);
    await act(async () => { release(); });
    await closed();
    await aTick();
    expect(leaveToasts()).toEqual([]);
  });

  it('opened on a held delete, settled elsewhere while its own Check again still reads, the read proving nothing: the plan takes its place, and no toast follows', async () => {
    h.proves = false;
    const release = slowRead();
    const { d, view } = heldOpen();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    h.held = [];
    view.rerender(<Host />);
    await aTick();
    // The view is not swapped under its own read: still this dialog, no plan yet.
    expect(d.isConnected).toBe(true);
    expect(within(d).queryByRole('button', { name: strings['action.delete'] })).toBeNull();
    await act(async () => { release(); });
    await planShown();
    await aTick();
    expect(leaveToasts()).toEqual([]);
  });

  it('not proved: its own Check again proves nothing, the delete stays "may have gone through"; closed, the toast takes it', async () => {
    h.proves = false;
    const { d, view } = await sentPending();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await aTick();
    expect(d.isConnected).toBe(true);
    expect(within(d).getAllByText(/may have gone through/i)).not.toHaveLength(0);
    expect(within(d).getByRole('button', { name: /check again/i })).toBeInTheDocument();
    await userEvent.click(within(d).getAllByRole('button', { name: strings['action.close'] })[0]!);
    await closed();
    await aTick();
    expect(leaveToasts()).toHaveLength(1);
    view.unmount();
    h.toasts.length = 0;
    const held = heldOpen();
    await userEvent.click(within(held.d).getByRole('button', { name: /check again/i }));
    await aTick();
    expect(held.d.isConnected).toBe(true);
    // Its pending outcome stands (its body also says "may have gone through": the outcome's Check again is the proof).
    expect(within(held.d).getByRole('button', { name: /check again/i })).toBeInTheDocument();
    await userEvent.click(within(held.d).getAllByRole('button', { name: strings['action.close'] })[0]!);
    await closed();
    await aTick();
    expect(leaveToasts()).toHaveLength(1);
  });

  it('controls: closed by the person while the delete is unknown, sent here or opened on it: the toast takes it', async () => {
    const { d, view } = await sentPending();
    await userEvent.click(within(d).getAllByRole('button', { name: strings['action.close'] })[0]!);
    await closed();
    await aTick();
    expect(leaveToasts()).toHaveLength(1);
    view.unmount();
    h.toasts.length = 0;
    const held = heldOpen();
    await userEvent.click(within(held.d).getAllByRole('button', { name: strings['action.close'] })[0]!);
    await closed();
    await aTick();
    expect(leaveToasts()).toHaveLength(1);
  });
});
