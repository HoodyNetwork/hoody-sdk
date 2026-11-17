// Focus return after an overlay closes, with a preferred target. AI Connect's Claude Code tile closes
// the drawer and jumps to its section: the return to the header's Connect scrolled the page back to its top, or left
// focus above the view. `prefer()` sends focus to the section's heading instead, without a scroll; without it (or
// when its target cannot take focus) the return is exactly as before: the invoker with a plain focus().
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFocusReturn } from './shared';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

/** A button that had focus when the overlay opened. */
function makeInvoker() {
  const invoker = document.createElement('button');
  document.body.append(invoker);
  return invoker;
}

/** A section heading as SettingsPage draws it: programmatic focus only (tabindex -1); jsdom draws no boxes, so one is given. */
function makeHeading(parent: HTMLElement = document.body) {
  const h = document.createElement('h2');
  h.tabIndex = -1;
  parent.append(h);
  vi.spyOn(h, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  return h;
}

/** Opens the hook with focus on `invoker`, then drops focus to <body> and closes it, as a drawer's unmount does. */
function openThenClose(invoker: HTMLElement, prefer?: () => HTMLElement | null, fallback?: () => HTMLElement | null) {
  invoker.focus();
  const hook = renderHook(({ open }) => useFocusReturn(open, fallback, prefer), { initialProps: { open: true } });
  invoker.blur();
  hook.rerender({ open: false });
  return hook;
}

describe('focus return with a preferred target', () => {
  it('without prefer, the invoker gets a plain focus, as before', () => {
    vi.useFakeTimers();
    const invoker = makeInvoker();
    const focus = vi.spyOn(invoker, 'focus');
    const hook = openThenClose(invoker);
    focus.mockClear();
    vi.advanceTimersByTime(0);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith();
    hook.unmount();
  });

  it('a preferred heading wins over the invoker and is focused without a scroll', () => {
    vi.useFakeTimers();
    const invoker = makeInvoker();
    const heading = makeHeading();
    const toHeading = vi.spyOn(heading, 'focus');
    const hook = openThenClose(invoker, () => heading);
    vi.advanceTimersByTime(1000);
    expect(toHeading).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(heading);
    hook.unmount();
  });

  it('wins also where the overlay itself already put focus back on the invoker', () => {
    vi.useFakeTimers();
    const invoker = makeInvoker();
    const heading = makeHeading();
    const hook = openThenClose(invoker, () => heading);
    invoker.focus();
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(heading);
    hook.unmount();
  });

  it('keeps focus the person placed elsewhere', () => {
    vi.useFakeTimers();
    const invoker = makeInvoker();
    const heading = makeHeading();
    const other = makeInvoker();
    const hook = openThenClose(invoker, () => heading);
    other.focus();
    vi.advanceTimersByTime(1000);
    expect(document.activeElement).toBe(other);
    hook.unmount();
  });

  it('once the heading took focus, a later check never moves focus back to it', () => {
    vi.useFakeTimers();
    const invoker = makeInvoker();
    const heading = makeHeading();
    const hook = openThenClose(invoker, () => heading);
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(heading);
    invoker.focus(); // the person goes back to Connect on purpose
    vi.advanceTimersByTime(1000);
    expect(document.activeElement).toBe(invoker);
    hook.unmount();
  });

  it('a target hidden by visibility, or one that refuses focus, leaves the return to the invoker', () => {
    vi.useFakeTimers();
    for (const spoil of [(h: HTMLElement) => (h.style.visibility = 'hidden'), (h: HTMLElement) => vi.spyOn(h, 'focus').mockImplementation(() => undefined)]) {
      const invoker = makeInvoker();
      const heading = makeHeading();
      spoil(heading);
      const hook = openThenClose(invoker, () => heading);
      vi.advanceTimersByTime(0);
      expect(document.activeElement).toBe(invoker);
      hook.unmount();
      document.body.replaceChildren();
    }
  });

  it('an absent, detached or non-programmatic target leaves the return to the invoker', () => {
    vi.useFakeTimers();
    for (const make of [() => null, () => document.createElement('h2'), () => document.body.appendChild(document.createElement('h2'))]) {
      const invoker = makeInvoker();
      const target = make();
      const hook = openThenClose(invoker, () => target);
      vi.advanceTimersByTime(0);
      expect(document.activeElement).toBe(invoker);
      hook.unmount();
      document.body.replaceChildren();
    }
  });

  it('a target in a hidden subtree leaves the return to the invoker at once', () => {
    vi.useFakeTimers();
    const invoker = makeInvoker();
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    document.body.append(box);
    const heading = makeHeading(box);
    const hook = openThenClose(invoker, () => heading);
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(invoker);
    hook.unmount();
  });

  it('a target still under the closing overlay\'s inert waits, and takes focus once it is free', () => {
    vi.useFakeTimers();
    const invoker = makeInvoker();
    const page = document.createElement('div');
    page.setAttribute('inert', '');
    document.body.append(page);
    const heading = makeHeading(page);
    const hook = openThenClose(invoker, () => heading);
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(document.body);
    page.removeAttribute('inert');
    vi.advanceTimersByTime(300);
    expect(document.activeElement).toBe(heading);
    hook.unmount();
  });

  it('a target still inert at the last check leaves the return to the invoker', () => {
    vi.useFakeTimers();
    const invoker = makeInvoker();
    const page = document.createElement('div');
    page.setAttribute('inert', '');
    document.body.append(page);
    const heading = makeHeading(page);
    const hook = openThenClose(invoker, () => heading);
    vi.advanceTimersByTime(300);
    expect(document.activeElement).toBe(document.body);
    vi.advanceTimersByTime(500);
    expect(document.activeElement).toBe(invoker);
    hook.unmount();
  });
});
