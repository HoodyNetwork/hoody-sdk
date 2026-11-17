// Hover in the sidebar (prim/Hover.ts): a plain nav row under the pointer stands on the `hover` ground and nothing else
// about it changes. The focused row (blue) and the current page's row (accent) keep their plates under the pointer.
// Only a pointer move sets it: a click alone, which is all a recorded frame gets, draws none. The 16-colour and mono
// tiers draw none. The terminal losing the focus takes the plate away (a pointer that left the window sends nothing).
import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import type { PageManifest } from '@kit/page';
import { queryClient } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from '../app/boot';
import { beginTermSession, type TermSession } from '../env/session';
import type { TermBoot } from '../app/lifecycle';
import { createTermApp } from '../app/App';
import { drawTest, type TestTerm } from '../prim/testing';
import { __resetHover } from '../prim/Hover';
import { TRUECOLOR, setColourTier, type ColourTier } from '../prim/tokens';

setDefaultTimeout(60_000);

let pages: readonly PageManifest[] = [];
let session: TermSession | null = null;
let boot: TermBoot | null = null;
let t: TestTerm | null = null;

beforeAll(async () => {
  pages = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  session = beginTermSession();
  boot = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'notes', fx: null });
  await boot.start(session, () => {});
});
afterEach(() => { __resetHover(); setColourTier('truecolor'); });
afterAll(async () => {
  await t?.dispose();
  await boot?.dispose('term-quit');
  session?.end();
});

async function open(tier: ColourTier = 'truecolor'): Promise<string> {
  await t?.dispose();
  setColourTier(tier);
  t = await drawTest(createTermApp({ pages, queryClient, path: '/notes', onQuit: () => {} }).element, { width: 120, height: 40 });
  const end = performance.now() + 8000;
  let f = await t.settle();
  for (; (!f.includes('HOODY') || f.includes('Loading…')) && performance.now() < end; f = await t.settle()) await new Promise((r) => setTimeout(r, 30));
  return f;
}

const hex = (c: { toInts(): [number, number, number, number] }): string => '#' + c.toInts().slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
/** The row a sidebar label is drawn on. */
const rowOf = (frame: string, label: RegExp): number => {
  const y = frame.split('\n').findIndex((l) => label.test(l.slice(0, 23)));
  expect(y, frame).toBeGreaterThanOrEqual(0);
  return y;
};
/** The background of the cell at column x of row y. */
function bgAt(x: number, y: number): string {
  let c = 0;
  for (const sp of t!.captureSpans().lines[y]!.spans) {
    const w = (sp as { width?: number }).width ?? [...sp.text].length;
    if (x < c + w) return hex(sp.bg);
    c += w;
  }
  throw new Error(`no cell at ${x},${y}`);
}
const dark = TRUECOLOR.dark;

test('a plain row under the pointer stands on the hover ground, whole row, and the frame text does not change', async () => {
  const rest = await open();
  const y = rowOf(rest, /^ Vault\b/);
  expect(bgAt(2, y)).toBe(dark.side);
  await t!.mockMouse.moveTo(3, y);
  const over = await t!.settle();
  expect(over).toBe(rest);
  // The whole row to the rule: the label's cells and the empty cells after it.
  expect(bgAt(0, y)).toBe(dark.hover);
  expect(bgAt(2, y)).toBe(dark.hover);
  expect(bgAt(20, y)).toBe(dark.hover);
  // Only that row.
  expect(bgAt(2, y + 1)).not.toBe(dark.hover);
  expect(bgAt(2, y - 1)).not.toBe(dark.hover);
});

test('moving on leaves exactly one row hovered, and moving off the sidebar leaves none', async () => {
  const rest = await open();
  const a = rowOf(rest, /^ Vault\b/);
  const b = rowOf(rest, /^ Logs\b/);
  await t!.mockMouse.moveTo(3, a);
  await t!.settle();
  await t!.mockMouse.moveTo(3, b);
  await t!.settle();
  expect(bgAt(2, a)).toBe(dark.side);
  expect(bgAt(2, b)).toBe(dark.hover);
  await t!.mockMouse.moveTo(60, 20);
  expect(await t!.settle()).toBe(rest);
  expect(bgAt(2, b)).toBe(dark.side);
});

test('the current page row keeps its accent plate under the pointer', async () => {
  const rest = await open();
  const y = rowOf(rest, /^▌Notes\b/);
  expect(bgAt(2, y)).toBe(dark.acc);
  await t!.mockMouse.moveTo(3, y);
  expect(await t!.settle()).toBe(rest);
  expect(bgAt(2, y)).toBe(dark.acc);
});

test('the focused row keeps its blue plate under the pointer', async () => {
  let f = await open();
  // F6 goes round the regions until the focus is on a sidebar row (drawn with ›).
  const focusedRow = (frame: string): number => frame.split('\n').findIndex((l) => l.startsWith('›'));
  for (let i = 0; i < 4 && focusedRow(f) < 0; i++) { t!.mockInput.pressKey('F6'); f = await t!.settle(); }
  const y = focusedRow(f);
  expect(y, f).toBeGreaterThanOrEqual(0);
  expect(bgAt(2, y)).toBe(dark.blue);
  await t!.mockMouse.moveTo(4, y);
  expect(await t!.settle()).toBe(f);
  expect(bgAt(2, y)).toBe(dark.blue);
  // And once the focus has left it, the pointer still on it, it is the hovered row.
  t!.mockInput.pressTab();
  const next = await t!.settle();
  expect(next.split('\n')[y]!.startsWith('›')).toBe(false);
  expect(bgAt(2, y)).toBe(dark.hover);
});

test('the terminal losing the focus takes the hover plate away; the next move puts it back', async () => {
  const rest = await open();
  const y = rowOf(rest, /^ Vault\b/);
  await t!.mockMouse.moveTo(3, y);
  await t!.settle();
  expect(bgAt(2, y)).toBe(dark.hover);
  (t!.renderer as unknown as { emit(e: string): void }).emit('blur');
  expect(await t!.settle()).toBe(rest);
  expect(bgAt(2, y)).toBe(dark.side);
  expect(bgAt(20, y)).toBe(dark.side);
  await t!.mockMouse.moveTo(4, y);
  await t!.settle();
  expect(bgAt(2, y)).toBe(dark.hover);
});

test('a click alone draws no hover anywhere (what a recorded frame gets)', async () => {
  const rest = await open();
  const y = rowOf(rest, /^ Vault\b/);
  // A click on the page, then on nothing in the sidebar's rows: the engine re-checks what is under that place after
  // every frame, and that must not be a hover.
  await t!.mockMouse.click(60, 20);
  await t!.settle();
  await t!.mockMouse.scroll(3, y, 'down');
  await t!.settle();
  const lines = t!.captureSpans().lines;
  const found = lines.flatMap((l) => l.spans).filter((sp) => hex(sp.bg) === dark.hover);
  expect(found.length).toBe(0);
});

for (const tier of ['ansi16', 'mono'] as const) {
  test(`${tier}: the pointer changes no cell`, async () => {
    const rest = await open(tier);
    const y = rowOf(rest, /^ Vault\b/);
    const before = JSON.stringify(t!.captureSpans().lines[y]!.spans.map((sp) => [sp.text, hex(sp.fg), hex(sp.bg), sp.attributes]));
    await t!.mockMouse.moveTo(3, y);
    expect(await t!.settle()).toBe(rest);
    expect(JSON.stringify(t!.captureSpans().lines[y]!.spans.map((sp) => [sp.text, hex(sp.fg), hex(sp.bg), sp.attributes]))).toBe(before);
  });
}
