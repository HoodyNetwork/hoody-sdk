// A pick list's divider (the web menu's Separator) is one row. On the bots page (80x24 and 120x40) the top bar's
// Computer menu reported "8 lines in 1 '────…'" (PickList). The divider was a 400-glyph text in a one-row box: the
// text wrapped into 8 lines and the box cut 7 of them. It is now the box's top border, one row at the list's width.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { layoutFaults } from '../prim/layoutcheck';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`bots ${cols}x${rows}: the Computer menu's dividers are one row each, not a cut multi-line text`, async () => {
    s = await renderPage({ page: 'bots', fx: 'idle', path: '/bots', cols, rows });
    await s.settle();
    const top = s.frame.split('\n')[0]!;
    const x = top.indexOf('atlas ▾');
    expect(x, s.frame).toBeGreaterThan(0);
    await s.click(x, 0);
    await s.settle();
    const f = s.frame;
    const lines = f.split('\n');
    const at = (w: string): number => lines.findIndex((l) => l.includes(w));
    // Open, with a divider between the computers and "+ Get a computer": the row right above it is a rule.
    expect(at('All computers'), f).toBeGreaterThan(0);
    const get = at('+ Get a computer');
    expect(get, f).toBeGreaterThan(0);
    expect(lines[get - 1], f).toMatch(/─{20,}/);
    const r0 = (s as unknown as { renderer: { root: Parameters<typeof layoutFaults>[0] } }).renderer;
    const cuts = layoutFaults(r0.root, { cols, rows }).filter((c) => c.kind === 'text-cut' && /PickList/.test(c.path));
    expect(cuts, f).toEqual([]);
  }, 240_000);
}
