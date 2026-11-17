// A Checkbox in a column that sizes its children to their content (align-items flex-start: the agent sign-in box) stays
// inside it. A long label and
// description wrap inside, under the label's first line, right of the mark.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { layoutFaults } from '../../term/prim/layoutcheck';
import { Checkbox } from './fields';

const LABEL = 'Let the writing assistant use this computer and act as you while it writes the script';
const HINT = 'You can turn it off again in the assistant settings of this page at any time.';

test('a Checkbox in a start-aligned column wraps inside the column', async () => {
  const t = await drawTest(
    <FocusRoot><Box dir="column" width={40} align="start" padX={1} border><Checkbox label={LABEL} description={HINT} isSelected={false} onChange={() => {}} /></Box></FocusRoot>,
    { width: 60, height: 20 },
  );
  try {
    const f = await t.settle();
    const r = t.renderer as unknown as { root: Parameters<typeof layoutFaults>[0] };
    const cut = layoutFaults(r.root, { cols: 60, rows: 20 }).filter((x) => x.kind === 'cut' || x.kind === 'text-cut');
    expect(cut, f).toEqual([]);
    const lines = f.split('\n');
    const first = lines.findIndex((l) => l.includes('[ ]'));
    expect(first, f).toBeGreaterThanOrEqual(0);
    const col = lines[first]!.indexOf('[ ]') + 4;
    // The label wraps: its second line starts under its first (right of the mark), inside the box (40 wide).
    expect(lines[first]!.slice(col).trim().length, f).toBeLessThan(LABEL.length);
    expect(lines[first + 1]!.slice(0, col).trim(), f).toMatch(/^│?$/);
    expect(lines[first + 1]!.slice(col).trim().length, f).toBeGreaterThan(0);
    for (const l of lines.slice(first, first + 6)) expect(l.trimEnd().length, f).toBeLessThanOrEqual(40);
  } finally { t.renderer.destroy(); }
});
