// A field whose suffix is a worded button (the terminal draws an IconButton as its label) in a row narrower than the
// field's own width: the field gives way (down to FIELD_MIN, termField.tsx) and the button stays whole. The frame kept
// its own width and ran past the row, so the card's edge cut the button (New Bot's Name at 120x40: "[Suggest anoth│").
// With room, a value shows whole. An unsized field is as wide as its value, and the engine input keeps the caret's
// cell and a margin after it (FieldInput.ts: scrollMargin, and the field's own width), so a value with room was cut
// at its start ("dy-amber-badger"). A value that arrives after the field's first frame (typed, pasted, filled in) gives
// way the same: the field's width follows its value, and a width set after the first frame stopped it shrinking
// (scripts' long address ran past its row and lost its "✓ Free").
import { afterEach, expect, test } from 'bun:test';
import { useEffect, useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { IconButton } from '../controls/Button';
import { TextField } from './fields';

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; });

/** A bordered row `width` cells wide holding one field, as a setting row's value column holds it. */
async function lines(width: number, value: string, suffix = true): Promise<string[]> {
  term = await drawTest(
    <FocusRoot>
      <Box dir="row" width={width} border>
        <Box dir="row" grow={1} shrink={1} minWidth={0}>
          <TextField aria-label="Name" value={value} onChange={() => {}}
            {...(suffix ? { suffix: <IconButton icon="reload" size="sm" label="Suggest another name" onPress={() => {}} /> } : {})} />
        </Box>
      </Box>
    </FocusRoot>,
    { width: 80, height: 6 },
  );
  return (await term.settle()).split('\n').map((l) => l.trimEnd());
}

test('in a narrow row the field gives way and its suffix button is whole, inside the border', async () => {
  const line = (await lines(40, 'steady-amber-badger')).find((l) => l.includes('Suggest'))!;
  expect(line).toMatch(/\[Suggest another name\] *│$/);
  expect(line.length).toBeLessThanOrEqual(40);
});

test('with room the field keeps its whole value beside the button', async () => {
  // Red before: "dy-amber-otter" (a fifth of the width kept after the caret); with the least margin alone the field
  // was still as wide as the value and showed "eady-amber-otter".
  const line = (await lines(70, 'steady-amber-otter')).find((l) => l.includes('Suggest'))!;
  expect(line).toContain('steady-amber-otter');
  expect(line).toContain('[Suggest another name]');
});

test('with room a value longer than the field\'s least width shows whole, no suffix', async () => {
  // 31 characters: wider than FIELD_MIN, so the field takes the value's own width.
  const value = 'steady-amber-otter-by-the-river';
  const line = (await lines(70, value, false)).find((l) => l.includes('river'))!;
  expect(line).toContain(value);
});

/** A field that is empty in its first frame and gets `value` right after (as a fill or a paste sets it). */
function Later({ value }: { value: string }) {
  const [v, setV] = useState('');
  useEffect(() => { setV(value); }, [value]);
  return (
    <TextField aria-label="Address" value={v} onChange={setV}
      suffix={<IconButton icon="reload" size="sm" label="Suggest another name" onPress={() => {}} />} />
  );
}

test('a long value that arrives after the first frame: the field gives way and its suffix button is whole', async () => {
  // Red before: the width set with the value stopped the field shrinking, so it kept the value's whole width, ran past
  // the row and the border cut the button (no "[Suggest another name]" on the line).
  const value = '/orders/archive/2026/customers/with-a-very-long-name/invoices';
  term = await drawTest(
    <FocusRoot>
      <Box dir="row" width={50} border>
        <Box dir="row" grow={1} shrink={1} minWidth={0}><Later value={value} /></Box>
      </Box>
    </FocusRoot>,
    { width: 80, height: 6 },
  );
  const frame = (await term.settle()).split('\n').map((l) => l.trimEnd());
  const line = frame.find((l) => l.includes('Suggest'));
  expect(line, frame.join('\n')).toBeDefined();
  expect(line!).toMatch(/\[Suggest another name\] *│$/);
  expect(line!.length).toBeLessThanOrEqual(50);
});
