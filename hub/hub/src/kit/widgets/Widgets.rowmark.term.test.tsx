// A widget row too long for its card gives way in one order: the label first, down to its floor (its own width up to
// 12 cells), then the meta, cut with "…", and the label below its floor only when no meta is left. The tone mark (the
// row's level without colour), the pill and the action never give way. Before, every part shrank in proportion: a
// Notifications row on Home began with a blank where "✓" belongs and cut its time ("19 days a…"), and a Billing row
// kept "fra…" of its server's name.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box } from '@term/prim';
import { Link, TextButton } from '../controls/Link';
import { WidgetList, WidgetRow } from './Widgets';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const LONG = 'Payment received for the yearly plan of server boreal, with its receipt attached and a note from billing';

async function rows(node: Parameters<typeof drawTest>[0], width: number, height: number): Promise<string[]> {
  t = await drawTest(node, { width, height });
  return (await t.settle()).split('\n');
}

test('the mark keeps its cell and the label takes the cut, however long the label', async () => {
  const lines = await rows(
    <WidgetList label="Notifications">
      <WidgetRow label={<Link href="/notifications/n2" variant="plain">{LONG}</Link>} tone="ok" meta="19 days ago" />
      <WidgetRow label={LONG} tone="warn" meta="19 days ago" />
    </WidgetList>,
    40,
    3,
  );
  expect(lines[0]).toMatch(/^✓ Payment/);
  expect(lines[1]).toMatch(/^! Payment/);
  // The time stays whole: the label gave way, not the meta.
  expect(lines[0]!.trimEnd().endsWith(' 19 days ago')).toBe(true);
  expect(lines[1]!.trimEnd().endsWith(' 19 days ago')).toBe(true);
});

test('a name within its floor stays whole; the meta gives way with "…"; the pill stays whole', async () => {
  const lines = await rows(
    <WidgetList label="Servers">
      <WidgetRow label="frankfurt-7" tone="danger" meta="Unpaid since Oct 20, 2026" pill={{ tone: 'danger', text: 'On hold' }} />
    </WidgetList>,
    40,
    2,
  );
  expect(lines[0]).toMatch(/^✗ frankfurt-7 Unpaid since O.*… .*On hold\s*$/);
});

test('with no meta to give, the label goes under its floor and the pill and action stay whole', async () => {
  const lines = await rows(
    <WidgetList label="Bots">
      <WidgetRow label="Chief · atlas" tone="accent" pill={{ tone: 'accent', text: 'Waiting for you' }} action={<TextButton onPress={() => {}}>Review</TextButton>} />
    </WidgetList>,
    30,
    2,
  );
  expect(lines[0]).toMatch(/^◆ Ch/);
  expect(lines[0]).toContain('Waiting for you');
  expect(lines[0]!.trimEnd().endsWith('Review')).toBe(true);
});

test('a card that starts on a half cell keeps the name whole while the meta gives way', async () => {
  // Two cards side by side in 82 cells: each is 40.5 wide and the right one starts at 41.5, as Home's two-track cards
  // do at 120 columns.
  const card = { grow: 1, shrink: 1, basis: 0, minWidth: 0 } as const;
  const lines = await rows(
    <Box dir="row" gap={1}>
      <Box {...card}>
        <WidgetList label="Left"><WidgetRow label="left" meta="now" /></WidgetList>
      </Box>
      <Box {...card}>
        <WidgetList label="Servers">
          <WidgetRow label="frankfurt-7" tone="danger" meta="Unpaid since Oct 20, 2026" pill={{ tone: 'danger', text: 'On hold' }} />
        </WidgetList>
      </Box>
    </Box>,
    82,
    2,
  );
  expect(lines[0]).toContain('✗ frankfurt-7 Unpaid since');
});

test('a meta given as a node is cut with "…" too, never clipped without a mark', async () => {
  const lines = await rows(
    <WidgetList label="Servers">
      <WidgetRow label="frankfurt-7" tone="danger" meta={<>Unpaid since {'Oct 20, 2026'}</>} pill={{ tone: 'danger', text: 'On hold' }} />
    </WidgetList>,
    40,
    2,
  );
  expect(lines[0]).toMatch(/^✗ frankfurt-7 Unpaid since O.*… .*On hold\s*$/);
});
