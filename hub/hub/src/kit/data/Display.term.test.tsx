import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { ContextLine, Facts, StatStrip, StatTile, StatusPill, Tag, factControls } from './Display';
import { InfoTip } from '../overlays/InfoTip';
import { Button } from '../controls/Button';

const facts = [
  { label: 'Runs', value: 'Every 5 minutes' },
  { label: 'Computer', value: 'atlas' },
  { label: 'Last result', value: 'Worked' },
  { label: 'Next run', value: 'in 3 minutes' },
  { label: 'Command', value: 'curl -fsS https://api.example.org/health', wide: true },
];

test('Facts: two columns filled top-down when wide; label and value on one line', async () => {
  const t = await drawTest(<FocusRoot><Facts items={facts} /></FocusRoot>, { width: 100, height: 8 });
  const f = await t.settle();
  const lines = f.split('\n');
  expect(lines[0]).toMatch(/^Runs\s+Every 5 minutes\s+Last result\s+Worked/);
  expect(lines[1]).toMatch(/^Computer\s+atlas\s+Next run\s+in 3 minutes/);
  expect(f).toMatch(/Command\s+curl -fsS https:\/\/api\.example\.org\/health/);
  expect(f).not.toMatch(/[│┃]/);
  t.renderer.destroy();
});

test('Facts: one column when a plain value with its copy mark does not fit half the room, so no value splits', async () => {
  const items = [
    { label: 'Time', value: '2026-11-11T08:46:57.000Z', copy: '2026-11-11T08:46:57.000Z' },
    { label: 'Method', value: 'GET' },
    { label: 'Visitor address', value: '93.184.216.225' },
    { label: 'Program', value: 'files' },
  ];
  const t = await drawTest(<FocusRoot><Facts items={items} /></FocusRoot>, { width: 78, height: 8 });
  const lines = (await t.settle()).split('\n');
  expect(lines[0]).toMatch(/^Time\s+2026-11-11T08:46:57\.000Z\s+\S+ copy\s*$/);
  expect(lines[1]).toMatch(/^Method\s+GET\s*$/);
  t.renderer.destroy();
  // Short values at the same width keep their two columns.
  const two = await drawTest(<FocusRoot><Facts items={items.slice(1)} /></FocusRoot>, { width: 78, height: 8 });
  expect((await two.settle()).split('\n')[0]).toMatch(/^Method\s+GET\s+Program\s+files/);
  two.renderer.destroy();
});

test('Facts: one column when narrow; a full id shows masked only', async () => {
  const id = '0123456789abcdef01234567';
  const t = await drawTest(<FocusRoot><Facts items={[...facts.slice(0, 2), { label: 'Reference', id }]} /></FocusRoot>, { width: 50, height: 8 });
  const f = await t.settle();
  expect(f.split('\n')[1]).toMatch(/^Computer\s+atlas/);
  expect(f).toContain('0123…4567');
  expect(f).not.toContain(id);
  t.renderer.destroy();
});

test('factControls is the shared pure check', () => {
  expect(factControls([{ label: 'x', value: 'plain' }])).toEqual([]);
});

test('StatStrip: in a row when it fits, pairs when not; a status has its mark', async () => {
  const items = [
    { label: 'Computers', value: '12', detail: '7 running' },
    { label: 'Open alerts', value: '3', status: 'warn' as const },
    { label: 'Spend', value: '$4.10', detail: 'this month' },
  ];
  const wide = await drawTest(<StatStrip items={items} />, { width: 90, height: 6 });
  const fw = await wide.settle();
  expect(fw.split('\n')[0]).toMatch(/Computers\s+! Open alerts\s+Spend/);
  // As the web: the number on its line, the detail under it.
  expect(fw.split('\n')[1]).toMatch(/^12\s+3\s+\$4\.10\s*$/);
  expect(fw.split('\n')[2]).toMatch(/^7 running\s+this month\s*$/);
  wide.renderer.destroy();
  const narrow = await drawTest(<StatStrip items={items} />, { width: 30, height: 8 });
  const fn = await narrow.settle();
  expect(fn).toMatch(/Computers\s+! Open alerts/);
  expect(fn).toMatch(/Spend/);
  narrow.renderer.destroy();
});

// Vault: "Account storage / 3% / of 50 MB" left the caption alone on a third row.
test('StatStrip: a short caption that reads on from the number shares its row when the label is as wide; others stay under', async () => {
  const t = await drawTest(<StatStrip items={[
    { label: 'Entries here', value: '3' },
    { label: 'Account storage', value: '3%', detail: 'of 50 MB' },
    { label: 'Computers', value: '12', detail: '4 up' },
    { label: 'Spend', value: '$4.10', detail: 'this month' },
  ]} />, { width: 90, height: 6 });
  const f = (await t.settle()).split('\n');
  t.renderer.destroy();
  expect(f[1]).toMatch(/^3\s+3% of 50 MB\s+12\s+\$4\.10\s*$/);
  // A caption starting with a digit, or wider than the label allows, stays under its number.
  expect(f[2]).toMatch(/^\s+4 up\s+this month\s*$/);
});

// Vault: "Account storage / 3% / of 50 MB" left the caption alone on a third row.
test('StatStrip: a short caption that reads on from the number shares its row when the label is as wide; others stay under', async () => {
  const t = await drawTest(<StatStrip items={[
    { label: 'Entries here', value: '3' },
    { label: 'Account storage', value: '3%', detail: 'of 50 MB' },
    { label: 'Computers', value: '12', detail: '4 up' },
    { label: 'Spend', value: '$4.10', detail: 'this month' },
  ]} />, { width: 90, height: 6 });
  const f = (await t.settle()).split('\n');
  t.renderer.destroy();
  expect(f[1]).toMatch(/^3\s+3% of 50 MB\s+12\s+\$4\.10\s*$/);
  // A caption starting with a digit, or wider than the label allows, stays under its number.
  expect(f[2]).toMatch(/^\s+4 up\s+this month\s*$/);
});

test('StatTile, StatusPill and ContextLine read without colour', async () => {
  const t = await drawTest(
    <>
      <StatTile label="Failed" value="4" tone="danger" hint="today" />
      <StatusPill tone="ok">Running</StatusPill>
      <ContextLine realm={{ name: 'Home' }} computer={{ name: 'atlas', tone: 'ok', state: 'running' }} server={{ name: 'fra-1', flag: '🇩🇪' }} />
    </>,
    { width: 60, height: 8 },
  );
  const f = await t.settle();
  expect(f).toMatch(/✗ 4/);
  expect(f).toContain('✓ Running');
  // The server's flag as its two letters, never the regional-indicator emoji (CountryFlag's rule).
  expect(f).toMatch(/■ Home · ✓ atlas \(running\) · DE fra-1/);
  expect(f).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
  t.renderer.destroy();
});

test('a Tag after a name yields whole: shown when it fits, gone (never a cut "Web r") when the cell is too narrow', async () => {
  const cell = (w: number) => (
    <Box dir="row" width={w} clip><Box dir="row" shrink={0}><span>{'ping-api'} <Tag>Web request</Tag></span></Box></Box>
  );
  let t = await drawTest(cell(30), { width: 32, height: 2 });
  expect(await t.settle()).toMatch(/ping-api +Web request /);
  t.renderer.destroy();
  t = await drawTest(cell(14), { width: 32, height: 2 });
  const f = await t.settle();
  expect(f).toContain('ping-api');
  expect(f).not.toContain('Web');
  t.renderer.destroy();
});

test('Facts: one label column; a long label wraps inside it and every value starts at the same x', async () => {
  const items = [
    { label: 'Name', value: 'Personal' },
    { label: 'Shared on purpose with the whole team', value: 'Yes, by the owner' },
    { label: 'Kind', value: 'Realm' },
  ];
  const t = await drawTest(<Facts items={items} columns={1} />, { width: 60, height: 6 });
  const lines = (await t.settle()).split('\n');
  const xs = ['Personal', 'Yes, by the owner', 'Realm'].map((v) => lines.find((l) => l.includes(v))!.indexOf(v));
  expect(new Set(xs).size).toBe(1);
  t.renderer.destroy();
});

test('an element passed as words (an InfoTip, a link) is drawn beside the text, never inside a Text (no crash)', async () => {
  const tip = <InfoTip text="Paid out monthly" subject="earned">earned</InfoTip>;
  const t = await drawTest(
    <FocusRoot>
      <StatStrip items={[{ label: 'Credit', value: '$4.00', detail: tip }, { label: 'People', value: <span>3</span> }]} />
      <Tag tone="warn"><InfoTip text="Two chats wait" subject="2 waiting">2 waiting</InfoTip></Tag>
      <StatusPill tone="ok">{tip}</StatusPill>
      <StatTile label="Saved" value={tip} hint={tip} />
    </FocusRoot>, { width: 80, height: 14 });
  const f = await t.settle();
  expect(f).toContain('$4.00');
  expect(f).toContain('earned');
  expect(f).toContain('2 waiting');
  t.renderer.destroy();
});

test('inside running text (a Link label) a Tag and a StatusPill draw as inline spans, no crash', async () => {
  const t = await drawTest(<Text>Chief <Tag tone="warn">Paused</Tag> and <StatusPill tone="ok">Running</StatusPill></Text>, { width: 60, height: 2 });
  const f = await t.settle();
  expect(f).toContain('Chief  Paused  and');
  expect(f).not.toContain('‹');
  expect(f).toContain('Running');
  t.renderer.destroy();
});

test('ContextLine inside a Button label (running text) draws inline, no crash', async () => {
  const t = await drawTest(<FocusRoot><Button onPress={() => {}}><ContextLine computer={{ name: 'atlas', href: '/computers/a', tone: 'ok' }} server={{ name: 'sg-1' }} /></Button></FocusRoot>, { width: 60, height: 3 });
  const f = await t.settle();
  expect(f).toContain('atlas');
  expect(f).toContain('· sg-1');
  t.renderer.destroy();
});

// As the web (.ssValue is a column): the number stands on its line, the detail under it, never "8 4 running" run together.
test('StatStrip: the detail goes under the number, wide and narrow, never on the number line', async () => {
  const items = [{ label: 'Computers', value: 8, detail: '4 running · 2 stopped · 1 failed' }, { label: 'Servers', value: 3 }];
  for (const [width, narrow] of [[80, 'pairs'], [24, 'pairs'], [24, 'rows']] as const) {
    const t = await drawTest(<StatStrip items={items} narrow={narrow} />, { width, height: 10 });
    const f = await t.settle();
    t.renderer.destroy();
    const lines = f.split('\n');
    expect(f).not.toMatch(/8 +4 running/);
    const num = lines.findIndex((l) => /(^|\s)8(\s|$)/.test(l));
    expect([width, narrow, num >= 0 && lines[num + 1]!.includes('4 running')]).toEqual([width, narrow, true]);
  }
});

test('Facts in a wrapping row (beside a pill, as the Scripts test answer): takes a row of its own and shows its values', async () => {
  const t = await drawTest(
    <Box dir="row" wrap gap={1} width={60}>
      <Text>Passed</Text>
      <Text>41 ms</Text>
      <Facts items={[{ label: 'Content type', value: 'application/json' }, { label: 'Size', value: '2 KB' }]} />
    </Box>,
    { width: 60, height: 8 },
  );
  const f = await t.settle();
  expect(f).toMatch(/Content type\s+application\/json/);
  expect(f).toMatch(/Size\s+2 KB/);
  t.renderer.destroy();
});

test('Facts: a list value with an indent (ul, padding at the start) wraps inside the value column, no letter lost', async () => {
  const long = 'New inbound IPv4 TCP connections from outside to its listening ports only from 203.0.113.0/24';
  const t = await drawTest(
    <Facts columns={1} items={[{ label: 'Saved policy', value: <ul style={{ display: 'flex', flexDirection: 'column', paddingInlineStart: 2, margin: 0 }}><li>{long}</li><li>Memory up to 256M</li></ul> }, { label: 'Inbound firewall now', value: 'In place' }]} />,
    { width: 50, height: 12 },
  );
  const f = await t.settle();
  const words = f.split('\n').map((l) => l.replace(/^Saved policy/, '').trim()).join(' ').replace(/\s+/g, ' ');
  expect(words).toContain(long);
  for (const l of f.split('\n')) expect(l.trimEnd().length).toBeLessThanOrEqual(50);
  t.renderer.destroy();
});

test('ContextLine wider than its row (a long computer name at 60 cells) wraps part by part, nothing past the edge', async () => {
  const line = <ContextLine realm={{ name: 'Personal', href: '/c' }} computer={{ name: 'production-build-runner-singapore-01', tone: 'ok', state: 'Running', href: '/c/x' }} server={{ name: 'SG n12', href: '/s' }} />;
  // As PageHeader's Inline holds it: one piece of a wrapping row.
  const t = await drawTest(<FocusRoot><Box dir="column" width={58}><Box dir="row" wrap shrink={0} align="start">{line}</Box></Box></FocusRoot>, { width: 58, height: 5 });
  const f = await t.settle();
  expect(f).toContain('production-build-runner-singapore-01 (Running)');
  expect(f).toContain('SG n12');
  t.renderer.destroy();
});
