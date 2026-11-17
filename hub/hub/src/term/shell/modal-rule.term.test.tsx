// The `?` sheet drew a stray "──" line under its title rule. A centred panel is placed
// at most `cols - 4` wide (prim/Overlay.ts placeLayer), but Modal sized its rule, and Sheet its label column, from
// `cols - 2`: below 82 columns the rule was 2 cells longer than the panel's inside and wrapped. Both now take the width
// the panel is placed at (centerWidth).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

/** The sheet's frame columns: the title row's left stroke, and the ┐ that ends the border row above it. */
function edges(frame: string): { lines: string[]; title: number; left: number; right: number } {
  const lines = frame.split('\n');
  const title = lines.findIndex((l) => l.includes('│ Keyboard shortcuts'));
  const left = title < 0 ? -1 : lines[title]!.indexOf('│ Keyboard shortcuts');
  const right = title < 1 ? -1 : lines[title - 1]!.indexOf('┐', left);
  return { lines, title, left, right };
}
/** The rows inside the sheet's frame (between its two strokes), trimmed, from the title row to the bottom border. */
function inside(frame: string): string[] {
  const { lines, title, left, right } = edges(frame);
  const out: string[] = [];
  for (let i = title; i >= 0 && i < lines.length && lines[i]![left] === '│'; i++) out.push(lines[i]!.slice(left + 1, right).trim());
  return out;
}

for (const [cols, rows] of [[80, 24], [81, 30], [82, 30], [120, 40]] as const) {
  test(`the ? sheet's title rule is one whole line (${cols}x${rows})`, async () => {
    s = await renderPage({ page: 'notes', cols, rows });
    await s.settle();
    await s.keys.type('?');
    const frame = await s.settle();
    const body = inside(frame);
    expect(body[0]).toBe('Keyboard shortcuts');
    // The rule fills the line under the title, and no part of it is left on the next line.
    const rule = body[1] ?? '';
    expect(rule).toMatch(/^─+$/);
    expect(body.filter((l) => /^─+$/.test(l))).toEqual([rule]);
    const { left, right } = edges(frame);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeGreaterThan(left);
    const innerCells = right - left - 1;
    expect(rule.length).toBe(innerCells - 2);
  }, 180_000);
}
