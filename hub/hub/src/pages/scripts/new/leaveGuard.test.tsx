// Vitest: the New script draft's switch guard on the real core. While the draft holds
// something a reload cannot bring back, a user-started realm switch asks (core realm.ts → askLeave) and names it; a clean
// draft asks nothing; once the draft unmounts its guard is gone and nothing asks.
import { setLeaveAsker, switchLosses } from '@core';
import { switchTo } from '@core/realm';
import { realm as selected } from '@core/ctx';
import { boot, onFetch, R1, R2 } from '@core/test/env';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newDraft, type Draft } from './draft';
import { useDraftSwitchGuard } from './leaveGuard';

const ID = 'abcde12345';
const offs: Array<() => void> = [];
afterEach(() => { while (offs.length) offs.pop()!(); });
function asker(answer: boolean) {
  const fn = vi.fn((_n: number) => Promise.resolve(answer));
  offs.push(setLeaveAsker(fn));
  return fn;
}
const typed = (): Draft => ({ ...newDraft(ID, 'write'), description: 'post the build log' });

describe('the New script draft before a realm switch or sign-out', () => {
  it('a dirty draft names what it loses, and the realm switch asks; Stay keeps the realm', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    const ask = asker(false);
    const h = renderHook(({ d }) => useDraftSwitchGuard(d, null), { initialProps: { d: typed() } });
    expect(switchLosses()).toEqual(["Leave New script? Your changes here aren't kept: what you typed."]);
    expect(await switchTo(R2)).toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(selected()).toBe(R1);
    h.unmount();
  });

  it('the guard reads the draft as it is when asked: edited code is named too', () => {
    boot({ realm: R1 });
    const h = renderHook(({ d }) => useDraftSwitchGuard(d, null), { initialProps: { d: newDraft(ID, 'write') } });
    expect(switchLosses()).toEqual([]);
    h.rerender({ d: { ...typed(), codeEdited: true } });
    expect(switchLosses()).toEqual(["Leave New script? Your changes here aren't kept: what you typed, the edited code."]);
    h.unmount();
  });

  it('a clean draft (or none) asks nothing: the switch goes straight through', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    const ask = asker(false);
    const a = renderHook(() => useDraftSwitchGuard(newDraft(ID, 'write'), null));
    const b = renderHook(() => useDraftSwitchGuard(null, null));
    expect(switchLosses()).toEqual([]);
    expect(await switchTo(R2)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    a.unmount();
    b.unmount();
  });

  it('after unmount the draft is never asked about again', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    const ask = asker(false);
    const h = renderHook(() => useDraftSwitchGuard(typed(), null));
    expect(switchLosses()).toHaveLength(1);
    h.unmount();
    expect(switchLosses()).toEqual([]);
    expect(await switchTo(R2)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });
});
