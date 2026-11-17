// Vitest: a flow wizard's step transition brings the new step's focus target into view in the page scroller (#hub-main
// only, never the shell grid), so a person who advanced from the stuck footer of a long, scrolled step is not left with
// focus above the window. A target already in view moves nothing. jsdom has no layout: the boxes are stubbed.
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WizardFooter, WizardPage } from './Layouts';

const steps = [
  { id: 'a', label: 'One' },
  { id: 'b', label: 'Two' },
];

function Flow({ current }: { current: number }) {
  return (
    <WizardPage variant="flow" header={{ title: 'New script' }} steps={steps} current={current} footer={<WizardFooter primary={<button type="button">Next</button>} />}>
      {current === 0 ? <input aria-label="First" /> : <input aria-label="Second" data-testid="second" />}
    </WizardPage>
  );
}

const rect = (top: number, height: number) => ({ top, bottom: top + height, left: 0, right: 100, width: 100, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

function mainScroller(scrollTop: number) {
  const main = document.createElement('div');
  main.id = 'hub-main';
  document.body.appendChild(main);
  Object.defineProperty(main, 'scrollTop', { value: scrollTop, configurable: true });
  Object.defineProperty(main, 'scrollHeight', { value: 5000, configurable: true });
  Object.defineProperty(main, 'clientHeight', { value: 800, configurable: true });
  main.getBoundingClientRect = () => rect(60, 800);
  const scrollTo = vi.fn();
  main.scrollTo = scrollTo as unknown as typeof main.scrollTo;
  return { main, scrollTo };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.getElementById('hub-main')?.remove();
});

describe('wizard_flow_transition_reveals_focus', () => {
  it('a target above the window after advancing from a scrolled step is scrolled into view in #hub-main', () => {
    const { main, scrollTo } = mainScroller(1500);
    const { rerender, getByTestId } = render(<Flow current={0} />, { container: main.appendChild(document.createElement('div')) });
    const proto = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('data-testid') === 'second' ? rect(-1200, 40) : proto.call(this);
    });
    act(() => rerender(<Flow current={1} />));
    expect(document.activeElement).toBe(getByTestId('second'));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    const top = (scrollTo.mock.calls[0]![0] as ScrollToOptions).top!;
    // The field's top lands at the scroller's top: 1500 + (-1200 - 60).
    expect(top).toBe(240);
  });

  it('a target already in view scrolls nothing', () => {
    const { main, scrollTo } = mainScroller(0);
    const { rerender } = render(<Flow current={0} />, { container: main.appendChild(document.createElement('div')) });
    const proto = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('data-testid') === 'second' ? rect(300, 40) : proto.call(this);
    });
    act(() => rerender(<Flow current={1} />));
    expect(scrollTo).not.toHaveBeenCalled();
  });
  it('a target under the strip the scroller keeps clear at its end (the phone bar) is scrolled above it', () => {
    const { main, scrollTo } = mainScroller(0);
    const { rerender } = render(<Flow current={0} />, { container: main.appendChild(document.createElement('div')) });
    const proto = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      // The scroller shows 60..860; its last 72 px lie under the phone bar. The field sits at 800..840: inside the box, under the bar.
      return this.getAttribute('data-testid') === 'second' ? rect(800, 40) : proto.call(this);
    });
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
      const cs = real(el, pseudo);
      return el === main ? (new Proxy(cs, { get: (t, k) => (k === 'scrollPaddingBlockEnd' ? '72px' : k === 'scrollPaddingBlockStart' ? '0px' : Reflect.get(t, k)) }) as CSSStyleDeclaration) : cs;
    });
    act(() => rerender(<Flow current={1} />));
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});
