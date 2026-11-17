import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { ColourName } from './ColourName';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

test('a realm colour draws a swatch and its name on one line (the name alone still reads in mono)', async () => {
  t = await drawTest(<ColourName color="red" label="Red" />, { width: 20, height: 1 });
  const f = await t.settle();
  expect(f).toMatch(/^\S+ +Red/);
  expect(f.indexOf('Red')).toBeGreaterThan(1);
});
