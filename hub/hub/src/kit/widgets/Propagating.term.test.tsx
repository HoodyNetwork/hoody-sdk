// PropagatingNote in the terminal. The compat drawing put the clock on the middle row of a wrapped
// note, broke "(DNS)" after its bracket and lost the last letter of a row at 40 columns. Each width case fails on it.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { setStyleTable } from '../../term/jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import { PropagatingNote } from './Propagating';

beforeAll(() => installStyleTable(120));
afterAll(() => setStyleTable(null));

async function rows(node: ReactNode, width: number) {
  const t = await drawTest(<FocusRoot><OverlayHost><Box dir="column" width={width}>{node}</Box></OverlayHost></FocusRoot>, { width, height: 8 });
  const f = (await t.settle()).split('\n').map((r) => r.trimEnd()).filter((r) => r !== '');
  t.renderer.destroy();
  return f;
}

const cases = (): ReactNode => (
  <>
    <PropagatingNote variant="created" />
    <div><strong>weather</strong> <PropagatingNote createdAt={new Date().toISOString()} /></div>
    <div><strong>old</strong> <PropagatingNote createdAt="2020-01-01T00:00:00Z" /></div>
  </>
);

for (const width of [80, 120, 240]) {
  test(`${width} columns: the clock leads the first row, words wrap whole; a link that is not fresh shows no note`, async () => {
    const f = await rows(cases(), width);
    if (process.env.HUB_FX_OUT) await Bun.write(`${process.env.HUB_FX_OUT}/propagating.${width}.txt`, f.join('\n') + '\n');
    if (width === 80) {
      // 84 cells of words: the row breaks between words, never inside "(DNS).", and the clock stays on the first row
      expect(f).toEqual([
        '◷ New links can take about a minute to start working while the address spreads',
        '  (DNS).',
        'weather',
        '◷ Made under a minute ago: it may still be spreading (DNS) and not answer yet.',
        'old',
      ]);
    } else {
      expect(f).toEqual([
        '◷ New links can take about a minute to start working while the address spreads (DNS).',
        'weather',
        '◷ Made under a minute ago: it may still be spreading (DNS) and not answer yet.',
        'old',
      ]);
    }
  }, 30_000);
}

test('40 columns: the sentence wraps at words with no letter lost, the clock on its first row', async () => {
  const f = await rows(<PropagatingNote variant="created" />, 40);
  if (process.env.HUB_FX_OUT) await Bun.write(`${process.env.HUB_FX_OUT}/propagating.40.txt`, f.join('\n') + '\n');
  expect(f[0]).toMatch(/^◷ New links/);
  expect(f.map((r) => r.replace(/^[◷ ] /, '')).join(' ')).toBe('New links can take about a minute to start working while the address spreads (DNS).');
  for (const r of f.slice(1)) expect(r).toMatch(/^ {2}\S/);
}, 30_000);
