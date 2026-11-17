// Under the strict globals (the test preload installs them), the column measures read no browser global: the terminal
// has no canvas, so text is measured per character (the api page's fitWidth crashed its live mount on `document`).
import { expect, test } from 'bun:test';
import { activeStrictGlobals } from '../../term/env/strict-globals';
import { fitWidth, headerWidth, measure } from './DataTableLayout';

test('measure, fitWidth and headerWidth read no browser global in the terminal', () => {
  activeStrictGlobals()?.clear();
  expect(measure('GET')).toBeCloseTo(3 * 6.6);
  expect(fitWidth(['POST', 'GET'], { mono: true })).toBeGreaterThan(0);
  expect(headerWidth('Method', true)).toBeGreaterThan(0);
  expect((activeStrictGlobals()?.ledger() ?? []).map((r) => r.name)).toEqual([]);
});
