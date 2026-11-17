// `<Widget fit>` in a column of cards (a form's groups in a drawer) is as wide as the column, as on the web, where
// `fit` only drops the card's least height. It was as wide as its content: a group of setting rows inside it never
// came to rest (a side-by-side row with a short value was narrower than the width a row stacks below, so it stacked;
// stacked it was as wide as its help, so it went side by side again: VMs "New VM", the Name row), and a group wider
// than a narrow drawer was cut at the drawer's edge (proven where it showed: src/pages/vms/create.term.test.tsx).
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { Widget } from './Layouts';
import { SettingGroup } from '../forms/SettingGroup';
import { SettingRow } from '../forms/SettingRow';

const HELP = 'Lower-case letters, digits and hyphens. It cannot be changed later.';

test('a fit card in a column takes the column\'s width, and a setting row in it comes to rest side by side', async () => {
  const t = await drawTest(
    <FocusRoot><Box dir="column" width={100}>
      <Widget size="l" fit><SettingGroup variant="field" title="The VM">
        <SettingRow label="Name" help={HELP}>web-1</SettingRow>
      </SettingGroup></Widget>
    </Box></FocusRoot>, { width: 100, height: 16 });
  const frames = [await t.settle()];
  for (let i = 0; i < 5; i++) frames.push(await t.settle());
  expect(new Set(frames).size).toBe(1);
  const lines = frames[0]!.split('\n');
  // Side by side: the value is on the label's line.
  expect(lines.find((l) => l.includes('web-1'))).toContain('Name');
  // The card's top edge spans the column.
  expect(lines.find((l) => l.startsWith('┌'))!.trimEnd().length).toBe(100);
  t.renderer.destroy();
});
