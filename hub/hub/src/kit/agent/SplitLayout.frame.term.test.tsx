// SplitLayout in the terminal (SplitLayout.term.tsx): the AI tab's frame in cells. SplitLayout.term.test.ts pins its
// rule (splitState) to the web's; these hold what the frame draws from it:
//   - m and l: the pane is 36 cells with its edge on the right and the conversation takes the rest; Details, once
//     open, takes the pane's place: 50 cells with its edge on the left
//   - xl: pane (38 cells), conversation and Details side by side; xxl: Details is 34% of the frame, 70 to 130 cells
//   - xs and s: one slot fills the frame (the list, the conversation, or Details as a whole sheet), no edge drawn
//   - no Details given: asking for it open still draws the pane and the conversation
//   - a hidden slot stays mounted: what it holds (a draft) is there again when it comes back
import { expect, test } from 'bun:test';
import { useEffect, useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Text } from '../../term/prim';
import { SplitLayout } from './SplitLayout';
import type { SizeClass } from './useSizeClass';

const EDGE = '│';

/** The frame's text, one string per row, after the frame has taken its own width (xxl reads it after the first draw). */
const draw = async (size: SizeClass, detailsOpen: boolean, o: { width?: number; screen?: 'list' | 'conversation'; noDetails?: boolean } = {}): Promise<string[]> => {
  const t = await drawTest(
    <SplitLayout
      size={size}
      detailsOpen={detailsOpen}
      screen={o.screen}
      pane={<Text>PANE</Text>}
      main={<Text>MAIN</Text>}
      details={o.noDetails ? undefined : <Text>DETAILS</Text>}
    />,
    { width: o.width ?? 120, height: 6 },
  );
  await t.settle();
  const f = await t.settle();
  t.renderer.destroy();
  return f.split('\n');
};

// Catches the m/l widths (SplitLayout.term.tsx 39-42: 288 px and 400 px at 8 px a cell) and the edges (49, 56, 58).
test('m and l: pane 36 cells, edge on its right, conversation after it; Details open takes the pane\'s place, 50 cells, edge on its left', async () => {
  for (const size of ['m', 'l'] as const) {
    let rows = await draw(size, false);
    expect(rows[0]!.indexOf('PANE')).toBe(0);
    expect(rows[0]!.indexOf(EDGE)).toBe(35);
    expect(rows[0]!.indexOf('MAIN')).toBe(36);
    for (const r of rows.slice(0, 6)) expect(r.indexOf(EDGE)).toBe(35);
    expect(rows.join('\n')).not.toContain('DETAILS');

    rows = await draw(size, true);
    expect(rows.join('\n')).not.toContain('PANE');
    expect(rows[0]!.indexOf('MAIN')).toBe(0);
    expect(rows[0]!.indexOf(EDGE)).toBe(120 - 50);
    expect(rows[0]!.indexOf('DETAILS')).toBe(120 - 50 + 1);
  }
});

// Catches xl (line 25: pane, conversation and Details together; line 39: the wide rail, 304 px).
test('xl with Details open: pane (38 cells), conversation and Details side by side, in that order', async () => {
  const rows = await draw('xl', true);
  const r = rows[0]!;
  expect(r.indexOf('PANE')).toBe(0);
  expect(r.indexOf(EDGE)).toBe(37);
  expect(r.indexOf('MAIN')).toBe(38);
  const detailsEdge = r.lastIndexOf(EDGE);
  expect(detailsEdge).toBeGreaterThan(r.indexOf('MAIN'));
  expect(r.indexOf('DETAILS')).toBe(detailsEdge + 1);
});

// Catches the xxl clamp (lines 40-41: clamp(70, 34% of the frame's own width, 130) cells): floor, middle and ceiling.
test('xxl: Details is 34% of the frame, never under 70 cells nor over 130', async () => {
  for (const [width, details] of [[120, 70], [300, 102], [400, 130]] as const) {
    const rows = await draw('xxl', true, { width });
    const r = rows[0]!;
    expect(r.indexOf('PANE')).toBe(0);
    expect(r.indexOf(EDGE)).toBe(37);
    expect(r.lastIndexOf(EDGE)).toBe(width - details);
    expect(r.indexOf('DETAILS')).toBe(width - details + 1);
  }
});

// Catches the small rule (lines 20-23) drawn as one whole slot with no edge (line 56/58: small = no width, no border).
test('xs and s: one slot fills the frame, no edge: the list, the conversation, or Details as a sheet', async () => {
  for (const size of ['xs', 's'] as const) {
    let rows = await draw(size, false, { screen: 'list' });
    expect(rows[0]!.indexOf('PANE')).toBe(0);
    for (const word of ['MAIN', 'DETAILS', EDGE]) expect(rows.join('\n')).not.toContain(word);

    for (const screen of ['conversation', undefined] as const) {
      rows = await draw(size, false, { screen });
      expect(rows[0]!.indexOf('MAIN')).toBe(0);
      for (const word of ['PANE', 'DETAILS', EDGE]) expect(rows.join('\n')).not.toContain(word);
    }

    rows = await draw(size, true, { screen: 'list' });
    expect(rows[0]!.indexOf('DETAILS')).toBe(0);
    for (const word of ['PANE', 'MAIN', EDGE]) expect(rows.join('\n')).not.toContain(word);
  }
});

// Catches line 35 (open only when there are Details to show).
test('no Details given: asking for it open still draws the pane and the conversation', async () => {
  const rows = await draw('l', true, { noDetails: true });
  expect(rows[0]!.indexOf('PANE')).toBe(0);
  expect(rows[0]!.indexOf(EDGE)).toBe(35);
  expect(rows[0]!.indexOf('MAIN')).toBe(36);
  expect(rows[0]!.lastIndexOf(EDGE)).toBe(35);
});

// Catches the hidden slot staying mounted (line 46: `hidden`, the node always rendered): a draft survives the slot
// being hidden and shown again, and the slot's content mounts once.
let mounts = 0;
let setDraft: (d: string) => void = () => {};
function Draft() {
  const [d, set] = useState('');
  setDraft = set;
  useEffect(() => { mounts++; }, []);
  return <Text>{`draft:${d}`}</Text>;
}
let setOpen: (o: boolean) => void = () => {};
function Host() {
  const [open, set] = useState(false);
  setOpen = set;
  return <SplitLayout size="l" detailsOpen={open} pane={<Draft />} main={<Text>MAIN</Text>} details={<Text>DETAILS</Text>} />;
}

test('a hidden slot stays mounted: the pane\'s draft is there again after Details closes', async () => {
  mounts = 0;
  const t = await drawTest(<Host />, { width: 120, height: 6 });
  setDraft('hello');
  let f = await t.settle();
  expect(f).toContain('draft:hello');
  setOpen(true);
  f = await t.settle();
  expect(f).not.toContain('draft:hello');
  expect(f).toContain('DETAILS');
  setOpen(false);
  f = await t.settle();
  expect(f).toContain('draft:hello');
  expect(f).not.toContain('DETAILS');
  expect(mounts).toBe(1);
  t.renderer.destroy();
});
