// Opening a script's row menu logged "ActionMenu: disabled item(s) without a reason: delete" for a
// script on a computer with an older Exec kit (Delete is off there). The item now says why.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const fx of [null, 'oldKit'] as const) {
  test(`row menu, state ${fx ?? 'default'}: no disabled item without a reason`, async () => {
    s = await renderPage({ page: 'scripts', fx, cols: 140, rows: 50 });
    await s.settle();
    // Walk the list: the menu of every one of the first rows (ready and old-kit computers both sit in the default state).
    for (let i = 0; i < 12; i++) {
      await s.keys.type('j');
      await s.keys.type('.');
      await s.settle();
      await s.keys.press('escape');
    }
    await s.settle();
    expect(s.errors.filter((e) => e.includes('without a reason'))).toEqual([]);
  }, 240_000);
}
