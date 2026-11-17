// The CSS `+` combinator.
// `.footBar > .footNote + *` gives the hint after the (empty, hidden) outcome note `margin-inline-end: auto`, so on the
// web the hint starts the bar and the actions end it. The translator dropped every sibling combinator, so the terminal
// pushed the hint right with the actions. Now the compound before `+` is the previous element sibling's condition
// (css-translate/selectors.ts foldAdjacent), and the parent names each element's previous sibling (dom.ts Slot.prev).
//
// | # | Web behaviour | Test |
// |---|---|---|
// | 1 | `.footBar > .footNote + *`: the hint after the note starts the bar, the actions end it | 'child rule after +' |
// | 2 | `.group + .group`: space above every group but the first | 'variant after +' |
// | 3 | A previous sibling that is a component (output unknown here): the `+` rule does not apply, never guessed | 'component before +' |
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot } from '../prim';
import { setStyleTable } from '../jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import sp from '../../pages/scripts/parts/parts.module.css';
import an from '../../kit/layouts/anatomy/anatomy.module.css';

beforeAll(() => installStyleTable(120));
afterAll(() => setStyleTable(null));

async function frame(node: ReactNode, width = 80, height = 8): Promise<string[]> {
  const t = await drawTest(<FocusRoot><Box dir="column" width={width} height={height}>{node}</Box></FocusRoot>, { width: width + 2, height });
  for (let i = 0; i < 6; i++) await t.renderOnce();
  const rows = t.captureCharFrame().split('\n').map((r) => r.trimEnd());
  t.renderer.destroy();
  return rows;
}

test('child rule after +: the hint after the empty note starts the bar, the action ends it', async () => {
  const rows = await frame(
    <div className={sp.footBar}>
      <div className={sp.footNote} />
      <span className={sp.faint}>Describe it first.</span>
      <span>Cancel</span>
    </div>,
  );
  const row = rows.find((r) => r.includes('Describe'))!;
  expect(row.indexOf('Describe')).toBe(0);
  expect(row.indexOf('Cancel')).toBe(80 - 'Cancel'.length);
});

test('variant after +: space above every group but the first (anatomy .group + .group: padding-block-start)', async () => {
  const rows = await frame(
    <div>
      <div className={an.group}>alpha</div>
      <div className={an.group}>beta</div>
      <div className={an.group}>gamma</div>
    </div>,
    30,
    14,
  );
  const at = (w: string): number => rows.findIndex((r) => r.includes(w));
  // No space before the first group; the same space (its padding, more than the one row of text) before each later one.
  expect(at('alpha')).toBe(0);
  expect(at('beta') - at('alpha')).toBeGreaterThan(1);
  expect(at('gamma') - at('beta')).toBe(at('beta') - at('alpha'));
});

function Note(): ReactNode {
  return <div className={sp.footNote} />;
}

test('component before +: its output is unknown here, so the + rule does not apply', async () => {
  const rows = await frame(
    <div className={sp.footBar}>
      <Note />
      <span className={sp.faint}>Describe it first.</span>
      <span>Cancel</span>
    </div>,
  );
  const row = rows.find((r) => r.includes('Describe'))!;
  // The bar's own justify-content: flex-end, as before: no margin from a guessed sibling.
  expect(row.indexOf('Cancel')).toBe(80 - 'Cancel'.length);
  expect(row.indexOf('Describe')).toBeGreaterThan(0);
});
