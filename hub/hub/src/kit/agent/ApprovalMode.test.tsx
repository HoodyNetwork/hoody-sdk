// Vitest: the chat's approval-mode chip (ApprovalMode.tsx). It names the mode the approvals READ shows (never a wish), offers
// exactly the three states the agent has, sends nothing for Allow everything before its confirm, never chains two changes,
// lets narrowing go in one press, and says why a choice is not available. The widest mode is switched only by the host's own
// write; without one it is not offered.
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AllowEverythingConfirm, ApprovalMode, allowEverythingOffered, approvalModeOf, useApprovalModeNote, type ApprovalModeProps } from './ApprovalMode';
import type { ApprovalData } from './useApproval';
import strings from './ApprovalMode.strings.en.json';

type Ap = NonNullable<ApprovalData['approval']>;
const ap = (o: Partial<Ap> = {}): Ap => ({ mode: 'default', strict: false, revision: 3, yolo: false, ...o });
const data = (o: Partial<ApprovalData> = {}): ApprovalData => ({
  phase: 'done', approval: ap(), error: null, change: null, running: false, key: 'K1', ops: 0, reads: 0,
  active: () => false, retry: vi.fn(), save: vi.fn(), check: vi.fn(async () => true), ...o,
});
const STRICT = ap({ mode: 'always', strict: true });
const ON = ap({ yolo: true });

/** The chip with the host's confirm beside it, as the page mounts them. */
function Host(p: Partial<ApprovalModeProps> & { data: ApprovalData; setYolo: ApprovalModeProps['setYolo']; onSent?: ApprovalModeProps['onSent'] }) {
  const [askFor, setAskFor] = useState<string | null>(null);
  const onSent = p.onSent ?? (() => undefined);
  return (
    <>
      <ApprovalMode busy={false} {...p} setAskFor={setAskFor} onSent={onSent} />
      <AllowEverythingConfirm data={p.data} setYolo={p.setYolo} computer="atlas" askFor={askFor} setAskFor={setAskFor} onSent={onSent} {...(p.waiting ? { waiting: true } : {})} {...(p.yoloWhy ? { yoloWhy: p.yoloWhy } : {})} />
    </>
  );
}
const chip = () => screen.getByRole('button', { name: /^Approvals: / });
const openMenu = () => { fireEvent.click(chip()); return screen.getByRole('menu'); };
const item = (name: string) => within(screen.getByRole('menu')).getByRole('menuitemradio', { name: new RegExp(`^${name}`) });
/** What describes an item: its own line under the label, or a note the menu says once for several items. */
const said = (el: Element) => (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? '').join(' ');

afterEach(() => { vi.restoreAllMocks(); });

describe('the state is what the approvals read shows', () => {
  it('one state per read; an unread or unparsed answer is never a mode', () => {
    expect(approvalModeOf({ approval: ap(), phase: 'done' })).toBe('default');
    expect(approvalModeOf({ approval: ON, phase: 'done' })).toBe('everything');
    expect(approvalModeOf({ approval: STRICT, phase: 'done' })).toBe('always');
    // Strict wins over a yolo flag the agent should never send with it.
    expect(approvalModeOf({ approval: ap({ mode: 'always', strict: true, yolo: true }), phase: 'done' })).toBe('always');
    expect(approvalModeOf({ approval: ap({ mode: 'locked', strict: false, yolo: true }), phase: 'done' })).toBe('locked');
    expect(approvalModeOf({ approval: ap({ yolo: null }), phase: 'done' })).toBe('unknown');
    expect(approvalModeOf({ approval: null, phase: 'failed' })).toBe('unknown');
    expect(approvalModeOf({ approval: null, phase: 'loading' })).toBe('reading');
  });
  it('the chip says it in plain words, and no string says "yolo"', () => {
    const { rerender } = render(<Host data={data()} setYolo={() => true} />);
    expect(chip().textContent).toBe('Ask when needed');
    rerender(<Host data={data({ approval: STRICT })} setYolo={() => true} />);
    expect(chip().textContent).toBe('Ask every time');
    rerender(<Host data={data({ approval: ON })} setYolo={() => true} />);
    expect(chip().textContent).toBe('Allow everything');
    expect(chip().getAttribute('data-approval-mode')).toBe('everything');
    rerender(<Host data={data({ approval: null, phase: 'failed' })} setYolo={() => true} />);
    expect(chip().textContent).toBe('Approvals unknown');
    for (const v of Object.values(strings)) expect(v.toLowerCase()).not.toContain('yolo');
  });
});

describe('the menu offers the three states the agent has', () => {
  it('three choices, the current one checked, each with what it covers', () => {
    render(<Host data={data()} setYolo={() => true} />);
    const items = within(openMenu()).getAllByRole('menuitemradio');
    expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(items[0]!.textContent).toContain(strings['am.opt.alwaysDesc']);
    expect(items[1]!.textContent).toContain(strings['am.opt.defaultDesc']);
    expect(items[2]!.textContent).toContain(strings['am.opt.everythingDesc']);
  });
  it('Ask every time is one mode change, sent through the approvals hook', () => {
    const d = data();
    const setYolo = vi.fn(() => true);
    render(<Host data={d} setYolo={setYolo} />);
    openMenu();
    fireEvent.click(item('Ask every time'));
    expect(d.save).toHaveBeenCalledTimes(1);
    expect(d.save).toHaveBeenCalledWith({ field: 'mode', value: 'always' });
    expect(setYolo).not.toHaveBeenCalled();
  });
  it('the mode waits for the reply to end, and says so; nothing is sent', () => {
    const d = data();
    render(<Host data={d} setYolo={() => true} busy />);
    openMenu();
    expect(item('Ask every time').getAttribute('aria-disabled')).toBe('true');
    expect(item('Ask every time').textContent).toContain(strings['am.why.busy']);
    fireEvent.click(item('Ask every time'));
    expect(d.save).not.toHaveBeenCalled();
  });
});

describe('Allow everything asks first', () => {
  it('choosing it sends nothing; the confirm names the computer and what it covers; Cancel sends nothing', () => {
    const d = data();
    const setYolo = vi.fn(() => true);
    render(<Host data={d} setYolo={setYolo} />);
    openMenu();
    fireEvent.click(item('Allow everything'));
    expect(setYolo).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
    const dlg = screen.getByRole('alertdialog');
    expect(dlg.textContent).toContain('atlas');
    expect(dlg.textContent).toContain(strings['am.confirm.waiting']);
    expect(dlg.textContent).toContain(strings['am.confirm.keeps']);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    expect(setYolo).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it('the confirm sends one switch through the host, never the approvals hook', () => {
    const d = data();
    const setYolo = vi.fn(() => true);
    const onSent = vi.fn();
    render(<Host data={d} setYolo={setYolo} onSent={onSent} />);
    openMenu();
    fireEvent.click(item('Allow everything'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['am.confirmGo'] }));
    expect(setYolo).toHaveBeenCalledTimes(1);
    expect(setYolo).toHaveBeenCalledWith(true);
    expect(onSent).toHaveBeenCalledWith(true, true);
    expect(d.save).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it('it can be turned on while a reply runs (the mode cannot)', () => {
    render(<Host data={data()} setYolo={() => true} busy />);
    openMenu();
    expect(item('Allow everything').getAttribute('aria-disabled')).not.toBe('true');
  });
  it('from Ask every time it is not offered: one change at a time, never a chain', () => {
    const d = data({ approval: STRICT });
    const setYolo = vi.fn(() => true);
    render(<Host data={d} setYolo={setYolo} />);
    openMenu();
    expect(item('Allow everything').getAttribute('aria-disabled')).toBe('true');
    expect(item('Allow everything').textContent).toContain(strings['am.why.strictFirst']);
    fireEvent.click(item('Allow everything'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(setYolo).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
  });
  it('a surface with no host switch does not offer it', () => {
    render(<Host data={data()} setYolo={null} />);
    openMenu();
    expect(item('Allow everything').getAttribute('aria-disabled')).toBe('true');
    expect(item('Allow everything').textContent).toContain(strings['am.why.notHere']);
    expect(allowEverythingOffered(data(), { setYolo: null })).toBe(false);
  });
  it('not offered while locked, unread, already on, or another change is unsettled', () => {
    const y = { setYolo: () => true };
    expect(allowEverythingOffered(data(), y)).toBe(true);
    expect(allowEverythingOffered(data({ approval: ap({ mode: 'locked' }) }), y)).toBe(false);
    expect(allowEverythingOffered(data({ approval: STRICT }), y)).toBe(false);
    expect(allowEverythingOffered(data({ approval: ON }), y)).toBe(false);
    expect(allowEverythingOffered(data({ approval: null, phase: 'failed' }), y)).toBe(false);
    expect(allowEverythingOffered(data({ approval: ap({ yolo: null }) }), y)).toBe(false);
    // A read running now keeps the offer (the last read stands); it holds the confirm's button instead (below).
    expect(allowEverythingOffered(data({ running: true }), y)).toBe(true);
    expect(allowEverythingOffered(data({ change: { kind: 'pending', change: { field: 'yolo', value: true } } }), y)).toBe(false);
    expect(allowEverythingOffered(data(), { ...y, waiting: true })).toBe(false);
    expect(allowEverythingOffered(data(), { ...y, yoloWhy: 'asleep' })).toBe(false);
  });
  it('while the approvals are being read the confirm stays but cannot be confirmed', () => {
    const setYolo = vi.fn(() => true);
    render(<AllowEverythingConfirm data={data({ running: true })} setYolo={setYolo} computer="atlas" askFor="K1" setAskFor={() => undefined} onSent={() => undefined} />);
    const go = within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['am.confirmGo'] });
    fireEvent.click(go);
    expect(setYolo).not.toHaveBeenCalled();
  });
  it('a confirm opened for another conversation is closed and sends nothing', () => {
    const setYolo = vi.fn(() => true);
    const setAskFor = vi.fn();
    render(<AllowEverythingConfirm data={data({ key: 'K2' })} setYolo={setYolo} computer="atlas" askFor="K1" setAskFor={setAskFor} onSent={() => undefined} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(setAskFor).toHaveBeenCalledWith(null);
    expect(setYolo).not.toHaveBeenCalled();
  });
  it('a set policy shows read-only: every choice says why', () => {
    const d = data({ approval: ap({ mode: 'locked', strict: true }) });
    render(<Host data={d} setYolo={() => true} />);
    expect(chip().textContent).toBe('Set by this computer');
    const menu = openMenu();
    for (const i of within(menu).getAllByRole('menuitemradio')) expect(i.getAttribute('aria-disabled')).toBe('true');
    // One reason for all three: the menu says it once.
    expect(menu.textContent).toContain(strings['am.why.locked']);
  });
});

describe('narrowing is one press', () => {
  it('Allow everything → Ask when needed switches it off through the host, with no confirm, also during a reply', () => {
    const d = data({ approval: ON });
    const setYolo = vi.fn(() => true);
    const onSent = vi.fn();
    render(<Host data={d} setYolo={setYolo} onSent={onSent} busy />);
    openMenu();
    fireEvent.click(item('Ask when needed'));
    expect(setYolo).toHaveBeenCalledTimes(1);
    expect(setYolo).toHaveBeenCalledWith(false);
    expect(onSent).toHaveBeenCalledWith(false, true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(d.save).not.toHaveBeenCalled();
  });
});

describe('while everything is allowed', () => {
  it('the chip is the one control: neutral look, warning icon, and Ask when needed in its menu turns it off with no confirm', () => {
    const d = data({ approval: ON });
    const setYolo = vi.fn(() => true);
    render(<Host data={d} setYolo={setYolo} busy />);
    expect(chip().getAttribute('data-approval-mode')).toBe('everything');
    expect(chip().className).not.toMatch(/danger/);
    openMenu();
    fireEvent.click(item('Ask when needed'));
    expect(setYolo).toHaveBeenCalledTimes(1);
    expect(setYolo).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it('no separate Off button beside the chip, in any state', () => {
    render(<Host data={data({ approval: ON })} setYolo={() => true} />);
    expect(screen.queryByRole('button', { name: strings['am.off'] })).toBeNull();
    cleanup();
    render(<Host data={data()} setYolo={() => true} />);
    expect(screen.queryByRole('button', { name: strings['am.off'] })).toBeNull();
  });
});

describe('what a change came to', () => {
  // Nothing was read, so nothing is claimed about the mode (the host refuses on a locked or unknown read too).
  it('a switch the host held back is said at once as not sent, never as "still asks first"', () => {
    const d = data();
    const h = renderHook(() => useApprovalModeNote(d));
    expect(h.result.current.note).toBeNull();
    act(() => h.result.current.sent(true, false));
    expect(h.result.current.note?.text).toBe(strings['am.unsentOn']);
    expect(h.result.current.note?.text).not.toBe(strings['am.failedOn']);
    expect(h.result.current.note?.warn).toBe(true);
  });
  it('turning it off held back is said as not sent', () => {
    const d = data({ approval: ON });
    const h = renderHook(() => useApprovalModeNote(d));
    act(() => h.result.current.sent(false, false));
    expect(h.result.current.note?.text).toBe(strings['am.unsentOff']);
  });
  it('a lost answer is "may have gone through" with Check again, which only reads', () => {
    const d = data({ change: { kind: 'pending', change: { field: 'yolo', value: true } } });
    const h = renderHook(() => useApprovalModeNote(d));
    const n = h.result.current.note!;
    expect(n.text).toBe(strings['am.maybe']);
    render(<>{n.end}</>);
    fireEvent.click(screen.getByRole('button', { name: strings['am.checkAgain'] }));
    expect(d.check).toHaveBeenCalledTimes(1);
    expect(d.save).not.toHaveBeenCalled();
  });
  it('on is said only once the approvals read after the switch shows it', () => {
    const settled = vi.fn();
    const retry = vi.fn();
    let d = data({ retry, change: { kind: 'running', change: { field: 'yolo', value: true } } });
    const h = renderHook(() => useApprovalModeNote(d, settled));
    act(() => h.result.current.sent(true, true));
    expect(h.result.current.note).toBeNull();
    // The host's write ended: one read is asked for, nothing is claimed yet.
    d = data({ retry, change: null, ops: 0 });
    h.rerender();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(h.result.current.note).toBeNull();
    // That read finished and shows it on.
    d = data({ retry, approval: ON, ops: 1, reads: 1 });
    h.rerender();
    expect(h.result.current.note?.text).toBe(strings['am.done.everything']);
  });
  it('a switch the read does not show is said as not changed, never as on', () => {
    const retry = vi.fn();
    let d = data({ retry, change: { kind: 'running', change: { field: 'yolo', value: true } } });
    const h = renderHook(() => useApprovalModeNote(d));
    act(() => h.result.current.sent(true, true));
    d = data({ retry, change: null, ops: 0 });
    h.rerender();
    d = data({ retry, ops: 1, reads: 1 });
    h.rerender();
    expect(h.result.current.note?.text).toBe(strings['am.failedOn']);
  });
});

// A read that failed, or an answer that may predate the switch, leaves the old mode shown. It must
// never be taken for "still asks first": Allow everything may be on.
describe('a switch no fresh read has judged', () => {
  const switched = (want = true) => {
    const retry = vi.fn();
    let d = data({ retry, change: { kind: 'running', change: { field: 'yolo', value: want } }, approval: want ? ap() : ON });
    const h = renderHook(() => useApprovalModeNote(d));
    act(() => h.result.current.sent(want, true));
    d = data({ retry, change: null, ops: 0, approval: want ? ap() : ON });
    h.rerender();
    return { h, retry, set: (o: Partial<ApprovalData>) => { d = data({ retry, ...o }); h.rerender(); } };
  };
  it('a failed read after turning it on says it may have gone through, with Check again that only reads', () => {
    const { h, retry, set } = switched();
    set({ phase: 'failed', approval: ap(), ops: 1, reads: 0 });
    const n = h.result.current.note!;
    expect(n.text).toBe(strings['am.maybe']);
    expect(n.text).not.toBe(strings['am.failedOn']);
    render(<>{n.end}</>);
    fireEvent.click(screen.getByRole('button', { name: strings['am.checkAgain'] }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('an answer that may predate the switch (the old mode kept, no fresh read) is not "still asks first"', () => {
    const { h, set } = switched();
    set({ phase: 'done', approval: ap(), ops: 1, reads: 0 });
    expect(h.result.current.note?.text).toBe(strings['am.maybe']);
    // The next read that comes back judges: here it shows the chat still asks.
    set({ phase: 'done', approval: ap(), ops: 2, reads: 1 });
    expect(h.result.current.note?.text).toBe(strings['am.failedOn']);
  });
  it('the next read that comes back showing it on says on', () => {
    const { h, set } = switched();
    set({ phase: 'failed', approval: ap(), ops: 1, reads: 0 });
    set({ phase: 'done', approval: ON, ops: 2, reads: 1 });
    expect(h.result.current.note?.text).toBe(strings['am.done.everything']);
  });
  it('a fresh read of a locked mode says neither on nor "still asks first"', () => {
    const { h, set } = switched();
    set({ phase: 'done', approval: ap({ mode: 'locked' }), ops: 1, reads: 1 });
    expect(h.result.current.note?.text).toBe(strings['am.maybe']);
  });
  // A fresh read that says neither keeps watching; the next read that comes back judges.
  it('after a locked read, the next read that comes back judges again', () => {
    const { h, set } = switched();
    set({ phase: 'done', approval: ap({ mode: 'locked' }), ops: 1, reads: 1 });
    expect(h.result.current.note?.text).toBe(strings['am.maybe']);
    set({ phase: 'done', approval: ON, ops: 2, reads: 2 });
    expect(h.result.current.note?.text).toBe(strings['am.done.everything']);
  });
  // A change begun from Details while this switch waits for a read is not judged as this switch's outcome.
  it('a Details change while the outcome is unknown ends the wait: its read is not this switch', () => {
    const { h, set } = switched();
    set({ phase: 'failed', approval: ap(), ops: 1, reads: 0 });
    expect(h.result.current.note?.text).toBe(strings['am.maybe']);
    set({ phase: 'done', approval: ap(), ops: 1, reads: 0, change: { kind: 'running', change: { field: 'yolo', value: false } } });
    set({ phase: 'done', approval: ap(), ops: 2, reads: 1, change: null });
    expect(h.result.current.note?.text).not.toBe(strings['am.failedOn']);
    expect(h.result.current.note).toBeNull();
  });
  it('turning it off with a failed read is not "could not be turned off" either', () => {
    const { h, set } = switched(false);
    set({ phase: 'failed', approval: ON, ops: 1, reads: 0 });
    expect(h.result.current.note?.text).toBe(strings['am.maybe']);
  });
});

// A said outcome does not outlive a later change (Details switches without this hook's `sent`).
describe('a said outcome ends when the approvals move on', () => {
  const on = () => {
    let d = data({ change: { kind: 'running', change: { field: 'yolo', value: true } } });
    const h = renderHook(() => useApprovalModeNote(d));
    act(() => h.result.current.sent(true, true));
    d = data({ change: null, ops: 0 });
    h.rerender();
    d = data({ approval: ON, ops: 1, reads: 1 });
    h.rerender();
    expect(h.result.current.note?.text).toBe(strings['am.done.everything']);
    return { h, set: (o: Partial<ApprovalData>) => { d = data(o); h.rerender(); } };
  };
  it('a change begun elsewhere (Details) clears it, and its end says nothing of the old switch', () => {
    const { h, set } = on();
    set({ approval: ON, ops: 1, reads: 1, change: { kind: 'running', change: { field: 'yolo', value: false } } });
    expect(h.result.current.note).toBeNull();
    set({ approval: ap(), ops: 2, reads: 2, change: null });
    expect(h.result.current.note).toBeNull();
  });
  it('a read showing another mode clears it', () => {
    const { h, set } = on();
    set({ approval: ap(), ops: 2, reads: 2 });
    expect(h.result.current.note).toBeNull();
  });
});

describe('a finished mode change is said only while the read still shows it', () => {
  it('"now asks when needed" is not said once the read shows Allow everything on', () => {
    let d = data({ change: { kind: 'done', change: { field: 'mode', value: 'default' } } });
    const h = renderHook(() => useApprovalModeNote(d));
    expect(h.result.current.note?.text).toBe(strings['am.done.default']);
    d = data({ approval: ON, change: { kind: 'done', change: { field: 'mode', value: 'default' } } });
    h.rerender();
    expect(h.result.current.note).toBeNull();
  });
  it('"now asks every time" is not said once the read shows another mode', () => {
    const d = data({ approval: ap(), change: { kind: 'done', change: { field: 'mode', value: 'always' } } });
    const h = renderHook(() => useApprovalModeNote(d));
    expect(h.result.current.note).toBeNull();
  });
});

describe('an unsettled change makes the chip unsure', () => {
  it('a pending change is unknown, whatever the last read said, in both directions', () => {
    expect(approvalModeOf({ approval: ap(), phase: 'done', change: { kind: 'pending', change: { field: 'yolo', value: true } } })).toBe('unknown');
    expect(approvalModeOf({ approval: ON, phase: 'done', change: { kind: 'pending', change: { field: 'yolo', value: false } } })).toBe('unknown');
    // A change still out keeps the last read (it is busy, not unsure).
    expect(approvalModeOf({ approval: ap(), phase: 'done', change: { kind: 'running', change: { field: 'yolo', value: true } } })).toBe('default');
  });
  it('the chip says unknown, and every choice waits for the check', () => {
    render(<Host data={data({ approval: ON, change: { kind: 'pending', change: { field: 'yolo', value: false } } })} setYolo={() => true} />);
    expect(chip().getAttribute('data-approval-mode')).toBe('unknown');
    expect(chip().textContent).toContain(strings['am.state.unknown']);
    expect(chip().textContent).not.toContain(strings['am.state.everything']);
    openMenu();
    for (const n of ['Ask every time', 'Ask when needed', 'Allow everything']) {
      expect(item(n).getAttribute('aria-disabled')).toBe('true');
      // The three share the reason, so the menu says it once over the group and each item is described by it.
      expect(said(item(n))).toContain(strings['am.why.wait']);
    }
  });
});
