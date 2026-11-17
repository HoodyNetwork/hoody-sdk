// ConvHeader.term: the header takes three rows (title row, where-it-runs line, rule), not the six the web markup took
// through the compat runtime (a blank row above and below, the meta list broken per item), and its meta items are told
// apart by a gap. The row-count and same-line tests fail on that drawing.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Text, setColourTier } from '../../term/prim';
import { Button } from '../controls/Button';
import { ConvHeader, type ConvHeaderProps } from './ConvHeader';
import type { ConvMeta } from './source';

const meta = (status: ConvMeta['status'], more: Partial<ConvMeta> = {}): ConvMeta => ({ computer: 'atlas', realm: 'Personal', folder: '/home/ada/projects/shop', agent: 'Reviewer', model: 'hoody-ai/hoody-free', status, ...more });
const LONG = 'A very long conversation title that goes on and on about the dashboard ports, the nightly restart, the backup rotation and more';
const rowsOf = (f: string): string[] => { const l = f.split('\n').map((x) => x.trimEnd()); return l.slice(0, l.indexOf('END')); };

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; setColourTier('truecolor'); });
async function draw(p: Partial<ConvHeaderProps>, width: number): Promise<TestTerm> {
  term = await drawTest(
    <FocusRoot><Box dir="column" width={width}>
      <ConvHeader size="l" title="Fix the failing checkout tests" meta={meta('running')} detailsOpen={false} onDetails={() => {}} {...p} />
      <Text>END</Text>
    </Box></FocusRoot>, { width, height: 16 });
  return term;
}

test('120 cells: three rows; title and state on one line, where it runs on the next, then the rule', async () => {
  const t = await draw({}, 120);
  const rows = rowsOf(await t.settle());
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatch(/^ Fix the failing checkout tests +● Running \[Details\]$/);
  expect(rows[1]).toBe(' atlas · Personal  /home/ada/projects/shop  Reviewer  hoody-ai/hoody-free');
  expect(rows[2]).toBe('─'.repeat(120));
}, 60_000);

test('80 cells, small size: three rows, Back first, no agent or model; computer, realm and folder stay whole', async () => {
  const t = await draw({ size: 's', onBack: () => {}, meta: meta('paused') }, 80);
  const rows = rowsOf(await t.settle());
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatch(/^ \[Back to chats\] Fix the failing checkout tests +! Paused \[Details\]$/);
  expect(rows[1]).toBe(' atlas · Personal  /home/ada/projects/shop');
}, 60_000);

test('a long title is cut with one ellipsis and never pushes the state, the host actions or Details off the row', async () => {
  for (const width of [80, 120]) {
    const t = await draw({ title: LONG, meta: meta('needs'), detailsOpen: true, actions: <Button size="sm" onPress={() => {}}>Add to Board</Button> }, width);
    const rows = rowsOf(await t.settle());
    expect(rows[0], String(width)).toMatch(/^ A very long conversation title.*… ● Needs you \[Add to Board\] \[✓ Close details\]$/);
    expect(rows[0]!.length, String(width)).toBeLessThanOrEqual(width);
    t.renderer.destroy();
    term = null;
  }
}, 60_000);

test('a long folder wraps; it is never cut or dropped', async () => {
  const folder = '/home/ada/projects/' + 'deeply-nested-service/'.repeat(4) + 'src';
  const t = await draw({ size: 's', meta: meta('idle', { folder }) }, 80);
  const rows = rowsOf(await t.settle());
  expect(rows.slice(1, -1).join('').replace(/\s+/g, '')).toBe(('atlas · Personal' + folder).replace(/\s+/g, ''));
  expect(rows.join('\n')).not.toContain('…');
}, 60_000);

test('no meta yet: the title row and the rule only', async () => {
  const t = await draw({ meta: undefined }, 80);
  const rows = rowsOf(await t.settle());
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatch(/^ Fix the failing checkout tests +\[Details\]$/);
}, 60_000);

test('keys: Tab goes Back, then the host action, then Details, in reading order; Enter presses the focused one', async () => {
  const calls: string[] = [];
  const t = await draw({ size: 's', onBack: () => calls.push('back'), onDetails: () => calls.push('details'), actions: <Button size="sm" onPress={() => calls.push('board')}>Add to Board</Button> }, 80);
  await t.settle();
  for (let i = 0; i < 3; i++) {
    t.mockInput.pressTab();
    await t.settle();
    t.mockInput.pressEnter();
    await t.settle();
  }
  expect(calls).toEqual(['back', 'board', 'details']);
}, 60_000);

test('mono: every state has a mark or a word beside its colour', async () => {
  setColourTier('mono');
  const t = await draw({ meta: meta('unreachable') }, 80);
  expect(await t.settle()).toContain("! Can't reach");
}, 60_000);

// Regression: in an open chat on a small screen Esc did nothing; only [Back to chats] went back.
test('small size: Esc goes back; at a wide size, or with no way back, Esc is left alone', async () => {
  const calls: string[] = [];
  let t = await draw({ size: 's', onBack: () => calls.push('back') }, 80);
  await t.settle();
  t.mockInput.pressEscape();
  await t.settle();
  expect(calls).toEqual(['back']);
  t.renderer.destroy();
  t = await draw({ size: 'l', onBack: () => calls.push('wide') }, 120);
  await t.settle();
  t.mockInput.pressEscape();
  await t.settle();
  expect(calls).toEqual(['back']);
}, 60_000);
