// Strict and the approval card (Strict offers no Allow for this session). The gateway withholds
// offer_session_allow under "always" (the same predicate that refuses a forged session allow), so a Strict chat's card
// arrives with no session offer (ask gateOf: offerSession = offer_session_allow === true), and a mode change is refused
// while a card waits. The card then offers Allow once and Deny only.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GateCard, type CardProps, type GateView } from './GateCard';
import strings from './Conversation.strings.en.json';

const props = (gate: GateView): CardProps => ({
  gate, pending: false, unknown: false, agentUrl: '', typing: true, onDecide: vi.fn(), onAnswer: vi.fn(), onCheck: vi.fn(),
});
const confirm: GateView = { kind: 'confirm', risk: 'exec', tool: 'bash', params: { command: 'make deploy' } };
const session = () => screen.queryByRole('button', { name: new RegExp(strings['agent.allowSession']) });

describe('Strict: no Allow for this session', () => {
  it('a Strict chat\'s card (no session offer): Allow once only, never Allow for this session', () => {
    render(<GateCard {...props({ ...confirm, offerSession: false })} />);
    expect(screen.getByRole('button', { name: new RegExp(strings['agent.allowOnce']) })).toBeInTheDocument();
    expect(session()).toBeNull();
  });

  it('the same card from a Default chat that offers it shows Allow for this session', () => {
    render(<GateCard {...props({ ...confirm, offerSession: true })} />);
    expect(session()).toBeInTheDocument();
  });
});
