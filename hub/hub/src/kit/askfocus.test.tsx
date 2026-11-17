// Vitest: AskDock.focus() (Home's quick ask, page entry points) puts focus in the dock even
// when the panel cannot focus itself (a loading or error panel has no gate card or composer): its first drawn,
// enabled control, never a disabled one or the resize grip; the panel's own focus wins when it has one.
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAskFocus, setAskForFixtures, useAskDock } from './ask';

beforeEach(() => {
  setAskForFixtures(true);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 1; });
  // happy-dom lays nothing out: every element counts as drawn unless a test marks it data-hidden (no boxes, as a
  // hidden element has).
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return (this.hasAttribute('data-hidden') ? [] : [{}]) as unknown as DOMRectList;
  });
});
afterEach(() => {
  setAskFocus(null);
  renderHook(() => useAskDock()).result.current.close();
  setAskForFixtures(false);
  vi.restoreAllMocks();
  cleanup();
});

function dockWith() {
  const r = render(
    <section data-hub-dock="" aria-label="Agent">
      <button type="button" disabled>Send</button>
      <button type="button">Try again</button>
    </section>,
  );
  // The resize grip, as the shell draws it (a focusable separator), first in the dock.
  const grip = document.createElement('div');
  grip.setAttribute('role', 'separator');
  grip.setAttribute('tabindex', '0');
  grip.setAttribute('aria-label', 'Resize');
  r.container.querySelector('[data-hub-dock]')?.prepend(grip);
  return r;
}

describe('AskDock.focus', () => {
  it('a panel that cannot focus itself: the dock\'s first enabled control takes focus', () => {
    dockWith();
    setAskFocus(() => false);
    renderHook(() => useAskDock()).result.current.focus();
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus();
  });
  it('no panel registered yet: the same first control', () => {
    dockWith();
    renderHook(() => useAskDock()).result.current.focus();
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus();
  });
  it('a disabled control with a tabindex is skipped too', () => {
    render(
      <section data-hub-dock="" aria-label="Agent">
        <button type="button" disabled tabIndex={0}>Send</button>
        <button type="button">Try again</button>
      </section>,
    );
    setAskFocus(() => false);
    renderHook(() => useAskDock()).result.current.focus();
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus();
  });
  it('a disabled control carrying an href is skipped too', () => {
    render(
      <section data-hub-dock="" aria-label="Agent">
        <button type="button" disabled tabIndex={0}>Send</button>
        <button type="button">Try again</button>
      </section>,
    );
    // Nonconforming markup an [href] alternative in the selector would let through; a button's props have no href, so set it here.
    screen.getByRole('button', { name: 'Send' }).setAttribute('href', '#x');
    setAskFocus(() => false);
    renderHook(() => useAskDock()).result.current.focus();
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus();
  });
  it('a control that is not drawn (hidden on this layout) is skipped', () => {
    render(
      <section data-hub-dock="" aria-label="Agent">
        <button type="button" data-hidden="">Wide only</button>
        <button type="button">Try again</button>
      </section>,
    );
    // Not drawn: no boxes and no offset parent (happy-dom has no layout and its offsetParent is never null, so the test says so for this one).
    Object.defineProperty(screen.getByRole('button', { name: 'Wide only' }), 'offsetParent', { value: null });
    setAskFocus(() => false);
    renderHook(() => useAskDock()).result.current.focus();
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus();
  });
  it('a panel that can focus itself keeps its own focus', () => {
    dockWith();
    const own = document.createElement('textarea');
    document.body.append(own);
    setAskFocus(() => { own.focus(); return true; });
    renderHook(() => useAskDock()).result.current.focus();
    expect(own).toHaveFocus();
    own.remove();
  });
});
