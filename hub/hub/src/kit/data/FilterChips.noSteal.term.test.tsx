// A filter bar that changes form on its first layout (a table below the fold measures its width once drawn) never takes
// the focus: only a bar that HELD the focus hands it to its new form (FilterChips.refold.term.test.tsx). Before, the
// Account page opened scrolled down to the Sign-in sessions toolbar, its Filters button focused.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });
const focusedName = (p: PageSession): string | null => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }))?.name ?? null;
};

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`Account at ${cols}x${rows} opens at its top, no filter control focused`, async () => {
    s = await renderPage({ page: 'account', cols, rows });
    const f = await s.settle();
    expect(focusedName(s) ?? '').not.toMatch(/^Filters|^Status|^Computer/);
    // The section strip marks where the page is ("▌Profile", not "▌Passcode lock"), and the profile's first rows show.
    expect(f).toContain('▌Profile');
    expect(f).toContain('Display name');
  }, 240_000);
}
