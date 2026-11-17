// Vitest: the Bot's "Waiting for you" card is the kit GateCard through the Bots adapter. An approval
// offers Allow once first and Deny (keys Y and N), with Add a reason, and never a session choice (the gate route decides
// one call); a question takes a typed answer. A decision whose answer is unknown ("may have gone through", C9) shows only
// Check again, which reads back and never sends a second decision. The delegate's summary is Prose with its secrets hidden.
import K from '@kit/agent/Conversation.strings.en.json';
import { render, screen, userEvent } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import type { BotView, Change, Gate } from './data';
import { gateShowOf, gateViewOf } from './model-adapters';
import { focusGate, GateCard } from './parts/GateCard';
import S from './strings.en.json';

type Vars = { approve: boolean; reason?: string; answer?: string };
const gate = (type: Gate['type'], summary = 'Run the release step'): Gate => ({ id: 'g1', generation: 1, type, summary, tool: null, advanced: null });
const bot = (g: Gate) => ({ gate: g }) as unknown as BotView;
function change(over: Partial<Change<{ replayed: boolean }, Vars>> = {}) {
  const run = vi.fn(async (_v: Vars) => ({ outcome: 'done' as const }));
  const readBack = vi.fn(async () => true);
  const dismiss = vi.fn();
  const c = { run, outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false, readBack, dismiss, reset: () => undefined, ...over };
  return c as unknown as Change<{ replayed: boolean }, Vars> & { run: typeof run; readBack: typeof readBack; dismiss: typeof dismiss };
}

describe('the Bot gate card (kit GateCard)', () => {
  it('an approval offers Allow once first, then Deny, with Add a reason and no session choice', () => {
    render(<GateCard bot={bot(gate('confirm'))} change={change()} />);
    const buttons = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    const once = buttons.findIndex((b) => b.includes(K['agent.allowOnce']));
    const deny = buttons.findIndex((b) => b.includes(K['agent.deny']));
    expect(once).toBe(0);
    expect(deny).toBeGreaterThan(once);
    expect(screen.getByRole('button', { name: K['agent.addReason'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(K['agent.allowSession']) })).toBeNull();
    expect(screen.getByText(S['gate.why'])).toBeInTheDocument();
  });

  it('Allow once sends one approval with no reason', async () => {
    const c = change();
    render(<GateCard bot={bot(gate('confirm'))} change={c} />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) }));
    expect(c.run).toHaveBeenCalledTimes(1);
    expect(c.run).toHaveBeenCalledWith({ approve: true });
  });

  it('Y on the focused card approves once and N denies', async () => {
    const yes = change();
    const { unmount } = render(<GateCard bot={bot(gate('confirm'))} change={yes} />);
    screen.getByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) }).focus();
    await userEvent.keyboard('y');
    expect(yes.run).toHaveBeenCalledWith({ approve: true });
    unmount();
    const no = change();
    render(<GateCard bot={bot(gate('confirm'))} change={no} />);
    screen.getByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) }).focus();
    await userEvent.keyboard('n');
    expect(no.run).toHaveBeenCalledWith({ approve: false });
  });

  it('Deny after Add a reason sends the reason with the denial', async () => {
    const c = change();
    render(<GateCard bot={bot(gate('confirm'))} change={c} />);
    await userEvent.click(screen.getByRole('button', { name: K['agent.addReason'] }));
    await userEvent.type(screen.getByRole('textbox', { name: K['agent.reason'] }), 'not on main');
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${K['agent.deny']}`) }));
    expect(c.run).toHaveBeenCalledWith({ approve: false, reason: 'not on main' });
  });

  it('a question takes a typed answer and has no why line', async () => {
    const c = change();
    render(<GateCard bot={bot(gate('question', 'Which branch?'))} change={c} />);
    expect(screen.queryByText(S['gate.why'])).toBeNull();
    const send = screen.getByRole('button', { name: new RegExp(`^${K['agent.sendAnswer']}`) });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: K['agent.somethingElseField'] }), 'release');
    await userEvent.click(send);
    expect(c.run).toHaveBeenCalledWith({ approve: true, answer: 'release' });
  });

  it('may have gone through: Check again only reads back, and no key or button sends again', async () => {
    const c = change();
    const { rerender } = render(<GateCard bot={bot(gate('confirm'))} change={c} />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) }));
    expect(c.run).toHaveBeenCalledTimes(1);
    const lost = { ...c, outcome: 'pending' } as typeof c;
    rerender(<GateCard bot={bot(gate('confirm'))} change={lost} />);
    expect(screen.getByText(K['agent.decisionUnknown'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(`^${K['agent.deny']}`) })).toBeNull();
    expect(screen.queryByText(S['gate.why'])).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: K['agent.checkAgain'] }));
    expect(c.readBack).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('y');
    expect(c.run).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: K['agent.dismissDecision'] }));
    expect(c.dismiss).toHaveBeenCalledTimes(1);
    expect(c.run).toHaveBeenCalledTimes(1);
  });

  it('the decision this page sent folds to one line; one decided elsewhere says so', async () => {
    const c = change();
    const { rerender } = render(<GateCard bot={bot(gate('confirm'))} change={c} />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) }));
    rerender(<GateCard bot={bot(gate('confirm'))} change={{ ...c, outcome: 'done' } as typeof c} />);
    expect(screen.getByText(K['agent.d.once'])).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<GateCard bot={bot(gate('confirm'))} change={{ ...c, outcome: 'failed', code: 'gate_already_resolved', idem: 'r1', details: { request_id: 'r2' } } as typeof c} />);
    expect(screen.getByText(K['agent.d.elsewhere'])).toBeInTheDocument();
  });

  it('a definite refusal says it did not go through and the card can decide again', async () => {
    const c = change();
    const { rerender } = render(<GateCard bot={bot(gate('confirm'))} change={c} />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) }));
    rerender(<GateCard bot={bot(gate('confirm'))} change={{ ...c, outcome: 'failed', code: 'internal_error' } as typeof c} />);
    expect(screen.getByText(S['gate.failed'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) })).toBeEnabled();
  });

  it('the summary is Prose: its paragraphs are kept and a key hidden behind a control byte stays hidden', () => {
    render(<GateCard bot={bot(gate('confirm', 'First line.\n\nKey sk-\u0007abcdefghijklmnopqr here.'))} change={change()} />);
    expect(screen.getByText('First line.').tagName).toBe('P');
    expect(document.body.textContent).not.toContain('abcdefghijklmnopqr');
    expect(document.body.textContent).toContain('[hidden]');
  });
});

describe('a key in the summary stays hidden on every part the card draws', () => {
  // The kit card shows a leading warning line and tagged diff rows outside Prose, after its own code clean. The page no longer
  // code-cleans the summary itself: these hold it to the kit's scrub.
  it.each([
    ['a warning line, a zero-width space inside the key', '\u26a0 Key sk-\u200babcdefghijklmnopqr here'],
    ['a warning line, a variation selector inside the key', '\u26a0 Key sk-\ufe0fabcdefghijklmnopqr here'],
    ['a warning line, a soft hyphen inside the key', '\u26a0 Key sk-abcdefgh\u00adijklmnopqr here'],
    ['tagged diff rows, a zero-width space inside the key', 'H +1\nA key = sk-\u200babcdefghijklmnopqr'],
    ['a paragraph, a word joiner inside the key', 'Key sk-abcdefgh\u2060ijklmnopqr here'],
  ])('%s', (_why, summary) => {
    const { container } = render(<GateCard bot={bot(gate('confirm', summary))} change={change()} />);
    expect(container.textContent).not.toContain('ijklmnopqr');
    expect(container.textContent).toContain('[hidden]');
  });

  it.each([
    ['a zero-width space inside the key', 'Key sk-\u200babcdefghijklmnopqr here?'],
    ['a variation selector inside the key', 'Key sk-\ufe0fabcdefghijklmnopqr here?'],
    ['a word joiner inside the key', 'Key sk-abcdefgh\u2060ijklmnopqr here?'],
  ])('a question, %s', (_why, summary) => {
    const { container } = render(<GateCard bot={bot(gate('question', summary))} change={change()} />);
    expect(container.textContent).not.toContain('ijklmnopqr');
    expect(container.textContent).toContain('[hidden]');
  });
});

describe('characters a reader cannot see in the summary', () => {
  it('never use up the bound before the text: a warning after 4000 zero-width spaces still shows', () => {
    const v = gateViewOf(gate('confirm', `${'\u200b'.repeat(4000)}\u26a0 Deletes production data`));
    expect(v.kind === 'confirm' && v.detail).toBe('\u26a0 Deletes production data');
    const { container } = render(<GateCard bot={bot(gate('confirm', `${'\u200b'.repeat(4000)}\u26a0 Deletes production data`))} change={change()} />);
    expect(container.textContent).toContain('Deletes production data');
  });
  it('a question after 4000 zero-width spaces still shows', () => {
    const { container } = render(<GateCard bot={bot(gate('question', `${'\u2060'.repeat(4000)}Which database?`))} change={change()} />);
    expect(container.textContent).toContain('Which database?');
  });
  it.each([
    ['a braille blank', '\u2800'],
    ['a Hangul filler', '\u3164'],
  ])('a warning line led by %s is still drawn as the warning, the filler gone', (_why, lead) => {
    const v = gateViewOf(gate('confirm', `${lead}\u26a0 Deletes production data`));
    expect(v.kind === 'confirm' && v.detail).toBe('\u26a0 Deletes production data');
    render(<GateCard bot={bot(gate('confirm', `${lead}\u26a0 Deletes production data`))} change={change()} />);
    expect(screen.getByText('\u26a0 Deletes production data').tagName).toBe('P');
  });
  it.each([
    ['a warning', `${'\u200b'.repeat(40001)}\u26a0 Deletes production data`, '\u26a0 Deletes production data'],
    ['a question', `${'\u2060'.repeat(40001)}Which database?`, 'Which database?'],
  ])('past the scrub\'s run limit (40000), a run of them still leaves %s whole', (_why, summary, shown) => {
    const kind = shown.startsWith('Which') ? 'question' : 'confirm';
    const v = gateViewOf(gate(kind, summary));
    expect(v.kind === 'confirm' ? v.detail : v.question).toBe(shown);
  });
  it('a key glued behind a run of them to the word before it is still hidden', () => {
    const { container } = render(<GateCard bot={bot(gate('confirm', 'note\u200b\u200b\u200bsk-abcdefghijklmnopqr here'))} change={change()} />);
    expect(container.textContent).not.toContain('ijklmnopqr');
    expect(container.textContent).toContain('[hidden]');
  });
  it('a key split by one of them is hidden before they are dropped', () => {
    const { container } = render(<GateCard bot={bot(gate('confirm', '\u26a0 Key sk-abcdefgh\u2800ijklmnopqr here'))} change={change()} />);
    expect(container.textContent).not.toContain('ijklmnopqr');
    expect(container.textContent).toContain('[hidden]');
  });
});

describe('where the page puts the keyboard (focusGate)', () => {
  const link = 'See [the plan](https://example.com/plan) first.';
  it('an approval with a link in its summary: Allow once, never the link', () => {
    const { container } = render(<GateCard bot={bot(gate('confirm', link))} change={change()} />);
    expect(screen.getByRole('link', { name: 'the plan' })).toBeInTheDocument();
    focusGate(container as HTMLElement);
    expect(screen.getByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) })).toHaveFocus();
  });

  it('a question with a link in its summary: the answer field, never the link', () => {
    const { container } = render(<GateCard bot={bot(gate('question', link))} change={change()} />);
    focusGate(container as HTMLElement);
    expect(screen.getByRole('textbox', { name: K['agent.somethingElseField'] })).toHaveFocus();
  });

  it('a decision that may have gone through: its Check again, never the link', () => {
    const c = change({ outcome: 'pending' } as Partial<Change<{ replayed: boolean }, Vars>>);
    const { container } = render(<GateCard bot={bot(gate('confirm', link))} change={c} />);
    focusGate(container as HTMLElement);
    expect(screen.getByRole('button', { name: K['agent.checkAgain'] })).toHaveFocus();
  });
});

describe('the Bots gate adapter', () => {
  it('a Bot gate never offers a session choice and names no tool or risk', () => {
    expect(gateViewOf(gate('confirm'))).toMatchObject({ kind: 'confirm', offerSession: false, risk: '' });
    expect(gateViewOf(gate('confirm')).tool).toBeUndefined();
    expect(gateViewOf(gate('question', 'Which?'))).toMatchObject({ kind: 'question', question: 'Which?', options: [] });
  });

  it('maps the change state to the card', () => {
    expect(gateShowOf('pending', 'once', false)).toEqual({ k: 'unknown' });
    expect(gateShowOf('running', 'once', false)).toEqual({ k: 'open', sending: true, failed: false });
    expect(gateShowOf('failed', 'deny', false)).toEqual({ k: 'open', sending: false, failed: true });
    expect(gateShowOf('decided', 'deny', false)).toEqual({ k: 'decided', kind: 'deny' });
    expect(gateShowOf('decided', 'answer', false)).toEqual({ k: 'decided', kind: 'answered' });
    expect(gateShowOf('elsewhere', 'once', true)).toEqual({ k: 'decided', kind: 'once' });
    expect(gateShowOf('elsewhere', 'once', false)).toEqual({ k: 'decided', kind: 'elsewhere' });
    expect(gateShowOf('idle', null, false)).toEqual({ k: 'open', sending: false, failed: false });
  });
});
