// useBoardPower over core's real lifecycle change on fixtures, under React StrictMode (as hub:dev and the shots run
// it): a settled press always leaves "sending", an unknown outcome reads pending, a refusal keeps its outcome.
import { answers, bootFixtureCore, computerLifecycle, computerLifecycleRoute, computersList, CoreQueryProvider, FIXTURE_REALM, heldChanges, lifecycleLock, reply } from '@core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type { BoardComputer } from '../computers';
import { CHANGE_STORE_KEY, readChanges, writeChanges } from '@core/change-store';
import { useBoardPower } from './lifecycle';

// The realm the top bar shows (core's useRealms, its selection only): null keeps core's own.
const shown = vi.hoisted(() => ({ realm: null as string | null }));
vi.mock('@core', async (orig) => {
  const core = await orig<typeof Core>();
  return { ...core, useRealms: () => { const v = core.useRealms(); return shown.realm === null ? v : { ...v, selected: shown.realm }; } };
});
afterEach(() => { shown.realm = null; });
const REALM2 = 'bbbbbbbbbbbbbbbbbbbbbbb2';

const cedar = { id: 'c0a7150000000000000000c3', name: 'cedar', status: 'stopped', project_id: 'p1' } as unknown as BoardComputer;
const fjord = { id: 'c0a7150000000000000000f6', name: 'fjord', status: 'paused', project_id: 'p1' } as unknown as BoardComputer;
const running = { ...cedar, status: 'running' } as unknown as BoardComputer;

function power(rule: Parameters<typeof reply>[1]) {
  bootFixtureCore({ rules: [reply(computerLifecycleRoute, rule)] });
  const reread = vi.fn();
  const h = renderHook(() => useBoardPower([cedar, fjord], reread), { reactStrictMode: true });
  return { ...h, reread };
}

// A press waits for { ownHold, pending }, as the tile's Dismiss does (Tile/Picker show it only while pending): ownHold
// is true as soon as the hold is stored, but holdId stays null while the press is still sending.
describe('useBoardPower: Dismiss frees the send the tile shows, by its hold token', () => {
  it('a stale Dismiss (a Power read before a later send) frees nothing: the later send stays held', async () => {
    const { result } = power(answers.pending5xx());
    await act(async () => { result.current(cedar)?.run(); });
    await waitFor(() => expect(result.current(cedar)).toMatchObject({ ownHold: true, pending: true }));
    const first = heldChanges(lifecycleLock.lock)[0]?.hold;
    const stale = result.current(cedar);
    await act(async () => { await result.current(cedar)?.dismiss(result.current(cedar)?.holdId ?? null); });
    await waitFor(() => expect(heldChanges(lifecycleLock.lock)).toHaveLength(0));
    await act(async () => { result.current(cedar)?.run(); });
    await waitFor(() => expect(result.current(cedar)).toMatchObject({ ownHold: true, pending: true }));
    const second = heldChanges(lifecycleLock.lock)[0]?.hold;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    let freed: boolean | undefined;
    await act(async () => { freed = await stale?.dismiss(stale.holdId); });
    expect(freed).toBe(false);
    expect(heldChanges(lifecycleLock.lock).map((h) => h.hold)).toEqual([second]);
    expect(result.current(cedar)?.pending).toBe(true);
  });

  it('a Dismiss naming any hold but the one shown frees nothing: the shown send stays held', async () => {
    const { result } = power(answers.pending5xx());
    await act(async () => { result.current(cedar)?.run(); });
    await waitFor(() => expect(result.current(cedar)).toMatchObject({ ownHold: true, pending: true }));
    const held = heldChanges(lifecycleLock.lock)[0]?.hold;
    let freed: boolean | undefined;
    await act(async () => { freed = await result.current(cedar)?.dismiss('inc-other#9'); });
    expect(freed).toBe(false);
    await act(async () => { freed = await result.current(cedar)?.dismiss(null); });
    expect(freed).toBe(false);
    expect(heldChanges(lifecycleLock.lock).map((h) => h.hold)).toEqual([held]);
    await act(async () => { freed = await result.current(cedar)?.dismiss(result.current(cedar)?.holdId ?? null); });
    expect(freed).toBe(true);
    await waitFor(() => expect(heldChanges(lifecycleLock.lock)).toHaveLength(0));
  });

  it('the lifecycle lock is the physical computer\'s in every realm view: the Board\'s own start shows and its Dismiss frees it from another realm', async () => {
    const { result, rerender } = power(answers.pending5xx());
    await act(async () => { result.current(cedar)?.run(); });
    await waitFor(() => expect(result.current(cedar)).toMatchObject({ ownHold: true, pending: true }));
    shown.realm = REALM2;
    rerender();
    expect(result.current(cedar)?.heldOp).toBe('start');
    expect(result.current(cedar)?.ownHold).toBe(true);
    await act(async () => { await result.current(cedar)?.dismiss(result.current(cedar)?.holdId ?? null); });
    await waitFor(() => expect(heldChanges(lifecycleLock.lock)).toHaveLength(0));
  });
});

describe('useBoardPower: the shown send and its sender', () => {
  it('holdId is the shown own send\'s token and follows another tab\'s newer send adopted in place; heldFrom is null for an own hold', async () => {
    const { result } = power(answers.pending5xx());
    await act(async () => { result.current(cedar)?.run(); });
    await waitFor(() => expect(result.current(cedar)).toMatchObject({ ownHold: true, pending: true }));
    const first = heldChanges(lifecycleLock.lock)[0]?.hold;
    expect(result.current(cedar)?.holdId).toBe(first);
    expect(result.current(cedar)?.heldFrom).toBeNull();
    const shown = result.current(cedar);
    const rec = readChanges()!.find((x) => x.pending && x.inc !== undefined)!;
    act(() => {
      writeChanges([...readChanges()!.filter((x) => x.id !== rec.id), { ...rec, inc: 'other-tab-incarnation', t: rec.t + 1 }]);
      window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
    });
    await waitFor(() => expect(result.current(cedar)?.holdId).not.toBe(first));
    expect(result.current(cedar)?.holdId).toBe(heldChanges(lifecycleLock.lock)[0]?.hold);
    // The Dismiss read with the first send frees nothing now.
    let freed: boolean | undefined;
    await act(async () => { freed = await shown?.dismiss(shown.holdId); });
    expect(freed).toBe(false);
    expect(result.current(cedar)?.pending).toBe(true);
  });

  it('heldFrom names the page that sent another page\'s hold (Bots, Home, Computers); none when its sender named no page; holdId null', async () => {
    const { result } = power(answers.pending5xx());
    for (const page of ['bots', 'home', 'computers'] as const) {
      await act(async () => { await computerLifecycle.forPage(page).run({ id: running.id, op: 'stop' }); });
      await waitFor(() => expect(result.current(running)?.heldFrom?.page).toBe(page));
      expect(result.current(running)?.ownHold).toBe(false);
      expect(result.current(running)?.holdId).toBeNull();
      const h = heldChanges(lifecycleLock.lock)[0]!;
      await act(async () => { await computerLifecycle.forPage(page).dismiss({ id: running.id, op: 'stop' }, h.hold!); });
      await waitFor(() => expect(result.current(running)).toBeNull());
    }
    await act(async () => { await computerLifecycle.run({ id: running.id, op: 'stop' }); });
    await waitFor(() => expect(result.current(running)?.pending).toBe(true));
    expect(result.current(running)?.heldFrom).toBeNull();
  });
});

describe('useBoardPower', () => {
  it('offers Start for stopped, Resume for paused, nothing for running', () => {
    const { result } = power(answers.ok({ data: {} }));
    expect(result.current(cedar)?.op).toBe('start');
    expect(result.current(fjord)?.op).toBe('resume');
    expect(result.current(running)).toBeNull();
  });

  it('an unknown outcome leaves sending and reads pending (Check again), then the Board reads again', async () => {
    const { result, reread } = power(answers.pending5xx());
    act(() => { result.current(cedar)?.run(); });
    await waitFor(() => expect(result.current(cedar)?.pending).toBe(true));
    expect(result.current(cedar)?.busy).toBe(true);
    expect(reread).toHaveBeenCalled();
  });

  it('a change held from another page (a stop of a running computer) makes a Power with its op, not the Board\'s: Dismiss frees nothing here', async () => {
    const { result } = power(answers.pending5xx());
    await act(async () => { await computerLifecycle.run({ id: running.id, op: 'stop' }); });
    await waitFor(() => expect(result.current(running)?.heldOp).toBe('stop'));
    expect(result.current(running)?.op).toBeNull();
    expect(result.current(running)?.pending).toBe(true);
    expect(result.current(running)?.ownHold).toBe(false);
    // Even naming that page's hold token frees nothing here.
    await act(async () => { await result.current(running)?.dismiss(heldChanges(lifecycleLock.lock)[0]?.hold ?? null); });
    expect(result.current(running)?.pending).toBe(true);
  });

  it('the Board\'s own held change is its own: ownHold, and its warned Dismiss frees it', async () => {
    const { result, reread } = power(answers.pending5xx());
    await act(async () => { await computerLifecycle.forPage('board').run({ id: running.id, op: 'stop' }); });
    await waitFor(() => expect(result.current(running)).toMatchObject({ ownHold: true, pending: true }));
    await act(async () => { await result.current(running)?.dismiss(result.current(running)?.holdId ?? null); });
    await waitFor(() => expect(result.current(running)).toBeNull());
    expect(reread).toHaveBeenCalled();
  });

  it('Check again reads back the held operation, not the card\'s: the Board\'s own held stop of a stopped computer is proven', async () => {
    const { result } = power(answers.pending5xx());
    // The read that proves it (core reads the computer list the shell keeps mounted).
    const list = renderHook(() => computersList.use(undefined), { wrapper: CoreQueryProvider });
    await waitFor(() => expect(list.result.current.data).toBeTruthy());
    await act(async () => { await computerLifecycle.forPage('board').run({ id: cedar.id, op: 'stop' }); });
    await waitFor(() => expect(result.current(cedar)?.heldOp).toBe('stop'));
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current(cedar)?.check(); });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current(cedar)?.pending).toBe(false));
    expect(result.current(cedar)?.op).toBe('start');
  });

  it('a held change of a computer shows in every realm view (the lock is the physical computer\'s), read-only when another page sent it', async () => {
    const { result, rerender } = power(answers.pending5xx());
    await act(async () => { await computerLifecycle.run({ id: running.id, op: 'stop' }); });
    await waitFor(() => expect(result.current(running)?.heldOp).toBe('stop'));
    for (const r of [REALM2, 'all', FIXTURE_REALM]) {
      shown.realm = r;
      rerender();
      expect(result.current(running)?.heldOp).toBe('stop');
      expect(result.current(running)?.ownHold).toBe(false);
      expect(result.current(fjord)?.busy).toBe(false);
    }
  });

  it('a press while another page holds the lock (HELD_BY_OTHER) shows no "not sent" on the card: the held state says what is true', async () => {
    const { result } = power(answers.pending5xx());
    await act(async () => { await computerLifecycle.run({ id: cedar.id, op: 'stop' }); });
    await waitFor(() => expect(result.current(cedar)?.heldOp).toBe('stop'));
    await act(async () => { result.current(cedar)?.run(); await Promise.resolve(); });
    await waitFor(() => expect(result.current(cedar)?.pending).toBe(true));
    expect(result.current(cedar)?.outcome).toBeNull();
  });

  it('a proven Check again of a held start keeps "Starting…" until the Board\'s read shows the new state (no Start flashes)', async () => {
    // The Board's own row still says stopped (its read is older); core's list already shows atlas running.
    const atlas = { id: 'c0a7150000000000000000a1', name: 'atlas', status: 'stopped', project_id: 'p1' } as unknown as BoardComputer;
    bootFixtureCore({ rules: [reply(computerLifecycleRoute, answers.pending5xx())] });
    const { result } = renderHook(() => useBoardPower([atlas], () => undefined), { reactStrictMode: true });
    const list = renderHook(() => computersList.use(undefined), { wrapper: CoreQueryProvider });
    await waitFor(() => expect(list.result.current.data).toBeTruthy());
    act(() => { result.current(atlas)?.run(); });
    await waitFor(() => expect(result.current(atlas)?.heldOp).toBe('start'));
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current(atlas)?.check(); });
    expect(ok).toBe(true);
    expect(result.current(atlas)?.pending).toBe(false);
    expect(result.current(atlas)?.busy).toBe(true);
  });

  it('a refusal leaves sending and keeps its outcome; the button comes back', async () => {
    const { result } = power(answers.refused(409, 'INVALID_STATE'));
    act(() => { result.current(cedar)?.run(); });
    await waitFor(() => expect(result.current(cedar)?.outcome).not.toBeNull());
    expect(result.current(cedar)?.busy).toBe(false);
    expect(result.current(cedar)?.pending).toBe(false);
  });
});
