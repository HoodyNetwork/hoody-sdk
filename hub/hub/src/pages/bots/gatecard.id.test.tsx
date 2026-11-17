// Vitest: two "Waiting for you" cards on one page (two Bot tiles with open gates on a Board) are each
// named by their own card. A fixed heading id once let the second card take the first card's title as its name; the kit
// card is named by its own label.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BotView, Change, Gate } from './data';
import { GateCard } from './parts/GateCard';
import K from '@kit/agent/Conversation.strings.en.json';

const gate = (id: string, type: Gate['type']): Gate => ({ id, generation: 1, type, summary: `Run step ${id}`, tool: null, advanced: null });
const bot = (g: Gate) => ({ gate: g }) as unknown as BotView;
const change = {
  run: async () => ({ outcome: 'done' }),
  outcome: 'idle',
  data: undefined,
  code: undefined,
  details: undefined,
  idem: undefined,
  running: false,
  readBack: async () => true,
  dismiss: () => undefined,
  reset: () => undefined,
} as unknown as Change<{ replayed: boolean }, { approve: boolean; reason?: string; answer?: string }>;

describe('GateCard names', () => {
  it('two cards on one page: each card is named by its own kind and holds its own text', () => {
    render(
      <>
        <GateCard bot={bot(gate('a', 'confirm'))} change={change} />
        <GateCard bot={bot(gate('b', 'question'))} change={change} />
      </>,
    );
    const approve = screen.getByRole('region', { name: K['agent.needsApproval'] });
    const question = screen.getByRole('region', { name: K['agent.needsAnswer'] });
    expect(approve).toHaveTextContent('Run step a');
    expect(approve).not.toHaveTextContent('Run step b');
    expect(question).toHaveTextContent('Run step b');
    expect(question).not.toHaveTextContent('Run step a');
    // Named by its own label, never by an id another card could share.
    for (const r of [approve, question]) expect(r.hasAttribute('aria-labelledby')).toBe(false);
  });
});
