// Vitest: the dock's chat before a session uses the conversation's meta scheme. Who answers and when the answer was finished
// sit in a header row over the Agent's part of the turn, as "You" and the sent time sit over the message; the reply's foot
// keeps its actions and holds no time of its own.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Column } from './Column';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';

const ANSWERED = Date.UTC(2026, 10, 13, 9, 41);
vi.mock('./conv', async (orig) => {
  const real = await orig<typeof C>();
  return { ...real, blocks: (c: C.Conv, now: number) => real.blocks(c, now).map((b) => (b.k === 'reply' ? { ...b, streaming: false, final: true, at: Date.UTC(2026, 10, 13, 9, 41) } : b)) };
});

const body = { messages: [
  { role: 'user', blocks: [{ kind: 'text', text: 'List the files' }] },
  { role: 'assistant', blocks: [{ kind: 'text', text: 'Three files.' }] },
] };
function snap(): Snapshot {
  const h = C.historyFrom(body, { liveTail: false, idOf: (i) => 'h' + i, at: 1 });
  const conv = { ...C.emptyConv('s1'), users: Object.fromEntries(h.users.map((u) => [u.id, u])), turns: h.turns };
  return { phase: 'ready', conv, status: null, dormant: false, gates: [] } as unknown as Snapshot;
}

afterEach(cleanup);

describe('the dock chat: one meta scheme', () => {
  it('the Agent has a header row with the time its answer was finished; the foot holds no time', () => {
    const { container } = render(<Column eng={{} as unknown as AskEngine} snap={snap()} agentUrl="" typing empty={null} />);
    const rows = [...container.querySelectorAll('[data-author]')];
    expect(rows.map((el) => el.getAttribute('data-author'))).toEqual(['you', 'agent']);
    expect(rows[1]?.querySelector('time')?.getAttribute('datetime')).toBe(new Date(ANSWERED).toISOString());
    expect(rows[1]?.querySelector('time')?.getAttribute('title')).toMatch(/^Answered /);
    const shown = new Date(ANSWERED).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const times = [...container.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent === shown);
    expect(times).toHaveLength(1);
    expect(times[0]?.closest('[data-author]')).not.toBeNull();
  });
});
