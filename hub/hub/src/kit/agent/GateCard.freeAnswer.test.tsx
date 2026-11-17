// A question whose agent already offers a free-answer choice ("Something else (I'll describe it)", "Other"): the card shows
// that choice once, in the agent's words, never the card's own "Something else" beside it; picking it opens the text field,
// and Send answer sends the typed words.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GateCard, type CardProps, type GateView } from './GateCard';
import strings from './Conversation.strings.en.json';

const props = (gate: GateView): CardProps => ({ gate, pending: false, unknown: false, agentUrl: '', typing: true, onDecide: vi.fn(), onAnswer: vi.fn(), onCheck: vi.fn() });
const sendBtn = () => screen.getByRole('button', { name: strings['agent.sendAnswer'] }) as HTMLButtonElement;
const field = () => screen.queryByRole('textbox', { name: strings['agent.somethingElseField'] }) as HTMLInputElement | null;
const OWN = "Something else (I'll describe it)";

describe('GateCard: the agent\'s own free-answer choice', () => {
  it('one free-answer choice only: the agent\'s, never the card\'s beside it', () => {
    render(<GateCard {...props({ kind: 'question', risk: '', question: 'Which port?', options: ['8080', '3000', OWN] })} />);
    expect(screen.getAllByRole('radio', { name: /something else/i })).toHaveLength(1);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: OWN })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: strings['agent.somethingElse'] })).toBeNull();
  });
  it('picking it opens the text field; Send answer sends the typed words, never the label', () => {
    const p = props({ kind: 'question', risk: '', question: 'Which port?', options: ['8080', OWN] });
    render(<GateCard {...p} />);
    expect(field()).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: OWN }));
    expect(field()).not.toBeNull();
    expect(sendBtn().disabled).toBe(true);
    fireEvent.change(field()!, { target: { value: ' 9443 ' } });
    fireEvent.click(sendBtn());
    expect(p.onAnswer).toHaveBeenCalledWith('9443');
  });
  it('"Other" works the same; a listed option next to it is still sent as written', () => {
    const p = props({ kind: 'question', risk: '', question: 'Which branch?', options: ['main', 'Other'] });
    render(<GateCard {...p} />);
    expect(screen.queryByRole('radio', { name: strings['agent.somethingElse'] })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
    fireEvent.change(field()!, { target: { value: 'release' } });
    fireEvent.click(screen.getByRole('radio', { name: 'main' }));
    expect(field()).toBeNull();
    fireEvent.click(sendBtn());
    expect(p.onAnswer).toHaveBeenCalledWith('main');
  });
  it('an agent with no free-answer choice: the card\'s own Something else is still there', () => {
    render(<GateCard {...props({ kind: 'question', risk: '', question: 'Which port?', options: ['8080', 'Other port'] })} />);
    expect(screen.getByRole('radio', { name: strings['agent.somethingElse'] })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Other port' })).toBeTruthy();
  });
  it('several questions: each question decides for itself', () => {
    const p = props({ kind: 'question', risk: '', questions: [{ id: 'a', question: 'First?', options: ['x', 'Other'] }, { id: 'b', question: 'Second?', options: ['p', 'q'] }] });
    render(<GateCard {...p} />);
    expect(screen.getAllByRole('radio', { name: 'Other' })).toHaveLength(1);
    expect(screen.getAllByRole('radio', { name: strings['agent.somethingElse'] })).toHaveLength(1);
  });
});
