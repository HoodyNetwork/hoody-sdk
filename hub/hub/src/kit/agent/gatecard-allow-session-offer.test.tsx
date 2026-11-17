// Vitest (3.6): gate decisions as the card draws them. Allow for this session only when the gate
// offers it, and the card says what a decision covers; a helper's approval is answered here and says who asked; a
// decision whose gate vanished without evidence stays unknown with the design's words, offering only a read or Stop tracking;
// a gate that ended before our answer applied folds as such; several gates are counted, and Activity lists each with
// Show, which brings that gate's own card to the person.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { can, type Action, type CapFacts } from './capability';
import { ConversationView } from './ConversationView';
import { DetailsPanel } from './DetailsPanel';
import { DecidedLine, GateCard, type CardProps, type GateView } from './GateCard';
import { SessionView } from './SessionView';
import type { ActiveSource, ConvSnapshot, ConversationSource, GateEntry } from './source';
import strings from './Conversation.strings.en.json';

const confirm: GateView = { kind: 'confirm', risk: 'exec', tool: 'bash', params: { command: 'make' } };
const question: GateView = { kind: 'question', risk: '', question: 'Which branch?', options: ['main'] };
const props = (o: Partial<CardProps>): CardProps => ({
  gate: confirm, pending: false, unknown: false, agentUrl: 'https://agent.example', typing: true,
  onDecide: vi.fn(), onAnswer: vi.fn(), onCheck: vi.fn(), ...o,
});
const btn = (name: string | RegExp) => screen.queryByRole('button', { name });
const LOST_ALLOW = 'We lost the answer to your Allow. The approval is no longer waiting, which does not tell us what happened.';

afterEach(() => { cleanup(); });

describe('GateCard: Allow for this session (offer_session_allow)', () => {
  it('offered: the button decides "session" and the card says what each choice covers', () => {
    const p = props({ gate: { ...confirm, offerSession: true } });
    render(<GateCard {...p} />);
    fireEvent.click(btn(strings['agent.allowSession'])!);
    expect(p.onDecide).toHaveBeenCalledWith('session');
    expect(screen.getByText(strings['agent.coversSession'])).toBeTruthy();
    expect(screen.queryByText(strings['agent.coversCall'])).toBeNull();
  });
  it('not offered: no session button, and the card says the answer applies to this call', () => {
    render(<GateCard {...props({})} />);
    expect(btn(strings['agent.allowSession'])).toBeNull();
    expect(screen.getByText(strings['agent.coversCall'])).toBeTruthy();
  });
  it('a question has no Allow buttons and no "applies to" line', () => {
    render(<GateCard {...props({ gate: question })} />);
    expect(btn(strings['agent.allowSession'])).toBeNull();
    expect(screen.queryByText(strings['agent.coversCall'])).toBeNull();
  });
});

describe('GateCard: a helper\'s approval', () => {
  it('is answered here and says who asked and that it covers this one call', () => {
    const p = props({ helper: { name: 'reviewer' }, gate: { ...confirm, offerSession: true } });
    render(<GateCard {...p} />);
    expect(screen.getByText('Asked by helper "reviewer". Approving applies to this one call only.')).toBeTruthy();
    expect(btn(strings['agent.allowSession'])).toBeNull(); // one call only, whatever the gate offers
    fireEvent.click(btn(new RegExp(strings['agent.allowOnce']))!);
    expect(p.onDecide).toHaveBeenCalledWith('once');
    expect(screen.queryByText(strings['agent.continueInAgent'])).toBeNull();
  });
  it('an unnamed helper still says a helper asked; its name is cleaned', () => {
    const { rerender } = render(<GateCard {...props({ helper: { name: '' } })} />);
    expect(screen.getByText(strings['agent.helperAskedAnon'])).toBeTruthy();
    rerender(<GateCard {...props({ helper: { name: 'rev\u001b[31mie\u0007wer' } })} />);
    expect(screen.getByText('Asked by helper "reviewer". Approving applies to this one call only.')).toBeTruthy();
  });
  it('a source that cannot answer helpers keeps the buttons off and says why', () => {
    const p = props({ helper: { name: 'reviewer' }, unavailable: 'A helper\'s approval is answered in the Agent app.' });
    render(<GateCard {...p} />);
    fireEvent.click(btn(new RegExp(strings['agent.allowOnce']))!);
    expect(p.onDecide).not.toHaveBeenCalled();
    expect(screen.getByText('A helper\'s approval is answered in the Agent app.')).toBeTruthy();
  });
  it('helper=true (a host that cannot answer helpers at all) still sends the person to the Agent', () => {
    render(<GateCard {...props({ helper: true })} />);
    expect(screen.getByText(strings['agent.continueInAgent'])).toBeTruthy();
    expect(btn(new RegExp(strings['agent.allowOnce']))).toBeNull();
  });
});

describe('GateCard: a decision whose gate vanished without evidence stays unknown', () => {
  it.each<[string, Partial<CardProps>, string]>([
    ['an Allow', { sent: 'once' }, LOST_ALLOW],
    ['an Allow for this session', { sent: 'session' }, LOST_ALLOW],
    ['a Deny', { sent: 'deny' }, 'We lost the answer to your Deny. The approval is no longer waiting, which does not tell us what happened.'],
    ['a decision the host did not name', {}, 'We lost the answer to your decision. The approval is no longer waiting, which does not tell us what happened.'],
    ['an answer to a question', { gate: question }, 'We lost your answer. The question is no longer waiting, which does not tell us what happened.'],
  ])('%s: the words say so, nothing can be decided, Check again reads and Stop tracking gives up', (_n, o, words) => {
    const onDismiss = vi.fn();
    const p = props({ unknown: true, gone: true, onDismiss, ...o });
    render(<GateCard {...p} />);
    expect(screen.getByText(words)).toBeTruthy();
    expect(btn(/Allow|Deny|Send answer/)).toBeNull();
    fireEvent.click(btn(strings['agent.checkAgain'])!);
    expect(p.onCheck).toHaveBeenCalledTimes(1);
    fireEvent.click(btn(strings['agent.dismissDecision'])!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(p.onDecide).not.toHaveBeenCalled();
    expect(p.onAnswer).not.toHaveBeenCalled();
  });
  it('without onDismiss there is no Stop tracking; a check the source refuses is off and says why', () => {
    render(<GateCard {...props({ unknown: true, gone: true, sent: 'once', checkUnavailable: 'Reading is not possible now.' })} />);
    expect(btn(strings['agent.dismissDecision'])).toBeNull();
    expect((btn(strings['agent.checkAgain']) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Reading is not possible now.')).toBeTruthy();
  });
  it.each<[string, Partial<CardProps>]>([
    ['policy-blocked approval', { gate: { ...confirm, blocked: 'policy' }, sent: 'once' }],
    ['invalid approval', { gate: { ...confirm, invalid: true }, sent: 'once' }],
    ['host without helper approvals', { helper: true, sent: 'once' }],
    ['policy-blocked question', { gate: { ...question, blocked: 'policy' } }],
  ])('%s: a vanished decision still shows the lost-answer words with Check again and Stop tracking', (_n, o) => {
    const onDismiss = vi.fn();
    const p = props({ unknown: true, gone: true, onDismiss, ...o });
    render(<GateCard {...p} />);
    expect(screen.getByText(/^We lost/)).toBeTruthy();
    expect(screen.queryByText(strings['agent.continueInAgent'])).toBeNull();
    fireEvent.click(btn(strings['agent.checkAgain'])!);
    fireEvent.click(btn(strings['agent.dismissDecision'])!);
    expect(p.onCheck).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(btn(/Allow|Deny|Send answer/)).toBeNull();
  });
  // The card's own Y / N keys decide only a card that can still be decided; a key pressed in a descendant bubbles to the
  // card, so a vanished decision must refuse it there too (the Check again and Stop tracking buttons hold focus).
  it.each([['Y'], ['y'], ['N'], ['n']])('key %s from a control inside a vanished-unknown card decides nothing', (key) => {
    const p = props({ unknown: true, gone: true, sent: 'once', onDismiss: vi.fn() });
    render(<GateCard {...p} />);
    fireEvent.keyDown(btn(strings['agent.checkAgain'])!, { key });
    fireEvent.keyDown(btn(strings['agent.dismissDecision'])!, { key });
    expect(p.onDecide).not.toHaveBeenCalled();
  });
  it.each([['Y', 'once'], ['y', 'once']])('control: key %s from a button inside a live card decides %s', (key, decision) => {
    const p = props({});
    render(<GateCard {...p} />);
    fireEvent.keyDown(btn(/^Deny/)!, { key });
    expect(p.onDecide).toHaveBeenCalledTimes(1);
    expect(p.onDecide).toHaveBeenCalledWith(decision);
  });
  it.each([['N'], ['n']])('control: key %s from a button inside a live card denies', (key) => {
    const p = props({});
    render(<GateCard {...p} />);
    fireEvent.keyDown(btn(/^Deny/)!, { key });
    expect(p.onDecide).toHaveBeenCalledTimes(1);
    expect(p.onDecide).toHaveBeenCalledWith('deny', undefined);
  });
  it('a lost answer whose gate still waits keeps the "may have gone through" words', () => {
    render(<GateCard {...props({ unknown: true, sent: 'once' })} />);
    expect(screen.getByText(strings['agent.decisionUnknown'])).toBeTruthy();
    expect(screen.queryByText(LOST_ALLOW)).toBeNull();
  });
});

describe('DecidedLine: a gate that ended before our answer applied', () => {
  it('folds with its own words, never as allowed or denied', () => {
    render(<DecidedLine d={{ kind: 'ended', tool: 'bash', text: 'make' }} />);
    expect(screen.getByText(strings['agent.d.ended'])).toBeTruthy();
    expect(screen.queryByText(strings['agent.d.once'])).toBeNull();
  });
});

// ---- several gates ----
const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: true, gate: 'confirm', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const gate = (id: string, o: Partial<GateEntry> = {}): GateEntry => ({
  key: id, ref: { id, generation: 1 }, gate: { kind: 'confirm', risk: 'exec', tool: 'bash', params: { command: `run ${id}` } }, helper: false, addressing: false, held: null, decision: null, ...o,
});
const snap = (gates: GateEntry[]): ConvSnapshot => ({ facts, title: 'Fix it', blocks: [{ k: 'user', key: 'u1', text: 'Fix it', at: 1 }], gates, meta: { computer: 'atlas', realm: 'Work', status: 'needs' } });
const readSource = (s: ConvSnapshot): ConversationSource => ({
  kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, s.facts),
});

describe('Activity: several gates counted, each with Show', () => {
  it('counts the gates and lists each, naming a helper, with a Show that names its gate', () => {
    const onShowGate = vi.fn();
    const gs = [gate('a'), gate('b', { helper: true, helperName: 'reviewer' }), gate('c', { decision: 'unknown', gone: true, sent: 'once' })];
    render(<DetailsPanel snapshot={snap(gs)} onClose={() => {}} tab="activity" onShowGate={onShowGate} />);
    expect(screen.getByText('3 approvals or questions open')).toBeTruthy();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[1]!).getByText(/asked by helper "reviewer"/)).toBeTruthy();
    fireEvent.click(within(items[1]!).getByRole('button', { name: 'Show' }));
    expect(onShowGate).toHaveBeenCalledWith(gs[1]);
    expect(within(items[2]!).getByText(/answer may be lost \(no longer waiting\): Allow run c\?/)).toBeTruthy();
  });
  it('one gate: no count line; without onShowGate there is no Show', () => {
    render(<DetailsPanel snapshot={snap([gate('a')])} onClose={() => {}} tab="activity" />);
    expect(screen.queryByText(/approvals or questions open/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull();
  });
});

describe('SessionView: every gate card can be found by its identity', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('each card sits in a wrap named by key, id and generation; the bar counts the rest', () => {
    const { container } = render(<SessionView source={readSource(snap([gate('a'), gate('b'), gate('c')]))} size="l" typing />);
    expect([...container.querySelectorAll('[data-gate-key]')].map((e) => e.getAttribute('data-gate-key'))).toEqual(['a:a:1', 'b:b:1', 'c:c:1']);
    expect(within(screen.getByRole('region', { name: 'Waiting for you' })).getByText('2 more')).toBeTruthy();
  });
  it('a helper gate is drawn as an answerable helper card with its name', () => {
    render(<SessionView source={readSource(snap([gate('a', { helper: true, helperName: 'reviewer' })]))} size="l" typing />);
    expect(screen.getByText('Asked by helper "reviewer". Approving applies to this one call only.')).toBeTruthy();
  });
  it('a vanished decision is drawn with the lost-answer words', () => {
    render(<SessionView source={readSource(snap([gate('a', { decision: 'unknown', gone: true, sent: 'once' })]))} size="l" typing />);
    expect(screen.getByText(LOST_ALLOW)).toBeTruthy();
  });
});

describe('ConversationView: Show in Activity brings that gate\'s card', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  const active = (s: ConvSnapshot): ActiveSource => ({
    ...readSource(s), send: async () => ({ k: 'done' }), stop: async () => ({ k: 'done' }), decide: async () => ({ k: 'done' }), answer: async () => ({ k: 'done' }),
    check: async () => ({ k: 'done' }), dismissDecision: () => {}, canDismiss: () => false,
  });
  it('wide: Details stays open and focus goes to the second card\'s first control', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1400);
    const onDetails = vi.fn();
    render(<ConversationView source={active(snap([gate('a'), gate('b')]))} pane={null} detailsOpen onDetails={onDetails} tab="activity" typing />);
    const panel = document.querySelector<HTMLElement>('[data-details-panel]')!;
    fireEvent.click(within(panel).getAllByRole('button', { name: 'Show' })[1]!);
    const wrap = document.querySelector<HTMLElement>('[data-gate-key="b:b:1"]')!;
    expect(wrap.contains(document.activeElement)).toBe(true);
    expect(onDetails).not.toHaveBeenCalled();
  });
  it('phone: the sheet closes, then focus goes to that card', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
    let open = true;
    const onDetails = vi.fn((v: boolean) => { open = v; });
    const s = active(snap([gate('a'), gate('b')]));
    const { rerender } = render(<ConversationView source={s} pane={null} detailsOpen={open} onDetails={onDetails} tab="activity" typing />);
    const panel = document.querySelector<HTMLElement>('[data-details-panel]')!;
    fireEvent.click(within(panel).getAllByRole('button', { name: 'Show' })[1]!);
    expect(onDetails).toHaveBeenCalledWith(false);
    act(() => { rerender(<ConversationView source={s} pane={null} detailsOpen={open} onDetails={onDetails} tab="activity" typing />); });
    const wrap = document.querySelector<HTMLElement>('[data-gate-key="b:b:1"]')!;
    expect(wrap.contains(document.activeElement)).toBe(true);
  });
  it('phone: a later Show pressed before the sheet has closed replaces the earlier one; only its card takes focus', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
    let open = true;
    const onDetails = vi.fn((v: boolean) => { open = v; });
    const s = active(snap([gate('a'), gate('b'), gate('c')]));
    const { rerender } = render(<ConversationView source={s} pane={null} detailsOpen={open} onDetails={onDetails} tab="activity" typing />);
    const shows = within(document.querySelector<HTMLElement>('[data-details-panel]')!).getAllByRole('button', { name: 'Show' });
    fireEvent.click(shows[1]!);
    fireEvent.click(shows[2]!);
    act(() => { rerender(<ConversationView source={s} pane={null} detailsOpen={open} onDetails={onDetails} tab="activity" typing />); });
    expect(document.querySelector<HTMLElement>('[data-gate-key="c:c:1"]')!.contains(document.activeElement), 'the later Show wins').toBe(true);
    expect(document.querySelector<HTMLElement>('[data-gate-key="b:b:1"]')!.contains(document.activeElement)).toBe(false);
  });
  it('phone: a card that goes away while the sheet closes takes no focus, and no other card takes it in its place', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
    let open = true;
    const onDetails = vi.fn((v: boolean) => { open = v; });
    const before = active(snap([gate('a'), gate('b')]));
    const { rerender } = render(<ConversationView source={before} pane={null} detailsOpen={open} onDetails={onDetails} tab="activity" typing />);
    fireEvent.click(within(document.querySelector<HTMLElement>('[data-details-panel]')!).getAllByRole('button', { name: 'Show' })[1]!);
    expect(onDetails).toHaveBeenCalledWith(false);
    // b is decided elsewhere in the same moment the sheet closes: the next drawing has no card for it.
    const after = active(snap([gate('a')]));
    act(() => { rerender(<ConversationView source={after} pane={null} detailsOpen={open} onDetails={onDetails} tab="activity" typing />); });
    expect(document.querySelector('[data-gate-key="b:b:1"]')).toBeNull();
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-gate-key]'));
    expect(cards.some((w) => w.contains(document.activeElement)), 'focus stays out of every card').toBe(false);
  });
});
