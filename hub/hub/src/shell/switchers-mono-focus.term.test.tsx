// With NO_COLOR (the mono tier) colours are dropped, so a control that shows its focus by colour alone shows nothing.
// The top bar's realm, computer and account triggers must not show their focus by colour alone: Tab would land on them with
// no mark on screen. In mono the words and the caret are bold and
// underlined while focused, as every kit control is (focusInk, via focusMark); the colour tiers draw as before.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../scripts/term/render';
import { setColourTier } from '../term/prim';
import { semanticsOf, type SemNode } from '../term/prim/semantics';

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

const CHIPS = [/^◆ Personal ▾$/, /^● atlas ▾$/, /^Account menu$/];

test('mono, 80x24: the realm, computer and account triggers mark their focus without colour, caret included', async () => {
  setColourTier('mono');
  s = await renderPage({ page: 'vault', cols: 80, rows: 24 });
  await s.settle();
  for (const name of CHIPS) {
    expect({ name: String(name), attrs: await marked(s, name) }, s.frame).toEqual({ name: String(name), attrs: [BOLD | UNDERLINE, BOLD | UNDERLINE] });
  }
  expect(s.failures).toEqual([]);
}, 240_000);

test('truecolor: the same triggers keep their look (no underline; the blue fill is the mark)', async () => {
  setColourTier('truecolor');
  s = await renderPage({ page: 'vault', cols: 80, rows: 24 });
  await s.settle();
  for (const name of CHIPS) expect({ name: String(name), attrs: await marked(s, name) }).toEqual({ name: String(name), attrs: [0, 0] });
  expect(s.failures).toEqual([]);
}, 240_000);
