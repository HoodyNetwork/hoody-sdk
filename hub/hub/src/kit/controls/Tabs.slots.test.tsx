// Vitest: the Tabs `before` and `after` slots put a control on the strip's own row: before the tabs, and right
// after the last tab, outside the tab list and the sideways scroll, so they never scroll away or stack under the strip
// (the `end` slot does stack when the row is tight). Without them the bar is as before.
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';
import ts from './Tabs.module.css';

afterEach(() => { vi.restoreAllMocks(); });

/** A laid-out bar for jsdom: the bar 500 wide with no padding or gap, every tab list 200, the end 150, the strip's
 *  `after` slot `after` wide, any other ⋯ / slot wrapper 100. */
function layout(after: number) {
  const box = (width: number) => ({ left: 0, right: width, top: 0, bottom: 20, width, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.hasAttribute('data-tabs-after') && !this.parentElement?.closest('[data-tabs-after]')) return box(after);
    if (this.classList.contains(ts.tabMenu ?? 'tabMenu')) return box(100);
    if (this.getAttribute('role') === 'tablist') return box(200);
    if (this.classList.contains(ts.end ?? 'end')) return box(150);
    return box(0);
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains(ts.bar ?? 'bar') ? 500 : 0;
  });
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    const cs = real(el);
    return new Proxy(cs, {
      get: (t, k) => (k === 'paddingLeft' || k === 'paddingRight' || k === 'columnGap' ? '0px' : typeof Reflect.get(t, k) === 'function' ? (Reflect.get(t, k) as (...a: unknown[]) => unknown).bind(t) : Reflect.get(t, k)),
    });
  });
}
const outerBar = () => screen.getByText('Count').closest(`.${ts.bar}`)!;

const VIEWS = Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, label: `Board ${i + 1}` }));

describe('Tabs, before and after slots', () => {
  it('draws before, the tabs, then after, in that order on the strip row', () => {
    render(<Tabs label="Boards" items={VIEWS} value="t0" before={<button type="button">Boards menu</button>} after={<button type="button">New Board</button>} />);
    const list = screen.getByRole('tablist');
    const pre = screen.getByRole('button', { name: 'Boards menu' });
    const post = screen.getByRole('button', { name: 'New Board' });
    expect(pre.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list.compareDocumentPosition(post) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const strip = list.parentElement?.parentElement as HTMLElement;
    expect(strip.contains(pre) && strip.contains(post)).toBe(true);
  });

  it('they sit outside the tab list and its scroller, so a tab scroll never hides them', () => {
    render(<Tabs label="Boards" items={VIEWS} value="t8" before={<button type="button">Boards menu</button>} after={<button type="button">New Board</button>} />);
    const scroller = screen.getByRole('tablist').parentElement as HTMLElement;
    expect(scroller.contains(screen.getByRole('button', { name: 'Boards menu' }))).toBe(false);
    expect(scroller.contains(screen.getByRole('button', { name: 'New Board' }))).toBe(false);
  });

  it('they are on the bar row, never in the stacking end area', () => {
    const { container } = render(<Tabs label="Boards" items={VIEWS} value="t0" after={<button type="button">New Board</button>} end={<span>Count</span>} />);
    const post = screen.getByRole('button', { name: 'New Board' });
    const endArea = screen.getByText('Count').parentElement as HTMLElement;
    expect(endArea.contains(post)).toBe(false);
    expect(container.querySelector('[data-tabs-after]')?.contains(post)).toBe(true);
  });

  it('with editable tabs, after comes before the ⋯ button', () => {
    render(<Tabs label="Boards" items={VIEWS} value="t0" edit={{ onRename: () => undefined }} after={<button type="button">New Board</button>} />);
    const post = screen.getByRole('button', { name: 'New Board' });
    const dots = screen.getByRole('button', { name: 'Tab actions: Board 1' });
    expect(post.compareDocumentPosition(dots) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('without them nothing is added', () => {
    const { container } = render(<Tabs label="Boards" items={VIEWS} value="t0" />);
    expect(container.querySelector('[data-tabs-before], [data-tabs-after]')).toBeNull();
  });

  it('the end stacks by the strip\'s own slots: the list, the after slot and the end past the bar stack it', () => {
    layout(200);
    render(<Tabs label="Boards" items={VIEWS.slice(0, 2)} value="t0" after={<button type="button">New Board</button>} end={<span>Count</span>} />);
    // 200 tabs + 200 after + 150 end > 500.
    expect(outerBar()).toHaveAttribute('data-stacked');
  });

  it('an editable Tabs inside the after slot is not counted twice: only the strip\'s own slot wrapper is', () => {
    layout(100);
    render(
      <Tabs
        label="Boards"
        items={VIEWS.slice(0, 2)}
        value="t0"
        after={<Tabs label="Inner" items={VIEWS.slice(2, 4)} value="t2" edit={{ onRename: () => undefined }} />}
        end={<span>Count</span>}
      />,
    );
    // 200 tabs + 100 after + 150 end = 450 fits; counting the inner ⋯ (100) too would make 550 and stack.
    expect(screen.getByRole('button', { name: 'Tab actions: Board 3' })).toBeInTheDocument();
    expect(outerBar()).not.toHaveAttribute('data-stacked');
  });

  it('a ⋯ wrapper that mounts later (a tab became enabled) is observed too, so its size changes still recheck the end', () => {
    const seen: Element[] = [];
    vi.stubGlobal('ResizeObserver', class { observe(el: Element) { seen.push(el); } unobserve() {} disconnect() {} });
    try {
      const off = VIEWS.slice(0, 2).map((v) => ({ ...v, isDisabled: true }));
      const { container, rerender } = render(<Tabs label="Boards" items={off} value="t0" edit={{ onRename: () => undefined }} end={<span>Count</span>} />);
      expect(container.querySelector(`.${ts.strip} > .${ts.tabMenu}`)).toBeNull();
      rerender(<Tabs label="Boards" items={VIEWS.slice(0, 2)} value="t0" edit={{ onRename: () => undefined }} end={<span>Count</span>} />);
      const wrapper = container.querySelector(`.${ts.strip} > .${ts.tabMenu}`);
      expect(wrapper).not.toBeNull();
      expect(seen).toContain(wrapper);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('with after set the strip marks itself to hug its tabs (the scroller its natural width); without, it does not', () => {
    const { container, rerender } = render(<Tabs label="Boards" items={VIEWS} value="t0" after={<button type="button">New Board</button>} />);
    expect(container.querySelector(`.${ts.strip}`)).toHaveAttribute('data-hug');
    rerender(<Tabs label="Boards" items={VIEWS} value="t0" before={<button type="button">Boards menu</button>} />);
    expect(container.querySelector(`.${ts.strip}`)).not.toHaveAttribute('data-hug');
  });
});
