// The Ask switch: on by default, so open() takes the draft with no fixture override. The off case (open() and
// toggle() do nothing, the dock stays shut) runs only if the switch goes off again; the fixture-only override can turn
// Ask on, never off.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ASK_ENABLED, setAskForFixtures, useAskDock } from '@kit/ask';

afterEach(() => setAskForFixtures(false));

describe('Ask switch', () => {
  it('on: with the fixture override off, open takes the draft and opens the dock', () => {
    expect(ASK_ENABLED).toBe(true);
    setAskForFixtures(false);
    const { result } = renderHook(() => useAskDock());
    act(() => result.current.open({ text: 'hello', source: 'home' }));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.takeDraft()).toEqual({ text: 'hello', source: 'home' });
    act(() => result.current.close());
  });
  it.skipIf(ASK_ENABLED)('off: open and toggle leave the dock closed and keep no draft', () => {
    const { result } = renderHook(() => useAskDock());
    act(() => result.current.open({ text: 'hello', source: 'home' }));
    expect(result.current.isOpen).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.takeDraft()).toBeUndefined();
  });
  it('fixture override on: open takes the draft and opens the dock', () => {
    setAskForFixtures(true);
    const { result } = renderHook(() => useAskDock());
    act(() => result.current.open({ text: 'hello', source: 'home' }));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.takeDraft()).toEqual({ text: 'hello', source: 'home' });
    act(() => result.current.close());
  });
});
