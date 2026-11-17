// RailPane in the terminal: the rail sits beside the page at the web's px / 8, every nav label starts on one text edge
// after the lead column (a glyph never lands on a label: "✦hats"), the subnav nests under its row, the strip wraps the
// destinations across, and the foot keeps its title and note on lines of their own with the end control at the edge.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Text } from '../../term/prim';
import { routed } from './termHarness';
import { RailFoot, RailFrame, RailNav, RailPane, RailSubnav } from './RailPane';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const draw = async (node: () => React.ReactNode, w: number, h: number) => {
  t = await drawTest(routed(node, '/ai').element, { width: w, height: h });
  return (await t.settle()).split('\n');
};

const items = (below?: React.ReactNode) => [
  { id: 'chats', href: '/ai', icon: 'sparkle' as const, label: 'Chats', current: true, mark: true },
  { id: 'agents', href: '/ai/agents', icon: 'hoody-ai-agent' as const, label: 'Agents' },
  { id: 'knowledge', href: '/ai/skills', icon: 'database' as const, label: 'Knowledge', ...(below ? { below } : {}) },
];
const foot = <RailFoot icon="computer" title="atlas · Personal" note="1 needs you" end={<Text>[⋯]</Text>} />;

test('beside the page: rail at width/8 cells, labels on one edge, subnav nested, foot lines apart', async () => {
  const sub = <RailSubnav label="Knowledge" items={[{ id: 's', href: '/ai/skills', label: 'Skills', current: true }, { id: 'm', href: '/ai/memory', label: 'Memory' }]} />;
  const lines = await draw(() => (
    <RailFrame width={240} regionHeight={null}>
      <RailPane label="AI" nav={<RailNav label="Switch" items={items(sub)} />} foot={foot}><Text>LIST</Text></RailPane>
      <Text>PAGE</Text>
    </RailFrame>
  ), 60, 16);
  const at = (s: string) => lines.findIndex((l) => l.includes(s));
  // The page starts after the rail's 30 cells.
  expect(lines.find((l) => l.includes('PAGE'))!.indexOf('PAGE')).toBe(30);
  // One text edge, the glyph in its own slot, the current bar and the needs-you mark.
  const edge = lines[at('Chats')]!.indexOf('Chats');
  expect(lines[at('Agents')]!.indexOf('Agents')).toBe(edge);
  expect(lines[at('Knowledge')]!.indexOf('Knowledge')).toBe(edge);
  expect(lines[at('Chats')]).toContain('▌✦ Chats');
  expect(lines[at('Chats')]).toContain('●');
  // The subnav is under its row, indented.
  expect(at('Skills')).toBe(at('Knowledge') + 1);
  expect(lines[at('Skills')]!.indexOf('Skills')).toBeGreaterThan(lines[at('Knowledge')]!.indexOf('Knowledge') - 2);
  // The foot: title and note on their own lines, the end control at the end of the title's row (never alone on a row).
  expect(at('1 needs you')).toBe(at('atlas · Personal') + 1);
  expect(lines[at('atlas · Personal')]).not.toContain('needs');
  expect(at('[⋯]')).toBe(at('atlas · Personal'));
  expect(lines[at('[⋯]')]!.indexOf('[⋯]') + 3).toBeGreaterThan(24);
});

test('strip: the destinations wrap across, never one per line', async () => {
  const lines = await draw(() => (
    <RailFrame width={240} regionHeight={null} single>
      <RailPane label="AI" strip nav={<RailNav label="Switch" items={items()} />} foot={foot}><Text>LIST</Text></RailPane>
    </RailFrame>
  ), 60, 12);
  const row = lines.find((l) => l.includes('Chats'))!;
  expect(row).toContain('Agents');
  expect(row).toContain('Knowledge');
});
