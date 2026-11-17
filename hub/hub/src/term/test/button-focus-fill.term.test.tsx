// A raw DOM button holding a title and a muted note (the AI page's Connect OpenAI tiles): while
// focused, every word reads in the focus ink, the note included (it was muted grey on the focus fill, unreadable), and
// the fill is the whole control, not one strip per line (the shorter line's tail stayed unfilled).
import { afterEach, expect, test } from 'bun:test';
import { drawTest } from '../prim/testing';
import { FocusRoot } from '../prim';
import { resolverFor } from '../jsx/css-table';
import { setStyleTable } from '../jsx/style';
import type { Table } from '../../../scripts/term/css-translate/types';

const tile = 'pages/x/x.module.css#tile';
const note = 'pages/x/x.module.css#note';
const table = { version: 1, generated: '', widthClass: {}, unitModel: {}, modules: {}, classes: {
  [tile]: { id: tile, style: { flexDirection: 'column', alignItems: 'flex-start' }, status: 'full', outcomes: [] },
  [note]: { id: note, style: {}, text: { fg: 'token:--hx-muted-text' }, status: 'full', outcomes: [] },
} } as unknown as Table;
afterEach(() => setStyleTable(null));

type Span = { text: string; fg: { toInts?: () => number[] } & Record<string, unknown>; bg: { toInts?: () => number[] } & Record<string, unknown>; width?: number };
const rgb = (c: Span['fg']): string => JSON.stringify(typeof c?.toInts === 'function' ? c.toInts() : c);

test('a focused button paints its muted note in the focus ink and fills both lines to the same width', async () => {
  setStyleTable(resolverFor(table));
  const t = await drawTest(
    <FocusRoot><button type="button" className={tile}><span>Sign in with ChatGPT</span><span className={note}>Use your plan</span></button></FocusRoot>,
    { width: 40, height: 4 },
  );
  const before = (t.captureSpans().lines as unknown as { spans: Span[] }[]);
  const mutedFg = rgb(before[1]!.spans.find((s) => s.text.includes('Use your plan'))!.fg);
  expect(mutedFg).not.toBe(rgb(before[0]!.spans.find((s) => s.text.includes('Sign in'))!.fg));
  t.mockInput.pressTab(); await t.settle();
  const lines = t.captureSpans().lines as unknown as { spans: Span[] }[];
  const title = lines[0]!.spans.find((s) => s.text.includes('Sign in'))!;
  const hint = lines[1]!.spans.find((s) => s.text.includes('Use your plan'))!;
  expect(title, t.captureCharFrame()).toBeDefined();
  expect(hint, t.captureCharFrame()).toBeDefined();
  // the note's words in the same ink as the title's, on the same fill
  expect(rgb(hint.fg)).toBe(rgb(title.fg));
  expect(rgb(hint.bg)).toBe(rgb(title.bg));
  // the fill runs on to the title's width on the note's line ("Sign in with ChatGPT" is 20 cells, the note 13)
  const cellBg = (row: number, x: number): string => {
    let at = 0;
    for (const s of lines[row]!.spans) { const w = s.width ?? [...s.text].length; if (x < at + w) return rgb(s.bg); at += w; }
    return 'none';
  };
  expect(cellBg(1, 18)).toBe(rgb(title.bg));
  t.renderer.destroy();
});

test('a focused button whose child is a bare string draws its words in the focus ink, not white on the fill', async () => {
  const t = await drawTest(<FocusRoot><button type="button">First</button></FocusRoot>, { width: 20, height: 2 });
  t.mockInput.pressTab(); await t.settle();
  const word = (t.captureSpans().lines as unknown as { spans: Span[] }[])[0]!.spans.find((s) => s.text.includes('First'))!;
  expect(word, t.captureCharFrame()).toBeDefined();
  // the focus ink's fg on its fill: never the plain ink (white) the bare Text drew before
  const f = (await import('../prim/FocusInk')).focusInk(true);
  expect(rgb(word.fg)).not.toBe(JSON.stringify([255, 255, 255, 255]));
  expect(f.colour).toBe('bg');
  t.renderer.destroy();
});
