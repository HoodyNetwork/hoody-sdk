// RailPane in the shell's page scroll, as the web draws it: the rail is exactly the page region's height whatever the
// list's length (`.rail { position: sticky; block-size: <region> }`), the list in its body scrolls itself (`.body`),
// and the head and foot stay on screen. Beside the rail the page scrolls in the shell's outlet; the rail stays put.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, Text } from '../../term/prim';
import { routed } from './termHarness';
import { PageOutlet, useScrollOwner } from './termScroll';
import { ScrollRegion } from './ScrollRegion';
import { ContentRegion } from './ContentRegion';
import { RailFoot, RailFrame, RailNav, RailPane } from './RailPane';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const nav = <RailNav label="Switch" items={[{ id: 'chats', href: '/ai', icon: 'sparkle' as const, label: 'Chats', current: true }]} />;
const foot = <RailFoot icon="computer" title="atlas · Personal" note="1 needs you" />;
const rows = (n: number, tag: string) => Array.from({ length: n }, (_, i) => <Text key={i}>{`${tag} ${i + 1}`}</Text>);
/** The rail's list as the AI tab's is: a list that scrolls itself (a kit list windows its rows; ScrollRegion here). */
const selfScrolling = (n: number) => <ScrollRegion label="Chats">{rows(n, 'ROW')}</ScrollRegion>;
const rail = (list: React.ReactNode, single: boolean, pageRows = 3) => (
  <RailFrame width={240} regionHeight={null} single={single}>
    <RailPane label="AI" strip={single} head={<Text>HEAD</Text>} nav={nav} foot={foot}>{list}</RailPane>
    {single ? null : <ContentRegion><Box dir="column">{rows(pageRows, 'PAGE')}</Box></ContentRegion>}
  </RailFrame>
);
const W = 60, H = 20;
const draw = async (node: React.ReactNode) => {
  t = await drawTest(routed(() => <Box dir="column" grow={1} height={H}><PageOutlet>{node}</PageOutlet></Box>, '/ai').element, { width: W, height: H });
  return (await t.settle()).split('\n');
};
const frame = async () => (await t!.settle()).split('\n');
const at = (lines: string[], s: string) => lines.findIndex((l) => l.includes(s + ' ') || l.trimEnd().endsWith(s));
const wheel = async (x: number, y: number, n: number) => { for (let i = 0; i < n; i++) await t!.mockMouse.scroll(x, y, 'down'); };

for (const single of [true, false]) {
  const where = single ? 'whole screen' : 'beside the page';
  test(`${where}: a short list leaves the foot on the region's last rows`, async () => {
    const lines = await draw(rail(<Box dir="column">{rows(3, 'ROW')}</Box>, single));
    expect(at(lines, '1 needs you')).toBe(H - 1);
    expect(at(lines, 'atlas · Personal')).toBe(H - 2);
  });

  test(`${where}: a list taller than the screen keeps head and foot on screen and scrolls itself`, async () => {
    const lines = await draw(rail(selfScrolling(40), single, 50));
    // Head on the first row, foot on the last two (a regression would grow the rail 40 rows down, the foot off screen).
    expect(at(lines, 'HEAD')).toBe(0);
    expect(at(lines, 'atlas · Personal')).toBe(H - 2);
    expect(at(lines, '1 needs you')).toBe(H - 1);
    expect(at(lines, 'ROW 1')).toBeGreaterThan(0);
    expect(at(lines, 'ROW 40')).toBe(-1);
    // The wheel over the list scrolls the list alone: rows move, head and foot stay, the page beside does not move.
    await wheel(lines[at(lines, 'ROW 1')]!.indexOf('ROW 1') + 1, at(lines, 'ROW 1') + 1, 20);
    const after = await frame();
    expect(at(after, 'ROW 1')).toBe(-1);
    expect(at(after, 'ROW 21')).toBeGreaterThan(0);
    expect(at(after, 'ROW 21')).toBeLessThan(H - 2);
    expect(at(after, 'HEAD')).toBe(0);
    expect(at(after, 'atlas · Personal')).toBe(H - 2);
    expect(at(after, '1 needs you')).toBe(H - 1);
    if (!single) expect(at(after, 'PAGE 1')).toBe(at(lines, 'PAGE 1'));
  });
}

test("the rail's list sees no page scroll owner, so a kit list fills the body and windows its own rows", async () => {
  let seen: unknown = 'unset';
  function Probe() { seen = useScrollOwner(); return <Text>PROBE</Text>; }
  await draw(rail(<Probe />, true));
  expect(seen).toBeNull();
});

test('beside the page: the page scrolls in the outlet while the rail stays put (sticky)', async () => {
  const lines = await draw(rail(<Box dir="column">{rows(5, 'ROW')}</Box>, false, 50));
  expect(at(lines, 'PAGE 1')).toBe(0);
  await wheel(lines[0]!.indexOf('PAGE 1') + 1, 5, 20);
  const after = await frame();
  expect(at(after, 'PAGE 1')).toBe(-1);
  expect(at(after, 'PAGE 21')).toBe(0);
  expect(at(after, 'HEAD')).toBe(0);
  expect(at(after, 'ROW 1')).toBe(at(lines, 'ROW 1'));
  expect(at(after, '1 needs you')).toBe(H - 1);
});

test('one slot holding the page and no rail: the page scrolls in the outlet as before', async () => {
  const lines = await draw(<RailFrame width={240} regionHeight={null} single><ContentRegion><Box dir="column">{rows(50, 'PAGE')}</Box></ContentRegion></RailFrame>);
  expect(at(lines, 'PAGE 1')).toBe(0);
  await wheel(5, 5, 20);
  const after = await frame();
  expect(at(after, 'PAGE 1')).toBe(-1);
  expect(at(after, 'PAGE 21')).toBe(0);
});
