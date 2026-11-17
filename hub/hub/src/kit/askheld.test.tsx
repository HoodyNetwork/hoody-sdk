// Vitest: while a start the panel has not taken yet is held, open() with plain words
// never drops them without a word: it answers false and a toast says so, whose one way tries again (and then fills the composer
// once the start is taken). A second start hears 'notSent' as before; with nothing held, open() takes the words and says true.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capture, chooseComputer } from '@core';
import { bump } from '@core/ctx';
import { boot } from '@core/test/env';
import { setAskForFixtures, useAskDock, type AskDock } from './ask';
import strings from './strings.en.json';

const toasts = vi.hoisted(() => [] as Array<{ title: string; body?: string; tone?: string; action?: { label: string; onAction: () => unknown } }>);
const closed = vi.hoisted(() => [] as string[]);
vi.mock('./states/Toast', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  showToast: (c: (typeof toasts)[number]) => { toasts.push(c); return `toast-${toasts.length}`; },
  closeToast: (id: string) => { closed.push(id); },
}));
const A = { id: 'ctr-aaaa', project_id: 'p1' };
const B = { id: 'ctr-bbbb', project_id: 'p1' };

// Read outside act(): a hook rendered inside act() has not rendered yet (its result is still null).
const dock = () => renderHook(() => useAskDock()).result.current;
/** A dock call inside act(), the hook read before it. */
function run<T>(f: (d: AskDock) => T): T {
  const d = dock();
  let r!: T;
  act(() => { r = f(d); });
  return r;
}

beforeEach(() => { boot({ realm: 'aaaaaaaaaaaaaaaaaaaaaaa1' }); setAskForFixtures(true); toasts.length = 0; closed.length = 0; });
afterEach(() => {
  const d = dock();
  act(() => { d.close(); d.takeDraft(); });
  setAskForFixtures(false);
});

describe('the dock and words a held start keeps out', () => {
  it('with nothing held, open() takes the words and says so; nothing is toasted', () => {
    let took = false;
    took = run((d) => d.open({ text: 'Why is the disk full?', source: 'Logs' }));
    expect(took).toBe(true);
    expect(dock().draft).toMatchObject({ text: 'Why is the disk full?', source: 'Logs' });
    expect(toasts).toEqual([]);
  });

  it('plain words while a start is held: false, the start stays, a toast names the page and its one way tries again', () => {
    const onStart = vi.fn();
    run((d) => d.open({ text: 'Back up the database every night', start: true, onStart }));
    const held = dock().draft;
    let took = true;
    took = run((d) => d.open({ text: 'Schedule a cleanup', source: 'Schedules' }));
    expect(took).toBe(false);
    expect(dock().draft, 'the held start still wins').toBe(held);
    expect(onStart).not.toHaveBeenCalled();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ title: strings['ask.heldTitle'].replace('{{source}}', 'Schedules'), body: strings['ask.heldBody'], tone: 'error', action: { label: strings['ask.heldRetry'] } });
    // Pressed while the start is still held: still kept out, told again.
    act(() => { void toasts[0]?.action?.onAction(); });
    expect(dock().draft).toBe(held);
    expect(toasts).toHaveLength(2);
    // The panel takes the start; then the way puts the words in the composer, not sent.
    run((d) => d.takeDraft());
    act(() => { void toasts[1]?.action?.onAction(); });
    expect(dock().draft).toMatchObject({ text: 'Schedule a cleanup', source: 'Schedules' });
    expect(dock().draft?.start).toBeFalsy();
    expect(toasts).toHaveLength(2);
  });

  it('a page with no label is named as this page; a second start hears notSent and is not toasted', () => {
    run((d) => d.open({ text: 'Back up the database every night', start: true }));
    run((d) => d.open('Schedule a cleanup'));
    expect(toasts[0]?.title).toBe(strings['ask.heldTitle'].replace('{{source}}', strings['ask.heldHere']));
    const second = vi.fn();
    let took = true;
    took = run((d) => d.open({ text: 'Another start', start: true, onStart: second }));
    expect(took).toBe(false);
    expect(second).toHaveBeenCalledWith('notSent');
    expect(toasts).toHaveLength(1);
  });

  it('a switch of account or realm closes the toast, and its words never cross into the next context', () => {
    run((d) => d.open({ text: 'Back up the database every night', start: true }));
    run((d) => d.open({ text: 'Schedule a cleanup', source: 'Schedules' }));
    run((d) => d.takeDraft());
    act(() => { bump('switch'); });
    expect(closed).toEqual(['toast-1']);
    act(() => { void toasts[0]?.action?.onAction(); });
    expect(dock().draft, 'nothing from the old context').toBeUndefined();
  });

  it('words bound to the computer shown then show it again first when another is shown by the retry', () => {
    act(() => { chooseComputer(A); });
    run((d) => d.open({ text: 'Back up the database every night', start: true, computer: A.id }));
    run((d) => d.open({ text: 'Schedule a cleanup', source: 'Schedules', computer: A.id }));
    act(() => { chooseComputer(B); });
    run((d) => d.takeDraft(A.id));
    act(() => { void toasts[0]?.action?.onAction(); });
    expect(capture().target?.container.id).toBe(A.id);
    expect(dock().draft).toMatchObject({ text: 'Schedule a cleanup', computer: A.id });
  });

  it('a second start with no words still hears notSent', () => {
    run((d) => d.open({ text: 'Back up the database every night', start: true }));
    const second = vi.fn();
    let took = true;
    took = run((d) => d.open({ text: ' ', start: true, onStart: second }));
    expect(took).toBe(false);
    expect(second).toHaveBeenCalledWith('notSent');
    expect(toasts).toEqual([]);
  });

  it('one held-words toast at a time, by id, and one listener: an earlier toast left open is not closed twice by a bump', () => {
    run((d) => d.open({ text: 'Back up the database every night', start: true }));
    run((d) => d.open({ text: 'one', source: 'Schedules' }));
    run((d) => d.open({ text: 'two', source: 'Schedules' }));
    expect(toasts.map((x) => (x as { id?: string }).id)).toEqual(['ask-held', 'ask-held']);
    act(() => { bump('switch'); });
    expect(closed, 'only the latest toast\'s listener is left').toEqual(['toast-2']);
  });
});
