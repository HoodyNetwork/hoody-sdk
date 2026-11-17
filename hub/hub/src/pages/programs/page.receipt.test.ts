// A restart's receipt (daemon RestartAnswer): only
// `completed` + `restarted` proves it applied; `completed` + `failed` means it stopped and did not start again;
// anything else proves nothing. A restart Computers holds is "may have gone through" here, never "not sent", and
// read-only: Computers checks or dismisses it (core frees it only for its sender).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { capture, defineMutation, heldChanges, programLock, programOp, restartReceiptVerdict, type Target } from '@core';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import * as data from './data';
import { opsStore } from './parts/ops';
import page from './page';
import strings from './strings.en.json';

vi.mock('./data', async (orig) => {
  const real = await orig<typeof data>();
  return { ...real, completePress: vi.fn(real.completePress), discardPress: vi.fn(real.discardPress) };
});

function webOp() {
  for (const [k, op] of opsStore.snapshot()) if (k.endsWith('|prog:1')) return op;
  return undefined;
}

describe('restart receipt verdict', () => {
  it('reads the daemon receipt by state and outcome', () => {
    expect(restartReceiptVerdict({ success: true, state: 'completed', outcome: 'restarted' })).toBe('completed');
    expect(restartReceiptVerdict({ success: false, code: 'START_FAILED', state: 'completed', outcome: 'failed' })).toBe('failed');
    expect(restartReceiptVerdict({ state: 'completed' })).toBe('unknown');
    expect(restartReceiptVerdict({ state: 'accepted' })).toBe('unknown');
    expect(restartReceiptVerdict({ state: 'unknown' })).toBe('unknown');
    expect(restartReceiptVerdict({ success: false, code: 'NOT_FOUND', state: null, outcome: null })).toBe('unknown');
  });
});

describe('programs: restart receipts', () => {
  beforeEach(() => {
    opsStore.reset();
    vi.mocked(data.completePress).mockClear();
    vi.mocked(data.discardPress).mockClear();
  });

  it('a receipt that says it stopped and did not start again is a failure, not a success', async () => {
    await renderPage(page, { state: 'receipt-failed', path: '/programs?sel=prog%3A1' });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Restart web' }))[0] as HTMLElement);
    await waitFor(() => expect(webOp()?.status).toBe('unknown'));
    await userEvent.click((await screen.findAllByRole('button', { name: /Check again/ }))[0] as HTMLElement);
    await waitFor(() => expect(webOp()?.status).toBe('failed'));
    expect(webOp()?.code).toBe('START_FAILED');
    expect(data.completePress).not.toHaveBeenCalled();
    expect((await screen.findAllByText(strings['op.f.START_FAILED'].replace('{{name}}', 'web'))).length).toBeGreaterThan(0);
  });

  it('a restart Computers holds is "may have gone through" here, read-only: Computers checks it, and its receipt frees both pages', async () => {
    await renderPage(page, { state: 'receipt-done', path: '/programs?sel=prog%3A1' });
    await screen.findAllByRole('button', { name: 'Restart web' });
    const target = capture().target as Target;
    // Computers' restart, built through the shared builder exactly as its Programs tab sends it.
    type V = { id: string; port: number | null; target: Target };
    const restartOf = (v: V) => programOp({ id: v.id, act: 'restart', port: v.port, range: false });
    const computers = defineMutation<V>(data.routes.restart, {
      input: (v) => ({ index: 1, recovers: true, target: v.target, params: { id: v.id }, body: restartOf(v).body }),
      lock: programLock.restart,
      lockKey: (v) => restartOf(v).identity,
    });
    const v: V = { id: '1', port: null, target };
    const held = await computers.run(v);
    expect(held.outcome).toBe('pending');
    // Core frees it only for Computers: shown from core, no Check of its own here.
    const note = strings['op.elsewhereAny'].replace('{{name}}', 'web');
    await screen.findAllByText(note);
    expect(webOp()).toBeUndefined();
    expect(screen.queryAllByRole('button', { name: /Check again/ })).toHaveLength(0);
    // Computers reads the receipt and proves it: the shared lock is free, and so is this row.
    await computers.complete(v, held.hold ?? '');
    await waitFor(() => expect(screen.queryAllByText(note)).toHaveLength(0));
    expect(data.completePress).not.toHaveBeenCalled();
    expect(heldChanges(programLock.restart)).toHaveLength(0);
  });

  it("Check reads only its own restart's receipt: an older key's receipt never completes a newer restart", async () => {
    await renderPage(page, { state: 'receipt-done', path: '/programs?sel=prog%3A1' });
    await screen.findAllByRole('button', { name: 'Restart web' });
    const target = capture().target as Target;
    type V = { id: string; port: number | null; target: Target };
    const restartOf = (v: V) => programOp({ id: v.id, act: 'restart', port: v.port, range: false });
    const computers = defineMutation<V>(data.routes.restart, {
      input: (v) => ({ index: 1, recovers: true, target: v.target, params: { id: v.id }, body: restartOf(v).body }),
      lock: programLock.restart,
      lockKey: (v) => restartOf(v).identity,
    });
    const v: V = { id: '1', port: null, target };
    // Programs' first restart may have gone through.
    await userEvent.click((await screen.findAllByRole('button', { name: 'Restart web' }))[0] as HTMLElement);
    await waitFor(() => expect(webOp()?.status).toBe('unknown'));
    const k1 = webOp()?.key;
    expect(k1).toBeTruthy();
    // Computers proves the first restart (naming its hold) and restarts again: the second may have gone through.
    await computers.complete(v, webOp()?.hold ?? '');
    const k2 = await computers.run(v);
    // Another sender's complete frees nothing: Computers is refused (HELD_BY_OTHER), the second restart never
    // exists, and the first stays this page's own to check.
    if (k2.outcome === 'not_sent') {
      expect(k2.error?.code).toBe('HELD_BY_OTHER');
      expect(heldChanges(programLock.restart).map((c) => c.key)).toEqual([k1]);
      return;
    }
    expect(k2.outcome).toBe('pending');
    expect(k2.idem).not.toBe(k1);
    // The old Programs row's Check: the first restart's receipt says completed, which proves nothing about the second.
    await userEvent.click((await screen.findAllByRole('button', { name: /Check again/ }))[0] as HTMLElement);
    await waitFor(() => expect(webOp()?.status === 'unknown' && webOp()?.checking).toBeFalsy());
    expect(data.completePress).not.toHaveBeenCalled();
    expect(heldChanges(programLock.restart).map((c) => c.key)).toEqual([k2.idem]);
  });
});
