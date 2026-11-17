// Vitest: the Layout menu's pictures (PRESET_CELLS) draw each preset as presetTree lays it out: the same panes, in
// reading order, at the same place and size.
import { describe, expect, it } from 'vitest';
import { PRESETS, PRESET_CELLS, PRESET_SLOTS, presetTree, rects } from './tree';

describe('PRESET_CELLS', () => {
  it.each(PRESETS.map((p) => [p]))('%s: one pane per slot, where the preset puts it', (p) => {
    const cells = PRESET_CELLS[p];
    expect(cells).toHaveLength(PRESET_SLOTS[p]);
    const w = Math.max(...cells.map(([x, , cw]) => x + cw));
    const h = Math.max(...cells.map(([, y, , ch]) => y + ch));
    const ids = Array.from({ length: PRESET_SLOTS[p] }, (_, k) => 's' + k);
    const r = rects(presetTree(p, ids));
    ids.forEach((id, k) => {
      const [x, y, cw, ch] = cells[k]!;
      const want = r[id]!;
      expect(x / w).toBeCloseTo(want.x);
      expect(y / h).toBeCloseTo(want.y);
      expect(cw / w).toBeCloseTo(want.w);
      expect(ch / h).toBeCloseTo(want.h);
    });
  });
});
