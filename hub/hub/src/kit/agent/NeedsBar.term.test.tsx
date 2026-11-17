// NeedsBar.term: the "Waiting for you" row says WHAT waits. The web markup drawn by the compat runtime lost those words
// (its flex: 1 / min-width: 0 span got no cells: the row read "WAITING FOR YOU [Show]" and nothing else), so each test
// here that looks for the command fails on that drawing.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, setColourTier } from '../../term/prim';
import { NeedsBar, needsWhat } from './NeedsBar';
import type { GateEntry } from './source';

const entry = (gate: Record<string, unknown>, key = 'g1'): GateEntry => ({ key, ref: { id: key, generation: 1 }, gate, helper: false, addressing: false, held: null, decision: null }) as unknown as GateEntry;
const bash = (command: string, key?: string): GateEntry => entry({ kind: 'confirm', risk: '', tool: 'bash', params: { command } }, key);
const LONG = 'find /srv/www -name "*.log" -mtime +30 -exec gzip {} + && rsync -az --delete /srv/www/ backup@atlas:/var/backups/www/ && systemctl reload nginx';
const lines = (f: string): string[] => f.split('\n').map((l) => l.trimEnd()).filter((l) => l !== '');

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; setColourTier('truecolor'); });
async function draw(gates: GateEntry[], width: number, onShow: () => void = () => {}, box?: number): Promise<TestTerm> {
  term = await drawTest(<FocusRoot><Box dir="column" width={box ?? width}><NeedsBar gates={gates} onShow={onShow} /></Box></FocusRoot>, { width, height: 10 });
  return term;
}

test('one row at 80 cells: mark, label, the command that waits, Show at the end', async () => {
  const t = await draw([bash('npm run build')], 80);
  const rows = lines(await t.settle());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatch(/^│ ◆ Waiting for you Allow npm run build\? +\[Show\]$/);
}, 60_000);

test('a long command is cut with one ellipsis; the count and Show are never cut (80 and 120 cells)', async () => {
  for (const width of [80, 120]) {
    const t = await draw([bash(LONG), bash('rm -rf dist', 'g2'), bash('git push', 'g3')], width);
    const rows = lines(await t.settle());
    expect(rows, String(width)).toHaveLength(1);
    expect(rows[0], String(width)).toMatch(/Allow find \/srv\/www .*… +2 more \[Show\]$/);
    expect(rows[0]!.length, String(width)).toBeLessThanOrEqual(width);
    expect(rows[0]).not.toContain('rm -rf dist');
    t.renderer.destroy();
    term = null;
  }
}, 60_000);

test('a narrow pane stacks: the label row keeps Show, the whole command wraps under it', async () => {
  const t = await draw([bash(LONG), bash('git push', 'g2')], 80, () => {}, 50);
  const rows = lines(await t.settle());
  expect(rows[0]).toMatch(/^│ ◆ Waiting for you 1 more +\[Show\]$/);
  expect(rows.length).toBeGreaterThan(2);
  for (const r of rows) expect(r.startsWith('│')).toBe(true);
  // Nothing of the command is lost: its characters, joined again, are the bar's words (the engine may break inside a word).
  const said = rows.slice(1).map((r) => r.slice(1)).join('').replace(/\s+/g, '');
  expect(said).toBe(needsWhat(bash(LONG), ((k: string, v?: { what?: string }) => (k === 'needs.approve' ? `Allow ${v?.what}?` : k)) as never).replace(/\s+/g, ''));
}, 60_000);

test('Show is the one tab stop: Tab reaches it, Enter and a click call the host, nothing else does', async () => {
  let shown = 0;
  const t = await draw([bash('npm run build')], 80, () => { shown += 1; });
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(shown).toBe(0);
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(shown).toBe(1);
  const f = t.captureCharFrame();
  const row = f.split('\n').findIndex((l) => l.includes('[Show]'));
  await t.mockMouse.click(f.split('\n')[row]!.indexOf('[Show]') + 2, row);
  await t.settle();
  expect(shown).toBe(2);
}, 60_000);

test('mono: the mark and the words still say it', async () => {
  setColourTier('mono');
  const t = await draw([bash('npm run build')], 80);
  const f = await t.settle();
  expect(f).toContain('◆ Waiting for you Allow npm run build?');
  expect(f).toContain('[Show]');
}, 60_000);

test('no gate draws nothing', async () => {
  const t = await draw([], 80);
  expect(lines(await t.settle())).toHaveLength(0);
}, 60_000);

test('on a very wide column the bar keeps the web reading width (760 px = 95 cells), centred', async () => {
  for (const width of [200, 240, 320]) {
    const t = await draw([bash('npm run build')], width);
    const raw = (await t.settle()).split('\n').find((l) => l.includes('Waiting for you'))!;
    const row = raw.trimEnd();
    const at = row.indexOf('│');
    expect(row.length - at).toBe(94);
    expect(at).toBe(Math.ceil((width - 95) / 2));
    expect(row.endsWith('[Show]')).toBe(true);
    t.renderer.destroy(); term = null;
  }
}, 60_000);
