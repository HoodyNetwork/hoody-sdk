// ActionMenu's two-line tray keeps its tallest row as drawn on the tray (--tray-row-m).
// Rows added, or replaced by a regroup, while the tray is open must be measured too, or a
// newly drawn tall row is cut again. jsdom lays nothing out, so a row's height comes from its text here (a row whose
// text has TALL is 124 px, any other 44 px) and ResizeObserver is a stand-in that reports when asked; Playwright
// (trayrow and traytoast specs) covers the real geometry.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { ActionMenu, type MenuEntry } from './Overlays';

function setPhone(phone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => ({ matches: phone && q.includes('600'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}

/** The live stand-in observers and what each observes now. */
const observers = new Set<FakeResizeObserver>();
class FakeResizeObserver {
  readonly els = new Set<Element>();
  constructor(private readonly cb: ResizeObserverCallback) {
    observers.add(this);
  }
  observe(el: Element) {
    observers.add(this); // a disconnected ResizeObserver can observe again: it is live again
    this.els.add(el);
  }
  unobserve(el: Element) {
    this.els.delete(el);
  }
  disconnect() {
    this.els.clear();
    observers.delete(this);
  }
  /** Reports every observed element, as a layout pass would after their sizes changed. */
  fire() {
    this.cb([...this.els].map((target) => ({ target }) as ResizeObserverEntry), this as unknown as ResizeObserver);
  }
}

const realRect = HTMLElement.prototype.getBoundingClientRect;
const realRO = globalThis.ResizeObserver;

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  setPhone(true);
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const row = this.getAttribute('role')?.startsWith('menuitem');
    const h = row ? (this.textContent?.includes('TALL') ? 124 : 44) : 0;
    return { x: 0, y: 0, top: 0, left: 0, right: 390, bottom: h, width: 390, height: h, toJSON: () => ({}) } as DOMRect;
  };
});
afterEach(() => {
  cleanup();
  setPhone(false);
  globalThis.ResizeObserver = realRO;
  HTMLElement.prototype.getBoundingClientRect = realRect;
  observers.clear();
  window.dispatchEvent(new Event('blur'));
});

const noop = () => undefined;
const tray = () => document.querySelector<HTMLElement>('[data-hub-tray]');
const measured = () => tray()?.style.getPropertyValue('--tray-row-m');
/** Lets the effect, its frames and the DOM observers run. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  });
/** What the live stand-in observers hold now. */
const held = () => new Set([...observers].flatMap((o) => [...o.els]));
/** Every row drawn now is observed by a live observer. */
const allObserved = () => {
  const rows = [...document.querySelectorAll('[data-hub-tray] [role^="menuitem"]')];
  const seen = new Set([...observers].flatMap((o) => [...o.els]));
  return rows.length > 0 && rows.every((r) => seen.has(r));
};

const BASE: MenuEntry[] = [
  { id: 'open', label: 'Open', description: 'In a new tab', onAction: noop },
  { id: 'rename', label: 'Rename', onAction: noop },
];

describe('ActionMenu two-line tray: the tallest row as drawn', () => {
  it('measures the rows it opens with', async () => {
    render(<ActionMenu label="Row actions" isOpen items={BASE} />);
    await settle();
    expect(measured()).toBe('44px');
    expect(allObserved()).toBe(true);
  });

  it('a taller row added while open is observed and reserved', async () => {
    const { rerender } = render(<ActionMenu label="Row actions" isOpen items={BASE} />);
    await settle();
    expect(measured()).toBe('44px');
    rerender(<ActionMenu label="Row actions" isOpen items={[...BASE, { id: 'move', label: 'Move', description: 'TALL reason', onAction: noop }]} />);
    await settle();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    expect(allObserved()).toBe(true);
    expect(measured()).toBe('124px');
  });

  it('a row regrouped while open (a new node, same ids and order) is observed and reserved', async () => {
    const { rerender } = render(<ActionMenu label="Row actions" isOpen items={BASE} />);
    await settle();
    const before = screen.getAllByRole('menuitem')[1]!;
    // tone: 'danger' moves the last row into its own section: React Aria draws a new node for it.
    rerender(<ActionMenu label="Row actions" isOpen items={[BASE[0]!, { id: 'rename', label: 'Rename', description: 'TALL now', tone: 'danger', onAction: noop }]} />);
    await settle();
    expect(screen.getAllByRole('menuitem')[1], 'precondition: the regroup drew a new node').not.toBe(before);
    expect(allObserved()).toBe(true);
    expect(held().has(before), 'the replaced node is no longer observed').toBe(false);
    expect(measured()).toBe('124px');
  });

  it('a tall row removed while open stops counting and is no longer observed', async () => {
    const { rerender } = render(<ActionMenu label="Row actions" isOpen items={[...BASE, { id: 'move', label: 'Move', description: 'TALL reason', onAction: noop }]} />);
    await settle();
    expect(measured()).toBe('124px');
    const removed = screen.getAllByRole('menuitem').find((r) => r.textContent?.includes('TALL'))!;
    rerender(<ActionMenu label="Row actions" isOpen items={BASE} />);
    await settle();
    expect(measured()).toBe('44px');
    expect(allObserved()).toBe(true);
    expect(held().has(removed), 'the removed node is no longer observed').toBe(false);
  });

  // A row whose size changes with no child-list change (text edited in place) is measured only
  // through the ResizeObserver's report, so this is the case that fails when that callback is broken.
  it('a row that grows in place (same node, no child-list change) is reserved when the observer reports it', async () => {
    render(<ActionMenu label="Row actions" isOpen items={BASE} />);
    await settle();
    expect(measured()).toBe('44px');
    const row = screen.getAllByRole('menuitem')[0]!;
    const text = document.createTreeWalker(row, NodeFilter.SHOW_TEXT).nextNode() as Text;
    await act(async () => {
      text.data = `TALL ${text.data}`; // characterData only: the MutationObserver (childList) stays quiet
    });
    await settle();
    expect(measured(), 'nothing re-measures before the observer reports').toBe('44px');
    await act(async () => {
      for (const o of [...observers]) o.fire();
    });
    expect(measured()).toBe('124px');
  });

  it('closing removes the measurement and stops observing', async () => {
    render(<ActionMenu label="Row actions" items={BASE} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Row actions' }));
    });
    await settle();
    expect(measured()).toBe('44px');
    const oldTray = tray()!;
    const oldMenu = oldTray.querySelector<HTMLElement>('[role="menu"]')!;
    const rows = screen.getAllByRole('menuitem');
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    });
    await settle();
    expect(tray()).toBeNull();
    // Other kit parts may observe their own elements; no menu row stays observed.
    const heldRows = () => [...held()].filter((el) => el.getAttribute('role')?.startsWith('menuitem'));
    expect(heldRows()).toEqual([]);
    expect(rows.some((r) => held().has(r)), 'no closed row is held').toBe(false);
    // A MutationObserver left connected would answer a change to the detached menu by observing
    // and measuring again; nothing comes back.
    await act(async () => {
      const late = document.createElement('div');
      late.setAttribute('role', 'menuitem');
      late.textContent = 'TALL late';
      oldMenu.appendChild(late);
    });
    await settle();
    expect(oldTray.style.getPropertyValue('--tray-row-m'), 'no measurement after close').toBe('');
    expect(heldRows()).toEqual([]);
  });
});
