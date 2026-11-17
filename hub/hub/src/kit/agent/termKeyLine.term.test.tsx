// The composer's key line wraps only between pairs: each key keeps its action on its line, at every width.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box } from '../../term/prim';
import { KeyLine } from './termKeyLine';

const LINE = 'Enter send · Alt+Enter or Ctrl+J new line · / commands · @ files · PgUp scroll';

test('every pair that fits stays on one line, at any width', async () => {
  for (const w of [24, 31, 40, 52, 60, 70, 90]) {
    const t = await drawTest(<Box width={w} height={8} dir="column"><KeyLine line={LINE} /></Box>, { width: w, height: 8 });
    const rows = (await t.settle()).split('\n').map((r) => r.trimEnd()).filter(Boolean);
    // A pair that fits the width is never split; one wider than the whole line wraps inside itself (nothing is cut).
    for (const pair of LINE.split(' · ').filter((x) => x.length + 2 <= w)) expect({ w, pair, found: rows.some((r) => r.includes(pair)) }).toEqual({ w, pair, found: true });
    t.renderer.destroy();
  }
});
