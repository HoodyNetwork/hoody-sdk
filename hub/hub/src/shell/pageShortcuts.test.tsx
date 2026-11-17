// usePageShortcuts: a page declares its keys once. They fire only when no dialog,
// alertdialog or menu is open, nothing is being typed, no modifier is held and nothing earlier took
// the key; the `?` sheet and the palette list the ones that apply now.
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCurrentPageShortcuts, usePageShortcuts } from './pageShortcuts';

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('usePageShortcuts', () => {
  it('runs the declared key and claims it', () => {
    const run = vi.fn();
    renderHook(() => usePageShortcuts([{ key: 'n', label: 'New', run }]));
    const e = press('n');
    expect(run).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('never fires while a dialog, alertdialog or menu is open (the guide j/k case)', () => {
    const run = vi.fn();
    renderHook(() => usePageShortcuts([{ key: 'j', label: 'Next section', run }]));
    for (const role of ['dialog', 'alertdialog', 'menu']) {
      const el = document.createElement('div');
      el.setAttribute('role', role);
      document.body.append(el);
      press('j');
      el.remove();
    }
    expect(run).not.toHaveBeenCalled();
    press('j');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('never fires while typing, with a modifier, or when something earlier took the key', () => {
    const run = vi.fn();
    renderHook(() => usePageShortcuts([{ key: 'n', label: 'New', run }]));
    const input = document.createElement('input');
    document.body.append(input);
    press('n', {}, input);
    press('n', { metaKey: true });
    press('n', { ctrlKey: true });
    press('n', { altKey: true });
    const taken = new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true });
    taken.preventDefault();
    act(() => {
      document.body.dispatchEvent(taken);
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('a disabled key does nothing and is not listed; the list follows the page', () => {
    const run = vi.fn();
    const { rerender, unmount } = renderHook(({ on }) => usePageShortcuts([
      { key: 'n', label: 'New', run, enabled: on },
      { key: 'r', label: 'Reload', run: () => {} },
    ]), { initialProps: { on: false } });
    const listed = renderHook(() => useCurrentPageShortcuts());
    press('n');
    expect(run).not.toHaveBeenCalled();
    expect(listed.result.current.map((s) => s.key)).toEqual(['r']);
    rerender({ on: true });
    expect(listed.result.current.map((s) => s.key)).toEqual(['n', 'r']);
    unmount();
    expect(listed.result.current).toEqual([]);
  });

  it('uses the latest handler without re-declaring', () => {
    const seen: string[] = [];
    function Page({ v }: { v: string }) {
      usePageShortcuts([{ key: 'x', label: 'Export', run: () => seen.push(v) }]);
      return <p>{v}</p>;
    }
    const { rerender } = render(<Page v="a" />);
    rerender(<Page v="b" />);
    expect(screen.getByText('b')).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'x' });
    expect(seen).toEqual(['b']);
  });
});

describe('runPageShortcut (the palette action)', () => {
  it('runs the page key with its latest handler, and nothing for a disabled or unknown key', async () => {
    const { runPageShortcut } = await import('./pageShortcuts');
    const seen: string[] = [];
    function Page({ v, on }: { v: string; on: boolean }) {
      usePageShortcuts([{ key: 'x', label: 'Export', run: () => seen.push(v), enabled: on }]);
      return null;
    }
    const { rerender } = render(<Page v="a" on />);
    rerender(<Page v="b" on />);
    act(() => runPageShortcut('x'));
    rerender(<Page v="c" on={false} />);
    act(() => runPageShortcut('x'));
    act(() => runPageShortcut('q'));
    expect(seen).toEqual(['b']);
  });
});
