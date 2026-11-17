// Vitest: the page re-reads when the person comes back to the tab (a sign-out in another tab shows up), at most once per gap.
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useReloadOnReturn } from './useReloadOnReturn';

const show = () => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('useReloadOnReturn', () => {
  it('reloads when the tab becomes visible or focused, but not twice inside the gap', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    renderHook(() => useReloadOnReturn(reload, 3000));
    act(() => show());
    expect(reload).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(reload).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3500);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(reload).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
  it('stops listening when the page unmounts', () => {
    const reload = vi.fn();
    const { unmount } = renderHook(() => useReloadOnReturn(reload, 0));
    unmount();
    act(() => show());
    expect(reload).not.toHaveBeenCalled();
  });
});
