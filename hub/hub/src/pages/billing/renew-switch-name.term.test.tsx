// Wallet & usage in a terminal: each subscription row's auto-renew switch is named by its setting, as on the web
// (SubscriptionsSection.tsx: label "On"/"Off", aria-label "Auto-renew for …"), never by the drawn word: the semantics
// tree (what tests and agents read) had three switches called "On", "Off" and "On". Read only: nothing is pressed.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { queryAllByRole, semanticsOf, within, type SemNode } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

function renewSwitches(): SemNode[] {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  const tree = semanticsOf({ root: r.root, stdin: r.stdin });
  // The Server subscriptions section (Bits.term.tsx Section: region `billing-subscriptions`).
  return queryAllByRole(tree, 'region', { id: 'billing-subscriptions' }).flatMap((g) => queryAllByRole(within(g), 'switch'));
}

// From 140 columns: at 120 the row's money action takes the cells of the Auto-renew column, which is then not drawn
// (the setting stays in the row's ⋯ menu).
for (const [cols, rows] of [[140, 60], [160, 50]] as const) {
  test(`${cols}x${rows}: every auto-renew switch is named by its setting, never "On" or "Off"`, async () => {
    s = await renderPage({ page: 'billing', path: '/billing?view=wallet', fx: null, cols, rows });
    const frame = await s.settle();
    // The default fixture's renewable rows (fixtures.ts SUBS: n12, Singapore M, the server being set up), drawn with
    // their state word.
    expect(frame).toContain('[■ on ] On');
    expect(frame).toContain('[□ off] Off');
    const sw = renewSwitches();
    expect(sw.length).toBe(3);
    for (const n of sw) expect(n.name).toMatch(/^Auto-renew for \S/);
    expect(sw.filter((n) => n.name === 'On' || n.name === 'Off')).toEqual([]);
  }, 180_000);
}
