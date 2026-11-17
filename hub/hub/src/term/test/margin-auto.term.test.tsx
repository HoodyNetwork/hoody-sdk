// Auto inline margins in a flex row: `margin-inline-start: auto` pushes an item to the
// far end of its row (the web's usual "this sits right"), `margin-inline-end: auto` pushes the items after it there, and
// `margin-inline: auto` centres. Reported as not honoured; probed, it already is (the translator keeps
// marginLeft/Right 'auto', Yoga places it): these pin it with real kit/page classes.
//
// | # | Web behaviour | Test |
// |---|---|---|
// | 1 | margin-inline-start: auto on the last item: it ends at the row's end | 'start auto' |
// | 2 | margin-inline-end: auto on the first item: the next item ends at the row's end | 'end auto' |
// (Case 2 used bots .stepFooter > :first-child until the target dropped that class with the New Bot footer; it now uses the kit
// DataTable .listPrimary, the list row's title that pushes the row's other items to its end.)
// | 3 | margin-inline: auto on a box narrower than its parent: centred | 'both auto' |
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot } from '../prim';
import { setStyleTable } from '../jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import cv from '../../kit/agent/ConversationView.module.css';
import dp from '../../kit/agent/DetailsPanel.module.css';
import dt from '../../kit/data/DataTable.module.css';

beforeAll(() => installStyleTable(120));
afterAll(() => setStyleTable(null));

// The parent is a sized box (a row for the `flex: 1` footer and column, which fill a page region on the web).
async function frame(node: ReactNode, width = 30, height = 4, row = true): Promise<string[]> {
  const t = await drawTest(<FocusRoot><Box dir={row ? 'row' : 'column'} width={width} height={height}>{node}</Box></FocusRoot>, { width: Math.max(40, width + 2), height });
  for (let i = 0; i < 6; i++) await t.renderOnce();
  const rows = t.captureCharFrame().split('\n').map((r) => r.trimEnd());
  t.renderer.destroy();
  return rows;
}

test('start auto: the item ends at the row end (DetailsPanel .meta)', async () => {
  const rows = await frame(<div className={dp.row}><span>Read file</span><span className={dp.meta}>2s</span></div>, 30, 4, false);
  const row = rows.find((r) => r.includes('Read file'))!;
  expect(row.indexOf('2s')).toBe(28);
});

test('end auto: the items after it end at the row end (DataTable .listPrimary)', async () => {
  const rows = await frame(<><span className={dt.listPrimary}>Back</span><span>Next</span></>);
  const row = rows.find((r) => r.includes('Back'))!;
  expect(row.indexOf('Back')).toBe(0);
  expect(row.indexOf('Next')).toBe(26);
});

test('both auto: a box narrower than its parent is centred (ConversationView .composerLane, 760px + two 24px insets = 101 cols)', async () => {
  const rows = await frame(<div className={cv.root}><div className={cv.composerLane}>middle</div></div>, 115, 8, false);
  const row = rows.find((r) => r.includes('middle'))!;
  // Its width and inset are the root's (--conv-col, --conv-inset): (115 - 101) / 2 = 7 columns of margin, then
  // its own 1-column inset (the column inset less the composer's own).
  // (This case used SessionView .column until the log became as wide as its pane, with the centred thread inside it.)
  expect(row.indexOf('middle')).toBe(8);
});
