// Vitest: an editable strip shows where a dragged tab lands: a bar before or after the tab under the
// pointer (the pointer's half of it), the dragged tab dimmed, no bar where the tab would stay put, the bar gone on
// leaving the strip and at the drag's end, and a drop that puts the tab exactly where the bar was.
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dropIndex, Tabs } from './Tabs';

const VIEWS = [
  { id: 'a', label: 'Overview' },
  { id: 'b', label: 'Builds' },
  { id: 'c', label: 'Logs' },
];

describe('dropIndex', () => {
  it.each([
    [0, 2, true, 2],
    [0, 2, false, 1],
    [2, 0, false, 0],
    [2, 0, true, 1],
    [0, 1, true, 1],
    [1, 1, false, null],
    [1, 1, true, null],
    [0, 1, false, null],
    [1, 0, true, null],
    [2, 1, true, null],
  ])('from %i over %i (after: %s) lands at %s', (from, over, after, to) => {
    expect(dropIndex(from, over, after)).toBe(to);
  });
});

// Each tab is 100 px wide, 120 px apart: Overview 0-100, Builds 120-220, Logs 240-340; right to left the strip is
// mirrored: Logs 0-100, Builds 120-220, Overview 240-340.
let rtl = false;
beforeEach(() => {
  rtl = false;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const n = VIEWS.findIndex((v) => this.getAttribute('role') === 'tab' && this.textContent?.includes(v.label));
    const i = rtl && n >= 0 ? VIEWS.length - 1 - n : n;
    return { left: i * 120, right: i * 120 + 100, width: n < 0 ? 0 : 100, top: 0, bottom: 40, height: 40, x: i * 120, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el, p) => {
    const cs = real(el, p);
    if (!rtl) return cs;
    return new Proxy(cs, { get: (o, k) => (k === 'direction' ? 'rtl' : typeof Reflect.get(o, k) === 'function' ? (Reflect.get(o, k) as (...a: unknown[]) => unknown).bind(o) : Reflect.get(o, k)) });
  });
});
afterEach(() => vi.restoreAllMocks());

function setup() {
  const onMove = vi.fn();
  render(<Tabs label="Board" items={VIEWS} value="a" edit={{ onMove }} />);
  const data = { setData: vi.fn(), getData: vi.fn(), effectAllowed: '', dropEffect: '' };
  const tab = (name: string) => screen.getByRole('tab', { name });
  const start = (name: string) => fireEvent.dragStart(screen.getByText(name), { dataTransfer: data });
  // happy-dom has no DragEvent: the pointer's x is set on the event by hand.
  const at = (kind: 'dragOver' | 'drop', name: string, x: number) => {
    const el = screen.getByText(name);
    const ev = createEvent[kind](el, { dataTransfer: data });
    Object.defineProperty(ev, 'clientX', { value: x });
    // fireEvent answers false when the strip took the event (a drop is allowed there).
    return !fireEvent(el, ev);
  };
  // The pointer in a gap between tabs: the event lands on the tab list itself.
  const gap = (kind: 'dragOver' | 'drop', x: number) => {
    const el = screen.getByRole('tablist');
    const ev = createEvent[kind](el, { dataTransfer: data });
    Object.defineProperty(ev, 'clientX', { value: x });
    return !fireEvent(el, ev);
  };
  const over = (name: string, x: number) => at('dragOver', name, x);
  const dropOn = (name: string, x: number) => at('drop', name, x);
  const leave = (name: string, to: Element) => {
    const ev = createEvent.dragLeave(screen.getByText(name), { dataTransfer: data });
    Object.defineProperty(ev, 'relatedTarget', { value: to });
    fireEvent(screen.getByText(name), ev);
  };
  const bars = () => VIEWS.map((v) => tab(v.label)).filter((el) => el.hasAttribute('data-drop'));
  return { onMove, data, tab, start, over, dropOn, gap, leave, bars };
}

describe('Tabs: where a dragged tab lands', () => {
  it('the bar sits after the tab when the pointer is on its far half, before it on its near half; the dragged tab dims', () => {
    const t = setup();
    t.start('Overview');
    expect(t.tab('Overview')).toHaveAttribute('data-dragging');
    expect(t.over('Logs', 300)).toBe(true);
    expect(t.tab('Logs')).toHaveAttribute('data-drop', 'after');
    expect(t.over('Logs', 250)).toBe(true);
    expect(t.tab('Logs')).toHaveAttribute('data-drop', 'before');
    expect(t.bars()).toHaveLength(1);
  });

  it('no bar and no drop where the tab would stay put', () => {
    const t = setup();
    t.start('Overview');
    expect(t.over('Overview', 80)).toBe(false);
    expect(t.over('Builds', 130)).toBe(false);
    expect(t.bars()).toHaveLength(0);
    t.dropOn('Builds', 130);
    expect(t.onMove).not.toHaveBeenCalled();
    expect(t.tab('Overview')).not.toHaveAttribute('data-dragging');
  });

  it('the drop puts the tab where the bar was, and says so', () => {
    const t = setup();
    t.start('Logs');
    expect(t.over('Overview', 90)).toBe(true);
    expect(t.tab('Overview')).toHaveAttribute('data-drop', 'after');
    t.dropOn('Overview', 90);
    expect(t.onMove).toHaveBeenCalledWith('c', 1);
    expect(screen.getByText('Logs moved to place 2 of 3')).toBeInTheDocument();
    expect(t.bars()).toHaveLength(0);
    expect(t.tab('Logs')).not.toHaveAttribute('data-dragging');
  });

  it('the bar goes when the pointer leaves the strip, and the drag ending (Escape, a drop elsewhere) clears it all', () => {
    const t = setup();
    t.start('Overview');
    t.over('Logs', 300);
    t.leave('Logs', document.body);
    expect(t.bars()).toHaveLength(0);
    expect(t.tab('Overview')).toHaveAttribute('data-dragging');
    t.over('Logs', 300);
    // Moving between tabs inside the strip keeps it.
    t.leave('Logs', screen.getByText('Builds'));
    expect(t.bars()).toHaveLength(1);
    fireEvent.dragEnd(screen.getByText('Overview'), { dataTransfer: t.data });
    expect(t.bars()).toHaveLength(0);
    expect(t.tab('Overview')).not.toHaveAttribute('data-dragging');
    expect(t.over('Logs', 300)).toBe(false);
  });

  it('a drop in the gap where the bar is drawn lands there: the gap takes the nearer tab', () => {
    const t = setup();
    t.start('Overview');
    // 225 is in the Builds-Logs gap (220-240), nearer Builds: after Builds.
    expect(t.gap('dragOver', 225)).toBe(true);
    expect(t.tab('Builds')).toHaveAttribute('data-drop', 'after');
    // 235 is nearer Logs: before Logs, the same slot.
    expect(t.gap('dragOver', 235)).toBe(true);
    expect(t.tab('Logs')).toHaveAttribute('data-drop', 'before');
    expect(t.bars()).toHaveLength(1);
    t.gap('drop', 235);
    expect(t.onMove).toHaveBeenCalledWith('a', 1);
  });

  it('a gap next to the dragged tab is no drop', () => {
    const t = setup();
    t.start('Builds');
    expect(t.gap('dragOver', 105)).toBe(false);
    expect(t.gap('dragOver', 235)).toBe(false);
    expect(t.bars()).toHaveLength(0);
    t.gap('drop', 105);
    expect(t.onMove).not.toHaveBeenCalled();
  });

  it.each([
    [105, 'Logs', 'before'],
    [110, 'Builds', 'after'],
    [115, 'Builds', 'after'],
  ])('right to left, both halves of a gap name one slot: x %i draws %s %s and lands at 1', (x, name, side) => {
    rtl = true;
    const t = setup();
    t.start('Overview');
    expect(t.gap('dragOver', x)).toBe(true);
    expect(t.tab(name)).toHaveAttribute('data-drop', side);
    expect(t.bars()).toHaveLength(1);
    t.gap('drop', x);
    expect(t.onMove).toHaveBeenCalledWith('a', 1);
  });

  it('right to left, a gap next to the dragged tab is no drop', () => {
    rtl = true;
    const t = setup();
    t.start('Overview');
    expect(t.gap('dragOver', 225)).toBe(false);
    expect(t.gap('dragOver', 235)).toBe(false);
    expect(t.bars()).toHaveLength(0);
    t.gap('drop', 225);
    expect(t.onMove).not.toHaveBeenCalled();
  });

  it('right to left, the far half is the left one', () => {
    rtl = true;
    const t = setup();
    t.start('Overview');
    t.over('Logs', 20);
    expect(t.tab('Logs')).toHaveAttribute('data-drop', 'after');
    t.dropOn('Logs', 20);
    expect(t.onMove).toHaveBeenCalledWith('a', 2);
  });
});
