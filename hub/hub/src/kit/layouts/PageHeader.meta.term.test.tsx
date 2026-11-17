// PageHeader: a meta that does not fit beside the title (billing passes a compact ErrorState as the header's meta) drops
// to the rows under the title; it never squeezes the title to nothing (billing shot-servers-balance-failed at 80x24 drew
// the error band where "Plans & Billing" should be). A meta that fits stays on the title's row.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { routed } from './termHarness';
import { PageHeader } from './PageHeader';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

async function frame(node: () => React.ReactElement, width: number): Promise<string[]> {
  const { element } = routed(() => <FocusRoot>{node()}</FocusRoot>);
  t = await drawTest(element, { width, height: 16 });
  await t.settle();
  return (await t.settle()).split('\n').map((l) => l.trimEnd());
}

const tallMeta = (
  <Box dir="column">
    <Text>! Balance unavailable</Text>
    <Text>No answer from the server. Check your connection, then try again. Try again</Text>
    <Text>Details</Text>
  </Box>
);

test('a tall meta wider than the room drops under the title; the title keeps its row whole', async () => {
  const lines = await frame(() => <PageHeader title="Plans & Billing" meta={tallMeta} />, 50);
  const ti = lines.findIndex((l) => l.includes('Plans & Billing'));
  expect(ti).toBeGreaterThanOrEqual(0);
  // Nothing of the meta on the title's row; the meta's first line right under it.
  expect(lines[ti]).not.toContain('Balance');
  expect(lines.findIndex((l) => l.includes('! Balance unavailable'))).toBe(ti + 1);
  expect(lines.some((l) => l.includes('Details'))).toBe(true);
});

test('a short meta stays beside the title', async () => {
  const lines = await frame(() => <PageHeader title="Plans & Billing" meta={<Text>3 servers</Text>} />, 50);
  const row = lines.find((l) => l.includes('Plans & Billing'))!;
  expect(row).toContain('3 servers');
});

test('the title never shrinks below its words: a long title with a meta shows every word, never "…" or a cut word', async () => {
  const title = 'Plans and billing for every server you rent';
  for (const width of [24, 30, 40]) {
    const lines = await frame(() => <PageHeader title={title} meta={<Text>3 servers running</Text>} />, width);
    const words = lines.join(' ').split(/\s+/);
    for (const w of title.split(' ')) expect({ width, w, shown: words.includes(w) }).toEqual({ width, w, shown: true });
    expect({ width, cut: lines.some((l) => l.includes('…')) }).toEqual({ width, cut: false });
    expect({ width, meta: lines.some((l) => l.includes('3 servers running')) }).toEqual({ width, meta: true });
    t?.renderer.destroy(); t = null;
  }
});
