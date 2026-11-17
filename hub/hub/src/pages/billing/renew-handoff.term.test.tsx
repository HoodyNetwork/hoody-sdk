// Wallet & usage in the live terminal: auto-renew is a plan setting, and the live terminal sends no money route
// (term/app/live-wire.ts refuses `/subserver-subscriptions/:id/auto-renew` before it is sent). A switch there could only
// end on "Couldn't change auto-renew." So with the live gate installed the Server subscriptions section draws each
// row's setting as a word, no switch and no row-menu item to change it, and hands the change to the web Hub with this
// page's address (kit Handoff: Copy link, QR code), as the checkout and Add funds do (parts/moneyHandoff.term.tsx).
// Without a live gate (fixtures, goldens, the web) the switches are drawn as before.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { setLiveGate, type LiveGate } from '@core/live-gate';
import { queryAllByRole, semanticsOf, within, type SemNode } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; setLiveGate(null); });

// A gate that sends nothing: this test never reaches a send.
const GATE: LiveGate = { direct: () => Promise.reject(Object.assign(new Error('not sent'), { kind: 'not_sent', notSent: true })) };

// The kit Handoff's reason (moneyTerm.strings.en.json), as two pieces: the box wraps it.
const REASON = ['Payments and plan changes are made in the web Hub.', 'nothing was'];

const flat = (frame: string): string => frame.replace(/\s+/g, ' ');

function renewSwitches(): SemNode[] {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  const tree = semanticsOf({ root: r.root, stdin: r.stdin });
  return queryAllByRole(tree, 'region', { id: 'billing-subscriptions' }).flatMap((g) => queryAllByRole(within(g), 'switch'));
}

test('live terminal: no auto-renew switch; the change is handed to the web Hub', async () => {
  setLiveGate(GATE);
  s = await renderPage({ page: 'billing', path: '/billing?view=wallet', fx: null, cols: 140, rows: 60 });
  const frame = flat(await s.settle());
  expect(renewSwitches()).toEqual([]);
  for (const piece of REASON) expect(frame).toContain(piece);
  expect(frame).toMatch(/https:\/\/[^\s/]+\/auth\/home\?\S*#\/billing/);
  expect(frame).toContain('[c Copy link]');
  expect(frame).not.toContain("Couldn't change auto-renew");
  expect(s.failures).toEqual([]);
}, 180_000);

test('no live gate: the auto-renew switches are drawn as before, no hand-off', async () => {
  s = await renderPage({ page: 'billing', path: '/billing?view=wallet', fx: null, cols: 140, rows: 60 });
  const frame = flat(await s.settle());
  expect(renewSwitches().length).toBe(3);
  expect(frame).not.toContain('made in the web Hub');
}, 180_000);
