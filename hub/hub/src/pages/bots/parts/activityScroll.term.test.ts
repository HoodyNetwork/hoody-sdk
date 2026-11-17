import { expect, test } from 'bun:test';
import { activeStrictGlobals } from '../../../term/env/strict-globals';
import { atEnd, bringTopIntoView, isScrollOf, observeLogResize, onAnyScroll, rowTopIn, scrollerOf, toEnd, visibleOf } from './activityScroll';

test('the terminal finds no box to scroll and hears no document (no document there)', () => {
  // Strict globals (test-preload) trap any read of document or window: running these calls clean is the proof.
  const seen = activeStrictGlobals()?.ledger().length ?? 0;
  const el = {} as HTMLElement;
  expect(scrollerOf(el)).toBeNull();
  expect(visibleOf(el)).toBeNull();
  expect(rowTopIn(el, 1)).toBeUndefined();
  expect(bringTopIntoView(el)).toBe(false);
  expect(isScrollOf({} as Event, el)).toBe(false);
  expect(observeLogResize(el, () => {})).toBeUndefined();
  const stop = onAnyScroll(() => {});
  expect(() => { stop(); }).not.toThrow();
  // and nothing here read a browser global (the ledger is process-wide: only this test's reads count)
  expect((activeStrictGlobals()?.ledger() ?? []).slice(seen).map((r) => r.name)).toEqual([]);
});

test('the follow rule keeps the web values', () => {
  const sc = { scrollHeight: 1000, clientHeight: 200, scrollTop: 790 } as HTMLElement;
  expect(atEnd(sc)).toBe(true);
  sc.scrollTop = 700;
  expect(atEnd(sc)).toBe(false);
  toEnd(sc);
  expect(sc.scrollTop).toBe(800);
});
