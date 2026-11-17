// Big screens: a Dashboard, Detail or Settings page stops at the web's content cap (`.capped`:
// --content-max 1600 px = 200 columns) and stays at the start edge; a table page fills the screen as the web's does.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Text } from '../../term/prim';
import { cellWidth as cells } from '../../term/prim/TableCells';
import { routed } from './termHarness';
import { __resetKeptScroll } from './termScroll';
import { DashboardPage, DetailPage, PageFrame, SettingsPage, TablePage, Widget } from './Layouts';
import { ASIDE_W, CAPPED_PAGE_COLS, CONTENT_MAX_COLS, FORM_MAX_COLS, pxCols } from './termBreaks';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; __resetKeptScroll(); });
const draw = async (node: () => React.ReactNode, w: number, h: number) => {
  t = await drawTest(routed(node).element, { width: w, height: h });
  return (await t.settle()).split('\n').map((l) => l.trimEnd());
};
/** The widest drawn line, in cells. */
const widest = (lines: string[]): number => Math.max(...lines.map((l) => cells(l)));
const act = { label: 'New', onPress: () => {} };

test('the cap is the web content cap in columns', () => {
  // The web's --content-max (1600 px) and --form-max (720 px) through the terminal's one px → cell conversion.
  expect(CONTENT_MAX_COLS).toBe(pxCols(1600));
  expect(CONTENT_MAX_COLS).toBe(200);
  expect(CAPPED_PAGE_COLS).toBe(CONTENT_MAX_COLS + 2);
  expect(FORM_MAX_COLS).toBe(pxCols(720));
  expect(FORM_MAX_COLS).toBe(90);
});

test('DashboardPage at 320 columns: header and cards stop at the content cap, at the start edge', async () => {
  const lines = await draw(() => (
    <DashboardPage header={{ title: 'Home', primary: act }}>
      <Widget title="One" size="l"><Text>body</Text></Widget>
      <Widget title="Two"><Text>body</Text></Widget>
    </DashboardPage>
  ), 320, 20);
  expect(lines.join('\n')).toContain('One');
  // A regression would put the header's action and the full-width card's corner at column 319.
  expect(widest(lines)).toBeLessThanOrEqual(CAPPED_PAGE_COLS);
  expect(widest(lines)).toBeGreaterThanOrEqual(CONTENT_MAX_COLS - 2);
  expect(lines[0]!.startsWith(' Home')).toBe(true);
});

test('DashboardPage at 200 columns is not cut by the cap', async () => {
  const lines = await draw(() => <DashboardPage header={{ title: 'Home', primary: act }}><Widget title="One" size="l"><Text>body</Text></Widget></DashboardPage>, 200, 12);
  expect(widest(lines)).toBeGreaterThanOrEqual(198);
});

test('SettingsPage and DetailPage at 320 columns stop at the content cap', async () => {
  const s = await draw(() => <SettingsPage header={{ title: 'Account', primary: act }} sections={[{ id: 'a', title: 'Profile', content: <Text>fields</Text> }]} />, 320, 16);
  expect(s.join('\n')).toContain('Profile');
  expect(widest(s)).toBeLessThanOrEqual(CAPPED_PAGE_COLS);
  t?.renderer.destroy(); t = null;
  const d = await draw(() => <DetailPage header={{ title: 'atlas', primary: act }}><Text>facts</Text></DetailPage>, 320, 12);
  expect(d.join('\n')).toContain('facts');
  expect(widest(d)).toBeLessThanOrEqual(CAPPED_PAGE_COLS);
  expect(widest(d)).toBeGreaterThanOrEqual(CONTENT_MAX_COLS - 2);
});

test('TablePage at 320 columns still fills the screen (the web table page has no cap)', async () => {
  const lines = await draw(() => <TablePage header={{ title: 'Keys', primary: act }}><Text>table</Text></TablePage>, 320, 8);
  expect(widest(lines)).toBeGreaterThanOrEqual(316);
});

/** First and last cell of the frame line that draws `mark`. */
const span = (lines: string[], mark: string): [number, number] => {
  const l = lines.find((x) => x.includes(mark))!;
  return [cells(l.slice(0, l.length - l.trimStart().length)), cells(l)];
};

test('SettingsPage at 240 columns: the form column stops at the web form width, the summary sits right after it', async () => {
  const lines = await draw(() => (
    <SettingsPage header={{ title: 'Account' }} summary={<Text>SUMMARY</Text>}
      sections={[{ id: 'a', title: 'Profile', content: <Text>fields</Text> }, { id: 'b', title: 'Security', content: <Text>more</Text> }]} />
  ), 240, 20);
  const top = lines.find((l) => l.includes('fields'))!;
  // A regression would run the section frame to column ~190 and put the summary at the far end (its text past column 195).
  const sum = lines.find((l) => l.includes('SUMMARY'))!;
  expect(cells(sum.slice(0, sum.indexOf('SUMMARY')))).toBeLessThanOrEqual(1 + 24 + 1 + FORM_MAX_COLS + 4);
  expect(cells(top)).toBeLessThanOrEqual(1 + 24 + 1 + FORM_MAX_COLS + 1 + ASIDE_W);
  expect(widest(lines)).toBeLessThanOrEqual(1 + 24 + 1 + FORM_MAX_COLS + 1 + ASIDE_W + 1);
});

test('SettingsPage at 100 columns is not narrowed by the form cap', async () => {
  const lines = await draw(() => <SettingsPage header={{ title: 'Account' }} sections={[{ id: 'a', title: 'Profile', content: <Text>fields</Text> }]} />, 92, 12);
  expect(span(lines, 'fields')[0]).toBeLessThan(6);
  expect(widest(lines)).toBeGreaterThanOrEqual(90);
});

test('a capped PageFrame at 320 columns stops at the web content cap (it was 140 columns, a stale 1180 px)', async () => {
  const lines = await draw(() => <PageFrame capped><Text>{'x'.repeat(400)}</Text></PageFrame>, 320, 8);
  expect(widest(lines)).toBe(1 + CONTENT_MAX_COLS);
});
