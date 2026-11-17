// An overlay unmounted while open leaves its focus-return checks running on purpose (its own focus restore lands
// after it is gone), up to the last RETURN_CHECKS_MS. When the page's environment is torn down first (a test file
// ending, the document gone), a late check does nothing: it never throws "document is not defined" into whatever
// runs next.
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFocusReturn } from './shared';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('focus return after teardown', () => {
  it('a check that fires after the document is gone does nothing', () => {
    vi.useFakeTimers();
    const hook = renderHook(({ open }) => useFocusReturn(open), { initialProps: { open: true } });
    hook.unmount();
    vi.stubGlobal('document', undefined);
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
  });

  it('a check after a close whose document is gone does nothing either', () => {
    vi.useFakeTimers();
    const hook = renderHook(({ open }) => useFocusReturn(open), { initialProps: { open: true } });
    hook.rerender({ open: false });
    vi.stubGlobal('document', undefined);
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    hook.unmount();
  });
});
