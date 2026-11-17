// A Tag holding elements (a realm's swatch and name) is tinted on its own row only, also where the row around it
// stretches its children to the row's height: a setting row is as tall as its label and wrapped help, and the chip's
// tinted box was stretched with it (Get a computer > Realm at 120x40: a grey block four rows deep under " █ Personal ").
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Text, setColourTier } from '../../term/prim';
import { SettingGroup } from '../forms/SettingGroup';
import { SettingRow } from '../forms/SettingRow';
import { Tag } from './Display';

const TINT = [0x20, 0x20, 0x23]; // tokens.ts raised, dark (the tag tint)
const HELP = "Always added: you're getting this computer inside this realm, and every computer made here joins it too.";

test('a Tag of elements in a tall setting row is tinted on one row, beside the label', async () => {
  setColourTier('truecolor');
  const t = await drawTest(
    <FocusRoot>
      <Box width={110} dir="column">
        <SettingGroup>
          <SettingRow label="Realm" help={HELP}>
            <Tag><Text colour="ok">█</Text> Personal</Tag>
          </SettingRow>
        </SettingGroup>
      </Box>
    </FocusRoot>,
    { width: 112, height: 12 },
  );
  const lines = (await t.settle()).split('\n');
  const tinted = t.captureSpans().lines
    .map((l, i) => (l.spans.some((s) => s.bg.toInts().slice(0, 3).join() === TINT.join()) ? i : -1))
    .filter((i) => i >= 0);
  t.renderer.destroy();
  const at = lines.findIndex((l) => l.includes('Personal'));
  expect(at).toBeGreaterThanOrEqual(0);
  // The row is taller than the tag: its help wraps under the label (side by side at this width).
  expect(lines.findIndex((l) => l.includes('too.'))).toBeGreaterThan(at);
  // Red before: the tint ran down every row of the setting row.
  expect(tinted).toEqual([at]);
});
