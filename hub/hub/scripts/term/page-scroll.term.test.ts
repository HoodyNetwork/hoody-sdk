// One scroll per page region. A list-detail page's table fills its
// pane and scrolls itself, its pager on screen, while the page stays put (kit/layouts/termScroll useOutletClaim); a
// compat `height: 100%` box under a scrolling page body is auto, as on the web (jsx/dom.ts hDef at a page root).
import { afterAll, expect, test } from 'bun:test';
afterAll(async () => { (await import('./clock')).thawClock(); });

const BAR = /[█░▀▄]/;
async function frameOf(page: string, fx: string | null, cols: number, rows: number): Promise<string[]> {
  const { renderPage } = await import('./render');
  const s = await renderPage({ page, fx, cols, rows });
  try { return s.frame.split('\n').slice(0, rows); } finally { s.close(); }
}
/** Rows (under the top bar, above the key line) whose right-edge cell is a scrollbar cell: a page-level scroll. */
const edgeBars = (f: string[], cols: number): number => f.slice(1, f.length - 1).filter((l) => BAR.test(l.padEnd(cols)[cols - 1]!)).length;

test('apps long at 80x24: header at the top, one scrollbar (the table\'s), pager on screen', async () => {
  const f = await frameOf('apps', 'long', 80, 24);
  // The page names itself in its header; the top bar does not repeat it.
  expect(f[0]).toContain('HOODY');
  expect(f[0]).not.toContain('Programs');
  expect(f[1]).toMatch(/^ Programs\b/);
  expect(f.some((l) => /1–50 of 68/.test(l))).toBe(true);
  // No page scrollbar on the right edge; the table's own bar is beside its rows (a ⋯ menu column before it).
  expect(edgeBars(f, 80)).toBe(0);
  expect(f.filter((l) => /⋯[█░]/.test(l)).length).toBeGreaterThan(5);
}, 60_000);

test('schedules long at 80x24: the same (pager on screen, no page scrollbar)', async () => {
  const f = await frameOf('schedules', 'long', 80, 24);
  expect(f[1]).toMatch(/^ Schedules\b/);
  expect(f.some((l) => /1–50 of 75/.test(l))).toBe(true);
  expect(edgeBars(f, 80)).toBe(0);
}, 60_000);

test('support (7 tickets, questions under them) draws no scrollbar: the list wrapper is not a page tall', async () => {
  const f = await frameOf('support', null, 120, 40);
  expect(f.some((l) => /7 loaded/.test(l))).toBe(true);
  expect(f.some((l) => /Questions/.test(l))).toBe(true);
  expect(f.filter((l) => /[█▀]\s*$/.test(l)).length).toBe(0);
}, 60_000);

// A detail pane holds one scroll: a DetailPage (its own header and PageBody) claims the pane's outlet, which stands
// down.
type Node = { getChildren?: () => Node[]; verticalScrollBar?: { visible?: boolean }; scrollHeight?: number; viewport?: { height: number } };
function scrollBoxes(n: Node, inside: Node | null, out: Array<{ box: Node; inside: Node | null }>): typeof out {
  const isScroll = n.verticalScrollBar !== undefined;
  if (isScroll) out.push({ box: n, inside });
  for (const c of n.getChildren?.() ?? []) scrollBoxes(c, isScroll && (n.scrollHeight ?? 0) > (n.viewport?.height ?? 0) ? n : inside, out);
  return out;
}
for (const [page, cols, rows] of [['computers', 120, 40], ['vault', 240, 67]] as const) {
  test(`${page} with a row open at ${cols}x${rows}: no scroll box inside a scrolling one, the detail is not cut short`, async () => {
    const { renderPage } = await import('./render');
    const s = await renderPage({ page, fx: null, cols, rows });
    try {
      await s.keys.press('enter');
      const f = (await s.settle()).split('\n');
      expect(f.join('\n')).toMatch(page === 'vault' ? /About this entry/ : /Open on atlas/);
      const boxes = scrollBoxes(s.renderer.root as unknown as Node, null, []);
      const nested = boxes.filter((b) => b.inside !== null);
      expect(nested.map((b) => `${b.box.viewport?.height}/${b.box.scrollHeight} inside ${b.inside!.viewport?.height}/${b.inside!.scrollHeight}`)).toEqual([]);
    } finally { s.close(); }
  }, 90_000);
}

// Files Browse under its page body: the root column is of indefinite height (the hDef line above), so the folder's
// `flex: 1` (a 0 basis) counts at its content (jsx/dom.ts basis rule). Without that pair the folder
// pane drew at no height: only Questions under the tabs.
for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`files Browse at ${cols}x${rows} draws its folder (Up one folder, the rows)`, async () => {
    const f = (await frameOf('files', null, cols, rows)).join('\n');
    expect(f).toMatch(/Up one folder/);
    expect(f).toMatch(/\bbin\b/);
  }, 60_000);
}

// A list-detail list that cannot shrink scrolls in its pane (the web's pane is overflow: auto): Billing's servers view
// (an overview over `.tableArea { flex: 1 0 auto; min-height: min(560px, 80dvh) }`) was cut at 80x24 with nothing
// scrolling it once the outlet stood down.
test('billing servers at 80x24: no layout fault, the list pane has its scrollbar', async () => {
  const { renderPage } = await import('./render');
  const { layoutFaults } = await import('../../src/term/prim/layoutcheck');
  const s = await renderPage({ page: 'billing', fx: null, cols: 80, rows: 24, path: '/billing?view=servers' });
  try {
    const f = s.frame.split('\n').slice(0, 24);
    expect(layoutFaults(s.renderer.root as never, { cols: 80, rows: 24 }).map((x) => `${x.kind} ${x.path}: ${x.detail}`)).toEqual([]);
    // The pane's bar, at its right edge (inside the page's one-cell padding): column 78.
    expect(f.slice(1, 23).filter((l) => BAR.test(l.padEnd(80)[78]!)).length).toBeGreaterThan(5);
  } finally { s.close(); }
}, 60_000);

// A frame depends only on its size and data: the list pane's fit-or-scroll switch (ListDetailPage
// FitOrScroll) carries nothing over from an earlier size. Resized there = drawn there fresh.
async function resizedFrame(page: string, path: string | undefined, steps: [number, number][]): Promise<string[]> {
  const { renderPage } = await import('./render');
  const [first, ...rest] = steps;
  const s = await renderPage({ page, fx: null, path, cols: first![0], rows: first![1] });
  try {
    for (const [c, r] of rest) await s.resize(c, r);
    return s.frame.split('\n').slice(0, steps[steps.length - 1]![1]);
  } finally { s.close(); }
}
for (const [page, path] of [['billing', '/billing?view=servers'], ['apps', undefined]] as const) {
  test(`${page} at 80x24: reached from 120x40, or 80x24 -> 80x60 -> 80x24, draws as a fresh 80x24`, async () => {
    const fresh = await resizedFrame(page, path, [[80, 24]]);
    // The pane's scroll decision (the bar column, row by row) is a fresh one after either history. The whole frame is
    // compared only for apps: billing's table keeps the column widths it sized at an earlier width (120 columns, or the
    // pane before it had a bar), the table's own memory.
    const bar = (f: string[]) => f.map((l) => l.padEnd(80)[78]);
    for (const steps of [[[120, 40], [80, 24]], [[80, 24], [80, 60], [80, 24]]] as [number, number][][]) {
      const got = await resizedFrame(page, path, steps);
      expect([steps, bar(got)]).toEqual([steps, bar(fresh)]);
      if (page === 'apps') expect(got).toEqual(fresh);
    }
  }, 120_000);
}
