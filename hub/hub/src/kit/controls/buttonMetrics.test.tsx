// useButtonLabelsWidth's contract. Null until its probe has measured these labels with the
// fonts ready; the widest probe Button, rounded up; again when a Button's box resizes; never a width measured for other
// labels; a value-equal label list measures nothing. jsdom lays nothing out, so a Button's width here is a stub of its
// label length; the real boxes are buttonMetrics.spec.ts.
import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useButtonLabelsWidth, type ButtonLabel, type ButtonLabelsOptions } from './buttonMetrics';

let perChar = 7.3;
let measures = 0;
let observers: Array<{ cb: ResizeObserverCallback; on: boolean; seen: Element[] }> = [];
const wide = (n: number, c = perChar) => Math.ceil(n * c + 30.2);

beforeEach(() => {
  perChar = 7.3;
  measures = 0;
  observers = [];
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.tagName === 'BUTTON') measures++;
    const w = this.tagName === 'BUTTON' ? (this.textContent ?? '').length * perChar + 30.2 : 0;
    return { width: w, height: 0, x: 0, y: 0, top: 0, left: 0, right: w, bottom: 0, toJSON: () => ({}) } as DOMRect;
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      o: { cb: ResizeObserverCallback; on: boolean; seen: Element[] };
      constructor(cb: ResizeObserverCallback) {
        this.o = { cb, on: true, seen: [] };
        observers.push(this.o);
      }
      observe(el: Element) {
        this.o.seen.push(el);
      }
      unobserve() {}
      disconnect() {
        this.o.on = false;
      }
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'fonts');
});

function Probe({ labels, opts, seen, noProbe }: { labels: readonly ButtonLabel[]; opts?: ButtonLabelsOptions; seen: Array<number | null>; noProbe?: boolean }) {
  const { width, probe } = useButtonLabelsWidth(labels, opts);
  seen.push(width);
  return (
    <div>
      <output>{width === null ? 'none' : width}</output>
      {!noProbe && probe}
    </div>
  );
}
const shown = (c: HTMLElement) => c.querySelector('output')!.textContent;
const resize = () => act(() => observers.filter((o) => o.on).forEach((o) => o.cb([], {} as ResizeObserver)));

function fontsStub(status: 'loading' | 'loaded') {
  let settle = () => {};
  const t = new EventTarget() as EventTarget & { status: string; ready: Promise<unknown> };
  t.status = status;
  t.ready = new Promise<void>((res) => (settle = res));
  Object.defineProperty(document, 'fonts', { configurable: true, value: t });
  return { settle };
}

describe('useButtonLabelsWidth', () => {
  it('is null on the first render, then the widest Button rounded up', () => {
    const seen: Array<number | null> = [];
    const { container } = render(<Probe labels={['Open', 'Open display', 'Stop']} seen={seen} />);
    expect(seen[0]).toBeNull();
    expect(shown(container)).toBe(String(wide(12)));
  });

  it('waits for document.fonts.ready before it measures', async () => {
    const { settle } = fontsStub('loading');
    const { container } = render(<Probe labels={['Open display']} seen={[]} />);
    expect(shown(container)).toBe('none');
    expect(measures).toBe(0);
    await act(async () => settle());
    expect(shown(container)).toBe(String(wide(12)));
  });

  it('follows a Button box that resizes later (a font, theme, language or token change), observing every probe Button', () => {
    const { container } = render(<Probe labels={['Open', 'Open display']} seen={[]} />);
    expect(observers.filter((o) => o.on)).toHaveLength(1);
    expect(observers[0]!.seen.map((e) => e.tagName)).toEqual(['BUTTON', 'BUTTON']);
    perChar = 9.1;
    resize();
    expect(shown(container)).toBe(String(wide(12, 9.1)));
  });

  it('never returns a width measured for other labels, and a new array of the same labels measures nothing', () => {
    const seen: Array<number | null> = [];
    const { container, rerender } = render(<Probe labels={['Open', 'Stop']} seen={seen} />);
    const after = measures;
    rerender(<Probe labels={['Open', 'Stop']} opts={{}} seen={seen} />);
    expect(measures).toBe(after);
    const from = seen.length;
    rerender(<Probe labels={['Open', 'Start again now']} seen={seen} />);
    expect(seen.slice(from).every((w) => w === null || w === wide(15))).toBe(true);
    expect(shown(container)).toBe(String(wide(15)));
    // The old labels' observer is gone: a late resize cannot write their width back.
    expect(observers.filter((o) => o.on)).toHaveLength(1);
  });

  it('stays null without its probe rendered, and gives 0 for no labels', () => {
    const a = render(<Probe labels={['Open']} seen={[]} noProbe />);
    expect(shown(a.container)).toBe('none');
    a.unmount();
    const b = render(<Probe labels={[]} seen={[]} />);
    expect(shown(b.container)).toBe('0');
  });

  it('is null again once the probe is removed, and measures again when it comes back', () => {
    const { container, rerender } = render(<Probe labels={['Open display']} seen={[]} />);
    expect(shown(container)).toBe(String(wide(12)));
    rerender(<Probe labels={['Open display']} seen={[]} noProbe />);
    expect(shown(container)).toBe('none');
    expect(observers.filter((o) => o.on)).toHaveLength(0);
    perChar = 9.1;
    rerender(<Probe labels={['Open display']} seen={[]} />);
    expect(shown(container)).toBe(String(wide(12, 9.1)));
  });

  it('measures LinkButtons with link, each probe in its own item', () => {
    const { container } = render(<Probe labels={['Open site', 'Docs']} opts={{ variant: 'row', size: 'sm', link: true }} seen={[]} />);
    const holder = container.querySelector('[data-kit-probe="button-labels"]')!.firstElementChild as HTMLElement;
    expect([...holder.children].map((c) => c.tagName)).toEqual(['SPAN', 'SPAN']);
    expect([...holder.children].map((c) => c.firstElementChild!.tagName)).toEqual(['A', 'A']);
    expect(holder.querySelectorAll('button')).toHaveLength(0);
  });

  it('works under StrictMode (effects run twice)', () => {
    const { container } = render(
      <StrictMode>
        <Probe labels={['Open display']} seen={[]} />
      </StrictMode>,
    );
    expect(shown(container)).toBe(String(wide(12)));
    expect(observers.filter((o) => o.on)).toHaveLength(1);
  });

  it('draws kit Buttons in the look asked inside a hidden, inert holder in the caller tree', () => {
    const { container } = render(
      <Probe
        labels={['Open', { label: 'Restart', busy: true }, { label: 'Open site', iconEnd: 'external' }, { label: 'Find', shortcut: 'Mod+K' }]}
        opts={{ variant: 'row', size: 'sm', className: 'callerCls' }}
        seen={[]}
      />,
    );
    const box = container.querySelector('[data-kit-probe="button-labels"]')!;
    expect(box).toHaveAttribute('aria-hidden', 'true');
    expect([...box.firstElementChild!.children].every((c) => c.tagName === 'SPAN' && c.children.length === 1)).toBe(true);
    const holder = box.firstElementChild as HTMLElement;
    expect(holder.hasAttribute('inert')).toBe(true);
    const buttons = [...holder.querySelectorAll('button')];
    expect(buttons.map((b) => b.getAttribute('data-variant'))).toEqual(['row', 'row', 'row', 'row']);
    expect(buttons.every((b) => b.classList.contains('callerCls') && b.tabIndex === -1)).toBe(true);
    expect(buttons[1]).toHaveAttribute('data-pending', 'true');
    expect(buttons[2]!.querySelectorAll('svg').length).toBeGreaterThan(0);
    expect(buttons[3]!.textContent).toMatch(/K/);
  });
});
