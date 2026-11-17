// A pressable card keeps its outline: without it a picker tile (AI Connect: "OpenAI", "Anthropic", ...) is a loose
// line of words with nothing saying it can be pressed. Plain cards and pressable rows (buttons) still draw no frame.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box } from '../prim';
import { resolverFor } from '../jsx/css-table';
import { setStyleTable } from '../jsx/style';
import { drawnSides, isPressable } from '../jsx/tags';
import type { Table } from '../../../scripts/term/css-translate/types';

const cls = (n: string) => `pages/x/presscard.module.css#${n}`;
const all = ['top', 'right', 'bottom', 'left'] as const;
const entry = (n: string, style: Record<string, unknown>, border?: unknown) => ({ [cls(n)]: { id: cls(n), style, ...(border ? { border } : {}), status: 'full', outcomes: [] } });
const table = { version: 1, generated: '', widthClass: {}, unitModel: {}, modules: {}, classes: {
  ...entry('tile', { flexDirection: 'column', alignItems: 'flex-start' }, { sides: [...all], style: 'rounded' }),
  ...entry('chip', { flexDirection: 'row', alignItems: 'center' }, { sides: [...all], style: 'rounded' }),
} } as unknown as Table;

let t: TestTerm | null = null;
afterEach(() => { setStyleTable(null); t?.renderer.destroy(); t = null; });

const frameAround = (lines: string[], word: string): boolean => {
  const i = lines.findIndex((l) => l.includes(word));
  if (i < 1) return false;
  const col = lines[i]!.indexOf(word);
  const left = lines[i]!.slice(0, col).trimEnd();
  return /[│┃║]$/.test(left) && /[─━═]/.test(lines[i - 1]!.slice(Math.max(0, col - 1), col + word.length));
};

test('the rule: pressable (tag, role, onClick, tab stop) and only then a kept frame', () => {
  expect(isPressable('button', {})).toBe(true);
  expect(isPressable('div', { role: 'option' })).toBe(true);
  expect(isPressable('div', { onClick: () => {} })).toBe(true);
  expect(isPressable('div', { tabIndex: 0 })).toBe(true);
  expect(isPressable('div', { tabIndex: -1 })).toBe(false);
  expect(isPressable('div', {})).toBe(false);
  const b = { sides: [...all], divider: false };
  expect(drawnSides('div', {}, b, true)).toEqual([...all]);
  expect(drawnSides('div', {}, b, false)).toBeNull();
});

test('a pressable column card draws its frame; a plain card and a pressable row do not', async () => {
  setStyleTable(resolverFor(table));
  t = await drawTest(
    <Box dir="column" width={40} height={14}>
      <button type="button" className={cls('tile')} onClick={() => {}}><span>OpenAI</span><span>Chat models</span></button>
      <div className={cls('tile')}><span>Plaincard</span></div>
      <div className={cls('tile')} onClick={() => {}}><span>Clickcard</span></div>
      <button type="button" className={cls('chip')}><span>Chipbutton</span></button>
    </Box>, { width: 40, height: 14 });
  const lines = (await t.settle()).split('\n');
  expect(frameAround(lines, 'OpenAI')).toBe(true);
  expect(frameAround(lines, 'Clickcard')).toBe(true);
  expect(frameAround(lines, 'Plaincard')).toBe(false);
  expect(frameAround(lines, 'Chipbutton')).toBe(false);
});
