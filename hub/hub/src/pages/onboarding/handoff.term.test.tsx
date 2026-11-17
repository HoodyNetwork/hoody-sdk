// The onboarding tour in a terminal: a page-level hand-off (page.ts `handoff`). The shell draws the page title and the
// kit Handoff block for /onboarding on the web; the animated web view (LoadScreen, its cards) is never imported.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | /onboarding draws the title, the reason and the web address, nothing of the web view | 'WxH: the tour is handed to the web' |
// | 2 | No strict-global trap, no page failure (LoadScreen reads matchMedia on the web) | same |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });
const flat = (f: string): string => f.replace(/[│┃║┌┐└┘─╭╮╰╯]/g, ' ').replace(/\s+/g, ' ');

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: the tour is handed to the web`, async () => {
    s = await renderPage({ page: 'onboarding', cols, rows });
    const frame = flat(await s.settle());
    expect(frame).toContain(strings.title);
    expect(frame).toContain(strings['term.reason']);
    expect(frame).toContain(`Open the ${strings['term.what']} on the web:`);
    // The address is drawn whole, wrapped at 80 columns.
    expect(frame.replace(/\s+/g, '')).toContain('#/onboarding');
    // Nothing of the web view: no setup step, no card.
    expect(frame).not.toContain(strings['steps.label']);
    expect(frame).not.toContain(strings['step.server']);
    // The web view is never imported (the kit barrel still evaluates LoadScreen's module, as for every web-only part).
    expect(s.loaded.filter((r) => /pages\/onboarding\/view\.tsx$/.test(r.file))).toEqual([]);
    expect(s.traps).toEqual([]);
    expect(s.failures).toEqual([]);
  }, 180_000);
}
