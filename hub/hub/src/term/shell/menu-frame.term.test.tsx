// A menu is the web's popover: one border at its edge. Two ways a terminal menu read as "two nested frames"
// (two ways it can go wrong):
// - the shell menus drew the modal's double frame (╔═╗║: two parallel strokes); they now draw a single line (Modal frame);
// - every framed layer filled its frame cells with the panel colour; a line glyph sits mid-cell, so a band of panel
//   colour showed outside the line, a second edge. The frame cells now keep the ground under them (prim/Overlay.ts).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

type Rgba = { toInts(): number[] };
/** The background of a cell, from the renderer's current buffer. */
function bgAt(x: number, y: number): string {
  const buf = (s!.renderer as unknown as { currentRenderBuffer: { getSpanLines(): Array<{ spans: Array<{ text: string; width: number; bg: Rgba }> }> } }).currentRenderBuffer;
  let at = 0;
  for (const sp of buf.getSpanLines()[y]!.spans) { if (x < at + sp.width) return sp.bg.toInts().join(','); at += sp.width; }
  return 'none';
}

/** The menu's frame: its top-left corner, found from a row inside it; checks one plain frame whose edge is not filled. */
function oneFrame(f: string, inside: number, label: string): void {
  const lines = f.split('\n');
  expect(lines[inside], f).toBeDefined();
  // The frame's left edge on that row: the last '│' before the label.
  const row = lines[inside]!;
  const left = row.lastIndexOf('│', row.indexOf(label));
  expect(left, f).toBeGreaterThanOrEqual(0);
  let top = inside; while (top > 0 && lines[top]![left] !== '┌') top--;
  let bottom = inside; while (bottom < lines.length - 1 && lines[bottom]![left] !== '└') bottom++;
  expect(lines[top]![left], f).toBe('┌');
  expect(lines[bottom]![left], f).toBe('└');
  const right = lines[top]!.indexOf('┐', left);
  expect(right, f).toBeGreaterThan(left);
  const box = lines.slice(top, bottom + 1).map((l) => l.slice(left, right + 1)).join('\n');
  expect(box, f).not.toMatch(/[╔╗╚╝║═]/);
  // No inner frame: inside the edges, no corner glyph.
  expect(lines.slice(top + 1, bottom).map((l) => l.slice(left + 1, right)).join('\n'), f).not.toMatch(/[┌┐└┘]/);
  // The edge cell is not painted with the body's colour (no band outside the line).
  expect(bgAt(left, inside), `${label}: frame cell vs body cell`).not.toBe(bgAt(left + 1, inside));
  expect(bgAt(right, inside), `${label}: right frame cell vs body cell`).not.toBe(bgAt(right - 1, inside));
}

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`bots ${cols}x${rows}: the top bar's Computer menu draws one plain frame`, async () => {
    s = await renderPage({ page: 'bots', fx: 'idle', path: '/bots', cols, rows });
    await s.settle();
    const x = s.frame.split('\n')[0]!.indexOf('atlas ▾');
    expect(x, s.frame).toBeGreaterThan(0);
    await s.click(x, 0);
    const f = await s.settle();
    const inside = f.split('\n').findIndex((l) => /│ +All computers/.test(l));
    expect(inside, f).toBeGreaterThan(0);
    oneFrame(f, inside, 'All computers');
  }, 240_000);
}

test('bots 120x40: a row ⋯ menu draws one plain frame', async () => {
  s = await renderPage({ page: 'bots', fx: 'idle', path: '/bots', cols: 120, rows: 40 });
  const g = await s.settle();
  const lines = g.split('\n');
  // The first idle Bot's row on screen (a row is as tall as its meta words need, so no one name is sure to be shown).
  const y = lines.findIndex((l) => /● Idle +⋯/.test(l));
  expect(y, g).toBeGreaterThan(0);
  await s.click(lines[y]!.lastIndexOf('⋯'), y);
  const f = await s.settle();
  const inside = f.split('\n').findIndex((l) => /│ .*Settings/.test(l));
  expect(inside, f).toBeGreaterThan(0);
  oneFrame(f, inside, 'Settings');
}, 240_000);
