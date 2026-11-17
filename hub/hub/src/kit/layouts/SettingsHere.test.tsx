// A section-nav jump to a section that already shows whole, or that moves nothing,
// makes the section say "here" for a moment (data-hub-here). A jump to a section out of view (it scrolls there) and a
// deep link landing mark nothing. One section is marked at a time: any later jump ends an earlier mark, and so does
// the page's unmount. Every jump scrolls, so it stops an earlier jump's smooth scroll still on its way.
// The scroller is #hub-main; jsdom has no layout, so its geometry is stubbed.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSectionHere, HERE_MS, scrollSettingsSection, SettingsPage } from './Layouts';

let root: HTMLElement;
let a: HTMLElement;
let b: HTMLElement;

/** #hub-main 600 px tall showing scrollTop..+600 of `height`; each section 200 px tall, its top at `at` in the content. */
function lay({ height, at, scrollTop = 0 }: { height: number; at: Record<string, number>; scrollTop?: number }) {
  Object.defineProperty(root, 'scrollHeight', { configurable: true, value: height });
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: 600 });
  root.scrollTop = scrollTop;
  root.getBoundingClientRect = () => ({ top: 0, bottom: 600, height: 600 }) as DOMRect;
  for (const el of [a, b]) {
    const y = at[el.dataset.section ?? ''] ?? 5000;
    el.getBoundingClientRect = () => ({ top: y - root.scrollTop, bottom: y - root.scrollTop + 200, height: 200 }) as DOMRect;
  }
}

const media = (reduce: boolean) => (q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} });

beforeEach(() => {
  vi.useFakeTimers();
  const { container } = render(
    <div id="hub-main">
      <section data-section="a">A</section>
      <section data-section="b">B</section>
    </div>,
  );
  root = container.querySelector('#hub-main')!;
  [a, b] = [...container.querySelectorAll('section')] as [HTMLElement, HTMLElement];
  root.scrollTo = vi.fn() as unknown as typeof root.scrollTo;
  vi.stubGlobal('matchMedia', media(false));
});

afterEach(() => {
  act(() => void vi.advanceTimersByTime(HERE_MS + 1));
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('section jump that moves nothing, or to a section in view, says "here"', () => {
  it('already at its place (the first section at the top): marks it, then clears', () => {
    lay({ height: 2000, at: { a: 0 } });
    scrollSettingsSection(a, true);
    expect(root.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(a).toHaveAttribute('data-hub-here');
    act(() => void vi.advanceTimersByTime(HERE_MS + 1));
    expect(a).not.toHaveAttribute('data-hub-here');
  });

  it('in view near the end, where the page cannot scroll further: marks it', () => {
    lay({ height: 1000, at: { a: 700 }, scrollTop: 400 });
    scrollSettingsSection(a, true);
    expect(root.scrollTo).toHaveBeenCalledWith({ top: 400, behavior: 'smooth' });
    expect(a).toHaveAttribute('data-hub-here');
  });

  it('shows whole but still scrolls up to its place: marks it as it scrolls', () => {
    lay({ height: 3000, at: { a: 300 } });
    scrollSettingsSection(a, true);
    expect(root.scrollTo).toHaveBeenCalledWith({ top: 300, behavior: 'smooth' });
    expect(a).toHaveAttribute('data-hub-here');
  });

  it('out of view, so the jump scrolls to it: marks nothing, the move is the answer', () => {
    lay({ height: 3000, at: { a: 1200 } });
    scrollSettingsSection(a, true);
    expect(root.scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: 'smooth' });
    expect(a).not.toHaveAttribute('data-hub-here');
  });

  it('a deep link landing (smooth false) marks nothing, even in view', () => {
    lay({ height: 2000, at: { a: 0 } });
    scrollSettingsSection(a, false);
    expect(a).not.toHaveAttribute('data-hub-here');
  });

  it('a second jump to the same section restarts the mark: it stays a full spell after the last one', () => {
    lay({ height: 2000, at: { a: 0 } });
    scrollSettingsSection(a, true);
    act(() => void vi.advanceTimersByTime(HERE_MS - 200));
    scrollSettingsSection(a, true);
    act(() => void vi.advanceTimersByTime(HERE_MS - 200));
    expect(a).toHaveAttribute('data-hub-here');
    act(() => void vi.advanceTimersByTime(201));
    expect(a).not.toHaveAttribute('data-hub-here');
  });

  it('a quick jump to another section in view moves the mark: one section is marked at a time', () => {
    lay({ height: 2000, at: { a: 0, b: 250 } });
    scrollSettingsSection(a, true);
    act(() => void vi.advanceTimersByTime(100));
    scrollSettingsSection(b, true);
    expect(a).not.toHaveAttribute('data-hub-here');
    expect(b).toHaveAttribute('data-hub-here');
    // A's old timer does not end B's mark early.
    act(() => void vi.advanceTimersByTime(HERE_MS - 100));
    expect(b).toHaveAttribute('data-hub-here');
    act(() => void vi.advanceTimersByTime(101));
    expect(b).not.toHaveAttribute('data-hub-here');
  });

  it('a jump to a section out of view ends an earlier mark', () => {
    lay({ height: 3000, at: { a: 0, b: 1500 } });
    scrollSettingsSection(a, true);
    scrollSettingsSection(b, true);
    expect(a).not.toHaveAttribute('data-hub-here');
    expect(b).not.toHaveAttribute('data-hub-here');
  });

  it('a jump while an earlier smooth scroll is on its way still scrolls: it replaces that scroll', () => {
    // Mid-way from 0 toward B (at 1200): A's goal is where the page is now, so nothing moves, but the earlier scroll stops.
    lay({ height: 3000, at: { a: 400, b: 1200 }, scrollTop: 400 });
    scrollSettingsSection(a, true);
    expect(root.scrollTo).toHaveBeenLastCalledWith({ top: 400, behavior: 'smooth' });
  });

  it('reduced motion still says "here" (the style shows it without motion), with an instant scroll', () => {
    vi.stubGlobal('matchMedia', media(true));
    lay({ height: 2000, at: { a: 0 } });
    scrollSettingsSection(a, true);
    expect(root.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    expect(a).toHaveAttribute('data-hub-here');
  });
});

describe('SettingsPage ends its mark when it unmounts', () => {
  it('the marked section leaves with the page and no mark or timer is left behind', async () => {
    const sections = [{ id: 'one', title: 'One', content: <p>one</p> }, { id: 'two', title: 'Two', content: <p>two</p> }];
    const router = createRouter({ routeTree: createRootRoute({ component: () => <SettingsPage header={{ title: 'T' }} sections={sections} /> }), history: createMemoryHistory({ initialEntries: ['/'] }) });
    const page = render(<RouterProvider router={router} />, { container: root });
    await act(async () => {
      await router.load();
    });
    const one = root.querySelector<HTMLElement>('[data-section="one"]')!;
    one.getBoundingClientRect = () => ({ top: 0, bottom: 200, height: 200 }) as DOMRect;
    Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 600 });
    Object.defineProperty(root, 'clientHeight', { configurable: true, value: 600 });
    act(() => screen.getByRole('button', { name: 'One' }).click());
    expect(one).toHaveAttribute('data-hub-here');
    const cleared = vi.spyOn(window, 'clearTimeout');
    page.unmount();
    expect(one).not.toHaveAttribute('data-hub-here');
    expect(cleared).toHaveBeenCalled();
  });
});

describe('a stray mark after the environment is gone', () => {
  it('its timer ends it without the window (a torn-down test file) and throws nothing', () => {
    lay({ height: 2000, at: { a: 0 } });
    scrollSettingsSection(a, true);
    expect(a).toHaveAttribute('data-hub-here');
    vi.stubGlobal('window', undefined);
    try {
      expect(() => vi.advanceTimersByTime(HERE_MS + 1)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(a).not.toHaveAttribute('data-hub-here');
  });

  it('clearing it without the window (a page unmounting during teardown) throws nothing and ends it', () => {
    lay({ height: 2000, at: { a: 0 } });
    scrollSettingsSection(a, true);
    expect(a).toHaveAttribute('data-hub-here');
    vi.stubGlobal('window', undefined);
    try {
      expect(() => clearSectionHere(root)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(a).not.toHaveAttribute('data-hub-here');
  });
});
