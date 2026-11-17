// Vitest: a message queued while a card waits is drawn after the card (the card stays with the turn that asked it, the message
// reads as the next one); once the agent has read it (no longer queued) it is drawn where the turn put it. Not while no card waits.
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { can, type Action, type CapFacts } from './capability';
import type { ConvBlock, ConvSnapshot, ConversationSource } from './source';
import { SessionView } from './SessionView';

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: true, gate: 'confirm', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const gate = { key: 'g1', ref: { id: 'g1', generation: 3 }, gate: { kind: 'confirm' as const, risk: 'exec', tool: 'bash', params: { command: 'npm install chart.js' } }, helper: false, addressing: false, held: null, decision: null };
const prompt: ConvBlock = { k: 'user', key: 'u1', text: 'Run the checkout tests again', at: 1 };
const steps: ConvBlock = { k: 'steps', key: 't1', label: '1 step', state: 'running', rows: [{ id: 's1', state: 'running', verb: 'Read file', summary: '/home/ada/dash/package.json' }] };
const later = (queued: boolean): ConvBlock => ({ k: 'user', key: 'u2', text: 'Use the staging database instead', at: 2, note: { text: 'Queued.' }, ...(queued ? { queued: true as const } : {}) });
const show = (blocks: ConvBlock[], gates: unknown[]) => {
  const s = { facts: { ...facts, gate: gates.length ? 'confirm' : 'none' }, title: 'T', gates, blocks } as ConvSnapshot;
  const source = { kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, s.facts) } as unknown as ConversationSource;
  return render(<SessionView source={source} size="l" />);
};
/** -1 when `a` is drawn before `b` in the document, 1 after. */
const order = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
afterEach(cleanup);

describe('a message queued while a card waits', () => {
  it('is drawn after the waiting card, as the newest turn', () => {
    const v = show([prompt, steps, later(true)], [gate]);
    const card = v.container.querySelector('[data-gate-key]') as Element;
    const msg = screen.getByText('Use the staging database instead');
    expect(order(card, msg)).toBe(-1);
    expect(msg.closest('[data-turn]')?.hasAttribute('data-latest')).toBe(true);
    // The turn that asked keeps its steps above the card.
    expect(order(v.container.querySelector('[data-k="steps"]') as Element, card)).toBe(-1);
  });
  it('once read by the agent (not queued) it is drawn where the turn put it; with no card waiting a queued one stays in place', () => {
    let v = show([prompt, steps, later(false)], [gate]);
    expect(order(screen.getByText('Use the staging database instead'), v.container.querySelector('[data-gate-key]') as Element)).toBe(-1);
    cleanup();
    v = show([prompt, steps, later(true)], []);
    const turns = v.container.querySelectorAll('[data-turn]');
    expect(turns[turns.length - 1]?.textContent).toContain('Use the staging database instead');
    expect(v.container.querySelector('[data-queued]')).toBeNull();
  });
});

describe('a message queued while a card waits, on a screen where it lands below the visible log', () => {
  it('comes into view once when it first appears (the person just sent it), and not again on later changes', () => {
    const into = vi.fn();
    const was = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = into;
    try {
      let s = { facts: { ...facts, gate: 'confirm' }, title: 'T', gates: [gate], blocks: [prompt, steps] } as unknown as ConvSnapshot;
      const subs = new Set<() => void>();
      const source = { kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => s, subscribe: (f: () => void) => { subs.add(f); return () => subs.delete(f); }, watch: () => {}, can: (a: Action) => can(a, s.facts) } as unknown as ConversationSource;
      const v = render(<SessionView source={source} size="l" />);
      const put = (blocks: ConvBlock[]) => act(() => { s = { ...s, blocks }; subs.forEach((f) => f()); });
      const before = into.mock.calls.length;
      put([prompt, steps, later(true)]);
      const row = v.container.querySelector('[data-queued]');
      expect(row).not.toBeNull();
      expect(into.mock.contexts.slice(before)).toContain(row);
      const n = into.mock.contexts.filter((c) => c === row).length;
      put([prompt, { ...steps, label: '1 step · 3 s' } as ConvBlock, later(true)]);
      expect(into.mock.contexts.filter((c) => c === v.container.querySelector('[data-queued]')).length).toBe(n);
    } finally {
      Element.prototype.scrollIntoView = was;
    }
  });
});
