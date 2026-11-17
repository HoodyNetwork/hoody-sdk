import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { FRAME_SANDBOX, Frame, SLOW_MS } from './UrlFrame';
import strings from './strings.en.json';
import { iconText, PX_GLYPHS } from '../../../kit/icons.glyphs';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

test('a web widget says in the card it cannot be shown here, with the external mark (a text glyph; reads without colour)', async () => {
  t = await drawTest(<Frame url="https://example.com/x" name="Example" />, { width: 50, height: 3 });
  const f = await t.settle();
  expect(f).toContain(`${iconText(PX_GLYPHS.external)} ${strings['card.blocked']}`);
  expect(f).not.toContain('↗');
  // Nothing of the address is drawn here: the card shows it whole, through AddressText, under the frame's place.
  expect(f).not.toContain('example.com');
});

test('the frame contract values are the shared ones', () => {
  expect(FRAME_SANDBOX.split(' ').sort()).toEqual(['allow-forms', 'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-same-origin', 'allow-scripts']);
  expect(SLOW_MS).toBe(20_000);
});
