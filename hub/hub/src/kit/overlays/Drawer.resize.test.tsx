// Drawer resize: every kit Drawer has a separator on its inline-start edge. Drag and the keyboard
// change its width in pixels (clamped to the viewport), the width is remembered per panel on this browser, and a phone's
// full-screen sheet has no separator. Storage that refuses or holds junk never breaks the drawer.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Drawer, type DrawerSize } from './Overlays';

const KEY = (k: string) => `hub.v3.pane.drawer.${k}.width`;
const setViewport = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w });
};

function Host({ size = 'md', resizeKey = 'computers', onOpenChange = () => undefined, title = 'Edit' }: { size?: DrawerSize; resizeKey?: string; onOpenChange?: (o: boolean) => void; title?: string }): ReactElement {
  return (
    <Drawer isOpen onOpenChange={onOpenChange} title={title} size={size} resizeKey={resizeKey}>
      <p>body</p>
    </Drawer>
  );
}

const handle = () => screen.getByRole('separator', { name: 'Resize panel' });
const drawerBox = () => screen.getByRole('dialog').parentElement as HTMLElement;
const widthVar = () => drawerBox().style.getPropertyValue('--drawer-w');
const key = (k: string, opts: KeyboardEventInit = {}) => act(() => { fireEvent.keyDown(handle(), { key: k, ...opts }); });

beforeEach(() => {
  setViewport(1400);
  window.localStorage.clear();
  window.location.hash = '#/computers';
});
afterEach(() => {
  document.documentElement.removeAttribute('dir');
  vi.restoreAllMocks();
});

describe('the Drawer separator', () => {
  it('is a vertical separator named Resize panel, at the size\'s width, between 360 and the viewport less the rail', () => {
    render(<Host size="md" />);
    const h = handle();
    expect(h).toHaveAttribute('aria-orientation', 'vertical');
    expect(h).toHaveAttribute('tabindex', '0');
    expect(h).toHaveAttribute('aria-valuenow', '640');
    expect(h).toHaveAttribute('aria-valuemin', '360');
    expect(h).toHaveAttribute('aria-valuemax', String(1400 - 56));
    expect(h).toHaveAttribute('aria-valuetext', '640 pixels wide');
    // Part of the named dialog, so a reader finds it with the panel it resizes.
    expect(screen.getByRole('dialog')).toContainElement(h);
    // Nothing is set until the person resizes: the size class draws it.
    expect(widthVar()).toBe('');
  });

  it('starts from each size\'s own width', () => {
    const { unmount } = render(<Host size="sm" />);
    expect(handle()).toHaveAttribute('aria-valuenow', '480');
    unmount();
    render(<Host size="lg" />);
    expect(handle()).toHaveAttribute('aria-valuenow', '880');
  });

  it('the edge moves left with ArrowLeft (wider) and right with ArrowRight (narrower), 16 px a step, 64 with Shift', () => {
    render(<Host />);
    key('ArrowLeft');
    expect(handle()).toHaveAttribute('aria-valuenow', '656');
    expect(widthVar()).toBe('656px');
    // The stylesheet's width rule for a width the person set is on the drawer.
    expect(drawerBox().className).toMatch(/sized/);
    key('ArrowRight');
    key('ArrowRight');
    expect(handle()).toHaveAttribute('aria-valuenow', '624');
    key('ArrowLeft', { shiftKey: true });
    expect(handle()).toHaveAttribute('aria-valuenow', '688');
  });

  it('Home is the narrowest, End the widest the viewport allows, Enter and a double click give back the size\'s width', () => {
    render(<Host />);
    key('Home');
    expect(handle()).toHaveAttribute('aria-valuenow', '360');
    key('End');
    expect(handle()).toHaveAttribute('aria-valuenow', String(1400 - 56));
    key('Enter');
    expect(handle()).toHaveAttribute('aria-valuenow', '640');
    expect(widthVar()).toBe('');
    key('ArrowLeft');
    act(() => { fireEvent.doubleClick(handle()); });
    expect(handle()).toHaveAttribute('aria-valuenow', '640');
    expect(widthVar()).toBe('');
  });

  it('never goes past either end', () => {
    setViewport(700);
    render(<Host size="sm" />);
    for (let i = 0; i < 40; i += 1) key('ArrowLeft');
    expect(handle()).toHaveAttribute('aria-valuenow', '644');
    expect(widthVar()).toBe('644px');
    for (let i = 0; i < 80; i += 1) key('ArrowRight');
    expect(handle()).toHaveAttribute('aria-valuenow', '360');
    expect(widthVar()).toBe('360px');
    // A drag past either end is held the same way.
    fireEvent.pointerDown(handle(), { button: 0, pointerId: 1, clientX: 300 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: -4000 });
    expect(widthVar()).toBe('644px');
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 9000 });
    expect(widthVar()).toBe('360px');
  });

  it('a window made narrower while it is open lowers the widest and keeps the shown width inside it', () => {
    render(<Host size="lg" />);
    expect(handle()).toHaveAttribute('aria-valuenow', '880');
    setViewport(800);
    act(() => { fireEvent(window, new Event('resize')); });
    expect(handle()).toHaveAttribute('aria-valuemax', '744');
    expect(handle()).toHaveAttribute('aria-valuenow', '744');
  });

  it('drags: the edge follows the pointer to the left; the width is kept at the end of the drag', () => {
    render(<Host />);
    const h = handle();
    fireEvent.pointerDown(h, { button: 0, pointerId: 1, clientX: 760 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 700 });
    expect(h).toHaveAttribute('aria-valuenow', '700');
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 820 });
    expect(h).toHaveAttribute('aria-valuenow', '580');
    fireEvent.pointerUp(h, { pointerId: 1, clientX: 820 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 100 });
    expect(h).toHaveAttribute('aria-valuenow', '580');
    expect(window.localStorage.getItem(KEY('computers.md'))).toBe('580');
  });

  it('a press on the edge focuses it, so the keys work straight after a drag', () => {
    render(<Host />);
    fireEvent.pointerDown(handle(), { button: 0, pointerId: 1, clientX: 760 });
    fireEvent.pointerUp(handle(), { pointerId: 1, clientX: 760 });
    expect(handle()).toHaveFocus();
  });

  it('ignores a secondary button and a second pointer', () => {
    render(<Host />);
    const h = handle();
    fireEvent.pointerDown(h, { button: 2, pointerId: 1, clientX: 760 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 700 });
    expect(h).toHaveAttribute('aria-valuenow', '640');
    fireEvent.pointerDown(h, { button: 0, pointerId: 2, clientX: 760 });
    fireEvent.pointerDown(h, { button: 0, pointerId: 3, clientX: 100 });
    fireEvent.pointerMove(h, { pointerId: 3, clientX: 0 });
    fireEvent.pointerMove(h, { pointerId: 2, clientX: 740 });
    expect(h).toHaveAttribute('aria-valuenow', '660');
  });

  it('a drag never closes the drawer', () => {
    const closed: boolean[] = [];
    render(<Host onOpenChange={(o) => closed.push(o)} />);
    const h = handle();
    fireEvent.pointerDown(h, { button: 0, pointerId: 1, clientX: 760 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 600 });
    fireEvent.pointerUp(h, { pointerId: 1, clientX: 40 });
    fireEvent.click(h);
    expect(closed).toEqual([]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('in a right-to-left page the edge is on the other side: ArrowRight widens and a drag to the right widens', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    render(<Host />);
    key('ArrowRight');
    expect(handle()).toHaveAttribute('aria-valuenow', '656');
    key('ArrowLeft');
    key('ArrowLeft');
    expect(handle()).toHaveAttribute('aria-valuenow', '624');
    fireEvent.pointerDown(handle(), { button: 0, pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 140 });
    expect(handle()).toHaveAttribute('aria-valuenow', '664');
  });

  it('a phone gets no separator: its sheet is the full screen', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ matches: q.includes('width < 600px'), media: q, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }) as MediaQueryList);
    render(<Host />);
    expect(screen.queryByRole('separator')).toBeNull();
    expect(widthVar()).toBe('');
  });
});

describe('the footer in a narrow drawer', () => {
  it('a drawer made narrower than 480 px is marked narrow, so its footer wraps like a phone\'s; 480 and wider are not', () => {
    render(<Host size="md" />);
    expect(drawerBox()).not.toHaveAttribute('data-narrow');
    key('Home');
    expect(handle()).toHaveAttribute('aria-valuenow', '360');
    expect(drawerBox()).toHaveAttribute('data-narrow');
    key('ArrowLeft', { shiftKey: true });
    key('ArrowLeft', { shiftKey: true });
    expect(handle()).toHaveAttribute('aria-valuenow', '488');
    expect(drawerBox()).not.toHaveAttribute('data-narrow');
  });

  it('the small size at its own 480 is not narrow; a phone is never marked (its sheet has its own rules)', () => {
    const { unmount } = render(<Host size="sm" />);
    expect(drawerBox()).not.toHaveAttribute('data-narrow');
    unmount();
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ matches: q.includes('width < 600px'), media: q, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }) as MediaQueryList);
    render(<Host size="sm" />);
    expect(drawerBox()).not.toHaveAttribute('data-narrow');
  });

  it('the stylesheet wraps the footer, puts the ask text and the Outcome on their own row, and shares the row between buttons, for data-narrow', () => {
    const css = readFileSync(join(import.meta.dirname, 'Drawer.module.css'), 'utf8');
    const rule = (sel: string) => css.match(new RegExp(`${sel.replace(/[.[\]()>:*]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
    // In reverse, so stacked buttons put the action (the last) on top; the Outcome and the ask text go
    // last in the order, which keeps them on the top row.
    expect(rule('.drawer[data-narrow] .foot')).toMatch(/flex-wrap: wrap-reverse;/);
    expect(rule('.drawer[data-narrow] .askButtons')).toMatch(/flex-wrap: wrap-reverse;/);
    expect(css).toMatch(/\.drawer\[data-narrow\] \.outcome,\s*\.drawer\[data-narrow\] \.askText \{\s*order: 1;/);
    expect(css).toMatch(/\.drawer\[data-narrow\] \.askText \{\s*flex-basis: 100%;/);
    expect(rule('.drawer[data-narrow] .askButtons')).toMatch(/flex: 1;/);
    // The footer's own buttons grow and share their row (footRow.module.css reads --foot-share), as on a phone.
    expect(rule('.drawer[data-narrow] .foot')).toMatch(/--foot-share: 1 1 auto;/);
    expect(rule('.drawer[data-narrow] .askButtons')).toMatch(/--foot-share: 1;/);
  });
});

describe('very wide windows', () => {
  it('a width the control saves can always be read back: End on a 5120 px window is kept, and nothing passes 8000', () => {
    setViewport(5120);
    const a = render(<Host />);
    key('End');
    expect(window.localStorage.getItem(KEY('computers.md'))).toBe('5064');
    a.unmount();
    render(<Host />);
    expect(handle()).toHaveAttribute('aria-valuenow', '5064');
    cleanup();
    setViewport(12000);
    render(<Host />);
    expect(handle()).toHaveAttribute('aria-valuemax', '8000');
  });
});

describe('the remembered width', () => {
  it('is stored per panel after a change, and read back when the drawer opens again', () => {
    const first = render(<Host />);
    key('ArrowLeft');
    key('ArrowLeft');
    expect(window.localStorage.getItem(KEY('computers.md'))).toBe('672');
    first.unmount();
    render(<Host />);
    expect(handle()).toHaveAttribute('aria-valuenow', '672');
    expect(widthVar()).toBe('672px');
  });

  it('the key and the size name the panel, so one panel\'s width never moves another\'s', () => {
    const a = render(<Host size="md" />);
    key('End');
    a.unmount();
    const b = render(<Host size="sm" />);
    expect(handle()).toHaveAttribute('aria-valuenow', '480');
    b.unmount();
    const c = render(<Host size="md" resizeKey="bots" />);
    expect(handle()).toHaveAttribute('aria-valuenow', '640');
    c.unmount();
    render(<Host size="md" />);
    expect(handle()).toHaveAttribute('aria-valuenow', String(1400 - 56));
  });

  it('a panel keeps its width wherever it opens, still per size', () => {
    const a = render(<Host resizeKey="copy" />);
    key('ArrowLeft');
    expect(window.localStorage.getItem(KEY('copy.md'))).toBe('656');
    a.unmount();
    window.location.hash = '#/bots';
    render(<Host resizeKey="copy" />);
    expect(handle()).toHaveAttribute('aria-valuenow', '656');
  });

  it('Enter forgets the stored width', () => {
    render(<Host />);
    key('ArrowLeft');
    expect(window.localStorage.getItem(KEY('computers.md'))).not.toBeNull();
    key('Enter');
    expect(window.localStorage.getItem(KEY('computers.md'))).toBeNull();
  });

  it('a stored width wider than the window is drawn inside it, and kept for a wider window', () => {
    window.localStorage.setItem(KEY('computers.md'), '1300');
    setViewport(900);
    render(<Host />);
    expect(handle()).toHaveAttribute('aria-valuenow', '844');
    expect(widthVar()).toBe('1300px');
    expect(window.localStorage.getItem(KEY('computers.md'))).toBe('1300');
  });

  it.each(['abc', '', '-5', '0', '12', 'NaN', 'Infinity', '1e9', '640px', '0x280', '640.5', ' 700', '5e2'])('ignores a stored %j', (v) => {
    window.localStorage.setItem(KEY('computers.md'), v);
    render(<Host />);
    expect(handle()).toHaveAttribute('aria-valuenow', '640');
    expect(widthVar()).toBe('');
  });

  it('works when storage refuses to read or to write', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    // The refusals are really in force (not a mock that missed).
    expect(() => window.localStorage.setItem('probe', '1')).toThrow('blocked');
    expect(() => window.localStorage.getItem('probe')).toThrow('blocked');
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => { errors.push(e.error ?? e.message); e.preventDefault(); };
    window.addEventListener('error', onError);
    render(<Host />);
    expect(handle()).toHaveAttribute('aria-valuenow', '640');
    // The key is still handled (its default is cancelled) when the write is refused.
    let handled = true;
    act(() => { handled = !fireEvent.keyDown(handle(), { key: 'ArrowLeft' }); });
    expect(handled).toBe(true);
    expect(handle()).toHaveAttribute('aria-valuenow', '656');
    act(() => { handled = !fireEvent.keyDown(handle(), { key: 'Enter' }); });
    expect(handled).toBe(true);
    expect(handle()).toHaveAttribute('aria-valuenow', '640');
    window.removeEventListener('error', onError);
    // No refusal escapes a key handler as an error.
    expect(errors).toEqual([]);
  });
});
