// A setting row keeps a usable value column beside its actions, or it stacks. The stack rule counted the label column
// and the value only, so at 60 columns a row with a button kept the side-by-side form with 8 cells left for the value:
// AI agent detail drew "The / chat's / model" one word a line beside [Change model].
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { Button } from '../controls/Button';
import { SettingRow } from './SettingRow';

async function draw(width: number, actions: boolean): Promise<string[]> {
  const t = await drawTest(
    <FocusRoot><Box dir="column" width={width}>
      <SettingRow label="Model" actions={actions ? <Button size="sm" variant="secondary" onPress={() => {}}>Change model</Button> : undefined}>The chat's model</SettingRow>
    </Box></FocusRoot>, { width: width + 3, height: 10 });
  const f = await t.settle();
  t.renderer.destroy();
  return f.split('\n').map((r) => r.trimEnd()).filter((r) => r !== '');
}

test('57 columns with a button: the label on top, the value and the button on one line under it', async () => {
  const rows = await draw(57, true);
  // The web's narrow row: the label on its own line; under it the value at the start and the button at the row's end.
  expect(rows[0]).toBe('Model');
  expect(rows[1]).toMatch(/^The chat's model\s+\[Change model\]$/);
  expect(rows[1]!.length).toBe(57);
  expect(rows.length).toBe(2);
});

test('26 columns with a button: no room for both on a line, so the button goes under the value', async () => {
  const rows = await draw(26, true);
  expect(rows[0]).toBe('Model');
  expect(rows[1]).toBe("The chat's model");
  expect(rows[2]).toBe('[Change model]');
});

test('57 columns without a button: side by side as before (the value has its 24 cells)', async () => {
  const rows = await draw(57, false);
  expect(rows.find((r) => r.startsWith('Model'))).toContain("The chat's model");
});

test('90 columns with a button: side by side, one line', async () => {
  const rows = await draw(90, true);
  const row = rows.find((r) => r.startsWith('Model'))!;
  expect(row).toContain("The chat's model");
  expect(row).toContain('Change model');
});
