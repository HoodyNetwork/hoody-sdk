import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Text } from '../../term/prim';
import { routed } from './termHarness';
import { __resetKeptScroll } from './termScroll';
import { DashboardPage, DetailPage, Panel, SettingsPage, TablePage, Widget, WizardFooter, WizardPage, useWizardStep } from './Layouts';
import { PageHeader } from './PageHeader';
import { ScrollRegion } from './ScrollRegion';
import { PageBody } from './termScroll';
import { useEffect, useState } from 'react';
import { DataTable } from '../data/DataTable';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; __resetKeptScroll(); });
const draw = async (node: () => React.ReactNode, w: number, h: number, path = '/page') => {
  const r = routed(node, path);
  t = await drawTest(r.element, { width: w, height: h });
  return { frame: await t.settle(), router: r.router };
};

test('PageHeader: a subtitle of text and links is one flowing line, never a stray separator line', async () => {
  const { frame } = await draw(() => (
    <PageHeader title="Schedules" subtitle={<>{'15 schedules · 4 failed'}{' · '}<Text colour="blueText">Computers ›</Text></>} primary={{ label: 'New', onPress: () => {} }} />
  ), 80, 6);
  const lines = frame.split('\n');
  expect(lines[0]).toMatch(/^Schedules\s+.*New/);
  expect(lines[1]).toContain('15 schedules · 4 failed · Computers ›');
  expect(lines.some((l) => l.trim() === '·')).toBe(false);
});

test('Panel tones carry a mark (mono) and the notice sits after the body', async () => {
  const { frame } = await draw(() => <Panel title="Billing" tone="danger" notice="2 left out">body</Panel>, 40, 6);
  expect(frame).toMatchSnapshot();
  expect(frame).toContain('✗ Billing');
});

test('TablePage: the table fills; with questions the page scrolls as one document and the FAQ is drawn', async () => {
  const { frame } = await draw(() => <TablePage header={{ title: 'Keys' }} faq={{ items: [{ id: 'what', q: 'What is it?', a: 'A key.' }] }}><Text>table</Text></TablePage>, 60, 12);
  expect(frame).toContain('Keys');
  expect(frame).toContain('Questions');
  expect(frame).toContain('▸ What is it?');
});

test('TablePage: its table takes the first focus even with questions under it; ↓ moves the row cursor at once', async () => {
  const rows = [{ id: 'a', name: 'alpha' }, { id: 'b', name: 'beta' }, { id: 'c', name: 'gamma' }];
  const cols = [{ id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' as const } }];
  const { frame } = await draw(() => (
    <TablePage header={{ title: 'Files' }} faq={{ items: [{ id: 'what', q: 'What is it?', a: 'A file.' }] }}>
      <DataTable label="Files" data={rows} columns={cols} getRowId={(r) => r.id} />
    </TablePage>
  ), 80, 24);
  expect(frame).toContain('▌ alpha');
  t!.mockInput.pressArrow('down');
  const after = await t!.settle();
  expect(after).toContain('▌ beta');
  expect(after).not.toContain('▌ alpha');
});

test('DetailPage: tabs keep the open one in ?tab=; ←/→ open the next', async () => {
  const tabs = [{ id: 'over', label: 'Overview', content: <Text>overview body</Text> }, { id: 'hist', label: 'History', content: <Text>history body</Text> }];
  const { router } = await draw(() => <DetailPage header={{ title: 'atlas' }} tabs={tabs} />, 60, 10);
  expect(t!.captureCharFrame()).toContain('overview body');
  t!.mockInput.pressTab();
  await t!.settle();
  t!.mockInput.pressArrow('right');
  const f = await t!.settle();
  expect(f).toContain('history body');
  expect(f).toContain('▸History');
  expect((router.state.location.search as Record<string, string>).tab).toBe('hist');
});

const SECTIONS = [
  { id: 'profile', title: 'Profile', content: <Text>name and email</Text> },
  { id: 'security', title: 'Security', content: <Text>password</Text> },
  { id: 'danger', title: 'Delete account', tone: 'danger' as const, content: <Text>delete it</Text> },
];

test('SettingsPage wide: a section menu beside the sections; j walks it and writes ?section=', async () => {
  const { frame, router } = await draw(() => <SettingsPage header={{ title: 'Account' }} sections={SECTIONS} footer={<Text>save bar</Text>} />, 120, 20);
  expect(frame).toMatch(/▌Profile/);
  expect(frame).toContain('! Delete account');
  expect(frame.trimEnd().split('\n').at(-1)).toContain('save bar');
  t!.mockInput.pressTab();
  await t!.settle();
  t!.mockInput.pressKey('j');
  const f = await t!.settle();
  expect(f).toMatch(/▌Security/);
  expect((router.state.location.search as Record<string, string>).section).toBe('security');
});

test('SettingsPage narrow: the menu is a strip above the sections', async () => {
  const { frame } = await draw(() => <SettingsPage header={{ title: 'Account' }} sections={SECTIONS} />, 70, 16);
  const lines = frame.split('\n');
  const strip = lines.findIndex((l) => l.includes('▌Profile'));
  expect(lines[strip]).toContain('Security');
  expect(lines[strip]).toContain('Delete account');
});

test('SettingsPage follows a deep link ?section=', async () => {
  const { frame } = await draw(() => <SettingsPage header={{ title: 'Account' }} sections={SECTIONS} />, 120, 20, '/page?section=danger');
  expect(frame).toMatch(/▌Delete account/);
});

const tall = (id: string, title: string, extra: Partial<{ wide: boolean }> = {}) => ({
  id, title, ...extra, content: <>{Array.from({ length: 8 }, (_, i) => <Text key={i}>{`${title} line ${i}`}</Text>)}</>,
});

test('SettingsPage scroll-spy: reading down with Page keys moves the menu mark; the end marks the last section', async () => {
  const sections = [tall('a', 'Alpha'), tall('b', 'Beta'), tall('c', 'Gamma'), tall('d', 'Delta')];
  await draw(() => <SettingsPage header={{ title: 'Account' }} sections={sections} />, 100, 16);
  expect(t!.captureCharFrame()).toMatch(/▌Alpha/);
  const spyWait = async () => { await t!.settle(); await new Promise((r) => setTimeout(r, 60)); return t!.settle(); };
  t!.mockInput.pressKey('\u001b[6~'); // PageDown
  let f = await spyWait();
  expect(f).not.toMatch(/▌Alpha/);
  t!.mockInput.pressKey('END');
  f = await spyWait();
  expect(f).toMatch(/▌Delta/);
  t!.mockInput.pressKey('HOME');
  f = await spyWait();
  expect(f).toMatch(/▌Alpha/);
});

test('SettingsPage wide sections: beside a summary, the first wide section and the rest run under both columns', async () => {
  const sections = [tall('a', 'Alpha'), tall('k', 'Keys', { wide: true }), tall('z', 'Zeta')];
  await draw(() => <SettingsPage header={{ title: 'Account' }} sections={sections} summary={<Text>SUMMARY</Text>} />, 200, 60);
  const lines = t!.captureCharFrame().split('\n');
  const sumCol = lines.find((l) => l.includes('SUMMARY'))!.indexOf('SUMMARY');
  const alpha = lines.find((l) => l.includes('Alpha line 0'))!;
  const keys = lines.find((l) => l.includes('Keys line 0'))!;
  // Alpha stops before the summary column; a wide row's frame runs past it.
  expect(alpha.indexOf('Alpha line 0')).toBeLessThan(sumCol);
  expect(keys.trimEnd().length).toBeGreaterThan(sumCol + 8);
  const row = lines.findIndex((l) => l.includes('Keys line 0'));
  expect(lines.findIndex((l) => l.includes('SUMMARY'))).toBeLessThan(row);
});

test('DashboardPage: widgets wrap into rows by width; the last of a row widens to its end', async () => {
  const w = (n: string, size: 's' | 'm' | 'l' = 's') => <Widget key={n} title={n} size={size}><Text>{`${n} body`}</Text></Widget>;
  const wide = await draw(() => <DashboardPage header={{ title: 'Home' }}>{[w('A'), w('B'), w('C'), w('D', 'l')]}</DashboardPage>, 160, 24);
  const row = wide.frame.split('\n').find((l) => l.includes('A body'))!;
  expect(row).toContain('B body');
  expect(row).toContain('C body');
  t!.renderer.destroy();
  const narrow = await draw(() => <DashboardPage header={{ title: 'Home' }}>{[w('A'), w('B')]}</DashboardPage>, 60, 24);
  const r2 = narrow.frame.split('\n').find((l) => l.includes('A body'))!;
  expect(r2).not.toContain('B body');
});

test('DashboardPage: cards drawn by a component (the web\'s display:contents) still share rows; a strip between them takes a line; cards are as tall as their content', async () => {
  const w = (n: string, size: 's' | 'm' | 'l' = 's', lines = 1) => (
    <Widget key={n} title={n} size={size}>{Array.from({ length: lines }, (_, i) => <Text key={i}>{`${n} body ${i}`}</Text>)}</Widget>
  );
  // As Home: one component child; inside it a strip, then cards; a card inside a card is not a grid item.
  function Body() {
    return (
      <>
        <Text>STRIP</Text>
        {w('A', 's', 3)}
        {w('B', 's')}
        <Widget title="C" size="s"><Widget title="inner"><Text>inner body</Text></Widget></Widget>
        {w('D', 'm')}
      </>
    );
  }
  const { frame } = await draw(() => <DashboardPage header={{ title: 'Home' }}><Body /></DashboardPage>, 160, 40);
  const lines = frame.split('\n');
  const strip = lines.find((l) => l.includes('STRIP'))!;
  expect(strip).not.toContain('A');
  const a = lines.find((l) => l.includes('A body 0'))!;
  expect(a).toContain('B body 0');
  expect(a).toContain('┌'); // C's own card holds the inner one, in the same line
  // 160 cols = 3 tracks: A, B, C fill the first line; D (m) is alone on the next and widens to the end.
  const d = lines.find((l) => l.includes('D body 0'))!;
  expect(d.trimEnd().length).toBeGreaterThan(150);
  // Nothing stretches a card past its line's tallest content: no run of empty framed rows.
  const empties = lines.filter((l) => /^\s*│\s*│\s*$/.test(l.slice(26))).length;
  expect(empties).toBeLessThan(4);
});

test('WizardPage: steps, progress, footer; a done step goes back; useWizardStep keeps ?step=', async () => {
  const steps = [{ id: 'name', label: 'Name' }, { id: 'members', label: 'Members' }, { id: 'done', label: 'Review' }];
  function W() {
    const [i, set] = useWizardStep(steps);
    return (
      <WizardPage header={{ title: 'New realm' }} steps={steps} current={i} onStep={set}
        footer={<WizardFooter back={i > 0 ? { onPress: () => set(i - 1) } : undefined} primary={<Text>{`next:${i}`}</Text>} />}>
        <Text>{`body of ${steps[i]!.label}`}</Text>
      </WizardPage>
    );
  }
  const { frame, router } = await draw(() => <W />, 120, 20, '/page?step=members');
  expect(frame).toContain('Step 2 of 3 · Members');
  expect(frame).toMatch(/✓ Name/);
  expect(frame).toMatch(/▸2 Members/);
  expect(frame).toContain('body of Members');
  expect(frame).toContain('[Back]');
  t!.mockInput.pressTab();
  await t!.settle();
  t!.mockInput.pressEnter();
  const f = await t!.settle();
  expect(f).toContain('body of Name');
  expect((router.state.location.search as Record<string, string>).step).toBeUndefined();
});

test('WizardPage: the summary beside the body is as tall as its content, not the page', async () => {
  const steps = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
  const { frame } = await draw(() => (
    <WizardPage header={{ title: 'New realm' }} steps={steps} current={0} summary={<Text>choices here</Text>}>
      <Text>body</Text>
    </WizardPage>
  ), 200, 30);
  const lines = frame.split('\n');
  const at = lines.findIndex((l) => l.includes('choices here'));
  expect(at).toBeGreaterThan(0);
  // Its bottom border is the next line; nothing of the frame below it.
  const col = lines[at]!.indexOf('choices here') - 2;
  expect(lines[at + 1]![col]).toBe('└');
  expect(lines.slice(at + 2).some((l) => l[col] === '│')).toBe(false);
});

test('useWizardStep clamps a deep link past the reachable step (replace)', async () => {
  const steps = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }];
  function W() { const [i] = useWizardStep(steps, { reachable: 1 }); return <Text>{`at ${i}`}</Text>; }
  const { frame, router } = await draw(() => <W />, 30, 3, '/page?step=c');
  expect(frame).toContain('at 1');
  expect((router.state.location.search as Record<string, string>).step).toBe('b');
});

test('ScrollRegion: Tab, End shows the last row, Home the first', async () => {
  await draw(() => <ScrollRegion label="Plans">{Array.from({ length: 40 }, (_, i) => <Text key={i}>{`row ${i}`}</Text>)}</ScrollRegion>, 40, 10);
  t!.mockInput.pressTab(); await t!.settle();
  t!.mockInput.pressKey('END');
  let f = await t!.settle();
  expect(f).toContain('row 39');
  expect(f).not.toMatch(/row 0\b/);
  t!.mockInput.pressKey('HOME');
  f = await t!.settle();
  expect(f).toMatch(/row 0\b/);
});

test('PageBody keeps its position per key: leaving and coming back finds the same rows', async () => {
  let show!: (v: boolean) => void;
  function P() {
    const [on, setOn] = useState(true);
    show = setOn;
    return on ? <PageBody keep="/keys">{Array.from({ length: 40 }, (_, i) => <Text key={i}>{`row ${i}`}</Text>)}</PageBody> : <Text>elsewhere</Text>;
  }
  await draw(() => <P />, 40, 10);
  t!.mockInput.pressKey('END');
  expect(await t!.settle()).toContain('row 39');
  show(false);
  expect(await t!.settle()).toContain('elsewhere');
  show(true);
  await t!.settle();
  const f = await t!.settle();
  expect(f).toContain('row 39');
});

// A ?section= deep link to a section near the page's end, on a page whose last rows arrive after the link was
// followed (the reveal runs one tick after mount; a part that lays out later made the page 2 rows taller on AI
// "Advanced"): the section still gets as far up as the finished page allows, and stays the marked one although the
// page then stands at its end (the scroll-spy marks the last section there only when the reader scrolled).
let growLate: ((n: number) => void) | null = null;
function Late() {
  const [n, set] = useState(0);
  useEffect(() => { growLate = set; return () => { growLate = null; }; }, []);
  return <>{Array.from({ length: n }, (_, i) => <Text key={i}>{`late line ${i}`}</Text>)}</>;
}
test('SettingsPage deep link near the page end: rows that arrive after the reveal still bring the section up; its mark stays', async () => {
  const sections = [
    tall('a', 'Alpha'), tall('b', 'Beta'),
    { id: 'c', title: 'Gamma', content: <Text>Gamma line</Text> },
    { id: 'd', title: 'Delta', content: <><Text>Delta line</Text><Late /></> },
  ];
  const { frame } = await draw(() => <SettingsPage header={{ title: 'Account' }} sections={sections} />, 100, 16, '/page?section=c');
  expect(frame).toMatch(/▌Gamma/);
  const rowOf = (f: string, text: string): number => f.split('\n').findIndex((l) => l.includes(text));
  // The page is short: it stands at its end with Gamma below the first row of the body.
  const before = rowOf(frame, 'Gamma line');
  expect(before).toBeGreaterThan(0);
  expect(frame).toContain('Delta line');
  // Past the jump's quiet time, as a slow part is: then two more rows arrive at the end of the page.
  await new Promise((r) => setTimeout(r, 320));
  growLate!(2);
  await t!.settle();
  await new Promise((r) => setTimeout(r, 80));
  const f = await t!.settle();
  expect(f).toContain('late line 1');
  expect(rowOf(f, 'Gamma line')).toBe(before - 2);
  expect(f).toMatch(/▌Gamma/);
  expect(f).not.toMatch(/▌Delta/);
});
