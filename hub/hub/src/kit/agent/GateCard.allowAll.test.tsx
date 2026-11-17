// Vitest: what the approval card says and offers beyond its three decisions. "Allow everything in this chat…" only asks the
// host (which confirms and sends): the card sends nothing, shows it only where a host offers it, never on a helper's call, and
// holds it back while the person still owes the "I read this text" tick. "Allow for this session" says what it covers, in the
// agent's own unit (the tool). The risk chip says the agent's class in words, and shows nothing for a call the agent gave no
// class ("unknown"); a tool the card has no words for is named.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GateAllowAll, GateCard, type CardProps, type GateView } from './GateCard';
import strings from './Conversation.strings.en.json';
import mode from './ApprovalMode.strings.en.json';

const bash: GateView = { kind: 'confirm', risk: 'write', tool: 'bash', params: { command: 'npm install chart.js' }, offerSession: true };
const props = (o: Partial<CardProps> = {}): CardProps => ({ gate: bash, pending: false, unknown: false, agentUrl: '', typing: true, onDecide: vi.fn(), onAnswer: vi.fn(), onCheck: vi.fn(), ...o });
const all = () => screen.queryByRole('button', { name: mode['am.card.all'] });
const withHost = (p: CardProps, ask: (() => void) | null) => render(<GateAllowAll.Provider value={ask}><GateCard {...p} /></GateAllowAll.Provider>);

describe('Allow everything on the card', () => {
  it('asks the host and decides nothing itself', () => {
    const ask = vi.fn();
    const p = props();
    withHost(p, ask);
    fireEvent.click(all()!);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(p.onDecide).not.toHaveBeenCalled();
  });
  it('is not shown where no host offers it (the Board, the dock, a Bot), or while the host does not', () => {
    const { unmount } = render(<GateCard {...props()} />);
    expect(all()).toBeNull();
    unmount();
    withHost(props(), null);
    expect(all()).toBeNull();
  });
  it('is not shown on a helper\'s call (it covers one call only)', () => {
    withHost(props({ helper: { name: 'tests' } }), vi.fn());
    expect(all()).toBeNull();
  });
  it('waits while a decision is on its way', () => {
    const ask = vi.fn();
    withHost(props({ pending: true }), ask);
    fireEvent.click(all()!);
    expect(ask).not.toHaveBeenCalled();
  });
  it('waits for the "I read this text" tick, as Allow once does: it would allow this very call', () => {
    const ask = vi.fn();
    // A right-to-left override in the command: shown as written, with marks, and the tick is owed.
    withHost(props({ gate: { ...bash, params: { command: 'echo ‮gnp.exe' } } }), ask);
    expect((screen.getByRole('button', { name: new RegExp(strings['agent.allowOnce']) }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(all()!);
    expect(ask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(all()!);
    expect(ask).toHaveBeenCalledTimes(1);
  });
});

describe('what "for this session" covers', () => {
  it('a command: every later command in this chat', () => {
    render(<GateCard {...props()} />);
    expect(screen.getByText(mode['am.card.session.bash'])).toBeTruthy();
  });
  it('another tool: that tool, by name', () => {
    render(<GateCard {...props({ gate: { ...bash, tool: 'delete_file', params: { path: '/a' } } })} />);
    expect(screen.getByText(mode['am.card.session.tool'].replaceAll('{{tool}}', 'delete_file'))).toBeTruthy();
  });
  it('not said where the session choice is not offered', () => {
    render(<GateCard {...props({ gate: { ...bash, offerSession: false } })} />);
    expect(screen.queryByText(mode['am.card.session.bash'])).toBeNull();
  });
});

describe('the risk chip and the tool', () => {
  const chipOf = (risk: string) => { const r = render(<GateCard {...props({ gate: { ...bash, risk } })} />); return r; };
  it('the agent\'s classes are said in words', () => {
    chipOf('write');
    expect(screen.getByText(mode['am.risk.write'])).toBeTruthy();
    expect(screen.queryByText('write')).toBeNull();
  });
  it('"unknown" (no class) shows no chip', () => {
    chipOf('unknown');
    expect(screen.queryByText('unknown')).toBeNull();
  });
  it('a class with no words is shown as the agent wrote it', () => {
    chipOf('restarts a service');
    expect(screen.getByText('restarts a service')).toBeTruthy();
  });
  it('a property name is not a class', () => {
    chipOf('constructor');
    expect(screen.getByText('constructor')).toBeTruthy();
  });
  it('a tool the card has no words for is named beside "Use a tool"', () => {
    render(<GateCard {...props({ gate: { ...bash, tool: 'mcp__files__move', params: {} } })} />);
    expect(screen.getByText(strings['agent.act.tool'])).toBeTruthy();
    expect(screen.getByText('mcp__files__move')).toBeTruthy();
  });
});
