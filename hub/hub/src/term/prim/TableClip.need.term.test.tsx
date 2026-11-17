// ClipRow's reported need (`onNatural`, a table column's want) is the same in a narrow box and a wide one: a part with a
// width of its own needs THAT width even while the row squeezes it (market RAM: "128 GB DDR4 ECC" in a 15-cell part
// squeezed to 10 reported 10), and the blank that holds a hidden tag's place counts (kit cells GiveWay: schedules Name
// reported 31 with the tag hidden and 36 with it shown). Before, the number depended on the width at the first read,
// and the table keeps the largest it heard: fresh renders of one page drew two column sets (scripts 160x45: 3 of 6).
import { expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from './testing';
import { Box, FocusRoot, Text } from './index';
import { ClipRow } from './TableClip';

const needIn = async (width: number, node: ReactNode): Promise<number> => {
  const heard: number[] = [];
  const t = await drawTest(<FocusRoot><Box width={width} height={1} dir="row" clip shrink={0}><ClipRow onNatural={(n) => { heard.push(n); }}>{node}</ClipRow></Box></FocusRoot>, { width: 60, height: 4 });
  await t.settle();
  for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 20)); await t.settle(); }
  t.renderer.destroy();
  return heard.at(-1) ?? -1;
};
const own = <Box dir="row" width={15} shrink={1} minWidth={0} clip><Text shrink={0}>128 GB DDR4 ECC</Text></Box>;
const held = <><Text shrink={0}>ping-api</Text><Box dir="row" shrink={1000} minWidth={0} drops><Box width={13} shrink={1} minWidth={0} /></Box></>;

test('a part with its own width needs that width, squeezed (10 cells) or not (30)', async () => {
  expect(await needIn(30, own)).toBe(15);
  expect(await needIn(10, own)).toBe(15);
});

test("the blank holding a hidden tag's place counts at its own width, squeezed or not", async () => {
  expect(await needIn(30, held)).toBe(21);
  expect(await needIn(10, held)).toBe(21);
});
