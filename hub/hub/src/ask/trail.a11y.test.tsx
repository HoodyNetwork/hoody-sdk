// Label in name (WCAG 2.5.3): the AI column draws the kit step trail (kit/agent/StepTrail), whose button is named by what it
// shows (how many steps, then its mark's outcome word), never a Show/Hide steps name that replaces the visible label; open or
// closed is aria-expanded. Every step mark says its outcome as text.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { fireEvent, isInaccessible, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Column } from './Column';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';
import type { Action } from './logic';
import strings from './strings.en.json';

let SEQ = 0;
const env = (type: string, data: any) => ({ seq: ++SEQ, incarnation: 'i1', turn_id: 'T1', event: { type, data } });
const frame = (e: any, now?: number): Action => ({ type: 'frame', name: e.event.type.slice(6), data: e, now });
function started(): C.Conv {
  let c = C.addUser(C.emptyConv('s1'), { id: '1', text: 'Fix the build', at: 0, key: 'k1', via: 'create', state: 'sending', turnId: null, commandId: null, reason: '' });
  c = C.addTurn(c, { turnId: 'T1', user: '1', now: 1000 });
  return C.patchUser(c, '1', { state: 'sent', turnId: 'T1' });
}
const call = (c: C.Conv, id: string, at: number) => C.onTurn(c, frame(env('event.tool_call', { tool_id: id, name: 'bash', summary: '$ make ' + id }), at));
const result = (c: C.Conv, id: string, r: Record<string, unknown>, at: number) => C.onTurn(c, frame(env('event.tool_result', { tool_id: id, ...r }), at));
const eng = () => ({ send: vi.fn(), newConversation: vi.fn(), decide: vi.fn(), answer: vi.fn(), checkDecision: vi.fn() }) as unknown as AskEngine;
const draw = (conv: C.Conv) =>
  render(<Column eng={eng()} snap={{ phase: 'ready', conv, status: null, dormant: false, gates: [] } as unknown as Snapshot} agentUrl="" typing empty={null} />);
const WORDS = [strings['ask.mark.running'], strings['ask.mark.ok'], strings['ask.mark.failed'], strings['ask.mark.unknown']];
// The one disclosure button whose text ends with an outcome word: the step trail's.
const trailButton = () => {
  const found = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded') && WORDS.some((w) => (b.textContent ?? '').endsWith(w)));
  expect(found).toHaveLength(1);
  return found[0]!;
};

describe('the AI column step trail names what it shows', () => {
  it('a running trail is named by its visible label and its outcome word; opening flips aria-expanded only', () => {
    draw(call(started(), 'a', 2000));
    const btn = trailButton();
    expect(btn.hasAttribute('aria-label')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    // The whole computed name: the visible label (how many steps · how long so far), then the outcome word. The running step is
    // beside it by its kind alone, outside the name.
    const full = new RegExp(`^1 step · \\S.* ${strings['ask.mark.running']}$`);
    expect(btn.parentElement!.querySelector('[data-trail-peek]')!.textContent).toBe(strings['ask.tool.run']);
    expect(screen.getByRole('button', { expanded: false, name: full })).toBe(btn);
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { expanded: true, name: full })).toBe(btn);
    expect(screen.queryByRole('button', { name: /show steps|hide steps/i })).toBeNull();
  });

  it('each step row\'s mark says its outcome in words: done, failed, outcome unknown', () => {
    let c = started();
    c = result(call(c, 'a', 2000), 'a', {}, 2100);
    c = result(call(c, 'b', 2200), 'b', { is_error: true, output: 'exit 1' }, 2300);
    c = result(call(c, 'c', 2400), 'c', { is_error: true, error_code: 'outcome_unknown', output: 'Error: unknown' }, 2500);
    c = C.onTurn(c, { type: 'receipt', body: { turn_id: 'T1', state: 'completed' } }, 5000);
    draw(c);
    const btn = trailButton();
    // A trail with a failed step reads as failed (the trail's own mark), after its visible label.
    expect(btn.textContent?.endsWith(strings['ask.mark.failed'])).toBe(true);
    fireEvent.click(btn);
    // Each row's first word is its outcome, and assistive technology reads it (not aria-hidden, hidden, display:none or visibility:hidden, itself or any ancestor).
    const rows = [...btn.parentElement!.parentElement!.querySelectorAll('li')];
    const said = rows.map((li) => [...li.querySelectorAll('span')].find((el) => WORDS.includes(el.textContent ?? '') && !isInaccessible(el))?.textContent);
    expect(said).toEqual([strings['ask.mark.ok'], strings['ask.mark.failed'], strings['ask.mark.unknown']]);
    expect(rows.map((li) => WORDS.find((w) => (li.textContent ?? '').startsWith(w)))).toEqual(said);
  });
});
