// A test file's jsdom teardown removes HTMLElement as well as document. The focus-return checks an
// overlay unmounted while open leaves running (teardown.test.tsx) would throw "HTMLElement is not defined" from the
// prefer step, an unhandled error vitest reports in whatever file runs next. A late check does nothing without
// either global.
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFocusReturn } from './shared';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('focus return after a jsdom teardown (no document, no HTMLElement)', () => {
  it('a check of an overlay unmounted while open does nothing', () => {
    vi.useFakeTimers();
    const hook = renderHook(({ open }) => useFocusReturn(open, undefined, () => null), { initialProps: { open: true } });
    hook.unmount();
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('HTMLElement', undefined);
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
  });

  it('a check after a close does nothing either', () => {
    vi.useFakeTimers();
    const hook = renderHook(({ open }) => useFocusReturn(open), { initialProps: { open: true } });
    hook.rerender({ open: false });
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('HTMLElement', undefined);
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    hook.unmount();
  });
});
