// A narrow switch row is the web's narrow switch row: the switch at the end of the label's line (its first line,
// however the help wraps), the actions under the help at the start. Before, the switch stood on a line of its own
// under the label and help, at the start.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { Button } from '../controls/Button';
import { SettingSwitch } from './SettingGroup';

const HELP = 'Renews this plan from your balance on the day it ends, until you turn it off.';

async function draw(width: number, opts: { help?: boolean; actions?: boolean } = {}): Promise<string[]> {
  const t = await drawTest(
    <FocusRoot><Box dir="column" width={width}>
      <SettingSwitch label="Auto-renew" help={opts.help ? HELP : undefined} isSelected onChange={() => {}}
        actions={opts.actions ? <Button size="sm" variant="secondary" onPress={() => {}}>See renewals</Button> : undefined} />
    </Box></FocusRoot>, { width: width + 3, height: 14 });
  const f = await t.settle();
  t.renderer.destroy();
  return f.split('\n').map((r) => r.trimEnd()).filter((r) => r !== '');
}
/** Rows inside the group's frame, without the frame. */
const inner = (rows: string[]): string[] => rows.filter((r) => r.startsWith('│')).map((r) => r.replace(/^│ ?/, '').replace(/ ?│$/, '').trimEnd()).filter((r) => r !== '');

test('50 columns: the switch is at the end of the label line', async () => {
  const rows = inner(await draw(50));
  expect(rows.length).toBe(1);
  expect(rows[0]).toMatch(/^Auto-renew\s{10,}\S/);
});

test('50 columns with help and an action: switch on the label line, help wrapped under the label, action last at the start', async () => {
  const rows = inner(await draw(50, { help: true, actions: true }));
  expect(rows[0]).toMatch(/^Auto-renew\s{10,}\S/);
  const help = rows.slice(1, -1).join(' ').replace(/\s+/g, ' ');
  expect(help).toBe(HELP);
  expect(rows[rows.length - 1]).toBe('[See renewals]');
  // The help wraps beside nothing: it never runs under the switch's cells (the label column ends before them).
  const switchAt = rows[0]!.search(/\S+(\s\S+)*$/);
  expect(switchAt).toBeGreaterThan(20);
});

test('90 columns: side by side as before, one line', async () => {
  const rows = inner(await draw(90, { actions: true }));
  expect(rows.length).toBe(1);
  expect(rows[0]).toContain('Auto-renew');
  expect(rows[0]).toContain('[See renewals]');
});
