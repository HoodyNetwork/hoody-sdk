// "Use with your agent", opened on a page, fits the screen: the hint is a drawer over the page (the whole screen under
// 75 columns), so its prose, prompts and command lines wrap inside it and nothing of it is cut at the screen's edge,
// and the page under it does not move.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { layoutFaults } from '../../term/prim/layoutcheck';

type S = Awaited<ReturnType<typeof renderPage>>;
let s: S | null = null;
afterEach(() => { s?.close(); s = null; });

const CASES = [
  { page: 'vault', path: '/vault', cols: 80, rows: 24, words: ['keys in your vault'] },
  { page: 'vault', path: '/vault', cols: 120, rows: 40, words: ['keys in your vault'] },
  { page: 'scripts', path: '/scripts', cols: 120, rows: 40, words: ['Each .ts or .js file in the scripts folder answers at its own HTTP address'] },
] as const;

for (const c of CASES) {
  test(`${c.page} ${c.cols}x${c.rows}: the opened hint lies inside the screen`, async () => {
    s = await renderPage({ page: c.page, path: c.path, cols: c.cols, rows: c.rows, settleMs: 3000 });
    const end = performance.now() + 20_000;
    while (!s.frame.includes('Use with your agent') && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
    const before = s.frame.split('\n');
    const y = before.findIndex((l) => l.includes('Use with your agent'));
    expect(y, s.frame).toBeGreaterThanOrEqual(0);
    await s.click(before[y]!.indexOf('Use with your agent') + 1, y);
    await s.settle();
    await new Promise((r) => setTimeout(r, 300));
    await s.settle();
    const f = s.frame;
    for (const tab of ['Prompts', 'Set up', 'Access', 'Can do']) expect(f, f).toContain(tab);
    expect(f, f).toContain('Acts on');
    // The drawer's own text (right of its edge ┃ where the page shows beside it), read as one line: a sentence wraps
    // inside the drawer.
    const text = f.split('\n').map((l) => (l.includes('┃') ? l.slice(l.lastIndexOf('┃') + 1) : l)).join(' ').replace(/\s+/g, ' ');
    for (const w of c.words) expect(text, f).toContain(w);
    // The footer stays on screen whatever the body's length (the body scrolls).
    expect(f, f).toContain('Hide on this page');
    const r = s.renderer as unknown as { root: Parameters<typeof layoutFaults>[0] };
    const cut = layoutFaults(r.root, { cols: c.cols, rows: c.rows }).filter((x) => /Hint|Drawer|Layer/.test(x.path) && (x.kind === 'cut' || x.kind === 'text-cut'));
    expect(cut, f).toEqual([]);
    expect(s.trapsAt).toEqual([]);
  }, 180_000);
}
