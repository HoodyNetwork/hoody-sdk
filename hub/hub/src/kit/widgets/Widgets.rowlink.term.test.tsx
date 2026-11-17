// A widget row whose label is an element: the Notifications card on Home passes its own link (to the notice) as the
// label, with no href. The terminal row drew that label inside a text, a pressable box in a text, which the terminal
// refuses, so the whole card showed "Couldn't load Notifications" instead of its rows.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { queryAllByRole, semanticsOf } from '../../term/prim/semantics';
import { Link } from '../controls/Link';
import { WidgetList, WidgetRow } from './Widgets';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

test('a row with a link as its label draws the link and its meta on one line', async () => {
  t = await drawTest(
    <WidgetList label="Notifications">
      <WidgetRow label={<Link href="/notifications/n1" variant="plain">Backup finished</Link>} tone="ok" meta="2h ago" />
      <WidgetRow label="Disk almost full" tone="warn" meta="5m ago" />
    </WidgetList>,
    { width: 50, height: 4 },
  );
  const lines = (await t.settle()).split('\n');
  expect(lines[0]).toMatch(/^✓ Backup finished\s+2h ago\s*$/);
  expect(lines[1]).toMatch(/^! Disk almost full\s+5m ago\s*$/);
  const tree = semanticsOf(t.renderer as never);
  expect(queryAllByRole(tree, 'link', { name: 'Backup finished' })).toHaveLength(1);
});
