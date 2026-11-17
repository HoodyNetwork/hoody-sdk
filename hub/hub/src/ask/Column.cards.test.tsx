// Column.cards.test.tsx: the dock column draws no gate card. A decision reaches the
// engine only through the active source (SessionView -> source.decide -> capability.ts prerequisites -> active.ts
// decideLike), so the column, which has no attachment hold or approver lease, never offers one, even for the render a
// session's gate is in its snapshot before the dock's source exists (DockSession's fallback). The held-card cases live in
// kit/agent/GateCard.test.tsx.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import kitStrings from '@kit/agent/Conversation.strings.en.json';
import { Column } from './Column';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';
import { gateOf } from './logic';

const confirm = gateOf({ id: 'gate-7', generation: 1 }, 'confirm', { tool_name: 'bash', params: { command: 'make' } });
const question = gateOf({ id: 'gate-8', generation: 2 }, 'question', { question: 'Which branch?' });
const card = (gate: typeof confirm) => ({ key: gate.id, gate, helper: false, addressing: false, decision: null, held: null, decidable: true });

describe('Column: no gate card, so no decision without the source\'s prerequisites', () => {
  it('a parked approval and a question in the snapshot draw no card, decide nothing and announce nothing', () => {
    const eng = { decide: vi.fn(), answer: vi.fn(), checkDecision: vi.fn() } as unknown as AskEngine;
    const snap = {
      phase: 'ready', conv: C.emptyConv(), status: null, dormant: false,
      gates: [card(confirm), card(question)],
    } as unknown as Snapshot;
    const { container } = render(<Column eng={eng} snap={snap} agentUrl="" typing empty={null} />);
    expect(container.querySelector('[data-ask-gate]')).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(kitStrings['agent.allowOnce']) })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(`^${kitStrings['agent.deny']}`) })).toBeNull();
    for (const b of screen.queryAllByRole('button')) fireEvent.click(b);
    expect(eng.decide).not.toHaveBeenCalled();
    expect(eng.answer).not.toHaveBeenCalled();
    expect(container.textContent ?? '').not.toContain('Which branch?');
    // No "needs your approval" announcement for a card that is not drawn here.
    for (const r of container.querySelectorAll('[aria-live="assertive"]')) expect(r.textContent).toBe('');
  });
});
