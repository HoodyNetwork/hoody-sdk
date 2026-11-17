// The checkbox mark ([ ], [x], [-]) is one piece: in a box narrower than its label's longest word the label wraps or
// is cut, never the mark ("[" on one row and "]" on the next).
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { Checkbox } from './fields';

for (const [label, selected, mark] of [['Supercalifragilistic', false, '[ ]'], ['Run commands (shell)', true, '[x]']] as const) {
  for (const width of [8, 10, 14]) {
    test(`${mark} ${label} in ${width} cells: the mark stays whole on its row`, async () => {
      const t = await drawTest(
        <FocusRoot><Box dir="row" width={width}><Checkbox label={label} isSelected={selected} onChange={() => {}} /></Box></FocusRoot>,
        { width: 30, height: 8 },
      );
      try {
        const f = await t.settle();
        expect(f.split('\n')[0]!.startsWith(mark), f).toBe(true);
      } finally { t.renderer.destroy(); }
    });
  }
}
