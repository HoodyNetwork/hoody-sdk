// An open InfoTip listens for Escape, Tab and outside presses on the window and the document. Those listeners are added
// when it opens and removed when it closes: a parent that renders again while the tip is open (a live counter, a poll)
// must not take them off and put them back, and what they read (the tip's mode) must still be current afterwards.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { InfoTip } from './InfoTip';

beforeEach(() => {
  boot();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const keydownAdds = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.filter((c: unknown[]) => c[0] === 'keydown' && c[2] === true).length;

describe('InfoTip listeners', () => {
  it('are added once per open, however often the parent renders again', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const ui = (n: number) => (
      <p>
        Tools {n} <InfoTip text="What a tool is." subject="Tools" />
      </p>
    );
    const { rerender } = render(ui(0));
    fireEvent.click(screen.getByRole('button', { name: 'About Tools' }));
    expect(screen.getByRole('button', { name: 'About Tools' }).getAttribute('aria-expanded')).toBe('true');
    const added = keydownAdds(add);
    const removed = keydownAdds(remove);
    expect(added).toBeGreaterThan(0);
    for (let n = 1; n <= 5; n++) rerender(ui(n));
    expect(keydownAdds(add), 'no listener added by a re-render').toBe(added);
    expect(keydownAdds(remove), 'no listener removed by a re-render').toBe(removed);
  });

  it('still close the tip on Escape after re-renders, and hand focus back to the trigger', () => {
    const ui = (n: number) => (
      <p>
        Tools {n} <InfoTip text="What a tool is." subject="Tools" />
      </p>
    );
    const { rerender } = render(ui(0));
    const trigger = screen.getByRole('button', { name: 'About Tools' });
    trigger.focus();
    fireEvent.click(trigger);
    for (let n = 1; n <= 3; n++) rerender(ui(n));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
});
