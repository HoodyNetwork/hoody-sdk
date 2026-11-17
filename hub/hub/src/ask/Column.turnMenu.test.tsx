// Vitest: the Ask panel's column draws the same turn-menu slot as the kit's SessionView: the host's function is called only
// for a FINAL, non-streaming reply that carries a completed-turn index (0 is real), and what it returns is drawn right after Copy.
// The producer of `turn` is ask/conv.ts (historyFrom stamps a turn whose boundary lies inside it; see conv.turn.test.ts); here a stand-in
// producer stamps the reply blocks (turn = the block's turn index) so the slot is tested apart from it, through the very blocks() the
// column reads. A history without turn_boundaries (`bare`) is what a reply with no turn looks like.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column } from './Column';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';

const stamp = vi.hoisted(() => ({ on: false, mode: 'turn' as 'turn' | 'streaming' | 'notfinal' | 'both' }));
vi.mock('./conv', async (orig) => {
  const real = await orig<typeof C>();
  return {
    ...real,
    blocks: (c: C.Conv, now: number) => real.blocks(c, now).map((b) => {
      if (!stamp.on || b.k !== 'reply') return b;
      const turn = Number(b.key.slice(1).split(':')[0]);
      if (stamp.mode === 'streaming') return { ...b, turn, streaming: true, final: false };
      if (stamp.mode === 'both') return { ...b, turn, streaming: true, final: true };
      if (stamp.mode === 'notfinal') return { ...b, turn, final: false };
      return { ...b, turn };
    }),
  };
});

beforeEach(() => { stamp.on = false; stamp.mode = 'turn'; });
afterEach(cleanup);
const body = { messages: [
  { role: 'user', blocks: [{ kind: 'text', text: 'Hello' }] },
  { role: 'assistant', blocks: [{ kind: 'text', text: 'First answer' }] },
  { role: 'user', blocks: [{ kind: 'text', text: 'And then?' }] },
  { role: 'assistant', blocks: [{ kind: 'text', text: 'Second answer' }] },
], turn_boundaries: [1, 3] };
function snapOf(bare = false): Snapshot {
  const h = C.historyFrom(bare ? { messages: body.messages } : body, { liveTail: false, idOf: (i) => 'h' + i, at: 1 });
  const conv = { ...C.emptyConv('s1'), users: Object.fromEntries(h.users.map((u) => [u.id, u])), turns: h.turns };
  return { phase: 'ready', conv, status: null, dormant: false, gates: [] } as unknown as Snapshot;
}
const eng = {} as unknown as AskEngine;
const show = (turnMenu?: (t: { key: string; turn: number }) => React.ReactNode, bare = false) =>
  render(<Column eng={eng} snap={snapOf(bare)} agentUrl="" typing empty={null} turnMenu={turnMenu} />);
/** A button's name: Copy is an icon button (its label is its name), the stand-in menu is named by its text. */
const nameOf = (b: Element) => b.getAttribute('aria-label') ?? b.textContent ?? '';
const trigger = (t: { key: string; turn: number }) => <button type="button" data-testid={`menu-${t.key}`} data-turn={t.turn}>menu</button>;

describe('Column turn-menu slot', () => {
  it('the fixture draws two final replies with a Copy footer each', () => {
    show();
    expect(screen.getByText('First answer')).toBeTruthy();
    expect(screen.getAllByRole('button').filter((b) => /Copy/.test(nameOf(b)))).toHaveLength(2);
  });
  it('no turnMenu: nothing is drawn beside Copy, whatever the blocks carry', () => {
    stamp.on = true;
    show();
    expect(screen.getAllByRole('button').filter((b) => !/Copy/.test(nameOf(b)))).toHaveLength(0);
  });
  it('a reply block with no turn (a history that names no turn boundary) gets no menu and the host is not called', () => {
    const f = vi.fn(trigger);
    show(f, true);
    expect(f).not.toHaveBeenCalled();
  });
  it('a final reply with its turn gets the host\'s menu (turn 0 included), right after Copy in its own footer', () => {
    stamp.on = true;
    const f = vi.fn(trigger);
    show(f);
    expect(f).toHaveBeenCalledTimes(2);
    const calls = f.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.turn)).toEqual([0, 1]);
    const first = screen.getAllByTestId(/^menu-/).at(0) as HTMLElement;
    expect(first.getAttribute('data-turn')).toBe('0');
    const foot = first.parentElement as HTMLElement;
    expect(within(foot).getAllByRole('button').at(1)).toBe(first);
    expect(nameOf(within(foot).getAllByRole('button').at(0) as HTMLElement)).toMatch(/Copy/);
  });
  it('a streaming reply gets none, and neither does a reply that is not final or one flagged both', () => {
    stamp.on = true;
    for (const mode of ['streaming', 'notfinal', 'both'] as const) {
      stamp.mode = mode;
      const f = vi.fn(trigger);
      const { unmount } = show(f);
      expect(f).not.toHaveBeenCalled();
      unmount();
    }
  });
});
