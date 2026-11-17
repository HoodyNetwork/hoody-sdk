// One meta scheme for every message: who wrote it and when sit in the same place, the header row over the message, for
// the person and for the Agent alike. A finished reply's time is in the Agent's header row of its turn (never alone in a
// row under the answer); the reply's foot keeps its actions (Copy, the turn menu) and its cost. Turns are set apart by a
// solid hairline, and the log is the containing block of everything in it (a visually hidden mark inside a long step
// list is laid out in the log, not in the page behind it).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { can, type Action, type CapFacts } from './capability';
import type { ConvSnapshot, ConversationSource } from './source';
import { SessionView } from './SessionView';

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const ASKED = Date.UTC(2026, 10, 13, 9, 38);
const ANSWERED = Date.UTC(2026, 10, 13, 9, 41);
const snap = (o: Partial<ConvSnapshot> = {}): ConvSnapshot => ({
  facts, title: 'Files', gates: [], meta: { computer: 'atlas' }, blocks: [
    { k: 'user', key: 'u1', text: 'List the files', at: ASKED },
    { k: 'steps', key: 't1', label: '1 step', state: 'ok', rows: [{ id: 's1', state: 'ok', verb: 'Read' }] },
    { k: 'reply', key: 'r1', text: 'Three files.', streaming: false, final: true, cost: 0.02, at: ANSWERED },
    { k: 'user', key: 'u2', text: 'And the folders?', at: ANSWERED + 60_000 },
    { k: 'reply', key: 'r2', text: 'Looking', streaming: true, final: false, cost: null, at: null },
  ], ...o,
} as ConvSnapshot);
const source = (s: ConvSnapshot): ConversationSource => ({ kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, s.facts) });
const css = readFileSync(join(__dirname, 'SessionView.module.css'), 'utf8');
const rule = (sel: string) => {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('one meta scheme for every message', () => {
  it('who and when share the header row: the person\'s and the Agent\'s alike', () => {
    const { container } = render(<SessionView source={source(snap())} size="l" />);
    const rows = [...container.querySelectorAll('[data-author]')];
    expect(rows.map((el) => el.getAttribute('data-author'))).toEqual(['you', 'agent', 'you', 'agent']);
    // The person's row: when the message was sent. The Agent's row: when its answer was finished.
    expect(rows[0]?.querySelector('time')?.getAttribute('datetime')).toBe(new Date(ASKED).toISOString());
    expect(rows[1]?.querySelector('time')?.getAttribute('datetime')).toBe(new Date(ANSWERED).toISOString());
    // In each row the name comes first and the time right after it.
    for (const row of rows.slice(0, 3)) expect(row.lastElementChild?.tagName).toBe('TIME');
    // A turn still running has no time yet: its header row says who, nothing else.
    expect(rows[3]?.querySelector('time')).toBeNull();
  });
  it('no time alone under the answer: the foot keeps Copy and the cost', () => {
    const { container } = render(<SessionView source={source(snap())} size="l" />);
    const reply = container.querySelector('[data-k="reply"]') as HTMLElement;
    expect(reply.querySelector('time')).toBeNull();
    const shown = new Date(ANSWERED).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    expect(reply.textContent).not.toContain(shown);
    expect(reply.querySelector('button')).not.toBeNull();
    expect(reply.textContent).toContain('$0.02');
    // Every time in the log is in a header row.
    for (const t of container.querySelectorAll('time')) expect(t.closest('[data-author]')).not.toBeNull();
  });
  it('the time says which it is: sent for the person, answered for the Agent', () => {
    const { container } = render(<SessionView source={source(snap())} size="l" />);
    const rows = [...container.querySelectorAll('[data-author]')];
    expect(rows[0]?.querySelector('time')?.getAttribute('title')).toMatch(/^Sent /);
    expect(rows[1]?.querySelector('time')?.getAttribute('title')).toMatch(/^Answered /);
  });
  it('a turn with several finished replies keeps every time: the last in the header row, an earlier one in its own foot', () => {
    const EARLIER = ANSWERED - 120_000;
    const { container } = render(<SessionView source={source(snap({ blocks: [
      { k: 'user', key: 'u1', text: 'List the files', at: ASKED },
      { k: 'reply', key: 'r1', text: 'Looking first.', streaming: false, final: true, cost: null, at: EARLIER },
      { k: 'steps', key: 't1', label: '1 step', state: 'ok', rows: [{ id: 's1', state: 'ok', verb: 'Read' }] },
      { k: 'reply', key: 'r2', text: 'Three files.', streaming: false, final: true, cost: null, at: ANSWERED },
    ] } as Partial<ConvSnapshot>))} size="l" />);
    const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    expect(container.querySelector('[data-author="agent"] time')?.getAttribute('datetime')).toBe(new Date(ANSWERED).toISOString());
    const [first, last] = [...container.querySelectorAll('[data-k="reply"]')] as HTMLElement[];
    expect(first?.textContent).toContain(clock(EARLIER));
    expect(last?.textContent).not.toContain(clock(ANSWERED));
  });
});

describe('the column', () => {
  it('with a mouse the rule after a turn that ends with its foot has the same room on both sides', () => {
    const at = css.indexOf('@media (hover: hover)');
    const block = css.slice(at, css.indexOf('\n}\n', at));
    expect(block).toMatch(/\.turn\[data-foot\] \+ \.turn \{/);
    // Under the answer: the foot row (--icon-hit and its --sp-1 gap), then the row gap. Over the next message: the same.
    expect(block).toMatch(/margin-block-start:\s*var\(--conv-gap-row\)/);
    expect(block).toMatch(/padding-block-start:\s*calc\(var\(--icon-hit\) \+ var\(--sp-1\) \+ var\(--conv-gap-row\)\)/);
  });
  it('turns are set apart by a solid hairline with the same room on both sides', () => {
    const turn = rule('.turn + .turn');
    expect(turn).toMatch(/border-block-start:\s*var\(--bw\) solid var\(--hx-line\)/);
    expect(turn).toMatch(/margin-block-start:\s*var\(--conv-gap-turn\)/);
    expect(turn).toMatch(/padding-block-start:\s*var\(--conv-gap-turn\)/);
    expect(css).not.toMatch(/dashed|dotted/);
  });
  it('the log scrolls at the pane\'s edge and holds its own content; the thread inside it is the capped, centred column', () => {
    const col = rule('.column');
    // The containing block of everything in the log: a visually hidden mark (position: absolute) scrolls with its row
    // and never makes the page behind the frame taller.
    expect(col).toMatch(/position:\s*relative/);
    // The same room is kept for the scrollbar on both sides, so the thread stays centred like the rows pinned under it.
    expect(col).toMatch(/scrollbar-gutter:\s*stable both-edges/);
    expect(col).not.toMatch(/max-width/);
    const thread = rule('.thread');
    expect(thread).toMatch(/max-width:\s*var\(--conv-col\)/);
    // Centred on the pane's own width (100cqi of the root, a size container), as the pinned rows are.
    expect(thread).toMatch(/margin-inline:\s*max\(\s*calc\(\(100% - min\(var\(--conv-col\), 100cqi - 2 \* var\(--conv-inset\)\)\) \/ 2\)/);
    expect(rule('.root')).toMatch(/container:\s*conv \/ inline-size/);
  });
  it('the thread wraps every turn and gate inside the log', () => {
    const { container } = render(<SessionView source={source(snap())} size="l" />);
    const log = container.querySelector('[role="log"]') as HTMLElement;
    expect(log.children).toHaveLength(1);
    expect(log.firstElementChild?.hasAttribute('data-thread')).toBe(true);
    expect(log.firstElementChild?.querySelectorAll(':scope > [data-turn]')).toHaveLength(2);
  });
});
