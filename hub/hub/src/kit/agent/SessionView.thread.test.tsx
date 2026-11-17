// The thread says who wrote what: "You" over each sent message, the Agent (as the host names it) once per turn over its
// answer. An "Ask the Agent" message shows its one-line request with the sent text folded under "Context sent"; opened,
// that is the sent text, character for character. The Agent's answer is Markdown through the kit renderer.
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { agentStartText } from '../ask';
import { can, type Action, type CapFacts } from './capability';
import type { ConvSnapshot, ConversationSource } from './source';
import { SessionView } from './SessionView';
import strings from './SentMessage.strings.en.json';

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const TITLE = 'Check who can open these computers';
const SENT = agentStartText('Answer as a short Markdown list.', 'Computer "atlas": Anyone with the address', { title: TITLE, contextLabel: 'access rules of 3 computers' }) as string;
const ANSWER = '- **atlas**: only the people in its rules.\n- **borealis**: anyone with the address.\n\n**Risks**\n\n- [docs](https://example.com/a) and [bad](javascript:alert(1))';
const snap = (o: Partial<ConvSnapshot> = {}): ConvSnapshot => ({
  facts, title: 'Access', gates: [], meta: { computer: 'atlas' }, blocks: [
    { k: 'user', key: 'u1', text: SENT, at: Date.UTC(2026, 10, 13, 9, 38) },
    { k: 'steps', key: 't1', label: '1 step', state: 'ok', rows: [{ id: 's1', state: 'ok', verb: 'Read' }] },
    { k: 'reply', key: 'r1', text: ANSWER, streaming: false, final: true, cost: null, at: null },
    { k: 'user', key: 'u2', text: 'And cedar?', at: Date.UTC(2026, 10, 13, 9, 40) },
    { k: 'reply', key: 'r2', text: 'Stopped.', streaming: false, final: true, cost: null, at: null },
  ], ...o,
} as ConvSnapshot);
const source = (s: ConvSnapshot): ConversationSource => ({ kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, s.facts) });

describe('the thread says who wrote what', () => {
  it('"You" over each sent message, the Agent once per turn over its first block, in order', () => {
    const { container } = render(<SessionView source={source(snap())} size="l" />);
    const who = [...container.querySelectorAll('[data-author]')].map((el) => el.getAttribute('data-author'));
    expect(who).toEqual(['you', 'agent', 'you', 'agent']);
    expect(screen.getAllByText(strings['sent.you'])).toHaveLength(2);
    const name = strings['sent.agentOn'].replace('{{agent}}', strings['sent.agent']).replace('{{computer}}', 'atlas');
    expect(screen.getAllByText(name)).toHaveLength(2);
    // The Agent's label sits over its steps (its first block of the turn), not over each block.
    const first = container.querySelector('[data-k="author"]');
    expect(first?.nextElementSibling?.getAttribute('data-k')).toBe('steps');
    expect(container.querySelectorAll('time')).toHaveLength(2);
  });
  it('a conversation the host does not name: plain "Agent"', () => {
    render(<SessionView source={source(snap({ meta: undefined }))} size="l" />);
    expect(screen.getAllByText(strings['sent.agent'])).toHaveLength(2);
  });
  it('an ask-action message: the request line and a closed context row; opened, exactly the sent text', async () => {
    const { container } = render(<SessionView source={source(snap())} size="l" />);
    // The request line is the message; the closed fold keeps its text out of sight (hidden, still in the document).
    expect(container.querySelector('[data-k="user"] [data-disclosure-panel]')).not.toBeVisible();
    expect(screen.getAllByText(TITLE)[0]).toBeVisible();
    const row = screen.getByRole('button', { name: 'Context sent: access rules of 3 computers' });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('figure', { name: strings['sent.exact'] })).toBeNull();
    await act(async () => { row.click(); });
    expect(screen.getByRole('figure', { name: strings['sent.exact'] }).querySelector('pre')?.textContent).toBe(SENT);
    // A typed message has no fold.
    expect(screen.getByText('And cedar?')).toBeVisible();
    expect(container.querySelectorAll('[data-k="user"] [aria-expanded]')).toHaveLength(1);
  });
  it('the answer is Markdown: lists and bold, links only to the web', () => {
    const { container } = render(<SessionView source={source(snap())} size="l" />);
    const reply = container.querySelector('[data-k="reply"]') as HTMLElement;
    expect(reply.querySelectorAll('ul')).toHaveLength(2);
    expect(reply.querySelectorAll('li')).toHaveLength(3);
    expect([...reply.querySelectorAll('strong')].map((el) => el.textContent)).toEqual(['atlas', 'borealis', 'Risks']);
    expect(reply.textContent).not.toContain('**');
    const hrefs = [...reply.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.some((h) => h.startsWith('javascript:'))).toBe(false);
  });
});
