// A table column's want is the widest width its cells report (ClipRow onNatural, kit DataTable). A MarkCell's tag gives
// way whole while the cell is too narrow and shows again once the cell widens (36 to 55 cells: Schedules' Name column
// when its table learns its height). The cell must report again once the tag is drawn: nothing in the cell resizes when
// the tag comes back, so the last report was the one taken while the tag was still held ("POST hooks.example.org"
// without "Web request"), and Schedules at 200x50 drew one of two column layouts by timing (Name 64 or 71 cells).
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box } from '@term/prim';
import { ClipRow } from '../../term/prim/TableClip';
import { MarkCell } from './cells';
import { Tag } from './Display';

const NAME = 'POST hooks.example.org';
const TAG = 'Web request';

test('a cell that widens until its tag shows reports the width with the tag as its last want', async () => {
  const heard: number[] = [];
  let widen: (w: number) => void = () => undefined;
  function Cell() {
    const [w, setW] = useState(36);
    widen = setW;
    return (
      <Box width={w} height={1} dir="row" clip shrink={0}>
        <ClipRow onNatural={(n) => { heard.push(n); }}>
          <MarkCell mark={undefined} after={<Tag>{TAG}</Tag>}>{NAME}</MarkCell>
        </ClipRow>
      </Box>
    );
  }
  const t = await drawTest(<Cell />, { width: 80, height: 3 });
  const pause = async () => { for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 20)); await t.settle(); } };
  await t.settle();
  await pause();
  widen(55);
  await t.settle();
  await pause();
  const frame = await t.settle();
  t.renderer.destroy();
  expect(frame).toContain(TAG);
  const whole = Math.max(...heard);
  expect({ last: heard.at(-1), whole }).toEqual({ last: whole, whole });
  expect(whole).toBeGreaterThanOrEqual(2 + NAME.length + 2 + TAG.length);
});
