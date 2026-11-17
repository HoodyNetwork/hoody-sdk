// PageHeader `menu`: the ⋯ slot sits after the actions on a one-line row and before them on a wrapped row (under 600 px),
// so crossing 600 px draws it in the other place. A keyboard user on the ⋯ keeps focus on the ⋯ across that change, in
// both directions; focus never falls to the page body. A ⋯ that leaves the header and comes back later takes no focus.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageHeader } from './PageHeader';

vi.mock('../nav', () => ({ useSearchParam: () => [undefined, () => undefined] }));
vi.mock('../ask', () => ({ useAskDock: () => ({ isOpen: false }) }));

const observers: { cb: ResizeObserverCallback; el: Element }[] = [];
let width = 1000;
const RO = globalThis.ResizeObserver;

beforeEach(() => {
  observers.length = 0;
  width = 1000;
  globalThis.ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(el: Element) {
      observers.push({ cb: this.cb, el });
      this.cb([{ target: el, contentRect: { width } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  globalThis.ResizeObserver = RO;
});

const resize = (w: number) =>
  act(() => {
    width = w;
    for (const o of observers) o.cb([{ target: o.el, contentRect: { width: w } } as unknown as ResizeObserverEntry], {} as ResizeObserver);
  });

const head = (menu = true) => (
  <PageHeader title="Vault" actions={<button type="button">Use with your agent</button>} menu={menu ? <button type="button">More</button> : undefined} />
);
const order = () => screen.getAllByRole('button').map((b) => b.textContent);

describe('PageHeader menu: focus across the wrap', () => {
  it('wide to narrow and back: focus stays on the ⋯', () => {
    render(head());
    expect(order()).toEqual(['Use with your agent', 'More']);
    screen.getByRole('button', { name: 'More' }).focus();
    resize(390);
    expect(order(), 'the ⋯ moved before the actions').toEqual(['More', 'Use with your agent']);
    expect(document.activeElement, 'focus on the ⋯, not the body').toBe(screen.getByRole('button', { name: 'More' }));
    resize(1000);
    expect(order()).toEqual(['Use with your agent', 'More']);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More' }));
  });

  it('focus elsewhere is left alone when the ⋯ moves', () => {
    render(head());
    screen.getByRole('button', { name: 'Use with your agent' }).focus();
    resize(390);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Use with your agent' }));
  });

  it('a ⋯ that leaves while focused and comes back later takes no focus', async () => {
    const { rerender } = render(head());
    screen.getByRole('button', { name: 'More' }).focus();
    rerender(head(false));
    await act(async () => { await Promise.resolve(); });
    rerender(head(true));
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'More' }));
  });
});
