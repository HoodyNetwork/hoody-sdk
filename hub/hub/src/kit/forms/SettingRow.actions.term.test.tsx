// A setting row never cuts its actions. A row with no value and two actions (AI's Claude Code row: "Open a terminal to
// install" and "Do it myself") kept the side-by-side form at 80 columns: the label column plus the two buttons ran past
// the row and "myself" was cut. Such a row puts its actions under the label, and they wrap among themselves when even
// that line is too short.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { layoutFaults } from '../../term/prim/layoutcheck';
import { Box, FocusRoot } from '../../term/prim';
import { Button } from '../controls/Button';
import { SettingRow } from './SettingRow';

async function draw(width: number): Promise<{ rows: string[]; faults: string[] }> {
  const cols = width + 3;
  const t = await drawTest(
    <FocusRoot><Box dir="column" width={width}>
      <SettingRow
        label="Claude Code"
        help="Not installed on this computer."
        actions={<>
          <Button size="sm" variant="secondary" onPress={() => {}}>Open a terminal to install</Button>
          <Button size="sm" variant="ghost" onPress={() => {}}>Do it myself</Button>
        </>}
      />
    </Box></FocusRoot>, { width: cols, height: 12 });
  const f = await t.settle();
  const faults = layoutFaults((t.renderer as unknown as { root: never }).root, { cols, rows: 12 }).map((x) => `${x.kind} ${x.path} ${x.detail}`);
  t.renderer.destroy();
  return { rows: f.split('\n').map((r) => r.trimEnd()).filter((r) => r !== ''), faults };
}

test('69 columns (a page at 80x24), two actions and no value: both actions whole, under the label', async () => {
  const { rows, faults } = await draw(69);
  expect(faults).toEqual([]);
  expect(rows[0]).toBe('Claude Code');
  const line = rows.find((r) => r.includes('Open a terminal to install'))!;
  expect(line).toContain('Do it myself');
  expect(rows.indexOf(line)).toBeGreaterThan(0);
  for (const r of rows) expect(r.length).toBeLessThanOrEqual(69);
});

test('32 columns: the two actions do not fit one line, so they wrap, each whole', async () => {
  const { rows, faults } = await draw(32);
  expect(faults).toEqual([]);
  const first = rows.findIndex((r) => r.includes('Open a terminal to install'));
  const second = rows.findIndex((r) => r.includes('Do it myself'));
  expect(first).toBeGreaterThan(0);
  expect(second).toBeGreaterThan(first);
  for (const r of rows) expect(r.length).toBeLessThanOrEqual(32);
});

test('120 columns: side by side, the actions on the label\'s line', async () => {
  const { rows, faults } = await draw(120);
  expect(faults).toEqual([]);
  expect(rows[0]).toMatch(/^Claude Code\s+.*Open a terminal to install.*Do it myself/);
});
