// Account > Passcode lock in the terminal. The terminal Hub keeps no passcode (its host refuses one), so the section
// says so in its own words, hands setting one to the web Hub (kit Handoff: the reason, its keys and the address) and
// draws no Set a passcode. Before, it drew the web's unsupported state: a disabled Set a passcode that could never
// work and "This browser can't keep a passcode.", a sentence about a browser.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { queryAllByRole, semanticsOf, semText, type SemNode } from '../../term/prim/semantics';
import handoff from '../../kit/states/Handoff.term.strings.en.json';
import lockTerm from './parts/lockTerm.strings.en.json';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: the section says the terminal has no passcode lock and draws no Set a passcode`, async () => {
    s = await renderPage({ page: 'account', fx: null, cols, rows, path: '/account?section=passcode' });
    await s.settle();
    const nodes = tree();
    const text = semText(nodes);
    // Positive controls on the same tree: the section's own words, the hand-off's reason and its Copy link button
    // (a button query that finds what is drawn).
    expect(text).toContain(lockTerm['term.lock.none']);
    expect(text).toContain(lockTerm['term.lock.reason']);
    expect(queryAllByRole(nodes, 'button', { name: handoff['handoff.copy'] }).length).toBeGreaterThan(0);
    // The section is the one on screen (`?section=` scrolls to it): its first row is in the frame.
    expect(s.frame).toContain(strings['lock.off']);
    // Before: a disabled "Set a passcode" button and the browser sentence.
    expect(queryAllByRole(nodes, 'button', { name: strings['lock.set'] })).toEqual([]);
    expect(text).not.toContain(strings['lock.err.unsupported']);
    expect(s.failures).toEqual([]);
  }, 120_000);
}
