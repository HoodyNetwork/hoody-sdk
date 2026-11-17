// The working bar's words say what the turn waits on: compacting the conversation, a step (named beside), the reply being written,
// the model thinking. A host that says nothing more keeps the generic line.
import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { can, type Action, type CapFacts } from './capability';
import type { ConvBlock, ConvSnapshot, ConversationSource } from './source';
import { SessionView } from './SessionView';
import strings from './SessionView.strings.en.json';

const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: true, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const user: ConvBlock = { k: 'user', key: 'u1', text: 'Fix the checkout tests', at: 1 };
const running: ConvBlock = { k: 'steps', key: 't1', label: '1 step', state: 'running', rows: [{ id: 'b', state: 'running', verb: 'Run', summary: 'npm test' }] };
const streaming: ConvBlock = { k: 'reply', key: 'r', text: 'So', streaming: true, final: false, cost: null, at: null };
const snap = (o: Partial<ConvSnapshot> = {}): ConvSnapshot => ({ facts, title: 'Fix tests', gates: [], blocks: [user], ...o });
const source = (s: ConvSnapshot): ConversationSource => ({ kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, s.facts) });
const bar = () => document.querySelector<HTMLElement>('[data-work-bar]')!;
const words = () => within(bar()).getByRole('status').textContent;

describe('SessionView working bar words', () => {
  it('compacting: says so, with why, and never Working', () => {
    render(<SessionView source={source(snap({ work: 'compacting' }))} size="l" />);
    expect(words()).toBe(strings['sv.work.compacting']);
    expect(within(bar()).getByText(strings['sv.work.compactingWhy'])).toBeTruthy();
    expect(within(bar()).queryByText(strings['sv.work.working'])).toBeNull();
  });
  it('waiting on the model: Thinking', () => {
    render(<SessionView source={source(snap({ work: 'thinking' }))} size="l" />);
    expect(words()).toBe(strings['sv.work.thinking']);
  });
  it('a step runs: says a step runs and names it, whatever the host says of the model', () => {
    render(<SessionView source={source(snap({ work: 'thinking', blocks: [user, running] }))} size="l" />);
    expect(words()).toBe(strings['sv.work.step']);
    expect(within(bar()).getByText('Run')).toBeTruthy();
    expect(within(bar()).getByText('npm test')).toBeTruthy();
  });
  it('the reply streams: Writing the reply', () => {
    render(<SessionView source={source(snap({ work: 'thinking', blocks: [user, streaming] }))} size="l" />);
    expect(words()).toBe(strings['sv.work.writing']);
  });
  it('a host that says nothing more keeps the generic line', () => {
    render(<SessionView source={source(snap())} size="l" />);
    expect(words()).toBe(strings['sv.work.working']);
  });
});

describe('SessionView working bar mark', () => {
  it('a running turn shows the Hoody loader, decorative (the words beside it are the status)', () => {
    render(<SessionView source={source(snap({ work: 'thinking' }))} size="l" />);
    const mark = bar().querySelector('[data-hoody-loader]');
    expect(mark).not.toBeNull();
    expect(mark!.getAttribute('aria-hidden')).toBe('true');
    expect(within(bar()).getAllByRole('status')).toHaveLength(1);
  });
});
