// SettingsPage's narrow section strip (below the rail breakpoint): one row, as the web's phone strip, which scrolls
// sideways between edge chevrons and never wraps. A strip wider than its room folds the way kit Tabs does: a window
// around the current section and "‹ n" / "n ›" counts for the sections out of view. A wrapped second line pushed the
// AI page's last section ("Questions") onto a row of its own at 80x24.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Text } from '@term/prim';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { routed } from './termHarness';
import { __resetKeptScroll } from './termScroll';
import { SettingsPage } from './Layouts';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; __resetKeptScroll(); });
const draw = async (node: () => React.ReactNode, w: number, h: number, path = '/page') => {
  const r = routed(node, path);
  t = await drawTest(r.element, { width: w, height: h });
  return { frame: await t.settle(), router: r.router };
};

const section = (id: string, title: string) => ({ id, title, content: <Text>{`${title} body`}</Text> });
const MANY = [
  section('model', 'Default model'), section('accounts', 'Accounts'), section('claude', 'Claude Code'),
  section('allowance', 'Hoody AI allowance'), section('spending', 'Spending'), section('advanced', 'Advanced'),
  section('questions', 'Questions'),
];
const stripRow = (frame: string): number => frame.split('\n').findIndex((l) => l.includes('▌'));

test('narrow strip wider than its room: one row, folded around the current section, never a wrapped line', async () => {
  const { frame } = await draw(() => <SettingsPage header={{ title: 'Models & keys' }} sections={MANY} />, 60, 16);
  const lines = frame.split('\n');
  const at = stripRow(frame);
  expect(at).toBeGreaterThanOrEqual(0);
  expect(lines[at]).toContain('▌Default model');
  expect(lines[at]).toMatch(/\d+ ›/);
  // The row right under the strip is its bottom rule, not a second line of sections.
  expect(lines[at + 1]!.trim()).toMatch(/^─+$/);
  expect(frame).not.toMatch(/^\s*Questions\s*$/m);
});

test('narrow strip: a deep link to the last section shows it, with the hidden ones counted before it', async () => {
  const { frame } = await draw(() => <SettingsPage header={{ title: 'Models & keys' }} sections={MANY} />, 60, 16, '/page?section=questions');
  const lines = frame.split('\n');
  const at = stripRow(frame);
  expect(lines[at]).toContain('▌Questions');
  expect(lines[at]).toMatch(/‹ \d+/);
  expect(lines[at]).not.toMatch(/\d+ ›/);
  expect(lines[at + 1]!.trim()).toMatch(/^─+$/);
});

test('narrow strip that fits: every section, no fold counts (positive control)', async () => {
  const few = MANY.slice(0, 3);
  const { frame } = await draw(() => <SettingsPage header={{ title: 'Models & keys' }} sections={few} />, 60, 16);
  const line = frame.split('\n')[stripRow(frame)]!;
  expect(line).toContain('▌Default model');
  expect(line).toContain('Accounts');
  expect(line).toContain('Claude Code');
  expect(line).not.toMatch(/‹|›/);
});

test('narrow strip: j and k walk across both fold edges, focus following the shown section each step', async () => {
  await draw(() => <SettingsPage header={{ title: 'Models & keys' }} sections={MANY} />, 60, 16);
  const focused = (): string | undefined => focusedNode(semanticsOf(t!.renderer as never))?.name;
  const shownTitle = (frame: string): string | undefined => frame.split('\n')[stripRow(frame)]?.match(/▌([^‹›]+?)\s{2}|▌(.+?)\s*$/)?.slice(1).find(Boolean)?.trim();
  t!.mockInput.pressTab();
  let f = await t!.settle();
  expect(focused()).toBe('Default model');
  // Down past the right edge to the last section, then back up past the left edge to the first.
  for (const [key, steps] of [['j', MANY.length - 1], ['k', MANY.length - 1]] as const) {
    for (let i = 0; i < steps; i += 1) {
      t!.mockInput.pressKey(key);
      f = await t!.settle();
      const title = shownTitle(f);
      expect(title).toBeDefined();
      expect(focused()).toBe(title);
    }
    if (key === 'j') expect(f.split('\n')[stripRow(f)]).toMatch(/‹ \d+/);
  }
  expect(focused()).toBe('Default model');
  expect(f.split('\n')[stripRow(f)]).not.toMatch(/‹/);
});
