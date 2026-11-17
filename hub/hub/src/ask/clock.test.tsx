// The Ask panel's running clocks (kit useNow): the status line's "Working · 5s", the step trail's running time and the
// rate-limit countdown "Try again in 3s". Each is read on a fake clock, so a clock that stops, never starts or reads the
// wrong time fails here: ask/ had no test that moved time. useNow's own contract is kit/useNow.test.tsx.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useStrings } from '@kit';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusLine } from './AskPanel';
import { Column, duration } from './Column';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';
import type * as L from './logic';
import strings from './strings.en.json';

const T0 = Date.parse('2026-11-01T05:00:00Z');
let SEQ = 0;
const env = (type: string, data: any) => ({ seq: ++SEQ, incarnation: 'i1', turn_id: 'T1', event: { type, data } });
const frame = (e: any, now?: number): L.Action => ({ type: 'frame', name: e.event.type.slice(6), data: e, now });
const user = (id: string, text: string): C.UserMsg => ({ id, text, at: 0, key: 'k' + id, via: 'create', state: 'sending', turnId: null, commandId: null, reason: '' } as unknown as C.UserMsg);

/** A conversation whose turn T1 started at `startedAt` and still runs. */
function running(startedAt: number): C.Conv {
  let c = C.addUser(C.emptyConv('s1'), user('1', 'Build me a dashboard'));
  c = C.addTurn(c, { turnId: 'T1', user: '1', now: startedAt });
  return C.patchUser(c, '1', { state: 'sent', turnId: 'T1' });
}
const snapOf = (conv: C.Conv, status: Snapshot['status']): Snapshot => ({ phase: 'ready', conv, status, dormant: false, gates: [], band: null, blocked: null, decision: { pending: false, unknown: false } }) as unknown as Snapshot;

function Line({ snap }: { snap: Snapshot }) {
  const t = useStrings(strings);
  return <StatusLine snap={snap} t={t} />;
}
const eng = { retryMsg: () => undefined, decide: () => undefined, answer: () => undefined, checkDecision: () => undefined } as unknown as AskEngine;
const column = (snap: Snapshot) => <Column eng={eng} snap={snap} agentUrl="" typing={false} empty={null} />;
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the status line clock', () => {
  it('Working · time moves every second while the agent works', async () => {
    render(<Line snap={snapOf(running(T0), 'working')} />);
    screen.getByText(`Working · ${duration(0)}`);
    await tick(5000);
    screen.getByText(`Working · ${duration(5000)}`);
    await tick(3000);
    screen.getByText(`Working · ${duration(8000)}`);
  });

  it('a turn that starts after the panel was idle shows its time from the start, not against the time the panel mounted (the clock refreshes when it turns on)', async () => {
    const view = render(<Line snap={snapOf(C.emptyConv('s1'), 'waiting')} />);
    expect(screen.queryByText(/^Working/)).toBeNull();
    // A minute passes with no tick (nothing ran), then the panel learns of a turn that began 10 s ago.
    vi.setSystemTime(T0 + 60_000);
    await act(async () => { view.rerender(<Line snap={snapOf(running(T0 + 50_000), 'working')} />); });
    screen.getByText(`Working · ${duration(10_000)}`);
    await tick(2000);
    screen.getByText(`Working · ${duration(12_000)}`);
  });

  it('when the work ends no time shows and nothing keeps ticking', async () => {
    const view = render(<Line snap={snapOf(running(T0), 'working')} />);
    await tick(2000);
    await act(async () => { view.rerender(<Line snap={snapOf(running(T0), 'waiting')} />); });
    expect(screen.queryByText(/^Working/)).toBeNull();
    screen.getByText(strings['ask.status.waiting']);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the column clock', () => {
  it('a running turn\'s step trail counts its time up', async () => {
    let c = running(T0);
    c = C.onTurn(c, frame(env('event.tool_call', { tool_id: 'a', name: 'bash', summary: '$ ls' }), T0 + 100));
    c = C.onTurn(c, frame(env('event.tool_result', { tool_id: 'a' }), T0 + 200));
    render(column(snapOf(c, 'working')));
    // The trail button is named by what it shows: its label (the time last, once there is a whole second), then its mark's outcome word.
    const trail = (ms: number) => screen.getByRole('button', { expanded: false, name: (n) => n.endsWith(`· ${duration(ms)} ${strings['ask.mark.running']}`) });
    expect(screen.getByRole('button', { expanded: false, name: (n) => n.endsWith(`1 step ${strings['ask.mark.running']}`) })).toBeTruthy();
    await tick(4000);
    expect(trail(4000)).toBeTruthy();
    await tick(3000);
    expect(trail(7000)).toBeTruthy();
  });

  it('a rate-limited turn counts down to its retry time, then offers Try again', async () => {
    const c = C.onTurn(running(T0), { type: 'receipt', body: { turn_id: 'T1', state: 'failed', error_code: 'rate_limit', retry_at: new Date(T0 + 3000).toISOString() } }, T0);
    render(column(snapOf(c, null)));
    const wait = (ms: number) => strings['ask.retryIn'].replace('{{time}}', duration(ms));
    screen.getByRole('button', { name: wait(3000) });
    await tick(1000);
    screen.getByRole('button', { name: wait(2000) });
    await tick(1000);
    screen.getByRole('button', { name: wait(1000) });
    await tick(1000);
    const again = screen.getByRole('button', { name: strings['ask.tryAgain'] });
    expect((again as HTMLButtonElement).disabled).toBe(false);
    // The countdown is over: no timer is left running.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a retry time that passes between two ticks is read from the clock, not from the last tick, on the next render', async () => {
    const c = C.onTurn(running(T0), { type: 'receipt', body: { turn_id: 'T1', state: 'failed', error_code: 'rate_limit', retry_at: new Date(T0 + 3000).toISOString() } }, T0);
    const view = render(column(snapOf(c, null)));
    await tick(1000);
    // The tab slept: the clock is past the retry time but no tick ran. The next render must see that.
    vi.setSystemTime(T0 + 10_000);
    await act(async () => { view.rerender(column(snapOf(c, null))); });
    const again = screen.getByRole('button', { name: strings['ask.tryAgain'] });
    expect((again as HTMLButtonElement).disabled).toBe(false);
  });

  it('the column clock stops when the work ends', async () => {
    const view = render(column(snapOf(running(T0), 'working')));
    await tick(2000);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await act(async () => { view.rerender(column(snapOf(running(T0), 'waiting'))); });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a retry time already past offers Try again at once and starts no timer', () => {
    const c = C.onTurn(running(T0), { type: 'receipt', body: { turn_id: 'T1', state: 'failed', error_code: 'rate_limit', retry_at: new Date(T0 - 1000).toISOString() } }, T0);
    render(column(snapOf(c, null)));
    screen.getByRole('button', { name: strings['ask.tryAgain'] });
    expect(vi.getTimerCount()).toBe(0);
  });
});
