// One cursor in a shell menu and the palette (layer.tsx PickList): the pointer moves the active row as the keys do.
// - a pointer MOVE onto a row makes it the active one; a pointer at rest never does (the keys keep their row);
// - leaving the list leaves the active row where it was;
// - a row that cannot be picked, a heading and a rule never take it;
// - Enter and a click pick the same row;
// - the list does not scroll under the pointer when the pointer chooses a row.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { drawTest, type TestTerm } from '../prim/testing';
import { PickList, type PickItem } from './layer';

let s: PageSession | null = null;
let t: TestTerm | null = null;
afterEach(() => { s?.close(); s = null; t?.renderer.destroy(); t = null; });

/** The row the cursor is on: the words after its ▸. */
const cursor = (f: string): string => (/│ ▸ (?:[✓○●] )*([A-Za-z+][^│\n]*?)(?:  |│|$)/m.exec(f)?.[1] ?? '').trim();
const rowOf = (f: string, re: RegExp): { x: number; y: number } => {
  const lines = f.split('\n');
  const y = lines.findIndex((l) => re.test(l));
  expect(y, f).toBeGreaterThanOrEqual(0);
  return { x: re.exec(lines[y]!)!.index + 3, y };
};

async function computerMenu(): Promise<string> {
  s = await renderPage({ page: 'bots', fx: 'idle', path: '/bots', cols: 120, rows: 40 });
  await s.settle();
  const x = s.frame.split('\n')[0]!.indexOf('atlas ▾');
  expect(x, s.frame).toBeGreaterThan(0);
  await s.click(x, 0);
  const f = await s.settle();
  expect(f).toMatch(/│ +All computers/);
  return f;
}

test('a shell menu: a move takes the cursor, a rest does not, leaving keeps it, a rule never takes it', async () => {
  const open = await computerMenu();
  const start = cursor(open);
  const cedar = rowOf(open, /○ cedar/);
  const fjord = rowOf(open, /○ fjord/);
  await s!.move(cedar.x, cedar.y);
  expect(cursor(s!.frame)).toMatch(/^cedar/);
  expect(start).not.toMatch(/^cedar/);
  // The keys go on from the pointer's row; the pointer rests on cedar and does not take the cursor back.
  await s!.keys.press('down');
  expect(cursor(s!.frame)).toMatch(/^fjord/);
  expect(cursor(await s!.settle())).toMatch(/^fjord/);
  // The next move does.
  await s!.move(cedar.x + 1, cedar.y);
  expect(cursor(s!.frame)).toMatch(/^cedar/);
  // The rule between the groups is no row.
  const rule = s!.frame.split('\n').findIndex((l, y) => y > fjord.y && /│ ─{10,}/.test(l));
  expect(rule, s!.frame).toBeGreaterThan(fjord.y);
  await s!.move(cedar.x, rule);
  expect(cursor(s!.frame)).toMatch(/^cedar/);
  // Off the menu: the cursor stays where the pointer left it.
  await s!.move(2, 30);
  const out = s!.frame;
  expect(cursor(out)).toMatch(/^cedar/);
  expect(out).toMatch(/│ +All computers/);
}, 240_000);

test('a shell menu: Enter picks the row the pointer chose', async () => {
  const open = await computerMenu();
  const fjord = rowOf(open, /○ fjord/);
  await s!.move(fjord.x, fjord.y);
  expect(cursor(s!.frame)).toMatch(/^fjord/);
  await s!.keys.press('enter');
  const f = await s!.settle();
  expect(f).not.toMatch(/│ +All computers/);
  expect(f.split('\n')[0]!).toContain('fjord ▾');
}, 240_000);

test('the palette: a move takes the cursor', async () => {
  s = await renderPage({ page: 'bots', fx: 'idle', path: '/bots', cols: 120, rows: 40 });
  await s.settle();
  await s.keys.press('k', { ctrl: true });
  const open = await s.settle();
  expect(open).toContain('Command palette');
  const lines = open.split('\n');
  const first = lines.findIndex((l) => l.includes('│ ▸ '));
  expect(first, open).toBeGreaterThan(0);
  const x = lines[first]!.indexOf('▸ ');
  // The next row below the cursor's that is a row (two blanks where the mark goes, then words that are not a heading).
  const isRow = (l: string): boolean => l.slice(x, x + 2) === '  ' && /[a-z]/.test(l.slice(x + 2, x + 30));
  const y = lines.findIndex((l, n) => n > first && isRow(l));
  expect(y, open).toBeGreaterThan(first);
  await s.move(x + 4, y);
  const f = s.frame.split('\n');
  expect(f[y]!.slice(x, x + 2), s.frame).toBe('▸ ');
  expect(f[first]!.slice(x, x + 2), s.frame).toBe('  ');
  // A pointer at rest does not take it back from the keys.
  await s.keys.press('up');
  expect(s.frame.split('\n')[y]!.slice(x, x + 2), s.frame).toBe('  ');
}, 240_000);

const items: PickItem[] = [
  { id: 'a', label: 'alpha' }, { id: 'b', label: 'beta', disabled: true }, { id: 'c', label: 'gamma', section: 'More' },
  ...Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, label: `item-${i}` })),
];
const picked: number[] = [];
/** The keys' part in the harness: sets the active row as an arrow key would. */
let keyTo: (i: number) => void = () => {};
function Harness({ hover = true }: { hover?: boolean }) {
  const [a, setA] = useState(0);
  keyTo = setA;
  return <PickList items={items} active={a} onPick={(i) => picked.push(i)} {...(hover ? { onHover: setA } : {})} rows={8} />;
}
const lineOf = (f: string, word: string): number => f.split('\n').findIndex((l) => l.includes(word));

test('PickList: a row that cannot be picked and a heading never take the cursor; a click picks the hovered row', async () => {
  picked.length = 0;
  t = await drawTest(<Harness />, { width: 30, height: 12 });
  let f = await t.settle();
  expect(f).toContain('▸ alpha');
  await t.mockMouse.moveTo(4, lineOf(f, 'beta'));
  f = await t.settle();
  expect(f).toContain('▸ alpha');
  await t.mockMouse.moveTo(4, lineOf(f, 'MORE'));
  f = await t.settle();
  expect(f).toContain('▸ alpha');
  await t.mockMouse.moveTo(4, lineOf(f, 'gamma'));
  f = await t.settle();
  expect(f).toContain('▸ gamma');
  await t.mockMouse.click(4, lineOf(f, 'gamma'));
  await t.settle();
  expect(picked).toEqual([2]);
});

test('PickList: hover never scrolls the list; the keys scroll it only when their row leaves the window', async () => {
  t = await drawTest(<Harness />, { width: 30, height: 12 });
  const rest = await t.settle();
  // The last row in view: centred on it, the window would start further down.
  const lines = rest.split('\n');
  const last = lines.findIndex((l) => l.includes('↓ more')) - 1;
  const word = lines[last]!.trim();
  await t.mockMouse.moveTo(4, last);
  const f = await t.settle();
  expect(f.split('\n')[last]!).toContain(`▸ ${word}`);
  expect(f.replace('▸ ' + word, '  ' + word).replace('  alpha', '▸ alpha')).toBe(rest);
  // The keys move on inside the window: nothing scrolls (only the mark moves).
  keyTo(3);
  const k = await t.settle();
  expect(k.replace('▸ item-0', '  item-0').replace('  alpha', '▸ alpha')).toBe(rest);
  // The keys take the row out of the window: the list centres on it, another row slides under the pointer at rest and
  // does not take the cursor (the engine tells that row the pointer is over it; only a move counts).
  keyTo(12);
  const g = await t.settle();
  expect(g).toContain('▸ item-9');
  expect(g).not.toContain('alpha');
  expect(g.match(/▸/g)!.length).toBe(1);
  expect(await t.settle()).toBe(g);
  // A second hold, further down: the pointer takes the first row in view; the keys leave that window (the hold ends)
  // and come back to that row: the list is centred on it as with no pointer, not put back where the pointer held it.
  const top = g.split('\n').findIndex((l) => l.includes('↑ more')) + 1;
  const held = /item-\d+/.exec(g.split('\n')[top]!)![0];
  await t.mockMouse.moveTo(4, top);
  expect((await t.settle()).split('\n')[top]!).toContain(`▸ ${held}`);
  keyTo(0);
  expect(await t.settle()).toContain('▸ alpha');
  keyTo(items.findIndex((i) => i.label === held));
  const back = await t.settle();
  expect(back).toContain(`▸ ${held}`);
  expect(back.split('\n')[top]!).not.toContain(held);
});

test('PickList without onHover: the pointer moves nothing', async () => {
  t = await drawTest(<Harness hover={false} />, { width: 30, height: 12 });
  const rest = await t.settle();
  await t.mockMouse.moveTo(4, lineOf(rest, 'gamma'));
  expect(await t.settle()).toBe(rest);
});
