// A runtime row of a Bot's Activity ("i Update · Read deploy log · on atlas", its text, its time): the text is drawn whole
// on the line under its kind, at the row's width, never as a narrow middle column wrapped beside the kind (the web's
// `flex: 1 1 200px` is 25 cells here; term-decls row pane.module.css#runtimeText).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../../scripts/term/render';

const TEXT = 'Task "Read deploy log" started on atlas.';
let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[120, 40], [80, 24], [200, 50]] as const) {
  test(`${cols}x${rows}: the runtime row's text is one whole line`, async () => {
    s = await renderPage({ page: 'bots', cols, rows });
    await s.settle();
    await s.keys.press('enter');
    let f = await s.settle();
    // Bring the row on screen: Load older is above it; the log opens at its end, the row is a few rows up.
    for (let i = 0; i < 12 && !(f.includes('Update') && f.includes(TEXT)); i++) { await s.keys.press('pageup'); f = await s.settle(); }
    expect(f).toContain('Update');
    expect(f).toContain(TEXT);
    expect(s.trapsAt).toEqual([]);
  }, 240_000);
}
