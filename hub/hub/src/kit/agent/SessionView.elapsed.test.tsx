// The working bar shows that the turn is alive: how long the newest turn has run, counted from when its message was sent
// (so a reload shows the true time, not a counter from zero), how many steps it has taken, and, when nothing has reached
// this page for a while, for how long. The clock is drawn beside the bar's words, never inside them: the words are the
// status a screen reader hears when the state changes, and a tick is not a state change.
import { act, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { can, type Action, type CapFacts } from './capability';
import type { ConvBlock, ConvSnapshot, ConversationSource } from './source';
import { SessionView } from './SessionView';
import strings from './SessionView.strings.en.json';

const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: true, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const NOW = Date.UTC(2026, 10, 16, 9, 0, 0);
const user = (ago: number): ConvBlock => ({ k: 'user', key: 'u1', text: 'List the files', at: NOW - ago });
const steps = (n: number, state: 'running' | 'ok'): ConvBlock => ({ k: 'steps', key: 't1', label: `${n} steps`, state, rows: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, state: i === n - 1 ? state : 'ok' as const, verb: 'Run', summary: `cmd ${i}` })) });
const snap = (o: Partial<ConvSnapshot> = {}): ConvSnapshot => ({ facts, title: 'Files', gates: [], blocks: [user(12_000)], work: 'thinking', ...o });
const source = (s: ConvSnapshot): ConversationSource => ({ kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, s.facts) });
const bar = () => document.querySelector<HTMLElement>('[data-work-bar]')!;
const elapsed = () => bar().querySelector('[data-work-elapsed]')?.textContent ?? null;
const status = () => within(bar()).getByRole('status');
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const secs = (n: number) => strings['sv.work.secs'].replace('{{n}}', String(n));
const mins = (m: number, sec: number) => strings['sv.work.mins'].replace('{{m}}', String(m)).replace('{{s}}', String(sec));

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

describe('the working bar counts the turn\'s time', () => {
  it('from when the message was sent, not from when the page drew it; it ticks once a second', () => {
    render(<SessionView source={source(snap())} size="l" />);
    expect(elapsed()).toBe(secs(12));
    tick(1000);
    expect(elapsed()).toBe(secs(13));
    tick(3000);
    expect(elapsed()).toBe(secs(16));
  });
  it('past a minute it reads as minutes and seconds, past an hour as hours and minutes (as the time of a step does)', () => {
    const { unmount } = render(<SessionView source={source(snap({ blocks: [user(65_000)] }))} size="l" />);
    expect(elapsed()).toBe(mins(1, 5));
    tick(55_000);
    expect(elapsed()).toBe(mins(2, 0));
    unmount();
    render(<SessionView source={source(snap({ blocks: [user(3_723_000)] }))} size="l" />);
    expect(elapsed()).toBe(strings['sv.work.hours'].replace('{{h}}', '1').replace('{{m}}', '2'));
  });
  it('the status words never hold the clock: a tick is not announced', () => {
    render(<SessionView source={source(snap())} size="l" />);
    expect(status().textContent).toBe(strings['sv.work.thinking']);
    tick(5000);
    expect(status().textContent).toBe(strings['sv.work.thinking']);
    expect(status().contains(bar().querySelector('[data-work-elapsed]'))).toBe(false);
    expect(bar().querySelector('[data-work-meta]')?.closest('[role="status"], [aria-live]')).toBeNull();
  });
  it('a time that cannot be the turn\'s (no time, a clock ahead, a day or more) is not shown', () => {
    for (const at of [0, NOW + 60_000, NOW - 25 * 3_600_000]) {
      const { unmount } = render(<SessionView source={source(snap({ blocks: [{ k: 'user', key: 'u1', text: 'x', at }] }))} size="l" />);
      expect(bar()).not.toBeNull();
      expect(elapsed()).toBeNull();
      unmount();
    }
  });
  it('how many steps the turn has taken, while it works', () => {
    const { unmount } = render(<SessionView source={source(snap({ blocks: [user(12_000), steps(3, 'running')] }))} size="l" />);
    expect(bar().querySelector('[data-work-steps]')?.textContent).toBe(strings['sv.work.stepN'].replace('{{n}}', '3'));
    unmount();
    render(<SessionView source={source(snap())} size="l" />);
    expect(bar().querySelector('[data-work-steps]')).toBeNull();
  });
  it('a follow-up typed while the turn runs, queued or still being sent into it, resets neither the time nor the step count', () => {
    for (const extra of [{ queued: true as const }, { followUp: true as const }]) {
      const later: ConvBlock = { k: 'user', key: 'u2', text: 'Also check the docs', at: NOW - 2_000, ...extra };
      const { unmount } = render(<SessionView source={source(snap({ blocks: [user(12_000), steps(3, 'running'), later] }))} size="l" />);
      expect(elapsed()).toBe(secs(12));
      expect(bar().querySelector('[data-work-steps]')?.textContent).toBe(strings['sv.work.stepN'].replace('{{n}}', '3'));
      unmount();
    }
  });
  it('the agent\'s own words between steps are not counted as steps', () => {
    const withNote: ConvBlock = { k: 'steps', key: 't1', label: '3 steps', state: 'running', rows: [
      { id: 's0', state: 'ok', verb: 'Run', summary: 'cmd 0' },
      { id: 'n1', state: 'ok', kind: 'note', verb: 'Note', summary: 'The tests pass now.' },
      { id: 's1', state: 'ok', verb: 'Run', summary: 'cmd 1' },
      { id: 's2', state: 'running', verb: 'Run', summary: 'cmd 2' },
    ] };
    render(<SessionView source={source(snap({ blocks: [user(12_000), withNote] }))} size="l" />);
    expect(bar().querySelector('[data-work-steps]')?.textContent).toBe(strings['sv.work.stepN'].replace('{{n}}', '3'));
  });
});

describe('nothing reached this page for a while', () => {
  it('after 30 s without a change the bar says for how long; a change takes the line away', () => {
    const first = snap();
    const { rerender } = render(<SessionView source={source(first)} size="l" />);
    const quiet = () => bar().querySelector('[data-work-quiet]')?.textContent ?? null;
    tick(29_000);
    expect(quiet()).toBeNull();
    tick(1000);
    expect(quiet()).toBe(strings['sv.work.quiet'].replace('{{time}}', secs(30)));
    tick(45_000);
    expect(quiet()).toBe(strings['sv.work.quiet'].replace('{{time}}', mins(1, 15)));
    // The turn's own clock keeps going beside it.
    expect(elapsed()).toBe(mins(1, 27));
    rerender(<SessionView source={source(snap({ blocks: [user(87_000), steps(1, 'running')] }))} size="l" />);
    expect(quiet()).toBeNull();
  });
  it('a turn that waits for the person is not called quiet', () => {
    const gate = { key: 'g1', ref: { id: 'g1', generation: 1 }, gate: { kind: 'confirm' as const, risk: 'exec' as const, tool: 'bash', params: { command: 'ls' } }, helper: false, addressing: false, held: null, decision: null };
    render(<SessionView source={source(snap({ gates: [gate], facts: { ...facts, gate: 'confirm' } }))} size="l" stop={{ busy: false, onPress: () => {} }} />);
    tick(120_000);
    expect(within(bar()).getByText(strings['sv.work.waiting'])).toBeTruthy();
    expect(bar().querySelector('[data-work-quiet]')).toBeNull();
  });
});
