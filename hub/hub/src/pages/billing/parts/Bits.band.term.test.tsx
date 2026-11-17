// The billing page's own Band in the terminal: a band for a sent change whose answer is unknown (`outcome: 'pending'`)
// wears the kit's pending mark (◷), so the kind still shows where cells carry no data attribute; a band with no outcome
// keeps its tone's own mark.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../../term/prim';
import { Band } from './Bits';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const draw = async (outcome?: 'pending' | 'failed') => {
  t = await drawTest(
    <FocusRoot><PaneSize><Band tone="warn" outcome={outcome}>The top-up may have gone through.</Band></PaneSize></FocusRoot>,
    { width: 80, height: 6 },
  );
  return t.settle();
};

test('Band: outcome pending draws the pending mark beside the words', async () => {
  const f = await draw('pending');
  expect(f).toContain('The top-up may have gone through.');
  expect(f).toContain('◷');
});

test('Band: no outcome keeps the tone mark, never the pending one', async () => {
  const f = await draw();
  expect(f).toContain('The top-up may have gone through.');
  expect(f).not.toContain('◷');
});
