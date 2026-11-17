// The first-key mark (kit/overlays/firstKey.ts): set at install, lifted by the first keydown even when a handler stops
// the key, never by a pointer press, and set once. What it draws is in firstkey.spec.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIRST_KEY_ATTR, installFirstKeyMark } from './firstKey';

const marked = () => document.documentElement.hasAttribute(FIRST_KEY_ATTR);
const key = (at: EventTarget) => at.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true, cancelable: true }));

afterEach(() => {
  key(window);
  document.documentElement.removeAttribute(FIRST_KEY_ATTR);
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('installFirstKeyMark', () => {
  it('marks the root until the first keydown', () => {
    installFirstKeyMark();
    expect(marked()).toBe(true);
    key(document.body);
    expect(marked()).toBe(false);
  });
  it('sees a key that a handler stops', () => {
    installFirstKeyMark();
    const el = document.body.appendChild(document.createElement('input'));
    el.addEventListener('keydown', (e) => e.stopPropagation());
    document.addEventListener('keydown', (e) => e.stopImmediatePropagation(), { capture: true, once: true });
    key(el);
    expect(marked()).toBe(false);
  });
  it('is not lifted by a pointer press or a click', () => {
    installFirstKeyMark();
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.body.click();
    expect(marked()).toBe(true);
  });
  it('removes its listener after the first key', () => {
    const remove = vi.spyOn(document.documentElement, 'removeAttribute');
    installFirstKeyMark();
    key(document.body);
    key(document.body);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
