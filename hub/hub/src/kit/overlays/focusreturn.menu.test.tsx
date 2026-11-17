// Focus return after an overlay opened from a menu item (traymenu.spec "an opens item"). The item had focus
// when the overlay opened and goes with the menu; React Aria's own return to the menu's trigger waits a frame, so the
// first check found focus lost and sent it to the page title. The invoker is the menu's trigger instead (the element whose
// aria-controls names the open menu): focus comes back to it, as the menu's own close gives it.
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFocusReturn } from './shared';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

/** A page title, a menu trigger and its open menu with one item, as React Aria draws them. */
function makeMenu(controls = 'm1') {
  const title = document.createElement('h1');
  title.tabIndex = -1;
  title.setAttribute('data-hub-title', '');
  const trigger = document.createElement('button');
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'true');
  trigger.setAttribute('aria-controls', controls);
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  menu.id = 'm1';
  const item = document.createElement('div');
  item.setAttribute('role', 'menuitem');
  item.tabIndex = -1;
  menu.append(item);
  document.body.append(title, trigger, menu);
  return { title, trigger, menu, item };
}

/** Opens the hook with focus on the menu item (the choice opens the overlay), then the menu goes and the overlay closes. */
function chooseThenClose(m: ReturnType<typeof makeMenu>) {
  m.item.focus();
  const hook = renderHook(({ open }) => useFocusReturn(open), { initialProps: { open: true } });
  m.menu.remove();
  m.trigger.removeAttribute('aria-controls');
  m.trigger.setAttribute('aria-expanded', 'false');
  hook.rerender({ open: false });
  return hook;
}

describe('focus return for an overlay opened from a menu item', () => {
  it('returns focus to the menu trigger, never the page title, before the frame React Aria restores on', () => {
    vi.useFakeTimers();
    const m = makeMenu();
    const hook = chooseThenClose(m);
    expect(document.activeElement, 'focus is lost with the menu gone').toBe(document.body);
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(m.trigger);
    vi.advanceTimersByTime(1000);
    expect(document.activeElement).toBe(m.trigger);
    hook.unmount();
  });

  it('keeps the menu trigger where React Aria already put focus back', () => {
    vi.useFakeTimers();
    const m = makeMenu();
    const hook = chooseThenClose(m);
    m.trigger.focus();
    vi.advanceTimersByTime(1000);
    expect(document.activeElement).toBe(m.trigger);
    hook.unmount();
  });

  it('control: a menu no trigger names leaves the item as the invoker, and its loss sends focus to the page title', () => {
    vi.useFakeTimers();
    const m = makeMenu('other');
    const hook = chooseThenClose(m);
    vi.advanceTimersByTime(1000);
    expect(document.activeElement).toBe(m.title);
    hook.unmount();
  });
});
