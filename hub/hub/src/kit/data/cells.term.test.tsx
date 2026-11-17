import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { CellLines, MarkCell, ProgressCell, UnknownCell, checkAgainAction, progressWords } from './cells';
import { Box, Text, setColourTier } from '../../term/prim';
import { semanticsOf, type SemNode } from '../../term/prim/semantics';
import { Tag } from './Display';

test('ProgressCell: a ten-block meter and the words; words alone without a total', async () => {
  const t = await drawTest(<><ProgressCell name="a.zip" done={38_000_000} total={50_000_000} /><ProgressCell name="b" done={5} /><UnknownCell /><CellLines>{'name'}{null}{'sub'}</CellLines></>, { width: 50, height: 6 });
  const f = await t.settle();
  expect(f).toMatch(/████████░░ 76% · 36 MB of 48 MB/);
  expect(f).toContain('5 B so far');
  expect(f).toContain('! Outcome unknown');
  expect(f).toMatch(/name *\nsub/);
  t.renderer.destroy();
  expect(progressWords({ done: null })).toBe('Starting');
  expect(checkAgainAction({ onCheck: () => undefined }).label).toBe('Check again');
});

test('MarkCell: names start in one column whether or not the row has a mark', async () => {
  const t = await drawTest(
    <Box dir="column">
      <MarkCell mark={<Text>!</Text>}>queue-drain</MarkCell>
      <MarkCell>ping-api</MarkCell>
    </Box>, { width: 30, height: 3 });
  const lines = (await t.settle()).split('\n');
  expect(lines[0]!.indexOf('queue-drain')).toBe(lines[1]!.indexOf('ping-api'));
  expect(lines[0]!.startsWith('!')).toBe(true);
  t.renderer.destroy();
});

test('MarkCell: a narrow cell drops the tag whole first, then cuts the name with one "…"', async () => {
  const cell = (w: number) => <Box dir="row" width={w}><MarkCell mark={<Text>!</Text>} after={<Tag>Web request</Tag>}>POST hooks.example.org</MarkCell></Box>;
  let t = await drawTest(cell(40), { width: 42, height: 2 });
  let f = await t.settle(); f = await t.settle();
  expect(f).toMatch(/! POST hooks\.example\.org +Web request /);
  expect(f).not.toContain('‹'); // a tag is a tinted cell, never a stand-in's angle quotes
  t.renderer.destroy();
  t = await drawTest(cell(14), { width: 42, height: 2 });
  f = await t.settle(); f = await t.settle();
  expect(f).not.toContain('Web');
  expect(f).toContain('! POST hooks.…'); // 2-cell gutter + 12 cells: 11 of the name and one "…"
  t.renderer.destroy();
});

test('a Tag is a tinted cell (the raised tint), "(…)" in mono: never a stand-in\'s angle quotes', async () => {
  setColourTier('truecolor');
  let t = await drawTest(<Box dir="row"><Text>name </Text><Tag>Command</Tag></Box>, { width: 30, height: 1 });
  await t.settle();
  const spans = t.captureSpans().lines[0]!.spans;
  const tag = spans.find((s) => s.text.includes('Command'))!;
  t.renderer.destroy();
  expect(tag.text).toContain(' Command ');
  expect(tag.bg.toInts().slice(0, 3)).toEqual([0x20, 0x20, 0x23]); // tokens.ts raised
  setColourTier('mono');
  t = await drawTest(<Box dir="row"><Text>name </Text><Tag>Command</Tag></Box>, { width: 30, height: 1 });
  const f = await t.settle();
  t.renderer.destroy();
  setColourTier('truecolor');
  expect(f).toContain('name (Command)');
  expect(f).not.toContain('‹');
});

test('a cut cell keeps its whole value in the semantics (the screen shows the cut)', async () => {
  const t = await drawTest(<Box dir="row" width={16}><MarkCell>POST hooks.example.org/deploy</MarkCell></Box>, { width: 20, height: 1 });
  let f = await t.settle(); f = await t.settle();
  const names: string[] = [];
  const walk = (ns: SemNode[]) => { for (const n of ns) { names.push(n.name); walk(n.children); } };
  walk(semanticsOf(t.renderer as never));
  t.renderer.destroy();
  expect(f).toContain('…');
  expect(names).toContain('POST hooks.example.org/deploy');
  expect(names.some((n) => n.includes('…'))).toBe(false);
});

// Computers' realm chip is a Tag around elements (the realm's colour swatch and the name): the whole chip takes the tag
// tint, never only its two pad cells (which drew a grey block on each side of an untinted name).
test('a Tag around elements (realm swatch + name) is tinted end to end, pads and name alike', async () => {
  setColourTier('truecolor');
  const t = await drawTest(<Box dir="row"><Text>name </Text><Tag><Text colour="acc">■</Text><Text> Personal</Text></Tag><Text> · SG</Text></Box>, { width: 40, height: 1 });
  await t.settle();
  const spans = t.captureSpans().lines[0]!.spans;
  t.renderer.destroy();
  const line = spans.map((s) => s.text).join('');
  const from = line.indexOf('■') - 1;
  const to = line.indexOf('Personal') + 'Personal'.length; // the closing pad cell
  let x = 0;
  for (const s of spans) {
    for (let i = 0; i < s.text.length; i++, x++) {
      if (x >= from && x <= to) expect([x, s.bg.toInts().slice(0, 3)]).toEqual([x, [0x20, 0x20, 0x23]]);
    }
  }
});
