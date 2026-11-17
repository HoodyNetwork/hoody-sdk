// Computers Overview "Open on <computer>" in a terminal: each use tile shows its whole actions row. The web's 168px
// tile fits three icon buttons; here they are words ("⧉ copy [QR] [Put Terminal on Board]", 40 cells with the inset),
// and at 21 cells a tile cut the row after "[Put Ter" (term-decls.ts gives the grid its terminal tile width).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { layoutFaults } from '../../term/prim/layoutcheck';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows, across] of [[80, 24, 1], [120, 40, 2], [240, 67, 4]] as const) {
  test(`${cols}x${rows}: ${across} tile(s) a line, every actions row whole`, async () => {
    s = await renderPage({ page: 'computers', path: '/computers?sel=atlas.00a1', cols, rows });
    const lines = (await s.settle()).split('\n');
    const first = lines.find((l) => l.includes('[Put Terminal on Board]') && l.includes('⧉ copy [QR]')) ?? '';
    expect(first).toContain('⧉ copy [QR] [Put Terminal on Board]');
    expect((first.match(/⧉ copy \[QR\] \[Put \w+ on Board\]/g) ?? []).length).toBe(across);
    const faults = layoutFaults((s.renderer as never as { root: never }).root, { cols, rows }).map((f) => `${f.kind} ${f.path}`).filter((f) => /useGrid|useCard|useActions/.test(f));
    expect(faults).toEqual([]);
    expect(s.failures).toEqual([]);
  }, 180_000);
}
