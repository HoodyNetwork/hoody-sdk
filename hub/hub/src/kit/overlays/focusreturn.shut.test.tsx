// useFocusReturn never gives focus back to an invoker that is
// inert, hidden or aria-hidden by then, a place a keyboard or screen reader user cannot be. Such an invoker is
// treated as gone (the fallback, else the page title), except under inert or aria-hidden at an early check: that may
// be the closing overlay's own, lifted when it goes, so it waits for a later check. Focus the overlay's own restore
// left on a shut invoker is moved the same way. Focus the person placed elsewhere is still kept.
import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFocusReturn } from './shared';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

/** A button inside its own box (so the box can be shut), and the page title the return falls back to. */
function setup() {
  const box = document.createElement('div');
  const invoker = document.createElement('button');
  box.append(invoker);
  const title = document.createElement('h1');
  title.tabIndex = -1;
  title.setAttribute('data-hub-title', '');
  document.body.append(box, title);
  return { box, invoker, title };
}

/** Opens the hook with focus on `invoker`, drops focus to <body>, then shuts the invoker's box and closes. */
function openShutClose(invoker: HTMLElement, shutIt: () => void, fallback?: () => HTMLElement | null) {
  invoker.focus();
  const hook = renderHook(({ open }) => useFocusReturn(open, fallback), { initialProps: { open: true } });
  invoker.blur();
  shutIt();
  hook.rerender({ open: false });
  return hook;
}

describe('focus return never lands on a shut invoker', () => {
  for (const [name, shutIt] of [
    ['hidden', (box: HTMLElement) => box.setAttribute('hidden', '')],
    ['visibility: hidden', (box: HTMLElement) => (box.style.visibility = 'hidden')],
  ] as const) {
    it(`a ${name} invoker is treated as gone at once: the page title gets focus`, () => {
      vi.useFakeTimers();
      const { box, invoker, title } = setup();
      const hook = openShutClose(invoker, () => shutIt(box));
      vi.advanceTimersByTime(0);
      expect(document.activeElement).toBe(title);
      hook.unmount();
    });
  }

  it('a shut invoker goes to the fallback when there is one', () => {
    vi.useFakeTimers();
    const { box, invoker } = setup();
    const next = document.createElement('button');
    document.body.append(next);
    const hook = openShutClose(invoker, () => box.setAttribute('hidden', ''), () => next);
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(next);
    hook.unmount();
  });

  for (const attr of ['inert', 'aria-hidden'] as const) {
    it(`an invoker under ${attr} waits, and gets focus once it is lifted`, () => {
      vi.useFakeTimers();
      const { box, invoker } = setup();
      const hook = openShutClose(invoker, () => box.setAttribute(attr, attr === 'inert' ? '' : 'true'));
      vi.advanceTimersByTime(0);
      expect(document.activeElement, 'not focused while shut').toBe(document.body);
      box.removeAttribute(attr);
      vi.advanceTimersByTime(300);
      expect(document.activeElement).toBe(invoker);
      hook.unmount();
    });

    it(`an invoker still under ${attr} at the last check is treated as gone`, () => {
      vi.useFakeTimers();
      const { box, invoker, title } = setup();
      const hook = openShutClose(invoker, () => box.setAttribute(attr, attr === 'inert' ? '' : 'true'));
      vi.advanceTimersByTime(300);
      expect(document.activeElement).toBe(document.body);
      vi.advanceTimersByTime(500);
      expect(document.activeElement).toBe(title);
      hook.unmount();
    });
  }

  it("focus the overlay's restore left on an aria-hidden invoker is moved at the last check", () => {
    vi.useFakeTimers();
    const { box, invoker, title } = setup();
    invoker.focus();
    const hook = renderHook(({ open }) => useFocusReturn(open), { initialProps: { open: true } });
    box.setAttribute('aria-hidden', 'true');
    hook.rerender({ open: false });
    expect(document.activeElement, 'the restore put focus on the invoker').toBe(invoker);
    vi.advanceTimersByTime(300);
    expect(document.activeElement, 'early: it may be the closing overlay that hides it').toBe(invoker);
    vi.advanceTimersByTime(500);
    expect(document.activeElement).toBe(title);
    hook.unmount();
  });

  it('an invoker that refuses focus (display: none in a browser) is treated as gone', () => {
    vi.useFakeTimers();
    const { invoker, title } = setup();
    const hook = openShutClose(invoker, () => vi.spyOn(invoker, 'focus').mockImplementation(() => undefined));
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(title);
    hook.unmount();
  });

  it('an open invoker is focused as before, and focus already on it stays', () => {
    vi.useFakeTimers();
    const { invoker } = setup();
    const hook = openShutClose(invoker, () => undefined);
    vi.advanceTimersByTime(1000);
    expect(document.activeElement).toBe(invoker);
    hook.unmount();
  });

  it('focus the person placed elsewhere is kept, even with a shut invoker', () => {
    vi.useFakeTimers();
    const { box, invoker } = setup();
    const other = document.createElement('button');
    document.body.append(other);
    const hook = openShutClose(invoker, () => box.setAttribute('hidden', ''));
    other.focus();
    vi.advanceTimersByTime(1000);
    expect(document.activeElement).toBe(other);
    hook.unmount();
  });

  it('unmounted while open: a hidden invoker is treated as gone too', () => {
    vi.useFakeTimers();
    const { box, invoker, title } = setup();
    invoker.focus();
    const hook = renderHook(({ open }) => useFocusReturn(open), { initialProps: { open: true } });
    invoker.blur();
    box.setAttribute('hidden', '');
    hook.unmount();
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(title);
  });
});

// The rescue of focus on a shut invoker is for the overlay's own restore only. A person who
// goes back to it (an aria-hidden button is still keyboard focusable) keeps it, and so does a preferred placement.
describe('focus the person puts on a shut invoker is theirs', () => {
  it('Tab back to an aria-hidden invoker before the last check: focus stays there', () => {
    vi.useFakeTimers();
    const { box, invoker } = setup();
    const hook = openShutClose(invoker, () => box.setAttribute('aria-hidden', 'true'));
    vi.advanceTimersByTime(300);
    fireEvent.keyDown(document.body, { key: 'Tab' });
    invoker.focus();
    vi.advanceTimersByTime(500);
    expect(document.activeElement).toBe(invoker);
    hook.unmount();
  });

  it('a pointer press counts as well', () => {
    vi.useFakeTimers();
    const { box, invoker } = setup();
    const hook = openShutClose(invoker, () => box.setAttribute('aria-hidden', 'true'));
    fireEvent.pointerDown(invoker);
    invoker.focus();
    vi.advanceTimersByTime(1000);
    expect(document.activeElement).toBe(invoker);
    hook.unmount();
  });

  it('after the preferred target took focus, going back to a shut invoker is kept', () => {
    vi.useFakeTimers();
    const { box, invoker } = setup();
    const heading = document.createElement('h2');
    heading.tabIndex = -1;
    document.body.append(heading);
    vi.spyOn(heading, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    invoker.focus();
    const hook = renderHook(({ open }) => useFocusReturn(open, undefined, () => heading), { initialProps: { open: true } });
    invoker.blur();
    box.setAttribute('aria-hidden', 'true');
    hook.rerender({ open: false });
    vi.advanceTimersByTime(0);
    expect(document.activeElement, 'the preferred heading took focus').toBe(heading);
    invoker.focus(); // programmatic, no key or pointer press: still the person's after a placement
    vi.advanceTimersByTime(1000);
    expect(document.activeElement).toBe(invoker);
    hook.unmount();
  });

  it('the key and pointer listeners are gone after the last check and after a cancel', () => {
    vi.useFakeTimers();
    const remove = vi.spyOn(document, 'removeEventListener');
    const { invoker } = setup();
    const hook = openShutClose(invoker, () => undefined);
    vi.advanceTimersByTime(1000);
    expect(remove.mock.calls.filter(([type]) => type === 'keydown' || type === 'pointerdown')).toHaveLength(2);
    hook.rerender({ open: true });
    hook.rerender({ open: false });
    remove.mockClear();
    hook.rerender({ open: true }); // reopened before the checks ran: they are cancelled
    expect(remove.mock.calls.filter(([type]) => type === 'keydown' || type === 'pointerdown')).toHaveLength(2);
    hook.unmount();
  });
});
