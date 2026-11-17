// With NO_COLOR (the mono tier) colours are dropped, so a control that shows its focus by colour alone shows nothing.
// The top bar's ≡ and the sidebar's "On <computer> ▾" painted their focus blue and nothing else: Tab landed on them
// with no mark on screen (live, Vault 80x24). In mono they are bold and underlined while focused, as every kit control
// is (focusInk, via focusMark); the colour tiers draw as before.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { setColourTier } from '../prim';
import { semanticsOf, type SemNode } from '../prim/semantics';

const BOLD = 1;
const UNDERLINE = 8;
let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; setColourTier('truecolor'); });

const focusedIn = (tree: SemNode[]): SemNode | null => {
  for (const n of tree) { if (n.states.focused) return n; const c = focusedIn(n.children); if (c) return c; }
  return null;
};
const focused = (p: PageSession): SemNode | null => focusedIn(semanticsOf(p.renderer as never));

/** The attributes of the cell at (x, y) as last drawn. */
function attrsAt(p: PageSession, x: number, y: number): number {
  const lines = (p.renderer as unknown as { currentRenderBuffer: { getSpanLines(): { spans: { text: string; attributes: number; width?: number }[] }[] } }).currentRenderBuffer.getSpanLines();
  let at = 0;
  for (const sp of lines[y]?.spans ?? []) {
    const w = sp.width ?? [...sp.text].length;
    if (x < at + w) return sp.attributes;
    at += w;
  }
  return 0;
}

async function tabTo(p: PageSession, name: RegExp): Promise<SemNode> {
  for (let i = 0; i < 80 && !name.test(focused(p)?.name ?? ''); i++) { await p.keys.press('tab'); await p.settle(); }
  const n = focused(p);
  expect(n?.name ?? '(nothing focused)').toMatch(name);
  return n!;
}

/** Bold and underlined on the first and last drawn cell of the control (its row may run on past its words). */
async function marked(p: PageSession, name: RegExp): Promise<[number, number]> {
  const n = await tabTo(p, name);
  const [x, y, w] = n.box;
  const cells = [...(p.frame.split('\n')[y] ?? '')];
  let last = x + w - 1;
  while (last > x && (cells[last] ?? ' ') === ' ') last--;
  return [attrsAt(p, x, y) & (BOLD | UNDERLINE), attrsAt(p, last, y) & (BOLD | UNDERLINE)];
}

test('mono, 80x24: the top bar\'s ≡ marks its focus without colour', async () => {
  setColourTier('mono');
  s = await renderPage({ page: 'vault', cols: 80, rows: 24 });
  await s.settle();
  expect(await marked(s, /^≡$/), s.frame).toEqual([BOLD | UNDERLINE, BOLD | UNDERLINE]);
  expect(s.failures).toEqual([]);
}, 240_000);

test('mono, 120x40: the sidebar\'s "On <computer> ▾" marks its focus without colour', async () => {
  setColourTier('mono');
  s = await renderPage({ page: 'vault', cols: 120, rows: 40 });
  await s.settle();
  expect(await marked(s, /^On atlas ▾$/), s.frame).toEqual([BOLD | UNDERLINE, BOLD | UNDERLINE]);
  expect(s.failures).toEqual([]);
}, 240_000);

test('truecolor: the same controls keep their look (no underline; the blue fill is the mark)', async () => {
  setColourTier('truecolor');
  s = await renderPage({ page: 'vault', cols: 80, rows: 24 });
  await s.settle();
  expect(await marked(s, /^≡$/)).toEqual([0, 0]);
  s.close();
  s = await renderPage({ page: 'vault', cols: 120, rows: 40 });
  await s.settle();
  expect(await marked(s, /^On atlas ▾$/)).toEqual([0, 0]);
  expect(s.failures).toEqual([]);
}, 240_000);
