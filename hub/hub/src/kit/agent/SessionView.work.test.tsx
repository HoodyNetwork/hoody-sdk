// The working bar and the turn structure of SessionView. The bar is pinned under the transcript (never inside the log): it says what the
// newest turn is doing (turnPhase) and holds the host's Stop. While a gate waits and the Needs-you bar is up, that bar carries Stop and
// the working bar stays away, so one pinned row speaks at a time.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { can, type Action, type CapFacts } from './capability';
import type { ConvBlock, ConvSnapshot, ConversationSource, GateEntry } from './source';
import { SessionView } from './SessionView';
import strings from './SessionView.strings.en.json';

const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: true, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const user: ConvBlock = { k: 'user', key: 'u1', text: 'Fix the checkout tests', at: Date.UTC(2026, 0, 2, 10, 42) };
const running: ConvBlock = { k: 'steps', key: 't1', label: '2 steps', state: 'running', rows: [
  { id: 'a', state: 'ok', verb: 'Read', summary: 'a.ts' }, { id: 'b', state: 'running', verb: 'Run', summary: 'npm test' },
] };
const snap = (o: Partial<ConvSnapshot> = {}, f: Partial<CapFacts> = {}): ConvSnapshot => ({ facts: { ...facts, ...f }, title: 'Fix tests', gates: [], blocks: [user], ...o });
const source = (s: ConvSnapshot): ConversationSource => ({ kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, s.facts) });
const gate: GateEntry = { key: 'g1', ref: { id: 'g1', generation: 3 }, gate: { kind: 'confirm', risk: 'exec', tool: 'bash', params: { command: 'git push' } }, helper: false, addressing: false, held: null, decision: null };
const bar = () => document.querySelector<HTMLElement>('[data-work-bar]');

describe('SessionView working bar', () => {
  it('nothing runs: no bar', () => {
    render(<SessionView source={source(snap({}, { turn: false, state: 'idle' }))} size="l" />);
    expect(bar()).toBeNull();
  });

  it('sent and nothing back yet: the bar says Working, outside the log', () => {
    render(<SessionView source={source(snap())} size="l" />);
    const b = bar()!;
    expect(within(b).getByText(strings['sv.work.working'])).toBeTruthy();
    expect(screen.getByRole('log').contains(b)).toBe(false);
    expect(within(b).queryByRole('button')).toBeNull();
  });

  it('the running step is named beside the phase, and the reply being written says so', () => {
    const r = render(<SessionView source={source(snap({ blocks: [user, running] }))} size="l" />);
    expect(within(bar()!).getByText('Run')).toBeTruthy();
    expect(within(bar()!).getByText('npm test')).toBeTruthy();
    r.unmount();
    render(<SessionView source={source(snap({ blocks: [user, { k: 'reply', key: 'r', text: 'So', streaming: true, final: false, cost: null, at: null }] }))} size="l" />);
    expect(within(bar()!).getByText(strings['sv.work.writing'])).toBeTruthy();
  });

  it("the host's Stop sits in the bar; a Stop on its way says Stopping and refuses a second press", () => {
    const onPress = vi.fn();
    const r = render(<SessionView source={source(snap())} size="l" stop={{ busy: false, onPress }} />);
    fireEvent.click(within(bar()!).getByRole('button', { name: strings['sv.work.stop'] }));
    expect(onPress).toHaveBeenCalledTimes(1);
    r.rerender(<SessionView source={source(snap())} size="l" stop={{ busy: true, onPress }} />);
    expect(within(bar()!).getByText(strings['sv.work.stopping'])).toBeTruthy();
    const stop = within(bar()!).getByRole('button', { name: new RegExp(strings['sv.work.stop']) });
    expect(stop.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(stop);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a Stop that never got its answer stays held, and the bar does not claim the turn is stopping', () => {
    const onPress = vi.fn();
    render(<SessionView source={source(snap())} size="l" stop={{ busy: true, unknown: true, onPress }} />);
    expect(within(bar()!).queryByText(strings['sv.work.stopping'])).toBeNull();
    expect(within(bar()!).getByText(strings['sv.work.working'])).toBeTruthy();
    expect(within(bar()!).getByRole('button', { name: new RegExp(strings['sv.work.stop']) }).getAttribute('aria-disabled')).toBe('true');
  });

  it('a host that hands a Stop always gets a bar to hold it, even for a snapshot that reads idle', () => {
    render(<SessionView source={source(snap({ saved: { at: 1 } }))} size="l" stop={{ busy: false, onPress: vi.fn() }} />);
    expect(within(bar()!).getByRole('button', { name: strings['sv.work.stop'] })).toBeTruthy();
  });

  it("catching up says so with its reason, from the host's own word, though the facts read loading", () => {
    render(<SessionView source={source(snap({ activity: { phase: 'catching_up' } }, { state: 'loading', turn: false }))} size="l" />);
    expect(within(bar()!).getByText(strings['sv.work.catchingUp'])).toBeTruthy();
    expect(within(bar()!).getByText(strings['sv.work.catchingUpWhy'])).toBeTruthy();
    expect(within(bar()!).queryByRole('button')).toBeNull();
  });

  it('a waiting gate whose card is in view: the bar says it waits for the answer and keeps Stop', () => {
    const onPress = vi.fn();
    render(<SessionView source={source(snap({ gates: [gate] }, { gate: 'confirm' }))} size="l" stop={{ busy: false, onPress }} />);
    expect(within(bar()!).getByText(strings['sv.work.waiting'])).toBeTruthy();
    expect(within(bar()!).getByRole('button', { name: strings['sv.work.stop'] })).toBeTruthy();
  });

  it('two waiting gates: the Needs-you bar carries Stop and the working bar stays away', () => {
    const onPress = vi.fn();
    const second: GateEntry = { ...gate, key: 'g2', ref: { id: 'g2', generation: 1 } };
    render(<SessionView source={source(snap({ gates: [gate, second] }, { gate: 'confirm' }))} size="l" stop={{ busy: false, onPress }} />);
    expect(bar()).toBeNull();
    const needs = document.querySelector<HTMLElement>('[data-needs-bar]')!;
    fireEvent.click(within(needs).getByRole('button', { name: strings['sv.work.stop'] }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a waiting gate without a host Stop draws no working bar (the card speaks)', () => {
    render(<SessionView source={source(snap({ gates: [gate] }, { gate: 'confirm' }))} size="l" />);
    expect(bar()).toBeNull();
  });

  it('a computer that stopped answering mid-turn says the reply may still run there, never Working', () => {
    render(<SessionView source={source(snap({}, { reach: 'unreachable' }))} size="l" />);
    expect(within(bar()!).getByText(strings['sv.work.lost'])).toBeTruthy();
    expect(within(bar()!).queryByText(strings['sv.work.working'])).toBeNull();
  });
});

describe('SessionView turn structure', () => {
  const two = snap({ blocks: [
    user,
    { k: 'reply', key: 'r1', text: 'Done', streaming: false, final: true, cost: null, at: null },
    { k: 'user', key: 'u2', text: 'And the lint?', at: Date.UTC(2026, 0, 2, 10, 50) },
    { k: 'line', key: 'l1', text: 'This reply failed.', tone: 'bad' },
  ] }, { turn: false, state: 'idle' });

  it('each message opens a turn that holds everything up to the next message', () => {
    const { container } = render(<SessionView source={source(two)} size="l" />);
    const turns = [...container.querySelectorAll<HTMLElement>('[data-turn]')];
    expect(turns).toHaveLength(2);
    expect(within(turns[0]!).getByText('Fix the checkout tests')).toBeTruthy();
    expect(within(turns[0]!).getByText('Done')).toBeTruthy();
    expect(within(turns[1]!).getByText('And the lint?')).toBeTruthy();
    expect(within(turns[1]!).getByText('This reply failed.')).toBeTruthy();
  });

  it('a message says when it was sent, as a time element with the full date', () => {
    const { container } = render(<SessionView source={source(two)} size="l" />);
    const times = [...container.querySelectorAll('time')];
    expect(times).toHaveLength(2);
    expect(times[0]!.getAttribute('datetime')).toBe(new Date(Date.UTC(2026, 0, 2, 10, 42)).toISOString());
  });

  it('a failure line carries a mark a screen reader hears, and stays a note', () => {
    render(<SessionView source={source(two)} size="l" />);
    const note = screen.getByText('This reply failed.');
    expect(note.getAttribute('role')).toBe('note');
    expect(note.querySelector('svg')).not.toBeNull();
  });

  it('blocks that come before any message (a chat read from its middle) still draw, in a turn of their own', () => {
    const { container } = render(<SessionView source={source(snap({ blocks: [{ k: 'line', key: 'l0', text: 'Earlier steps', tone: 'muted' }, user] }, { turn: false, state: 'idle' }))} size="l" />);
    expect(container.querySelectorAll('[data-turn]')).toHaveLength(2);
  });
});
