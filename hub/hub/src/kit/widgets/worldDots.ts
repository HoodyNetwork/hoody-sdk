// The dotted world of IntroPanel's map: land on an 8-unit grid, one bit per cell, 125 cells a row (1000 units for
// 360 degrees of longitude, so the world repeats every 1000 units), rows from the top. Each row is 32 hex digits read
// from the left; the last three bits are unused. Drawn as 4-unit squares, as the website's dotted map.

/** The world's width in map units: one turn of longitude. */
export const WORLD_W = 1000;
/** The world's height in map units. */
export const WORLD_H = 416;
const CELL = 8;
const DOT = 4;
const COLS = 125;

const ROWS: readonly string[] = [
  '000000003f01fc000000000000000000',
  '00000007fdffff000000000180000000',
  '00000000e3fffe000800000060000000',
  '00000807e01fff0000002007fc010000',
  '00001fcdf81ffe00000043ffffe1c000',
  '07ffffe64e0ffc0007e01ffffffffff8',
  'e7ffffffc78fe0001ffffffffffffff8',
  '03ffffff470701803ffffffffffffff8',
  '07fffffc1c030000fbfffffffffffbe0',
  '0181fffc1f80000079ffffffffff0200',
  '0000ffff8fc0000c53fffffffffc0600',
  '00003fffdfe00016ffffffffffff0400',
  '00003fffffe00003ffffffffffff0000',
  '00001fffff300007fffffffffffe0000',
  '00001fffff800003ffaefffffffc0000',
  '00001ffffc00001f37067ffffff10000',
  '00001ffff800001e06ff7fffff610000',
  '00000ffff000000c40ff7fffff220000',
  '000007fff000000fc01fffffff0c0000',
  '000003ffc000001ff63fffffff800000',
  '000001fc0000001ffffeffffff800000',
  '000001f82000003fffdf7fffff000000',
  '000000780000007fffefe3fffe000000',
  '000000391000007fffefe1f9f8000000',
  '0000001f0400007ffff7c0f1e0000000',
  '000000038000007ffff780e0f0800000',
  '00000000c000007ffffc00c078000000',
  '000000004f80007fffff004010000000',
  '000000001fc0003fffff002000400000',
  '000000000ff0001cfffe000043000000',
  '000000001ff800003ffc0000c7000000',
  '000000001ffc00003ff800006e800000',
  '000000003fff80003ff8000026870000',
  '000000003fffc0001ff0000000038000',
  '000000001fffc0001ff0000000014000',
  '000000001fffc0001ff8000000000000',
  '000000000fff80001ff90000001c8000',
  '0000000007ff80001ff30000007f8000',
  '0000000003ff80001fe3000000ffc000',
  '0000000003ff00001fe2000003ffe000',
  '0000000003fc00000fe2000003ffe000',
  '0000000003fc00000fc0000003fff000',
  '0000000003f800000f80000003fff000',
  '0000000003f000000700000001c7e000',
  '0000000007e00000000000000003e000',
  '0000000007e00000000000000001c010',
  '00000000078000000000000000000010',
  '00000000070000000000000000004060',
  '00000000060000000000000000000040',
  '000000000e0000000000000000000000',
  '00000000060000000000000000000000',
  '00000000060000000000000000000000',
];

/** Whether the grid cell (column, row) is land. */
export function isLand(col: number, row: number): boolean {
  const hex = ROWS[row];
  if (!hex || col < 0 || col >= COLS) return false;
  return ((parseInt(hex.charAt(col >> 2), 16) >> (3 - (col & 3))) & 1) === 1;
}

/** The whole world as one SVG path: a square per land cell. */
export function worldPath(): string {
  let d = '';
  for (let row = 0; row < ROWS.length; row++) {
    for (let col = 0; col < COLS; col++) {
      if (isLand(col, row)) d += `M${col * CELL + 2} ${row * CELL + 2}h${DOT}v${DOT}h-${DOT}z`;
    }
  }
  return d;
}
