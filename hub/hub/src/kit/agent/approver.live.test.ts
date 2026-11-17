// Vitest: the page wiring's hidden-tab gap reads both clocks, so a stepped wall clock cannot hide a gap.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTickets } from '@core';
import { approvers, resetApproversForTests } from './approver-live';

let mono = 0;
let wall = 0;
let gap: ReturnType<typeof vi.spyOn>;
const vis = (state: 'hidden' | 'visible'): void => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};
beforeEach(() => {
  mono = 1000; wall = 5_000_000;
  vi.spyOn(performance, 'now').mockImplementation(() => mono);
  vi.spyOn(Date, 'now').mockImplementation(() => wall);
  resetTickets(); resetApproversForTests();
  gap = vi.spyOn(approvers(), 'gap');
});
afterEach(() => { vi.restoreAllMocks(); resetApproversForTests(); resetTickets(); });

describe('a tab hidden for 60 s or more is a gap on either clock', () => {
  it('both clocks short of 60 s: no gap', () => {
    vis('hidden'); mono += 59_000; wall += 59_000; vis('visible');
    expect(gap).not.toHaveBeenCalled();
  });
  it('the monotonic clock saw 60 s while the wall clock stepped back: a gap', () => {
    vis('hidden'); mono += 61_000; wall -= 5_000; vis('visible');
    expect(gap).toHaveBeenCalledTimes(1);
  });
  it('the wall clock saw 60 s while the monotonic clock stood still: a gap', () => {
    vis('hidden'); mono += 1_000; wall += 61_000; vis('visible');
    expect(gap).toHaveBeenCalledTimes(1);
  });
});
